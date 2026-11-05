/**
 * 防火墙总开关 + 五道闸门开关的行为测试
 *
 * 2026-11-05 起 defense 下多了三个开关：
 *   enableFirewall     总开关（false = 整套防护旁路，排障用）
 *   enableGlobalBlock  封禁闸门（false = 不再拦黑名单/已封禁态）
 *   enableChallenge   挑战闸门（false = 挑战态放行，且 Bot 检测一并跳过）
 *
 * 这里只用**真身**函数 + 可变的配置副本，不复制任何判定逻辑：配置来源 mock 在
 * `interface/config-access.js`（与 bot-detector.test.js 同一套做法），封禁状态走
 * redis 访问层在 jest 环境下的内存实现。
 *
 * @author yijiu2025
 * @since 2026-11-05
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const { DEFAULT_SECURITY_SETTINGS } = await import('../app/firewall/config/config.js');

/** 可写副本：每个用例自行改开关，beforeEach 复位 */
let settings;

jest.unstable_mockModule('../framework/firewall/interface/config-access.js', () => ({
  readSecuritySettings: () => settings,
  registerSettingsReader: () => {},
  hasSettingsReader: () => true
}));

const { checkGlobalBlockPhase, runDetectionPipeline, isFirewallEnabled } =
  await import('../framework/firewall/engine/pipeline.js');
const { setBlock, removeBlock } = await import('../framework/firewall/block-manager.js');
const { resetMemoryState } = await import('../framework/firewall/util/redis-memory.js');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36';

/** 造一个够用的 request 替身（pipeline 只读这些字段） */
function makeRequest({ ip, url = '/api/user/profile', method = 'GET', ua = UA, cookies = {} } = {}) {
  return { ip, url, method, headers: { 'user-agent': ua }, cookies, body: null };
}

/**
 * 造一个记录副作用的 reply 替身（`request` 必须挂上：地理围栏读 `reply.request.ip`）
 *
 * @param {object} request 对应的 request 替身
 * @returns {object} reply 替身
 */
function makeReply(request) {
  const reply = {
    statusCode: 200,
    sentBody: undefined,
    responseHeaders: {},
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
    setCookie() {
      return reply;
    }
  };
  return reply;
}

/**
 * 走一遍第 1 阶段（封禁检查）
 *
 * @param {object} options 传给 makeRequest 的参数
 * @returns {Promise<{blocked: boolean, reply: object}>} blocked=true 表示被拦并已回包
 */
async function runBlockPhase(options) {
  const request = makeRequest(options);
  const reply = makeReply(request);
  request._fingerprint = 'fp-test';
  request._deviceId = null;
  request._firewallLog = { blocked: false, statusCode: 0 };
  const blocked = await checkGlobalBlockPhase(request, reply);
  return { blocked, reply };
}

/**
 * 走一遍第 3 阶段（深度检测）
 *
 * @param {string} ip 客户端 IP
 * @param {string} ua User-Agent
 * @param {object} [options] 透传给 runDetectionPipeline 的 options
 * @returns {Promise<{intercepted: boolean, reply: object, firewallLog: object}>} 结果
 */
async function runPipeline(ip, ua, options = {}) {
  const request = makeRequest({ ip, ua });
  const reply = makeReply(request);
  const firewallLog = { blocked: false, statusCode: 0 };
  const intercepted = await runDetectionPipeline(ip, ua, request.url, firewallLog, 'fp-test', reply, null, options);
  return { intercepted, reply, firewallLog };
}

beforeEach(() => {
  settings = {
    ...DEFAULT_SECURITY_SETTINGS,
    defense: { ...DEFAULT_SECURITY_SETTINGS.defense }
  };
  resetMemoryState();
});

