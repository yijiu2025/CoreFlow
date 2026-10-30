/**
 * 私钥信封加密测试
 *
 * 覆盖两层：
 * - `envelope.js`：AES-256-GCM 的往返、随机 IV、防篡改、AAD 绑定、KEK 轮转、
 *   历史明文兼容、配置非法一律失败；
 * - `repository.js`：写库前加密、读库后解密（DB 里绝不出现 PEM）。
 *
 * ⚠️ 这里不断言密文字面量（同一明文每次加密都不同），只断言**可判定的性质**：
 * 前缀、可解密性、篡改必失败、跨行搬用必失败。
 *
 * @author yijiu2025
 * @since 2026-10-30
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import crypto from 'node:crypto';

/** 真实 PKCS#8 私钥：用假 PEM 测不出"能不能真的用于签名" */
const PEM = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
}).privateKey;

/** 32 字节密钥，两种编码各测一次 */
const hexKey = () => crypto.randomBytes(32).toString('hex');
const b64Key = () => crypto.randomBytes(32).toString('base64');

/** 解构出被测试模块（env 在调用时才读，模块顶层导入安全） */
const { seal, open, isSealed, isEnabled, assertReady, SEALED_PREFIX } = await import('../framework/keys/envelope.js');

/** 记录/还原与本模块相关的环境变量 */
const ENV_KEYS = [
  'KEY_ENCRYPTION_KEY',
  'KEY_ENCRYPTION_KEY_ID',
  'KEY_ENCRYPTION_KEY_PREVIOUS',
  'KEY_ENCRYPTION_KEY_PREVIOUS_ID',
  'KEY_ENCRYPTION_REQUIRED'
];
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('envelope：加解密', () => {
  it('未配置 KEK 时 isEnabled=false，seal 直接拒绝', () => {
    expect(isEnabled()).toBe(false);
    expect(() => seal(PEM, 'k1')).toThrow(/未配置 KEY_ENCRYPTION_KEY/);
  });

  it('hex 与 base64 两种密钥编码都能往返', () => {
    for (const key of [hexKey(), b64Key()]) {
      process.env.KEY_ENCRYPTION_KEY = key;
      const sealed = seal(PEM, 'kid-a');
      expect(sealed.startsWith(SEALED_PREFIX)).toBe(true);
      expect(open(sealed, 'kid-a')).toBe(PEM);
    }
  });

  it('同一明文每次密文不同（随机 IV），且都不含明文片段', () => {
    process.env.KEY_ENCRYPTION_KEY = hexKey();
    const a = seal(PEM, 'kid-a');
    const b = seal(PEM, 'kid-a');
    expect(a).not.toBe(b);
    expect(a).not.toContain('BEGIN PRIVATE KEY');
    expect(b).not.toContain('MIIEvQIBADANBg');
  });

  it('历史明文原样返回（滚动升级期间旧行照常可用）', () => {
    process.env.KEY_ENCRYPTION_KEY = hexKey();
    expect(isSealed(PEM)).toBe(false);
    expect(open(PEM, 'kid-a')).toBe(PEM);
  });

  it('密文被改一个字符就解密失败', () => {
    process.env.KEY_ENCRYPTION_KEY = hexKey();
    const sealed = seal(PEM, 'kid-a');
    // 改 base64 段正中间的一个字符：末位可能落在 padding 上，观感上改了实际解码不变
    const idx = Math.floor(sealed.length / 2);
    const flipped = sealed.slice(0, idx) + (sealed[idx] === 'A' ? 'B' : 'A') + sealed.slice(idx + 1);

    expect(() => open(flipped, 'kid-a')).toThrow(/解密失败/);
  });

  it('密文搬到另一个 kid 行上解密失败（AAD 绑定行身份）', () => {
    process.env.KEY_ENCRYPTION_KEY = hexKey();
    const sealed = seal(PEM, 'kid-a');
    // 有 DB 写权限的人把 A 行密文复制到 B 行：密文没坏，但语义被替换，必须拒绝
    expect(() => open(sealed, 'kid-b')).toThrow(/解密失败/);
  });

  it('找不到对应 keyId 时明确报错，绝不把密文当明文返回', () => {
    process.env.KEY_ENCRYPTION_KEY = hexKey();
    process.env.KEY_ENCRYPTION_KEY_ID = 'k1';
    const sealed = seal(PEM, 'kid-a');

    // 换一把 KEK 且 ID 不同：行里记录的 k1 不在 keyring 中
    process.env.KEY_ENCRYPTION_KEY = hexKey();
    process.env.KEY_ENCRYPTION_KEY_ID = 'k9';

    expect(() => open(sealed, 'kid-a')).toThrow(/找不到解密所需的密钥 k1/);
  });

  it('KEK 轮转：旧密钥降级为 PREVIOUS 后旧密文仍可解，新写入用新 ID', () => {
    const oldKey = hexKey();
    process.env.KEY_ENCRYPTION_KEY = oldKey;
    process.env.KEY_ENCRYPTION_KEY_ID = 'k1';
    const sealedOld = seal(PEM, 'kid-a');

    // 轮转：新 KEK 上台，旧 KEK 留在 PREVIOUS
    const newKey = hexKey();
    process.env.KEY_ENCRYPTION_KEY = newKey;
    process.env.KEY_ENCRYPTION_KEY_ID = 'k2';
    process.env.KEY_ENCRYPTION_KEY_PREVIOUS = oldKey;
    process.env.KEY_ENCRYPTION_KEY_PREVIOUS_ID = 'k1';

    expect(open(sealedOld, 'kid-a')).toBe(PEM);

    const sealedNew = seal(PEM, 'kid-a');
    expect(sealedNew.startsWith(`${SEALED_PREFIX}k2:`)).toBe(true);
    expect(open(sealedNew, 'kid-a')).toBe(PEM);
  });

  it('PREVIOUS_ID 与 ACTIVE_ID 相同视为配置错误', () => {
    process.env.KEY_ENCRYPTION_KEY = hexKey();
    process.env.KEY_ENCRYPTION_KEY_ID = 'k1';
    process.env.KEY_ENCRYPTION_KEY_PREVIOUS = hexKey();
    process.env.KEY_ENCRYPTION_KEY_PREVIOUS_ID = 'k1';

    expect(() => seal(PEM, 'kid-a')).toThrow(/不能与 KEY_ENCRYPTION_KEY_ID 相同/);
  });

  it('密钥长度不对时拒绝（不是静默换成别的算法）', () => {
    process.env.KEY_ENCRYPTION_KEY = 'too-short';
    expect(() => seal(PEM, 'kid-a')).toThrow(/32 字节密钥/);
  });

  it('密文格式非法时给出明确错误而不是崩溃', () => {
    process.env.KEY_ENCRYPTION_KEY = hexKey();
    expect(() => open('enc:v1:k1', 'kid-a')).toThrow(/格式非法/);
    expect(() => open('enc:v1:k1:AAAA', 'kid-a')).toThrow(/负载长度不足/);
  });
});

