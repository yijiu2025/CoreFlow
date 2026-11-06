/**
 * 挑战 provider 注册表与第三方分支
 *
 * 这组用例守的是「换一种人机验证方式」这条路能不能真的走通，以及**走不通时的表现**：
 *   · 名字拼错 / 密钥没配齐 → 必须回落 pow（而不是"谁也不验证"或让用户卡死）；
 *   · 判题按**载荷形状**选 provider → 配置在出题与提交之间被热改也不会把用户锁死；
 *   · 上游挂了要回 503（可重试），不能挫成 403 —— 否则运维看到的是"用户全在失败"。
 *
 * 第三方上游全部打桩：这组用例不联网，也不依赖真密钥。
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

let settings;
jest.unstable_mockModule('../../framework/firewall/interface/config-access.js', () => ({
  readSecuritySettings: () => settings,
  registerSettingsReader: () => {},
  hasSettingsReader: () => true
}));

jest.unstable_mockModule('../../app/firewall/data/store.js', () => ({
  pushRecord: () => {},
  getRecentRecords: () => [],
  getSummary: () => ({}),
  clearAll: () => {},
  setBroadcastHandler: () => {},
  stopPersistTimer: () => {},
  flushPersist: async () => {}
}));

const { DEFAULT_SECURITY_SETTINGS } = await import('../../framework/firewall/config/defaults.js');
const { CHALLENGE_PROVIDERS } = await import('../../framework/firewall/config/schema.js');
const { resolveChallengeProvider, pickVerifyProvider, resetProviderWarnings, EXTERNAL_PROVIDERS } =
  await import('../../app/firewall/services/challenge-providers/index.js');
const { createRecaptchaProvider } = await import('../../app/firewall/services/challenge-providers/recaptcha.js');
const { recaptchaService } = await import('../../framework/verify/recaptcha/index.js');
const { verifyConfig } = await import('../../framework/verify/config.js').then(m => ({
  verifyConfig: m.default
}));
const { resetMemoryState } = await import('../../framework/firewall/util/redis-memory.js');
const { setBlock } = await import('../../framework/firewall/block-manager.js');
const { issueChallenge, verifyChallenge } = await import('../../app/firewall/services/challenge.service.js');

const IP = '203.0.113.70';

/** 造一个只带必要字段的请求替身 */
function makeRequest(body = null, ip = IP) {
  return {
    ip,
    url: '/api/firewall/v1/challenge/verify',
    method: 'POST',
    headers: { 'user-agent': 'UA-Test' },
    cookies: {},
    body
  };
}

/** 记录 setCookie 的最小 reply 替身 */
function makeReply() {
  return {
    statusCode: 200,
    cookies: {},
    setCookie(n, v) {
      this.cookies[n] = v;
    }
  };
}

/** 把验证库的密钥临时"配齐"（三家都配），用完恢复 */
function withRecaptchaKeys(fn) {
  const saved = { ...verifyConfig.recaptcha };
  // google / hcaptcha 共用 secretKey + siteKey；turnstile 独立一套
  Object.assign(verifyConfig.recaptcha, {
    secretKey: 'test-secret',
    siteKey: 'test-site-key',
    turnstileSecretKey: 'test-secret',
    turnstileSiteKey: 'test-site-key'
  });
  return Promise.resolve()
    .then(fn)
    .finally(() => Object.assign(verifyConfig.recaptcha, saved));
}

