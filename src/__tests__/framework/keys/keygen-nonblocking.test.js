/**
 * 密钥生成必须走异步路径（不得阻塞主线程）
 *
 * 设计意图：这不是"能生成密钥就行"的冒烟测试，而是一条**不变量守卫**。
 * RSA 密钥生成是纯 CPU 计算，同步版会占住事件循环（本机实测 2048 位约 53ms，
 * 且随 modulusLength 超线性增长）。因此本测试把 `crypto.generateKeyPairSync`
 * 替换为**一调用就抛错**的替身：
 *
 *   · 若实现走异步版 → 全绿
 *   · 若有人改回 `generateKeyPairSync` → 立刻变红
 *
 * 这比断言"返回 Promise"更强：后者只约束了返回形状，前者直接禁止了阻塞行为。
 */
import { jest } from '@jest/globals';
import cryptoReal from 'node:crypto';

/** 记录 sync 版是否被调用过——用于在断言失败时给出可读原因 */
const syncCalls = [];

jest.unstable_mockModule('node:crypto', () => ({
  default: {
    // 除 generateKeyPairSync 外一律委托真身，保证被替换的只有"被禁止的那一个"
    ...cryptoReal,
    generateKeyPairSync: (...args) => {
      syncCalls.push(args[0]);
      throw new Error('__SYNC_KEYGEN__ 检测到同步密钥生成：会阻塞事件循环');
    }
  }
}));

const { generateKeyPair, generateKid } = await import('../../../framework/keys/manager.js');

describe('密钥生成不阻塞主线程', () => {
  beforeEach(() => {
    syncCalls.length = 0;
  });

  test('generateKeyPair 返回 Promise（异步契约）', async () => {
    const p = generateKeyPair({ kid: 'async-contract' });
    expect(p).toBeInstanceOf(Promise);
    await p;
  });

  test('生成过程从未调用 crypto.generateKeyPairSync', async () => {
    await generateKeyPair({ kid: 'no-sync' });
    expect(syncCalls).toEqual([]);
  });

  test('默认参数生成 RSA 2048 密钥对，PEM 与 jwk 形状正确', async () => {
    const { privateKey, publicKey, jwk } = await generateKeyPair({ kid: 'default-params' });

    expect(privateKey).toContain('BEGIN PRIVATE KEY');
    expect(publicKey).toContain('BEGIN PUBLIC KEY');

    // jwk 必须是真正的公钥 JWK，而不是占位对象
    expect(jwk.kty).toBe('RSA');
    expect(jwk.n).toBeTruthy();
    expect(typeof jwk.n).toBe('string');
    expect(jwk.kid).toBe('default-params');
    expect(jwk.alg).toBe('RS256');
    expect(jwk.use).toBe('sig');
    expect(syncCalls).toEqual([]);
  });

  test('公钥与私钥确实是配对的一对', async () => {
    const { privateKey, publicKey } = await generateKeyPair({ kid: 'pair' });

    // 用私钥签名、公钥验签：只有真正配对时才会通过
    const data = Buffer.from('pairwise-check');
    const sig = cryptoReal.sign('sha256', data, privateKey);
    const ok = cryptoReal.verify('sha256', data, publicKey, sig);
    expect(ok).toBe(true);
  });

  test('更高的密钥长度同样不触发同步生成', async () => {
    const { privateKey } = await generateKeyPair({ kid: 'm4096', modulusLength: 4096 });
    expect(privateKey.length).toBeGreaterThan(1000); // 4096 位的 PEM 明显更长
    expect(syncCalls).toEqual([]);
  });

  test('generateKid 产出唯一且可检索的 kid（回归：kid 规则不应被改动）', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateKid()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^k[0-9a-f]{16}$/);
  });
});
