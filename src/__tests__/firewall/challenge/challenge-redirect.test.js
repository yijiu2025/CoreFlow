/**
 * 文档请求 → 独立前端挑战页（`defense.challengePageUrl`）
 *
 * 三件事必须钉住：
 *   ① `buildChallengeRedirect` 只产出**站内相对路径**（配置写错 = 开放重定向）；
 *   ② 配了地址 → 管道回 302 + `Location` + 一次性标记 cookie；
 *   ③ 带标记再来一次 → **不再跳**，直接给内置页（否则"前端页挂了 → 回退 → 又 302 → 又挂"
 *      就是死循环；这正是这道标记 cookie 存在的唯一理由）。
 *
 * 判定逻辑不复制：全部走真实 `checkGlobalBlockPhase`，配置来源 mock 在
 * `interface/config-access.js`（与 firewall-switches.test.js 同一套做法）。
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals';

/** 可写副本：每个用例自行改配置，beforeEach 复位 */
let settings;

// ⚠️ 必须先注册 mock 再 import 任何**传递依赖** config-access 的模块：
//    challenge/template.js → util/shared.js 会提前把真实模块装进 registry，
//    之后 pipeline.js 拿到的就还是真身（症状：'安全配置读取器尚未注册'）。
jest.unstable_mockModule('../../../framework/firewall/interface/config-access.js', () => ({
  readSecuritySettings: () => settings,
  registerSettingsReader: () => {},
  hasSettingsReader: () => true
}));

const { DEFAULT_SECURITY_SETTINGS } = await import('../../../app/firewall/config/config.js');
const { buildChallengeRedirect } = await import('../../../framework/firewall/challenge/index.js');
const { checkGlobalBlockPhase } = await import('../../../framework/firewall/engine/pipeline.js');
const { peekChallengeMetrics, resetChallengeMetrics } = await import('../../../framework/firewall/challenge/index.js');
const { setBlock } = await import('../../../framework/firewall/block-manager.js');
const { resetMemoryState } = await import('../../../framework/firewall/util/redis-memory.js');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36';

/** 造一个够用的 request 替身（pipeline 只读这些字段） */
function makeRequest({ ip, url = '/api/user/profile', method = 'GET', ua = UA, cookies = {} } = {}) {
  return { ip, url, method, headers: { 'user-agent': ua }, cookies, body: null };
}

/** 记录副作用的 reply 替身（补上 setCookie 以便断言标记 cookie） */
function makeReply(request) {
  const reply = {
    statusCode: 200,
    sentBody: undefined,
    responseHeaders: {},
    cookies: {},
    request,
    headers(h) {
      Object.assign(reply.responseHeaders, h);
      return reply;
    },
    code(c) {
      reply.statusCode = c;
      return reply;
    },
    send(body) {
      reply.sentBody = body;
      return reply;
    },
    type() {
      return reply;
    },
    header() {
      return reply;
    },
    setCookie(name, value, options) {
      reply.cookies[name] = { value, options };
      return reply;
    }
  };
  return reply;
}

/**
 * 让该 IP 进入挑战态，再走一遍第 1 阶段
 *
 * @param {string} ip 客户端 IP
 * @param {object} extra 额外的 request 字段（如 cookies）
 * @returns {Promise<{blocked: boolean, reply: object}>} 阶段结果
 */
async function challengeAndRun(ip, extra = {}) {
  await setBlock(ip, { status: 'CHALLENGE', source: 'auto', permanent: false, expiresAt: Date.now() + 60_000 });
  const request = makeRequest({ ip, ...extra });
  const reply = makeReply(request);
  request._fingerprint = 'fp-doc';
  request._deviceId = null;
  request._firewallLog = { blocked: false, statusCode: 0 };
  // 浏览器直接打开地址：Sec-Fetch-Mode: navigate → 文档请求
  request.headers['sec-fetch-mode'] = 'navigate';
  request.headers.accept = 'text/html';
  const blocked = await checkGlobalBlockPhase(request, reply);
  return { blocked, reply };
}

beforeEach(() => {
  resetMemoryState();
  resetChallengeMetrics();
  settings = {
    ...DEFAULT_SECURITY_SETTINGS,
    defense: { ...DEFAULT_SECURITY_SETTINGS.defense, challengePageUrl: '' }
  };
});

// ── ① 纯函数：只产出站内相对路径 ───────────────────────────────────────────────

describe('buildChallengeRedirect：只认站内相对路径', () => {
  test('空 / 非字符串 → null（回落内置页，不报错）', () => {
    expect(buildChallengeRedirect('', '/api/x')).toBeNull();
    expect(buildChallengeRedirect('   ', '/api/x')).toBeNull();
    expect(buildChallengeRedirect(null, '/api/x')).toBeNull();
    expect(buildChallengeRedirect(undefined, '/api/x')).toBeNull();
    expect(buildChallengeRedirect(42, '/api/x')).toBeNull();
  });

  test('绝对地址 / 协议相对地址一律拒绝（否则 302 就是开放重定向）', () => {
    expect(buildChallengeRedirect('https://evil.example/x', '/api/x')).toBeNull();
    expect(buildChallengeRedirect('//evil.example/x', '/api/x')).toBeNull();
    // 部分浏览器把反斜杠当斜杠：`/\evil.com` 等价于 `//evil.com`
    expect(buildChallengeRedirect('/\\evil.example/x', '/api/x')).toBeNull();
  });

  test('正常路径：带上原 URL（含查询串）并做 URL 编码', () => {
    expect(buildChallengeRedirect('/firewall/challenge.html', '/api/user/profile?a=1&b=2')).toBe(
      '/firewall/challenge.html?return=%2Fapi%2Fuser%2Fprofile%3Fa%3D1%26b%3D2'
    );
  });

  test('地址本身带查询串时用 & 续接（不能出现两个 ?）', () => {
    expect(buildChallengeRedirect('/challenge.html?from=fw', '/api/x')).toBe(
      '/challenge.html?from=fw&return=%2Fapi%2Fx'
    );
  });

  test('原 URL 不是站内地址 → return 退回根路径（绝不把外部地址塞进 return）', () => {
    expect(buildChallengeRedirect('/firewall/challenge.html', 'https://evil.example/x')).toBe(
      '/firewall/challenge.html?return=%2F'
    );
    expect(buildChallengeRedirect('/firewall/challenge.html', '')).toBe('/firewall/challenge.html?return=%2F');
    // `//host` 是协议相对地址，同样不能进 return
    expect(buildChallengeRedirect('/firewall/challenge.html', '//evil.example/x')).toBe(
      '/firewall/challenge.html?return=%2F'
    );
  });
});