beforeEach(() => {
  resetMemoryState();
  resetProviderWarnings();
  settings = { defense: { ...DEFAULT_SECURITY_SETTINGS.defense } };
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('配置契约：framework 的取值清单与 app 的注册表必须一致', () => {
  test('CHALLENGE_PROVIDERS 里的每个名字都能解析出 provider，且 name 对得上', async () => {
    await withRecaptchaKeys(async () => {
      for (const name of CHALLENGE_PROVIDERS) {
        const provider = resolveChallengeProvider(name);
        expect(provider.name).toBe(name);
        expect(typeof provider.issue).toBe('function');
        expect(typeof provider.verify).toBe('function');
      }
    });
  });

  test('EXTERNAL_PROVIDERS 与清单里除 pow 之外的部分完全一致（漏改一处这里就红）', () => {
    expect([...EXTERNAL_PROVIDERS].sort()).toEqual(CHALLENGE_PROVIDERS.filter(n => n !== 'pow').sort());
  });

  test('默认配置就是 pow', () => {
    expect(DEFAULT_SECURITY_SETTINGS.defense.challengeProvider).toBe('pow');
  });
});

describe('降级规则：不认识 / 没密钥 → 回落 pow', () => {
  test('空值 / 未设置 → pow', () => {
    expect(resolveChallengeProvider(undefined).name).toBe('pow');
    expect(resolveChallengeProvider('').name).toBe('pow');
    expect(resolveChallengeProvider('   ').name).toBe('pow');
  });

  test('名字不认识（拼错）→ pow，而不是"谁也不验证"', () => {
    expect(resolveChallengeProvider('turnstle').name).toBe('pow');
  });

  test('名字认识但密钥没配齐 → pow（切过去只会让用户卡在渲不出来的页上）', () => {
    expect(recaptchaService.isConfigured('turnstile')).toBe(false);
    expect(resolveChallengeProvider('turnstile').name).toBe('pow');
  });

  test('密钥配齐 → 真的切过去', async () => {
    await withRecaptchaKeys(() => {
      expect(resolveChallengeProvider('turnstile').name).toBe('turnstile');
      expect(resolveChallengeProvider('  Turnstile ').name).toBe('turnstile'); // 大小写与空白都容错
    });
  });
});

describe('判题按载荷形状选 provider（不是按配置）', () => {
  test('带 token → 用配置的第三方', async () => {
    await withRecaptchaKeys(() => {
      const configured = resolveChallengeProvider('turnstile');
      expect(pickVerifyProvider(configured, { token: 'abc' }).name).toBe('turnstile');
    });
  });

  test('带 challengeId/answer → 一定走 pow（配置成第三方也一样）', async () => {
    await withRecaptchaKeys(() => {
      const configured = resolveChallengeProvider('turnstile');
      // 内嵌挑战页只发 pow 题：它回来的形状必须能被受理，否则那张页就永远过不去
      expect(pickVerifyProvider(configured, { challengeId: 'a'.repeat(32), answer: '1' }).name).toBe('pow');
    });
  });

  test('两者都没有 → 走 pow（由 pow 给出 Malformed Challenge，而不是抛错）', () => {
    expect(pickVerifyProvider(resolveChallengeProvider('pow'), {}).name).toBe('pow');
  });
});

describe('第三方 provider 的判题语义', () => {
  test('没有 token → Invalid Proof（不调上游）', async () => {
    const spy = jest.spyOn(recaptchaService, 'verify');
    const provider = createRecaptchaProvider('turnstile');
    await expect(provider.verify({ request: makeRequest(), body: {} })).resolves.toEqual({
      ok: false,
      reason: 'Invalid Proof'
    });
    expect(spy).not.toHaveBeenCalled();
  });

  test('上游通过 → ok', async () => {
    jest.spyOn(recaptchaService, 'verify').mockResolvedValue({ success: true });
    const provider = createRecaptchaProvider('turnstile');
    await expect(provider.verify({ request: makeRequest(), body: { token: 'good' } })).resolves.toEqual({ ok: true });
  });

  test('上游说 token 不对 → 403 Invalid Proof', async () => {
    jest.spyOn(recaptchaService, 'verify').mockResolvedValue({ success: false, error: 'invalid-input-response' });
    const provider = createRecaptchaProvider('turnstile');
    await expect(provider.verify({ request: makeRequest(), body: { token: 'bad' } })).resolves.toEqual({
      ok: false,
      reason: 'Invalid Proof'
    });
  });

  test('上游不可达 → 503 Challenge Unavailable（可重试，不是"你是机器人"）', async () => {
    jest.spyOn(recaptchaService, 'verify').mockResolvedValue({ success: false, error: 'api_error' });
    const provider = createRecaptchaProvider('turnstile');
    await expect(provider.verify({ request: makeRequest(), body: { token: 'x' } })).resolves.toEqual({
      ok: false,
      reason: 'Challenge Unavailable',
      statusCode: 503
    });
  });

  test('issue 只回 siteKey（公开值），不含任何密钥', async () => {
    await withRecaptchaKeys(async () => {
      const provider = resolveChallengeProvider('turnstile');
      const issued = await provider.issue({ ip: IP });
      expect(issued).toEqual({ siteKey: 'test-site-key' });
      expect(JSON.stringify(issued)).not.toContain('test-secret');
    });
  });
});

describe('服务层：切到第三方后整条链路仍然成立', () => {
  test('issue 下发 provider 与 siteKey；verify 用 token 判定；通过后照常签 cookie', async () => {
    await withRecaptchaKeys(async () => {
      settings.defense.challengeProvider = 'turnstile';
      // 挑战态是签发的前提（与 provider 无关）
      await setBlock(IP, { status: 'CHALLENGE', source: 'auto', permanent: false, expiresAt: Date.now() + 60_000 });

      const issued = await issueChallenge(makeRequest(null, IP));
      expect(issued).toMatchObject({ ok: true, provider: 'turnstile', siteKey: 'test-site-key' });
      expect(issued.challengeId).toBeUndefined(); // 第三方没有服务端载荷

      jest.spyOn(recaptchaService, 'verify').mockResolvedValue({ success: true });
      const reply = makeReply();
      const verified = await verifyChallenge(makeRequest({ token: 'good-token' }, IP), reply);
      expect(verified).toMatchObject({ ok: true, scope: 'anonymous', passTtlSec: 120 });
      expect(reply.cookies.fw_verified).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  test('第三方判定失败 → 403，且不签 cookie', async () => {
    await withRecaptchaKeys(async () => {
      settings.defense.challengeProvider = 'turnstile';
      jest.spyOn(recaptchaService, 'verify').mockResolvedValue({ success: false, error: 'timeout-or-duplicate' });
      const reply = makeReply();
      const res = await verifyChallenge(makeRequest({ token: 'used-token' }, IP), reply);
      expect(res).toMatchObject({ ok: false, statusCode: 403, reason: 'Invalid Proof' });
      expect(reply.cookies.fw_verified).toBeUndefined();
    });
  });

  test('第三方上游挂了 → 503，且不签 cookie', async () => {
    await withRecaptchaKeys(async () => {
      settings.defense.challengeProvider = 'turnstile';
      jest.spyOn(recaptchaService, 'verify').mockResolvedValue({ success: false, error: 'api_error' });
      const reply = makeReply();
      const res = await verifyChallenge(makeRequest({ token: 'x' }, IP), reply);
      expect(res).toMatchObject({ ok: false, statusCode: 503, reason: 'Challenge Unavailable' });
      expect(reply.cookies.fw_verified).toBeUndefined();
    });
  });
});
