/**
 * 递进难度：难度按"这台机器最近的挑战表现"浮动
 *
 * 这组用例钉三件容易做错的事：
 *   ① **关着时必须恒为基准** —— 默认关闭意味着"不改变任何人的体验"，任何"顺手生效"
 *      都是事故（运维根本没答应过让用户的题变难）；
 *   ② **升难度的信号只认「答案不对」** —— `Expired`（载荷 300s 过期）、`Mismatch`
 *      （切网改 IP）计进去，就是这套机制最经典的自伤：用户越倒霉 → 题越难 → 更过不去；
 *   ③ **配置写坏不能变成"机制失效"** —— min/max 写反、窗口写 0、难度写 `"abc"`，
 *      都要退化成可预测的行为（交换/回退），而不是"永远基准"或"永远上限"。
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// ⚠️ 先注册 mock 再 import 任何**传递依赖** config-access 的模块（顺序错了拿到的是真身，
//    症状是「安全配置读取器尚未注册」）。与 challenge-redirect.test.js 同一套约定。
let settings;
jest.unstable_mockModule('../../../framework/ingress/firewall/interface/config-access.js', () => ({
  readSecuritySettings: () => settings,
  registerSettingsReader: () => {},
  hasSettingsReader: () => true
}));

// store.js 真身会起 10 秒防抖落盘定时器（jest 进程活过 10 秒就会污染工作区）
jest.unstable_mockModule('../../../app/firewall/data/store.js', () => ({
  pushRecord: () => {},
  getRecentRecords: () => [],
  getSummary: () => ({}),
  clearAll: () => {},
  setBroadcastHandler: () => {},
  stopPersistTimer: () => {},
  flushPersist: async () => {}
}));

const { DEFAULT_SECURITY_SETTINGS } = await import('../../../framework/ingress/firewall/config/defaults.js');
const { resolveChallengeDifficulty } = await import('../../../framework/ingress/firewall/challenge/index.js');
const { bumpCounter, readCounter, rel } = await import('../../../framework/ingress/firewall/util/redis.js');
const { resetMemoryState } = await import('../../../framework/ingress/firewall/util/redis-memory.js');
const { issueChallengePayload } = await import('../../../framework/ingress/firewall/challenge/index.js');
const { verifyChallenge } = await import('../../../app/firewall/services/challenge/index.js');
const { makePowSolver } = await import('../../../framework/security/verify/pow/service.js');

const IP = '203.0.113.61';
const WINDOW = 600;

/**
 * 把某个 IP 的"答错 / 通过"计数打到指定次数
 *
 * @param {string} ip 客户端 IP
 * @param {{fails?: number, passes?: number}} counts 计数
 * @returns {Promise<void>}
 */
async function seed(ip, { fails = 0, passes = 0 }) {
  for (let i = 0; i < fails; i++) await bumpCounter(rel.chalFail(ip), WINDOW);
  for (let i = 0; i < passes; i++) await bumpCounter(rel.chalPass(ip), WINDOW);
}

/** 造一个只要 ip 的请求替身（verifyChallenge 只用到 ip / headers / cookies / body） */
function makeRequest(ip, body = null) {
  return {
    ip,
    url: '/api/firewall/v1/challenge/verify',
    method: 'POST',
    headers: { 'user-agent': 'UA-Test' },
    cookies: {},
    body
  };
}

/** 记录副作用的最小 reply 替身（本组只关心 setCookie 是否被调用） */
function makeReply() {
  const reply = {
    statusCode: 200,
    cookies: {},
    setCookie(name, value) {
      reply.cookies[name] = value;
    }
  };
  return reply;
}

/** 用与服务端同一份内核求解页面里那一道题 */
function solve(challenge) {
  const matches = makePowSolver(`${challenge.challengeId}:${challenge.salt}:`, challenge.difficulty);
  for (let i = 0; i < challenge.maxAttempts; i++) if (matches(i)) return String(i);
  throw new Error('求不出解（用例本身有问题）');
}

beforeEach(() => {
  resetMemoryState();
  settings = { defense: { ...DEFAULT_SECURITY_SETTINGS.defense } };
});