// ── ② 管道：配了就 302 ────────────────────────────────────────────────────────

describe('管道：文档请求按配置 302 / 回落内置页', () => {
  test('没配 challengePageUrl → 200 + 内置 HTML（现状行为不变）', async () => {
    const { blocked, reply } = await challengeAndRun('203.0.113.101');
    expect(blocked).toBe(true);
    expect(reply.statusCode).toBe(200);
    expect(reply.sentBody).toContain('CHALLENGE_ID');
    expect(reply.responseHeaders.Location).toBeUndefined();
    expect(reply.cookies.fw_chal_page).toBeUndefined();
    // 观测：没配 → 走内置页
    expect(peekChallengeMetrics()).toMatchObject({ 'surface:inline': 1 });
  });

  test('配了 → 302 + Location + 一次性标记 cookie（不渲染 HTML）', async () => {
    settings.defense.challengePageUrl = '/firewall/challenge.html';
    const { blocked, reply } = await challengeAndRun('203.0.113.102', { url: '/api/user/profile?tab=1' });

    expect(blocked).toBe(true);
    expect(reply.statusCode).toBe(302);
    expect(reply.responseHeaders.Location).toBe('/firewall/challenge.html?return=%2Fapi%2Fuser%2Fprofile%3Ftab%3D1');
    expect(reply.sentBody).toBeUndefined();
    // 标记 cookie：只用于"下次别再跳"，不参与安全判定
    expect(reply.cookies.fw_chal_page).toMatchObject({ value: '1' });
    expect(reply.cookies.fw_chal_page.options).toMatchObject({ path: '/', httpOnly: true, sameSite: 'lax' });
    // 302 绝不能被缓存，否则所有人被永久导向挑战页
    expect(reply.responseHeaders['Cache-Control']).toContain('no-store');
    // 观测：走前端页的流量单独计数（用来回答"内嵌页还有没有真实流量"）
    expect(peekChallengeMetrics()).toMatchObject({ 'surface:page': 1 });
  });

  test('配置写坏（绝对地址）→ 当作没配，回落内置页而不是 302 到外站', async () => {
    settings.defense.challengePageUrl = 'https://evil.example/challenge';
    const { reply } = await challengeAndRun('203.0.113.103');
    expect(reply.statusCode).toBe(200);
    expect(reply.responseHeaders.Location).toBeUndefined();
  });

  test('带标记 cookie 再来 → 不再 302，直接给内置页（打破"前端挂了→回退→又跳"的死循环）', async () => {
    settings.defense.challengePageUrl = '/firewall/challenge.html';
    const { reply } = await challengeAndRun('203.0.113.104', { cookies: { fw_chal_page: '1' } });

    expect(reply.statusCode).toBe(200);
    expect(reply.sentBody).toContain('CHALLENGE_ID');
    expect(reply.responseHeaders.Location).toBeUndefined();
  });

  test('标记 cookie 只认值 `1`（别把任意 cookie 都当成回退信号）', async () => {
    settings.defense.challengePageUrl = '/firewall/challenge.html';
    const { reply } = await challengeAndRun('203.0.113.105', { cookies: { fw_chal_page: 'yes' } });
    expect(reply.statusCode).toBe(302);
  });

  test('XHR 不受 challengePageUrl 影响：仍是 428 + X-Firewall-Challenge', async () => {
    settings.defense.challengePageUrl = '/firewall/challenge.html';
    const ip = '203.0.113.106';
    await setBlock(ip, { status: 'CHALLENGE', source: 'auto', permanent: false, expiresAt: Date.now() + 60_000 });

    const request = makeRequest({ ip, url: '/api/user/profile' });
    request.headers['sec-fetch-mode'] = 'cors'; // XHR
    const reply = makeReply(request);
    request._fingerprint = 'fp-xhr';
    request._deviceId = null;
    request._firewallLog = { blocked: false, statusCode: 0 };

    expect(await checkGlobalBlockPhase(request, reply)).toBe(true);
    expect(reply.statusCode).toBe(428);
    expect(reply.responseHeaders['X-Firewall-Challenge']).toBe('/api/user/profile');
    expect(reply.responseHeaders.Location).toBeUndefined();
    expect(reply.cookies.fw_chal_page).toBeUndefined();
    // 观测：XHR 是第三种形态，不能和两个页面混在一起
    expect(peekChallengeMetrics()).toMatchObject({ 'surface:xhr': 1 });
  });
});