describe('总开关 enableFirewall', () => {
  test('默认开启（配置默认值就是 true）', () => {
    expect(DEFAULT_SECURITY_SETTINGS.defense.enableFirewall).toBe(true);
    expect(isFirewallEnabled()).toBe(true);
  });

  test('关掉后整机旁路：已封禁 IP 也放行，且不发生任何拦截', async () => {
    const ip = '198.51.100.11';
    await setBlock(ip, { status: 'BLOCKED', source: 'manual', permanent: true });

    // 对照组：开关开着 → 拦
    const on = await runBlockPhase({ ip });
    expect(on.blocked).toBe(true);
    // block-manager 的既定语义：SCANNER→403，其余（BLOCKED 等）→429
    expect(on.reply.statusCode).toBe(429);

    settings.defense.enableFirewall = false;
    expect(isFirewallEnabled()).toBe(false);
    const off = await runBlockPhase({ ip });
    expect(off.blocked).toBe(false);
    expect(off.reply.sentBody).toBeUndefined();

    await removeBlock(ip);
  });

  test('关掉后深度检测管道也直接放行（不计数、不写挑战态）', async () => {
    settings.defense.enableFirewall = false;
    const { intercepted, firewallLog } = await runPipeline('198.51.100.12', 'python-requests/2.28.0');
    expect(intercepted).toBe(false);
    expect(firewallLog.blocked).toBe(false);
  });
});

describe('封禁闸门 enableGlobalBlock', () => {
  test('关掉后黑名单/已封禁态不再拦人（对照组：开着就拦）', async () => {
    const ip = '198.51.100.21';
    await setBlock(ip, { status: 'SCANNER', source: 'auto', permanent: false, expiresAt: Date.now() + 60_000 });

    const on = await runBlockPhase({ ip });
    expect(on.blocked).toBe(true);

    settings.defense.enableGlobalBlock = false;
    const off = await runBlockPhase({ ip });
    expect(off.blocked).toBe(false);

    await removeBlock(ip);
  });

  test('关掉封禁闸门不影响挑战闸门的判断口径（各自独立）', async () => {
    settings.defense.enableGlobalBlock = false;
    settings.defense.enableChallenge = true;
    // 封禁闸关闭时连挑战态检查都不会执行（checkGlobalBlock 被跳过）—— 这是有意的：
    // "封禁"这一类处置整体关掉，挑战态也只是封禁键的一种状态
    const ip = '198.51.100.22';
    await setBlock(ip, { status: 'CHALLENGE', source: 'auto', permanent: false, expiresAt: Date.now() + 60_000 });
    const result = await runBlockPhase({ ip });
    expect(result.blocked).toBe(false);
    await removeBlock(ip);
  });
});

describe('挑战闸门 enableChallenge', () => {
  test('关掉后挑战态请求直接放行（不再渲染挑战页 / 428）', async () => {
    const ip = '198.51.100.31';
    await setBlock(ip, { status: 'CHALLENGE', source: 'auto', permanent: false, expiresAt: Date.now() + 60_000 });

    // 对照组：开着 → 拦并下发挑战响应
    const on = await runBlockPhase({ ip });
    expect(on.blocked).toBe(true);
    expect([200, 428]).toContain(on.reply.statusCode);

    settings.defense.enableChallenge = false;
    const off = await runBlockPhase({ ip });
    expect(off.blocked).toBe(false);

    await removeBlock(ip);
  });

  test('关掉后 Bot 检测一并跳过（它只会写挑战态，而挑战态已不拦人）', async () => {
    settings.defense.enableChallenge = false;
    const ip = '198.51.100.32';

    const { intercepted } = await runPipeline(ip, 'python-requests/2.28.0');
    expect(intercepted).toBe(false);

    // 关键：没有写入挑战态 —— 把闸门打开后同一个 IP 仍然可正常访问
    settings.defense.enableChallenge = true;
    const again = await runBlockPhase({ ip });
    expect(again.blocked).toBe(false);
  });

  test('开启时同样的请求会命中挑战（证明上一条不是"反正都不命中"）', async () => {
    const ip = '198.51.100.33';
    // 阈值调到 1，第 2 次请求必中（判据是 `requestCount > limit`）
    settings.defense.botChallengeBotLimit = 1;
    await runPipeline(ip, 'python-requests/2.28.0');
    await runPipeline(ip, 'python-requests/2.28.0');

    const after = await runBlockPhase({ ip });
    expect(after.blocked).toBe(true);
    await removeBlock(ip);
  });
});