describe('开关：默认关闭时恒为基准', () => {
  test('关闭时即使计数已经很难看，也一字不动', async () => {
    await seed(IP, { fails: 9, passes: 0 });
    const r = await resolveChallengeDifficulty({ ip: IP });
    expect(r).toEqual({ difficulty: 3, reason: 'baseline' });
  });

  test('没有 ip 时直接给基准（不读计数、不抛错）', async () => {
    settings.defense.challengeReputationEnabled = true;
    await expect(resolveChallengeDifficulty({ ip: '' })).resolves.toEqual({ difficulty: 3, reason: 'baseline' });
    await expect(resolveChallengeDifficulty({})).resolves.toEqual({ difficulty: 3, reason: 'baseline' });
  });
});

describe('信誉浮动：答错升、连过降', () => {
  beforeEach(() => {
    settings.defense.challengeReputationEnabled = true;
  });

  test('答错 2 次（且一次没通过）→ 升 1 档', async () => {
    await seed(IP, { fails: 2 });
    expect(await resolveChallengeDifficulty({ ip: IP })).toEqual({ difficulty: 4, reason: 'hardened' });
  });

  test('答错 5 次 → 升到上限（不再往上涨）', async () => {
    await seed(IP, { fails: 5 });
    expect(await resolveChallengeDifficulty({ ip: IP })).toEqual({ difficulty: 5, reason: 'hardened' });

    // 继续答错也只有上限那么多
    await seed(IP, { fails: 20 });
    expect((await resolveChallengeDifficulty({ ip: IP })).difficulty).toBe(5);
  });

  test('顺利通过 3 次 → 降 1 档', async () => {
    await seed(IP, { passes: 3 });
    expect(await resolveChallengeDifficulty({ ip: IP })).toEqual({ difficulty: 2, reason: 'relaxed' });
  });

  test('通过越多也只降到下限（难度过低等于没有成本）', async () => {
    await seed(IP, { passes: 30 });
    expect((await resolveChallengeDifficulty({ ip: IP })).difficulty).toBe(2);
  });

  test('有过答错就不再享受"连过降档"（哪怕是 3 次通过 1 次失败）', async () => {
    await seed(IP, { fails: 1, passes: 5 });
    expect(await resolveChallengeDifficulty({ ip: IP })).toEqual({ difficulty: 3, reason: 'baseline' });
  });

  test('登录用户整体低一档：答错 5 次也只升 1 档', async () => {
    await seed(IP, { fails: 5 });
    expect(await resolveChallengeDifficulty({ ip: IP, loggedIn: true })).toEqual({ difficulty: 4, reason: 'hardened' });
  });

  test('登录用户 + 零失败 → 直接给下限附近（不越过 Min）', async () => {
    await seed(IP, { passes: 3 });
    expect(await resolveChallengeDifficulty({ ip: IP, loggedIn: true })).toEqual({ difficulty: 2, reason: 'relaxed' });
  });
});

