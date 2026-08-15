/**
 * keys 组件集成测试
 *
 * 用 jest.unstable_mockModule 替换 DB 层（getModel 返回内存模型），
 * 验证重构后的密钥管理链路：
 * - ensureCurrentKey 启动初始化
 * - createKey 生成唯一字母数字 kid 并设为当前
 * - getPublicKey()/getPrivateKey(kid) round-trip
 * - getJWKS 返回所有 active 公钥
 * - sign/verify JWT 端到端
 */
import { jest } from '@jest/globals';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

// 内存 KeyPair 模型
const store = new Map();
let idSeq = 1;
// 模拟 DB 唯一冲突：前 N 次 create 抛 SequelizeUniqueConstraintError，之后正常
let createSabotage = 0;
function uniqueViolationError() {
  const e = new Error('Duplicate entry');
  e.name = 'SequelizeUniqueConstraintError';
  e.parent = { code: 'ER_DUP_ENTRY' };
  return e;
}
const InMemKeyPair = {
  async findOne({ where }) {
    for (const r of store.values()) {
      if (Object.entries(where).every(([k, v]) => r[k] === v)) return r;
    }
    return null;
  },
  async findAll({ where }) {
    let arr = [...store.values()];
    if (where) arr = arr.filter(r => Object.entries(where).every(([k, v]) => r[k] === v));
    return arr.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  },
  async create(data) {
    // 破坏：前 createSabotage 次抛唯一冲突，模拟并发/碰撞
    if (createSabotage > 0) {
      createSabotage--;
      throw uniqueViolationError();
    }
    // 真实 DB 的唯一约束：name 重复则抛错
    if (store.has(data.name)) throw uniqueViolationError();
    const rec = { id: idSeq++, created_at: Date.now(), ...data };
    store.set(rec.name, rec);
    return rec;
  },
  async destroy({ where }) {
    for (const name of Object.keys(store)) {
      if (Object.entries(where).every(([k, v]) => store.get(name)[k] === v)) store.delete(name);
    }
  }
};

jest.unstable_mockModule('../framework/db/index.js', () => ({
  getModel: () => InMemKeyPair
}));

const { createKey, rotateKey, ensureCurrentKey, listKeys, deleteKey, refreshCache } =
  await import('../framework/keys/manager.js');
const { getPrivateKey, getPublicKey, getPublicKeyByKid, getJWKS } = await import('../framework/keys/accessor.js');
const { clearCache, getCurrentKid } = await import('../framework/keys/cache.js');
const { sign, verify } = await import('../framework/jwt/index.js');

function reset() {
  store.clear();
  idSeq = 1;
  createSabotage = 0;
  clearCache();
}

describe('keys 组件', () => {
  beforeEach(reset);

  test('ensureCurrentKey 首次启动生成唯一字母数字 kid', async () => {
    const kid = await ensureCurrentKey();
    expect(kid).toMatch(/^k[0-9a-f]{16}$/);
    expect(getCurrentKid()).toBe(kid);
    const kid2 = await ensureCurrentKey(); // 再次调用不重复生成
    expect(kid2).toBe(kid);
  });

  test('createKey 生成不同 kid 且写 DB+缓存', async () => {
    const a = await createKey({ remark: 'a' });
    const b = await createKey({ remark: 'b' });
    expect(a.kid).not.toBe(b.kid);
    expect(getCurrentKid()).toBe(b.kid); // 新密钥即当前
    const all = await listKeys();
    expect(all.length).toBe(2);
  });

  test('getPublicKey()/getPrivateKey(kid) round-trip 一致', async () => {
    await ensureCurrentKey();
    const { pem, kid } = await getPublicKey();
    const priv = await getPrivateKey(kid);
    expect(pem).toContain('BEGIN PUBLIC KEY');
    expect(priv).toContain('BEGIN PRIVATE KEY');
    // 公私钥匹配：用私钥签名、公钥验证
    const data = Buffer.from('hello');
    const sig = crypto.sign('sha256', data, crypto.createPrivateKey(priv));
    expect(crypto.verify('sha256', data, crypto.createPublicKey(pem), sig)).toBe(true);
  });

  test('getPublicKeyByKid 与 getPublicKey 形状一致 {pem,kid}', async () => {
    await ensureCurrentKey();
    const { kid } = await getPublicKey();
    const byKid = await getPublicKeyByKid(kid);
    expect(byKid).toHaveProperty('pem');
    expect(byKid.kid).toBe(kid);
  });

  test('getJWKS 返回所有 active 公钥', async () => {
    await createKey({ remark: 'k1' });
    await createKey({ remark: 'k2' });
    const { keys } = await getJWKS();
    expect(keys.length).toBe(2);
    expect(keys.every(k => k.kid && k.use === 'sig')).toBe(true);
  });

  test('JWT sign/verify 端到端（kid 写入 header）', async () => {
    await ensureCurrentKey();
    const { token, kid } = await sign({ sub: 'u1', aud: 'c1' });
    const decoded = jwt.decode(token, { complete: true });
    expect(decoded.header.kid).toBe(kid);
    const payload = await verify(token);
    expect(payload.sub).toBe('u1');
  });

  test('删除当前密钥后自动重选最新 active 为当前', async () => {
    const a = await createKey({ remark: 'a' });
    const b = await createKey({ remark: 'b' });
    expect(getCurrentKid()).toBe(b.kid);
    await deleteKey(b.kid);
    expect(getCurrentKid()).toBe(a.kid);
  });

  test('createKey 自动生成 kid 遇 DB 唯一冲突自动重试不抛错', async () => {
    createSabotage = 2; // 前两次 insert 抛唯一冲突
    const { kid } = await createKey({ remark: 'retry' });
    expect(kid).toMatch(/^k[0-9a-f]{16}$/);
    expect(createSabotage).toBe(0); // 破坏已耗尽
    expect(getCurrentKid()).toBe(kid);
  });

  test('createKey 显式 kid 撞名抛错（不重试换名）', async () => {
    await createKey({ kid: 'fixed-kid', remark: 'a' });
    await expect(createKey({ kid: 'fixed-kid', remark: 'b' })).rejects.toThrow('已存在');
    // 旧记录未被覆盖
    const all = await listKeys();
    expect(all.length).toBe(1);
    expect(all[0].remark).toBe('a');
  });

  test('rotateKey 生成新密钥设为当前，旧密钥保留 active', async () => {
    await ensureCurrentKey();
    const oldKid = getCurrentKid();
    const { kid: newKid } = await rotateKey({ remark: 'manual-rotate' });
    expect(newKid).not.toBe(oldKid);
    expect(getCurrentKid()).toBe(newKid);
    const all = await listKeys();
    expect(all.length).toBe(2); // 旧密钥仍保留
    // 旧 kid 公钥仍可查（验证旧 token 用）
    const old = await getPublicKeyByKid(oldKid);
    expect(old.kid).toBe(oldKid);
  });

  test('refreshCache 清空并从 DB 重载当前密钥', async () => {
    const { kid } = await createKey({ remark: 'a' });
    clearCache(); // 模拟缓存丢失
    expect(getCurrentKid()).toBeNull();
    const reloaded = await refreshCache();
    expect(reloaded).toBe(kid);
    expect(getCurrentKid()).toBe(kid);
    // 重载后仍能正常签发
    const { token } = await sign({ sub: 'u2' });
    expect(token).toBeTruthy();
  });
});
