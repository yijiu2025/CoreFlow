/**
 * JWT 签发与验证（测试 `src/framework/jwt/index.js` 真身）
 *
 * ⚠️ 为什么重写：本文件的前身**没有 import 任何项目代码**，只是在测试
 * `jsonwebtoken` 这个第三方库——把 `framework/jwt/index.js` 整个删掉它照样全绿。
 * 那 6 个用例对生产行为的保证是零。
 *
 * 现在锁的是本模块**自己的**语义（jsonwebtoken 的正确性不是我们的责任）：
 *   - `sign()` 把当前 kid 写进 header.keyid，并回传 kid（验签方要靠它找公钥）；
 *   - 没有当前密钥时先 `ensureCurrentKey()` 再签，而不是抛错；
 *   - `verify()` 按 header.kid 选公钥（轮转后旧 token 仍可验）、强制 RS256、
 *     并按需校验 issuer / audience / token_type —— 这三项是 U7 的修复点，
 *     退化任意一条都会让「换算法」「跨 issuer 重放」「refresh token 当 access token 用」重新成立。
 *
 * 密钥库用 mock 替换（真实 keys 子系统的端到端签验在 `keys.test.js`），
 * 这样本文件只对"包装层"的行为负责，不重复覆盖。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-10-30 重写为真身测试（U18）
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import crypto from 'node:crypto';

/** 两把真实 RSA 密钥：k1 为当前，k0 为轮转后的旧密钥 */
const pairOf = () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  return { privateKey, publicKey };
};

const K1 = pairOf();
const K0 = pairOf();

const state = {
  current: 'k1',
  keys: new Map([
    ['k1', K1],
    ['k0', K0]
  ]),
  ensureCalls: 0
};

jest.unstable_mockModule('../framework/keys/index.js', () => ({
  getCurrentKid: () => state.current,
  getPrivateKey: async kid => {
    const k = state.keys.get(kid);
    if (!k) throw new Error(`密钥对 "${kid}" 不存在或已退役`);
    return k.privateKey;
  },
  getPublicKeyByKid: async kid => {
    const resolved = kid || state.current;
    const k = state.keys.get(resolved);
    if (!k) throw new Error(`密钥对 "${resolved}" 不存在或已退役`);
    return { pem: k.publicKey, kid: resolved };
  },
  ensureCurrentKey: async () => {
    state.ensureCalls++;
    state.current = 'k1';
    return state.current;
  }
}));

const { sign, verify } = await import('../framework/jwt/index.js');

beforeEach(() => {
  state.current = 'k1';
  state.ensureCalls = 0;
});

describe('sign：kid 必须落到 header 并回传', () => {
  test('签名用当前 kid，header.keyid 与返回值一致', async () => {
    const { token, kid } = await sign({ sub: 'user-1' });

    expect(kid).toBe('k1');
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
    expect(header.kid).toBe('k1');
    expect(header.alg).toBe('RS256');
  });

  test('keyName 指定时覆盖当前 kid（轮转期间用旧密钥签发）', async () => {
    const { kid } = await sign({ sub: 'user-1' }, { keyName: 'k0' });
    expect(kid).toBe('k0');
  });

  test('没有当前密钥时先 ensureCurrentKey 再签，不直接抛错', async () => {
    state.current = null;
    const { kid, token } = await sign({ sub: 'user-1' });

    expect(state.ensureCalls).toBe(1);
    expect(kid).toBe('k1');
    expect(token).toBeTruthy();
  });
});

describe('verify：按 header.kid 选公钥', () => {
  test('签发→验证 往返得到原 payload', async () => {
    const { token } = await sign({ sub: 'user-1', scope: 'openid' });
    const payload = await verify(token);

    expect(payload.sub).toBe('user-1');
    expect(payload.scope).toBe('openid');
  });

  test('旧 kid 签的 token 在轮转后仍可验证（用 k0 的私钥签、按 header 找 k0 公钥）', async () => {
    const { token } = await sign({ sub: 'legacy' }, { keyName: 'k0' });
    // 当前指针已换成 k1，验签仍应成功
    state.current = 'k1';

    await expect(verify(token)).resolves.toMatchObject({ sub: 'legacy' });
  });

  test('kid 不在密钥库里时抛出，而不是回退到当前密钥验证', async () => {
    const { token } = await sign({ sub: 'ghost' }, { keyName: 'k0' });
    state.keys.delete('k0');

    await expect(verify(token)).rejects.toThrow(/不存在或已退役/);
    state.keys.set('k0', K0); // 还原，避免污染后续用例
  });
});

describe('verify：claims 校验（U7 修复点）', () => {
  test('token_type 不匹配直接拒绝（refresh token 不能当 access 用）', async () => {
    const { token } = await sign({ sub: 'u', token_type: 'refresh_token' });

    await expect(verify(token, { tokenType: 'access_token' })).rejects.toThrow(/token_type 不匹配/);
    await expect(verify(token, { tokenType: 'refresh_token' })).resolves.toBeTruthy();
  });

  test('issuer 不匹配拒绝（跨 issuer 重放）', async () => {
    const { token } = await sign({ sub: 'u', iss: 'https://evil.example' });

    await expect(verify(token, { issuer: 'https://good.example' })).rejects.toThrow();
    await expect(verify(token, { issuer: 'https://evil.example' })).resolves.toBeTruthy();
  });

  test('audience 不匹配拒绝（token 被别的客户端拿去用）', async () => {
    const { token } = await sign({ sub: 'u', aud: 'client-a' });

    await expect(verify(token, { audience: 'client-b' })).rejects.toThrow();
    await expect(verify(token, { audience: 'client-a' })).resolves.toBeTruthy();
  });

  test('过期 token 拒绝', async () => {
    const { token } = await sign({ sub: 'u' }, { expiresIn: '-1s' });
    await expect(verify(token)).rejects.toThrow(/expired/i);
  });

  test('篡改 payload 拒绝', async () => {
    const { token } = await sign({ sub: 'user-1' });
    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin' })).toString('base64url');

    await expect(verify(`${h}.${forged}.${s}`)).rejects.toThrow();
  });
});