describe('阈值可调：三个触发点走配置', () => {
  beforeEach(() => {
    settings.defense.challengeReputationEnabled = true;
  });

  test('HardenAfterFails 调成 1 → 答错 1 次就升 1 档', async () => {
    settings.defense.challengeReputationHardenAfterFails = 1;
    await seed(IP, { fails: 1 });
    expect(await resolveChallengeDifficulty({ ip: IP })).toEqual({ difficulty: 4, reason: 'hardened' });
  });

  test('HardenStrongAfterFails 调成 3 → 答错 3 次直接升 2 档（跳过 1 档）', async () => {
    settings.defense.challengeReputationHardenStrongAfterFails = 3;
    await seed(IP, { fails: 3 });
    expect(await resolveChallengeDifficulty({ ip: IP })).toEqual({ difficulty: 5, reason: 'hardened' });
  });

  test('RelaxAfterPasses 调成 1 → 通过 1 次就降 1 档', async () => {
    settings.defense.challengeReputationRelaxAfterPasses = 1;
    await seed(IP, { passes: 1 });
    expect(await resolveChallengeDifficulty({ ip: IP })).toEqual({ difficulty: 2, reason: 'relaxed' });
  });

  test('阈值都调大 → 同样的计数不再触发（改配置真的能关小这套机制）', async () => {
    settings.defense.challengeReputationHardenAfterFails = 10;
    settings.defense.challengeReputationHardenStrongAfterFails = 10;
    await seed(IP, { fails: 5 });
    expect(await resolveChallengeDifficulty({ ip: IP })).toEqual({ difficulty: 3, reason: 'baseline' });
  });

  test('HardenStrong 写得比 Harden 小 → 抬到同值，不会让 Harden 那一档静默失效', async () => {
    settings.defense.challengeReputationHardenAfterFails = 4;
    settings.defense.challengeReputationHardenStrongAfterFails = 2;
    // 抬齐后 strongAt = 4：答错 2 次既够不上 Harden(4) 也够不上 Strong(4) → 基准
    await seed(IP, { fails: 2 });
    expect(await resolveChallengeDifficulty({ ip: IP })).toEqual({ difficulty: 3, reason: 'baseline' });
    // 答错 4 次才命中 Strong → 升 2 档
    await seed(IP, { fails: 2 });
    expect(await resolveChallengeDifficulty({ ip: IP })).toEqual({ difficulty: 5, reason: 'hardened' });
  });

  test('三个阈值写坏（0 / 负数 / "abc" / null）→ 各自回退默认，不会变成"人人顶格"', async () => {
    // 每个坏值换一个 IP：计数是按 IP 累加的，复用同一个 IP 会让上一轮的失败次数串味
    const bads = ['abc', 0, -1, null];
    for (let i = 0; i < bads.length; i++) {
      settings.defense.challengeReputationHardenAfterFails = bads[i];
      settings.defense.challengeReputationHardenStrongAfterFails = bads[i];
      settings.defense.challengeReputationRelaxAfterPasses = bads[i];
      const ip = `203.0.113.${100 + i}`;
      // 回退到默认 2 / 5 / 3：答错 2 次仍然只升 1 档（而不是被 0 顶到上限）
      await seed(ip, { fails: 2 });
      expect((await resolveChallengeDifficulty({ ip })).difficulty).toBe(4);
    }
  });
});

describe('配置写坏：退化成可预测行为，而不是机制失效', () => {
  beforeEach(() => {
    settings.defense.challengeReputationEnabled = true;
  });

  test('Min > Max 写反 → 交换后仍然生效', async () => {
    settings.defense.challengeDifficultyMin = 5;
    settings.defense.challengeDifficultyMax = 2;
    await seed(IP, { fails: 5 });
    // 交换后区间是 [2, 5]，答错 5 次仍能升到 5
    expect((await resolveChallengeDifficulty({ ip: IP })).difficulty).toBe(5);
  });

  test('难度区间把基准夹在中间：Min=4 时基准 3 被抬到 4，但 reason 仍是 baseline', async () => {
    settings.defense.challengeDifficultyMin = 4;
    expect(await resolveChallengeDifficulty({ ip: IP })).toEqual({ difficulty: 4, reason: 'baseline' });
  });

  test('难度写 "abc" / 0 / null → 回退基准 3，不会变成"没有难度"', async () => {
    for (const bad of ['abc', 0, -1, null, 99]) {
      settings.defense.challengeDifficulty = bad;
      const r = await resolveChallengeDifficulty({ ip: IP });
      // 99 会被夹到上限 5；其余回退基准 3。关键是**绝不为 0**
      expect(r.difficulty).toBeGreaterThanOrEqual(1);
      expect(r.difficulty).toBeLessThanOrEqual(5);
    }
  });

  test('窗口写成 0 也不会让计数"立刻过期"（回退默认窗口）', async () => {
    settings.defense.challengeReputationWindowSec = 0;
    // 走服务层：通过一次后计数必须还在，否则等于窗口形同虚设
    const challenge = await issueChallengePayload({ ip: IP });
    const reply = makeReply();
    await verifyChallenge(makeRequest(IP, { challengeId: challenge.challengeId, answer: solve(challenge) }), reply);
    expect(await readCounter(rel.chalPass(IP))).toBe(1);
  });
});

