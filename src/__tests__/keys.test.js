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

const { createKey, ensureCurrentKey, listKeys, deleteKey } = await import('../framework/keys/manager.js');
const { getPrivateKey, getPublicKey, getPublicKeyByKid, getJWKS } = await import('../framework/keys/accessor.js');
const { clearCache, getCurrentKid } = await import('../framework/keys/cache.js');
const { sign, verify } = await import('../framework/jwt/index.js');

function reset() {
  store.clear();
  idSeq = 1;
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
});