describe('envelope：启动自检', () => {
  it('未要求加密且未配置 KEK：只告警，不阻断启动', () => {
    expect(() => assertReady()).not.toThrow();
  });

  it('KEY_ENCRYPTION_REQUIRED=true 且无 KEK：拒绝启动', () => {
    process.env.KEY_ENCRYPTION_REQUIRED = 'true';
    expect(() => assertReady()).toThrow(/拒绝以明文私钥启动/);
  });

  it('KEY_ENCRYPTION_REQUIRED=true 且 KEK 非法：同样拒绝启动', () => {
    process.env.KEY_ENCRYPTION_REQUIRED = 'true';
    process.env.KEY_ENCRYPTION_KEY = 'not-32-bytes';
    expect(() => assertReady()).toThrow(/32 字节密钥/);
  });

  it('KEY_ENCRYPTION_REQUIRED=true 且 KEK 正常：通过', () => {
    process.env.KEY_ENCRYPTION_REQUIRED = 'true';
    process.env.KEY_ENCRYPTION_KEY = hexKey();
    expect(() => assertReady()).not.toThrow();
  });
});

// ── repository：DB 里不能出现 PEM ──

/** 内存 KeyPair 模型：create 收到什么就存什么（用来检查写入的是不是密文） */
const db = new Map();
const InMemKeyPair = {
  async findOne({ where }) {
    for (const row of db.values()) {
      if (Object.entries(where).every(([k, v]) => row[k] === v)) return { ...row };
    }
    return null;
  },
  async findAll({ where } = {}) {
    let rows = [...db.values()];
    if (where) rows = rows.filter(r => Object.entries(where).every(([k, v]) => r[k] === v));
    return rows.map(r => ({ ...r }));
  },
  async create(data) {
    const row = { id: db.size + 1, active: true, createdAt: Date.now(), updatedAt: Date.now(), ...data };
    db.set(row.name, row);
    return { ...row };
  }
};

jest.unstable_mockModule('../framework/db/index.js', () => ({
  getModel: name => (name === 'KeyPair' ? InMemKeyPair : null)
}));

const { insertKey, findByName, findAll } = await import('../framework/keys/repository.js');

describe('repository：私钥落库即密文', () => {
  beforeEach(() => {
    db.clear();
    process.env.KEY_ENCRYPTION_KEY = hexKey();
  });

  it('insertKey 写入 DB 的是密文，返回给调用方的是明文', async () => {
    const created = await insertKey({ name: 'kid-1', algorithm: 'RS256', private_key: PEM, public_key: 'PUB' });

    expect(db.get('kid-1').private_key.startsWith(SEALED_PREFIX)).toBe(true);
    expect(db.get('kid-1').private_key).not.toContain('BEGIN PRIVATE KEY');
    expect(created.private_key).toBe(PEM);
  });

  it('findByName 读出来是可直接用于签名的 PEM', async () => {
    await insertKey({ name: 'kid-1', private_key: PEM, public_key: 'PUB' });
    const row = await findByName('kid-1');

    expect(row.private_key).toBe(PEM);
    // 真的能用来签名：不是"看起来像 PEM"的字符串
    const keyObj = crypto.createPrivateKey(row.private_key);
    expect(keyObj.asymmetricKeyType).toBe('rsa');
  });

  it('findAll 批量解密，且不修改 DB 中的密文', async () => {
    await insertKey({ name: 'kid-1', private_key: PEM, public_key: 'PUB' });
    await insertKey({ name: 'kid-2', private_key: PEM, public_key: 'PUB' });

    const rows = await findAll();
    expect(rows.map(r => r.private_key)).toEqual([PEM, PEM]);
    expect(isSealed(db.get('kid-1').private_key)).toBe(true);
  });

  it('历史明文行（未迁移）仍可读，不会因启用加密而全站掉线', async () => {
    db.set('legacy', { id: 9, name: 'legacy', private_key: PEM, public_key: 'PUB', active: true });
    const row = await findByName('legacy');
    expect(row.private_key).toBe(PEM);
  });

  it('未配置 KEK 时保持历史明文写入行为（迁移前的默认状态）', async () => {
    delete process.env.KEY_ENCRYPTION_KEY;
    await insertKey({ name: 'kid-plain', private_key: PEM, public_key: 'PUB' });
    expect(db.get('kid-plain').private_key).toBe(PEM);
  });
});