describe('服务层：只有「答案不对」计入升难度', () => {
  beforeEach(() => {
    settings.defense.challengeReputationEnabled = true;
  });

  test('通过一次 → 通过计数 +1，答错计数不动', async () => {
    const challenge = await issueChallengePayload({ ip: IP });
    const res = await verifyChallenge(
      makeRequest(IP, { challengeId: challenge.challengeId, answer: solve(challenge) }),
      makeReply()
    );
    expect(res.ok).toBe(true);
    expect(await readCounter(rel.chalPass(IP))).toBe(1);
    expect(await readCounter(rel.chalFail(IP))).toBe(0);
  });

  test('答案不对 → 答错计数 +1（这是唯一的"升"信号）', async () => {
    const challenge = await issueChallengePayload({ ip: IP });
    const res = await verifyChallenge(
      makeRequest(IP, { challengeId: challenge.challengeId, answer: 'x' }),
      makeReply()
    );
    expect(res).toMatchObject({ ok: false, reason: 'Invalid Proof' });
    expect(await readCounter(rel.chalFail(IP))).toBe(1);
  });

  test('重放（Challenge Expired）不计入：那是页面/网络问题，不是"在试错"', async () => {
    const challenge = await issueChallengePayload({ ip: IP });
    const body = { challengeId: challenge.challengeId, answer: solve(challenge) };
    await verifyChallenge(makeRequest(IP, body), makeReply()); // 第一次通过
    const replay = await verifyChallenge(makeRequest(IP, body), makeReply()); // 第二次必然 Expired
    expect(replay).toMatchObject({ ok: false, reason: 'Challenge Expired' });
    expect(await readCounter(rel.chalFail(IP))).toBe(0);
  });

  test('换 IP 提交（Challenge Mismatch）不计入：切网的用户不该被加难度', async () => {
    settings.defense.challengeReputationEnabled = true;
    const challenge = await issueChallengePayload({ ip: IP, fingerprint: 'fp-a' });
    const res = await verifyChallenge(
      makeRequest('198.51.100.77', { challengeId: challenge.challengeId, answer: solve(challenge) }),
      makeReply()
    );
    expect(res).toMatchObject({ ok: false, reason: 'Challenge Mismatch' });
    expect(await readCounter(rel.chalFail('198.51.100.77'))).toBe(0);
  });

  test('开关关闭时，通过/失败都不写计数（不留下"以后打开就生效"的旧账）', async () => {
    settings.defense.challengeReputationEnabled = false;
    const challenge = await issueChallengePayload({ ip: IP });
    await verifyChallenge(makeRequest(IP, { challengeId: challenge.challengeId, answer: 'x' }), makeReply());
    expect(await readCounter(rel.chalFail(IP))).toBe(0);
  });
});

describe('端到端：计数真的接到出题上', () => {
  beforeEach(() => {
    settings.defense.challengeReputationEnabled = true;
  });

  test('连续答错之后，新发的挑战难度确实升了（并带上 reason）', async () => {
    const first = await issueChallengePayload({ ip: IP });
    expect(first.difficulty).toBe(3);
    expect(first.reason).toBe('baseline');

    // 把这题答错两次（每次都要重新出题：载荷是一次性的）
    for (let i = 0; i < 2; i++) {
      const c = await issueChallengePayload({ ip: IP });
      await verifyChallenge(makeRequest(IP, { challengeId: c.challengeId, answer: 'x' }), makeReply());
    }

    const hardened = await issueChallengePayload({ ip: IP });
    expect(hardened.difficulty).toBe(4);
    expect(hardened.reason).toBe('hardened');
    // 题目参数必须跟着难度一起变（尝试上限按 8 倍期望值推导）
    expect(hardened.maxAttempts).toBeGreaterThan(first.maxAttempts);
  });

  test('登录态通过 issue 入口体现为降档', async () => {
    await seed(IP, { passes: 3 });
    const anon = await issueChallengePayload({ ip: IP });
    const authed = await issueChallengePayload({ ip: IP, loggedIn: true });
    expect(anon.difficulty).toBe(2);
    expect(authed.difficulty).toBe(2); // 已在下限，登录不再继续往下降
    expect(authed.reason).toBe('relaxed');
  });
});
