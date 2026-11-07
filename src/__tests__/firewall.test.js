/**
 * 防火墙核心链路契约测试
 *
 * 覆盖五条真实链路，全部 `import` 真身实现（不再有内联副本）：
 *   ① 封禁状态机 —— 四种状态各自的入口行为（CHALLENGE 不是硬封禁）
 *   ② 挑战链路端到端 —— 下发挑战 → 求解 PoW → 校验 → 签发令牌 → 撤销挑战态放行
 *   ③ 名单三维度隔离 —— IP / 指纹 / 设备互不污染，设备维度跨 IP 生效
 *   ④ 匿名请求短路（🔵-17）—— 判定只认「一个凭据都没有」，且依赖的机制被钉死
 *   ⑤ 启动链路 —— initDao 被真正调用、安全管道只注册一次、插件只有唯一注册点
 *
 * ⚠️ 为什么要重写（AUDIT-REPORT-2026-09-15 🟡-7）：
 * 本文件的前身是一份**内联副本**测试 —— 自己在文件里定义 `isBot` / `isScanTrap` /
 * `checkRateLimit` 再自己断言。它对 `src/app/firewall` 的真身**零覆盖**，因此
 * 「扫描计数翻倍」「挑战令牌写不进去」「暴力破解从未接入」这些缺陷能长期漏过测试。
 * 重写后所有断言都打在真身上。
 *
 * 重写时立刻抓到一个真实漂移：旧副本把 `curl` 列为 bot 模式并断言「curl 超限触发挑战」，
 * 而真身默认配置里只有 `libcurl`（`config.js:249`）—— 也就是说那条断言若打向真身是**失败**的。
 * 这种漂移正是内联副本的危害本身，故在 `bot-detector.test.js` 里补了一条固化用例。
 *
 * Redis 不在 jest 环境时，访问层自动走内存实现（与 firewall-redis-adapter.test.js 同策略），
 * 因此这些用例既能离线跑，又走的是生产同一条代码路径。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-09-15 重写为真身契约测试（🟡-7）
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

// ── 隔离副作用 ────────────────────────────────────────────────────────────────
// `data/store.js` 的 pushRecord 会起一个 10 秒防抖定时器，把环形缓冲落到
// `data/traffic_stats.json`（一个运行期数据文件（已不进 git））。jest 进程普遍活过 10 秒
// → 测试会污染仓库工作区。整体替换为可断言的桩：既消除落盘，又能断言「挑战页下发时
// 记了一条 blocked 记录」。
const pushedRecords = [];
jest.unstable_mockModule('../app/firewall/data/store.js', () => ({
  pushRecord: r => {
    pushedRecords.push(r);
  },
  getRecentRecords: () => pushedRecords.slice(),
  getSummary: () => ({
    totalRequests: pushedRecords.length,
    totalBlocked: pushedRecords.filter(r => r.blocked).length,
    bufferedCount: pushedRecords.length,
    bufferCapacity: 1000,
    topRegions: [],
    topPaths: [],
    topIps: []
  }),
  clearAll: () => {
    pushedRecords.length = 0;
  },
  setBroadcastHandler: () => {},
  // ⚠️ 模块替身必须**镜像真身的导出面**：ESM 是静态链接的，真身新增一个导出而替身没有，
  // 整条 import 链会以 `does not provide an export named '...'` 直接崩掉整个套件
  // （不是某一项失败，是 "Test suite failed to run"）。
  // 真身在 2026-09-19 新增了这两个生命周期函数供 onClose 落盘使用。
  stopPersistTimer: () => {},
  flushPersist: async () => {}
}));

// 两层分离：引擎经 framework 的 telemetry-sink 产生记录事件；store.js 被替身后，
// 替身模块体（sink 注册）不会执行 —— 在此把 pushedRecords 桩显式注册进 sink。
const { registerRecordSink } = await import('../framework/ingress/firewall/telemetry-sink.js');
registerRecordSink(r => pushedRecords.push(r));

const { buildChallengePage } = await import('../framework/ingress/firewall/challenge/index.js');
const { issueChallenge, verifyChallenge } = await import('../app/firewall/services/challenge/index.js');
const { sha256Hex } = await import('../framework/security/verify/pow/service.js');
const { generateFingerprint } = await import('../framework/ingress/firewall/util/fingerprint.js');
const { hasPass } = await import('../framework/ingress/firewall/util/redis.js');
const { ipRequestTimestamps } = await import('../framework/ingress/firewall/util/shared.js');
const { setBlock, setBlockDevice, setWhitelistDevice, getActiveBlocks, getActiveWhitelist, checkGlobalBlock } =
  await import('../framework/ingress/firewall/block-manager.js');
const { buildRequestContext, checkGlobalBlockPhase, willBeRejectedAsAnonymous, observeLoginOutcome } =
  await import('../framework/ingress/firewall/engine/pipeline.js');
const { isAccountLocked } = await import('../framework/ingress/firewall/engine/detectors/brute-force.js');
const { checkNotFoundTrap, isSafePath, isLoopbackIp } =
  await import('../framework/ingress/firewall/engine/detectors/scan-trap.js');
const { generateServerSideDeviceId } = await import('../framework/security/auth/device/device-id-service.js');
const { getSecuritySettings } = await import('../app/firewall/dao/dao.js');
const { initFirewall } = await import('../app/firewall/index.js');

// ── 测试替身 ──────────────────────────────────────────────────────────────────

const UA_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * 构造一个「够用」的请求对象
 *
 * 只用真身实际会读到的字段（ip / url / method / headers / cookies / body）——
 * firewall 的 onRequest 阶段不依赖 Fastify 的其余能力，因此无需起真实服务。
 */
function makeRequest({
  ip,
  ua = UA_CHROME,
  deviceId = null,
  cookies = {},
  body = null,
  url = '/api/firewall/v1/monitor/summary',
  method = 'GET',
  // 模拟 Fastify 路由匹配后的状态：`request.routeOptions.config` 可读。
  // 登录观测只认 `credentialRoute` 声明、挑战接口放行只认 `challengeSurface` 声明
  // （见 pipeline.js 的 isCredentialRoute / isChallengeApiUrl），都不再看 URL 正则。
  credentialRoute = false,
  challengeSurface = false
}) {
  const headers = { 'user-agent': ua };
  if (deviceId) headers['x-device-id'] = deviceId;
  const request = { ip, url, method, headers, cookies, body };
  const firewall = {};
  if (credentialRoute) firewall.credentialRoute = true;
  if (challengeSurface) firewall.challengeSurface = true;
  if (Object.keys(firewall).length) request.routeOptions = { config: { firewall } };
  return request;
}

/** 构造一个记录副作用的 reply 替身（type / headers / code / send / setCookie） */
function makeReply() {
  const reply = {
    statusCode: 200,
    sentBody: undefined,
    sentType: undefined,
    responseHeaders: {},
    cookies: {},
    type(t) {
      reply.sentType = t;
      return reply;
    },
    headers(h) {
      Object.assign(reply.responseHeaders, h);
      return reply;
    },
    code(c) {
      reply.statusCode = c;
      return reply;
    },
    send(p) {
      reply.sentBody = p;
      return reply;
    },
    setCookie(n, v) {
      reply.cookies[n] = v;
      return reply;
    }
  };
  return reply;
}

/** 调用 checkGlobalBlock，把「抛出的封禁错误」当返回值（不抛则返回 null） */
async function catchBlock(...args) {
  try {
    await checkGlobalBlock(...args);
    return null;
  } catch (err) {
    return err;
  }
}

/**
 * challenge 路由的注册选项快照
 *
 * 用假 fastify 捕获 `post(url, opts)`，绕开 guard 的 preHandler —— 既能拿到 handler
 * 验响应体，也能拿到 `config` 验路由声明。guard 的 `_routeRegistry` 是**进程级**的，
 * 同一进程重复注册同一路由会抛 DUPLICATE_ROUTE，所以这里必须缓存。
 *
 * @returns {Promise<Array<{url: string, opts: object}>>} 捕获到的路由
 */
let challengeRouteOptions = null;
async function captureChallengeRoutes() {
  if (!challengeRouteOptions) {
    const routes = [];
    const fakeFastify = {
      post(url, opts) {
        routes.push({ url, opts });
      }
    };
    const { default: registerChallengeRoutes } = await import('../api/firewall/v1/challenge.js');
    registerChallengeRoutes(fakeFastify);
    challengeRouteOptions = routes;
  }
  return challengeRouteOptions;
}

/** 从挑战页 HTML 中解出 challengeId / salt / difficulty 并暴力求解 PoW */
function solvePow(html) {
  const id = html.match(/CHALLENGE_ID = '([0-9a-f]{32})'/);
  const salt = html.match(/SALT = '([0-9a-f]{16})'/);
  const difficulty = html.match(/DIFFICULTY = (\d+)/);
  expect(id).not.toBeNull();
  expect(salt).not.toBeNull();

  const challengeId = id[1];
  const target = '0'.repeat(Number(difficulty[1]));
  for (let answer = 0; answer < 20_000_000; answer++) {
    if (sha256Hex(`${challengeId}:${salt[1]}:${answer}`).startsWith(target)) {
      return { challengeId, answer: String(answer) };
    }
  }
  throw new Error('PoW 求解失败：难度配置可能异常');
}

// ── ① 封禁状态机 ──────────────────────────────────────────────────────────────

describe('封禁状态机：四种状态 × 请求入口行为', () => {
  const ipBlocked = '203.0.113.201';
  const ipScanner = '203.0.113.202';
  const ipChallenge = '203.0.113.203';
  const ipClean = '203.0.113.204';
  const ipWhitelisted = '203.0.113.205';

  it('无封禁记录 → 放行（不抛错）', async () => {
    expect(await catchBlock(ipClean)).toBeNull();
  });

  it('status=BLOCKED → 429 + Retry-After（临时封禁语义）', async () => {
    await setBlock(ipBlocked, { status: 'BLOCKED', source: 'auto', permanent: false, expiresAt: Date.now() + 60_000 });
    const err = await catchBlock(ipBlocked);
    expect(err).not.toBeNull();
    expect(err.statusCode).toBe(429);
    expect(Number(err.headers['Retry-After'])).toBeGreaterThan(0);
    expect(err.isChallenge).toBeUndefined();
  });

  it('status=SCANNER → 403（扫描器拿不到挑战机会）', async () => {
    await setBlock(ipScanner, { status: 'SCANNER', source: 'auto', permanent: true });
    const err = await catchBlock(ipScanner);
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('Scanner blocked');
  });

  it('status=CHALLENGE → 不是拒绝：isChallenge=true 且 statusCode 200', async () => {
    await setBlock(ipChallenge, {
      status: 'CHALLENGE',
      source: 'auto',
      permanent: false,
      expiresAt: Date.now() + 60_000
    });
    const err = await catchBlock(ipChallenge);
    // 旧实现把 CHALLENGE 也落进 429 分支 → 挑战页刚渲染出来，下一个请求就被自己的封禁拦掉，
    // 连 challenge/verify 也是 429 → 用户被硬封 30 分钟且永远无法自解。
    expect(err.isChallenge).toBe(true);
    expect(err.statusCode).toBe(200);
  });

  it('白名单优先级最高：IP 被封禁但同 IP 也在白名单 → 放行', async () => {
    await setBlock(ipWhitelisted, { status: 'SCANNER', source: 'auto', permanent: true });
    expect((await catchBlock(ipWhitelisted)).statusCode).toBe(403); // 先确认封禁确实生效

    const { setWhitelist } = await import('../framework/ingress/firewall/block-manager.js');
    await setWhitelist(ipWhitelisted, 60);
    expect(await catchBlock(ipWhitelisted)).toBeNull();
  });
});

// ── ② 挑战链路端到端 ──────────────────────────────────────────────────────────

describe('挑战链路端到端：下发 → 求解 → 校验 → 签发令牌 → 放行', () => {
  const ip = '203.0.113.211';

  it('服务端持有载荷：正确求解后校验通过并签发 fw_verified 令牌', async () => {
    const html = await buildChallengePage(ip, null, null);
    // 载荷只在服务端；页面拿到的 challengeId 本身不含任何可直接回放的凭据
    const { challengeId, answer } = solvePow(html);

    const request = makeRequest({
      ip,
      method: 'POST',
      url: '/api/firewall/v1/challenge/verify',
      body: { challengeId, answer }
    });
    const reply = makeReply();
    const res = await verifyChallenge(request, reply);

    expect(res).toMatchObject({ ok: true });
    expect(reply.cookies.fw_verified).toMatch(/^[0-9a-f]{64}$/);

    // 令牌确实落进了访问层，且绑定在本次请求的 IP/指纹上
    const fp = generateFingerprint(request);
    expect(await hasPass({ ip, fingerprint: fp, token: reply.cookies.fw_verified })).toBe(true);
  });

  it('单次有效：重放同一个 challengeId 必然失败（载荷是原子 GET+DEL）', async () => {
    const html = await buildChallengePage('203.0.113.212', null, null);
    const { challengeId, answer } = solvePow(html);
    const body = { challengeId, answer };

    const first = await verifyChallenge(makeRequest({ ip: '203.0.113.212', method: 'POST', body }), makeReply());
    expect(first.ok).toBe(true);

    const second = await verifyChallenge(makeRequest({ ip: '203.0.113.212', method: 'POST', body }), makeReply());
    expect(second).toEqual({ ok: false, statusCode: 403, reason: 'Challenge Expired' });
  });

  it('工作量证明：答案不满足难度 → Invalid Proof', async () => {
    const html = await buildChallengePage('203.0.113.213', null, null);
    const { challengeId } = solvePow(html);
    // 答案必然不满足难度（难度 ≥ 1，而 '0' 只在前导位置出现一次的概率极低但存在，
    // 因此再加一条：用一个明显非法/不满足的常量 0，并对结果容错断言）
    const res = await verifyChallenge(
      makeRequest({ ip: '203.0.113.213', method: 'POST', body: { challengeId, answer: 'not-a-number' } }),
      makeReply()
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('Invalid Proof');
  });

  it('上下文绑定：换 IP 提交 → Challenge Mismatch', async () => {
    const html = await buildChallengePage('203.0.113.214', null, null);
    const { challengeId, answer } = solvePow(html);
    const res = await verifyChallenge(
      makeRequest({ ip: '198.51.100.214', method: 'POST', body: { challengeId, answer } }),
      makeReply()
    );
    expect(res.reason).toBe('Challenge Mismatch');
  });

  it('上下文绑定：载荷绑了设备 ID，提交时设备 ID 不一致 → Challenge Mismatch', async () => {
    const devA = generateServerSideDeviceId(UA_CHROME);
    const devB = generateServerSideDeviceId(UA_CHROME);
    expect(devA).not.toBe(devB);

    const html = await buildChallengePage('203.0.113.215', null, devA);
    const { challengeId, answer } = solvePow(html);

    const res = await verifyChallenge(
      makeRequest({ ip: '203.0.113.215', deviceId: devB, method: 'POST', body: { challengeId, answer } }),
      makeReply()
    );
    expect(res.reason).toBe('Challenge Mismatch');
  });

  it('请求入口：挑战态返回挑战页（200 / text/html），不是硬封禁 429', async () => {
    const entryIp = '203.0.113.216';
    await setBlock(entryIp, { status: 'CHALLENGE', source: 'auto', permanent: false, expiresAt: Date.now() + 60_000 });

    const request = makeRequest({ ip: entryIp });
    await buildRequestContext(request);
    const reply = makeReply();
    const handled = await checkGlobalBlockPhase(request, reply);

    expect(handled).toBe(true);
    expect(reply.statusCode).toBe(200);
    expect(reply.sentType).toBe('text/html');
    expect(reply.sentBody).toContain('CHALLENGE_ID');

    // 生产环境全局 CSP 是 `script-src 'self'` —— 内联脚本会被拦到"页面永不动"。
    // 因此响应必须自带一份 nonce 策略，且与 HTML 里的 nonce 同值（实测见挑战页 CSP 用例）。
    const nonce = reply.sentBody.match(/<script nonce="([0-9a-f]{32})">/);
    expect(nonce).not.toBeNull();
    const csp = reply.responseHeaders['Content-Security-Policy'];
    expect(csp).toContain(`script-src 'nonce-${nonce[1]}'`);
    expect(csp).toContain('worker-src blob:');
    expect(csp).not.toContain("script-src 'self'");

    expect(pushedRecords.at(-1)).toMatchObject({ blocked: true, statusCode: 200 });
  });

  it('请求入口：持有效令牌再访问 → 撤销挑战态并放行（死锁已解）', async () => {
    const entryIp = '203.0.113.217';
    const first = makeRequest({ ip: entryIp });
    await buildRequestContext(first);
    await setBlock(entryIp, { status: 'CHALLENGE', source: 'auto', permanent: false, expiresAt: Date.now() + 60_000 });

    // 第一步：拿到挑战页
    const challengeReply = makeReply();
    expect(await checkGlobalBlockPhase(first, challengeReply)).toBe(true);
    const { challengeId, answer } = solvePow(challengeReply.sentBody);

    // 第二步：求解并通过验证（同一指纹/设备上下文）
    const verifyReply = makeReply();
    const res = await verifyChallenge({ ...first, method: 'POST', body: { challengeId, answer } }, verifyReply);
    expect(res).toMatchObject({ ok: true });
    const token = verifyReply.cookies.fw_verified;

    // 第三步：带令牌再访问 → 放行，且挑战态已被清掉
    const passedReply = makeReply();
    const handled = await checkGlobalBlockPhase({ ...first, cookies: { fw_verified: token } }, passedReply);
    expect(handled).toBe(false);
    expect(passedReply.sentBody).toBeUndefined();

    // 第四步：不带令牌再来一次仍然放行 —— 证明挑战键被真的删掉了，而不是被令牌反复绕过
    const afterReply = makeReply();
    expect(await checkGlobalBlockPhase({ ...first }, afterReply)).toBe(false);
    expect(afterReply.sentBody).toBeUndefined();
  });
});

// ── ③ 名单三维度隔离（设备维度跨 IP） ─────────────────────────────────────────

describe('名单三维度隔离', () => {
  it('设备封禁进入设备条目，不污染 IP / 指纹条目', async () => {
    const dev = generateServerSideDeviceId(UA_CHROME);
    await setBlockDevice(dev, { status: 'BLOCKED', source: 'manual', permanent: true });

    const blocks = await getActiveBlocks();
    const devEntry = blocks.find(b => b.deviceId === dev);
    expect(devEntry).toBeDefined();
    expect(devEntry.type).toBe('device');
    expect(devEntry.permanent).toBe(true);
  });

  it('设备维度跨 IP：换一个 IP 仍被拦下（IP 维度已失效，设备维度撑住）', async () => {
    const dev = generateServerSideDeviceId(UA_CHROME);
    await setBlockDevice(dev, { status: 'SCANNER', source: 'auto', permanent: true });

    const err = await catchBlock('198.51.100.219', undefined, dev);
    expect(err).not.toBeNull();
    expect(err.statusCode).toBe(403);

    // 对照组：同一新 IP 不带设备 ID → 什么都读不到，证明命中确实来自设备维度
    expect(await catchBlock('198.51.100.219')).toBeNull();
  });

  it('设备白名单短路设备封禁', async () => {
    const dev = generateServerSideDeviceId(UA_CHROME);
    await setBlockDevice(dev, { status: 'SCANNER', source: 'auto', permanent: true });
    expect((await catchBlock('198.51.100.220', undefined, dev)).statusCode).toBe(403);

    await setWhitelistDevice(dev, 60);
    expect(await catchBlock('198.51.100.220', undefined, dev)).toBeNull();
    const whites = await getActiveWhitelist();
    expect(whites.find(w => w.deviceId === dev)?.type).toBe('device');
  });

  it('请求入口：设备维度的挑战态在换 IP 后仍然命中', async () => {
    const dev = generateServerSideDeviceId(UA_CHROME);
    await setBlockDevice(dev, {
      status: 'CHALLENGE',
      source: 'auto',
      permanent: false,
      expiresAt: Date.now() + 60_000
    });

    const request = makeRequest({ ip: '198.51.100.221', deviceId: dev });
    await buildRequestContext(request);
    const reply = makeReply();

    expect(await checkGlobalBlockPhase(request, reply)).toBe(true);
    expect(reply.sentBody).toContain('Security Verification');
  });
});

// ── ⑤ 匿名请求短路（🔵-17） ───────────────────────────────────────────────────

describe('匿名请求短路（🔵-17）：判定只认「一个凭据都没有」', () => {
  /** 构造一个「路由声明了 requireLogin」的请求 */
  const requireLoginRequest = overrides => ({
    routeOptions: { config: { requireLogin: true } },
    state: {},
    cookies: {},
    headers: {},
    ...overrides
  });

  it('路由声明 requireLogin 且一个凭据都没带 → 可跳过深度检测', () => {
    expect(willBeRejectedAsAnonymous(requireLoginRequest())).toBe(true);
  });

  it.each([
    ['sid', { cookies: { sid: 'abc' } }],
    ['access_token', { cookies: { access_token: 'abc' } }],
    ['Authorization 头', { headers: { authorization: 'Bearer abc' } }]
  ])('带了 %s 就不跳过 —— 认证失败/伪造/越权试探是更可疑的信号', (_name, override) => {
    expect(willBeRejectedAsAnonymous(requireLoginRequest(override))).toBe(false);
  });

  it('已认证（state.user 存在）→ 不跳过', () => {
    expect(willBeRejectedAsAnonymous(requireLoginRequest({ state: { user: { id: 1 } } }))).toBe(false);
  });

  it('路由未声明 requireLogin → 不跳过（避免把公开端点也短路掉）', () => {
    expect(willBeRejectedAsAnonymous(requireLoginRequest({ routeOptions: { config: {} } }))).toBe(false);
    expect(willBeRejectedAsAnonymous(requireLoginRequest({ routeOptions: { config: { requireLogin: false } } }))).toBe(
      false
    );
  });

  it('未匹配到路由（config 为空对象 / routeOptions 缺失）→ 不跳过，不会误判', () => {
    expect(willBeRejectedAsAnonymous(requireLoginRequest({ routeOptions: { config: {} } }))).toBe(false);
    expect(willBeRejectedAsAnonymous(requireLoginRequest({ routeOptions: {} }))).toBe(false);
    expect(willBeRejectedAsAnonymous(requireLoginRequest({ routeOptions: undefined }))).toBe(false);
  });

  it('前提机制成立：onRequest 阶段确实能读到已注册路由的 config（路由先于钩子匹配）', async () => {
    // `willBeRejectedAsAnonymous` 的全部依据就是这个行为：Fastify 在跑 onRequest 之前
    // 已经完成路由匹配，因此 `request.routeOptions.config` 可读。这条断言把它钉死 ——
    // 一旦 Fastify 改变顺序（或被换掉），短路逻辑必须被重新审视，而不是静默失效。
    const observed = {};
    const app = Fastify({ logger: false });
    try {
      app.addHook('onRequest', async request => {
        observed[request.url] = request.routeOptions?.config ?? null;
      });
      app.get('/secure', { config: { requireLogin: true } }, async () => ({ ok: true }));

      await app.inject({ method: 'GET', url: '/secure' });
      await app.inject({ method: 'GET', url: '/__not_a_route__' });

      expect(observed['/secure']).toMatchObject({ requireLogin: true });
      expect(observed['/__not_a_route__']).toEqual({});
    } finally {
      await app.close();
    }
  });
});

// ── ⑥ 启动链路（🟡-7 的回归项 ③④） ────────────────────────────────────────────

describe('启动链路：initDao 真的被调用 / 安全管道只注册一次', () => {
  // ⚠️ 本 describe 必须放在文件最后：initDao 会把磁盘配置合并进进程内单例，
  // 从而改掉后续用例读到的 defense 值。

  it('注册 initFirewall 会真正加载磁盘配置（initDao 不再被漏掉）', async () => {
    const before = getSecuritySettings();
    const app = Fastify({ logger: false });
    try {
      await app.register(initFirewall);
      await app.ready();
      // initDao 用 deepMerge 重新赋值 securitySettings（dao.js:52 是 `let` 绑定），
      // 因此「对象身份是否更换」就是「initDao 是否被执行」的确切判据。
      // 历史缺陷：initDao 的注释写着「由 index.js 在插件注册时调用」，但服务端从未调用过它，
      // 导致磁盘上的 enableRateLimit / 手动黑白名单从未被加载，且下一次保存会把磁盘覆盖成默认值。
      expect(getSecuritySettings()).not.toBe(before);
    } finally {
      await app.close();
    }
  });

  it('一次请求只走一次深度检测管道（防「每层执行两次」回归）', async () => {
    const app = Fastify({ logger: false });
    try {
      await app.register(initFirewall);
      await app.ready();

      // onRequest 在路由匹配之后执行：未匹配到路由也能进入管道（`/__probe__` 不在跳过名单里）
      const ip = '127.0.0.1';
      const before = ipRequestTimestamps.get(ip)?.length ?? 0;
      const res = await app.inject({ method: 'GET', url: '/__firewall_probe__' });
      const after = ipRequestTimestamps.get(ip)?.length ?? 0;

      expect(res.statusCode).toBe(404);
      // trackRequestCount 由 runDetectionPipeline 调用，每个请求恰好 1 次。
      // 历史缺陷：initFirewall 被 config.init 与 05-firewall.js 同时注册 → 管道执行两次 →
      // 同一请求的计数 +2，扫描陷阱阈值实际减半（声称 10，实际 5）。
      expect(after - before).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('装配点契约：核心插件只允许两个注册位，initFirewall 不得被 src 注册，config.init 只能指向 app 侧入口', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

    /** 递归收集 .js 源码（跳过测试目录：测试自身也会 register(initFirewall)） */
    const walk = (dir, out = []) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '__tests__') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, out);
        else if (e.name.endsWith('.js')) out.push(full);
      }
      return out;
    };

    const findRegisterSites = symbol => {
      const sites = [];
      const re = new RegExp(`register\\(\\s*${symbol}\\s*\\)`);
      for (const f of walk(srcRoot)) {
        const src = fs.readFileSync(f, 'utf-8');
        const code = src
          .split('\n')
          .filter(l => {
            const t = l.trimStart();
            return !(t.startsWith('*') || t.startsWith('//') || t.startsWith('/*'));
          })
          .join('\n');
        if (re.test(code)) sites.push(path.relative(srcRoot, f).replace(/\\/g, '/'));
      }
      return sites.sort();
    };

    // 防护核心（bootstrap.js）的注册位必须收敛为两处：05-firewall.js（生产编排）
    // 与 app/firewall/index.js 的 initFirewall（测试用完整组合）。出现第三处 = 新的重复注册路径
    expect(findRegisterSites('firewallCorePlugin')).toEqual([
      'app/firewall/index.js',
      'framework/lifecycle/loader/registry/05-firewall.js'
    ]);

    // initFirewall 是测试专用组合；生产路径一律是：05-firewall.js 注册**核心**、
    // 10-apps 通过 config.init 注册 **app 侧**（操作面）。
    // 历史事故：两者同时注册 → 管道执行两次、统计 ×2。
    expect(findRegisterSites('initFirewall')).toEqual([]);

    // app/firewall 是「操作防火墙」的应用层（面板 / 落盘 / 名单同步 / 遥测），按应用约定由
    // 10-apps 加载。它的 init 只能指向 firewallAppInit（app 侧能力），**不得指向 initFirewall**：
    // 后者会把防护核心再注册一次，而此时 08-api 的路由已注册完 —— @fastify/rate-limit 的
    // onRoute 钩子对它们不触发，限流会静默失效。
    const firewallConfigSrc = fs.readFileSync(path.join(srcRoot, 'app', 'firewall', 'config.js'), 'utf-8');
    const initLine = firewallConfigSrc.split('\n').find(l => !l.trimStart().startsWith('*') && /^\s*init\s*:/.test(l));
    expect(initLine).toBeDefined();
    expect(initLine).toContain('firewallAppInit');
    expect(initLine).not.toContain('initFirewall');
  });
});

// ── ⑧ 挑战响应按请求类型分流（2026-11-03） ────────────────────────────────────

describe('挑战响应分流：文档请求给页面，其余给可编程的 428', () => {
  /** 构造「带 Fastify reply.request」的 reply 替身（真实 reply 一定挂 .request） */
  function replyFor(request) {
    const reply = makeReply();
    reply.request = request;
    return reply;
  }

  it('浏览器导航（Sec-Fetch-Mode: navigate）→ 200 + text/html + no-store', async () => {
    const ip = '203.0.113.231';
    await setBlock(ip, { status: 'CHALLENGE', source: 'auto', permanent: false, expiresAt: Date.now() + 60_000 });

    const request = makeRequest({ ip, url: '/console/' });
    request.headers['sec-fetch-mode'] = 'navigate';
    request.headers.accept = 'text/html,application/xhtml+xml';
    await buildRequestContext(request);

    const reply = replyFor(request);
    expect(await checkGlobalBlockPhase(request, reply)).toBe(true);
    expect(reply.statusCode).toBe(200);
    expect(reply.sentType).toBe('text/html');
    expect(reply.sentBody).toContain('CHALLENGE_ID');
    // 挑战页可能落在 /assets/*.js 这类地址上：不带 no-store 会被 CDN 当业务响应缓存复用
    expect(reply.responseHeaders['Cache-Control']).toContain('no-store');
  });

  it('XHR（Sec-Fetch-Mode: cors）→ 428 + X-Firewall-Challenge，不回 HTML', async () => {
    const ip = '203.0.113.232';
    await setBlock(ip, { status: 'CHALLENGE', source: 'auto', permanent: false, expiresAt: Date.now() + 60_000 });

    const request = makeRequest({ ip, url: '/api/firewall/v1/monitor/summary?x=1' });
    request.headers['sec-fetch-mode'] = 'cors';
    request.headers.accept = 'application/json, text/plain, */*';
    await buildRequestContext(request);

    const reply = replyFor(request);
    expect(await checkGlobalBlockPhase(request, reply)).toBe(true);
    expect(reply.statusCode).toBe(428);
    expect(reply.sentType).toBeUndefined();
    expect(reply.sentBody).toMatchObject({
      code: 428,
      challengeUrl: '/api/firewall/v1/monitor/summary'
    });
    expect(reply.responseHeaders['X-Firewall-Challenge']).toBe('/api/firewall/v1/monitor/summary');
    expect(pushedRecords.at(-1)).toMatchObject({ blocked: true, statusCode: 428 });
  });

  it('POST 一律不发挑战页（表单/接口都无法执行页面脚本）', async () => {
    const ip = '203.0.113.233';
    await setBlock(ip, { status: 'CHALLENGE', source: 'auto', permanent: false, expiresAt: Date.now() + 60_000 });

    const request = makeRequest({ ip, method: 'POST', url: '/api/user/profile', body: {} });
    request.headers.accept = 'text/html';
    await buildRequestContext(request);

    const reply = replyFor(request);
    expect(await checkGlobalBlockPhase(request, reply)).toBe(true);
    expect(reply.statusCode).toBe(428);
  });
});

// ── ⑨ 登录观测 → 账号维度暴力破解（2026-11-03 修复的回归守卫） ─────────────────

describe('登录结果观测：账号维度必须真的记账（曾只读 body.username 导致永不生效）', () => {
  /**
   * 构造一个「失败登录」的 onResponse 上下文
   *
   * `credentialRoute: true` 是必须的：2026-11-06 起观测入口改成读路由声明
   * （`request.routeOptions.config.firewall.credentialRoute`），不再用 URL 正则。
   */
  function failedLogin(url, body, ip) {
    return {
      request: makeRequest({ ip, method: 'POST', url, body, credentialRoute: true }),
      reply: { statusCode: 401 }
    };
  }

  it('未声明 credentialRoute 的路由 → 401 一次都不记（URL 长得像登录也不算）', async () => {
    const ip = '203.0.113.240';
    const email = 'not-credential@example.com';
    for (let i = 0; i < 6; i++) {
      // 故意用 /login 这个"看起来像登录"的 URL，但不带声明
      const request = makeRequest({ ip, method: 'POST', url: '/api/oauth21/v1/auth/login', body: { email } });
      await observeLoginOutcome(request, { statusCode: 401 });
    }
    expect(await isAccountLocked(email)).toBe(false);
  });

  it('邮箱验证码登录失败达阈值 → 写入账号锁定（isAccountLocked 命中）', async () => {
    const ip = '203.0.113.241';
    const email = 'victim@example.com';
    for (let i = 0; i < 5; i++) {
      const { request, reply } = failedLogin(
        '/api/oauth21/v1/auth/login',
        { type: 'email', email, code: '000000' },
        ip
      );
      await observeLoginOutcome(request, reply);
    }
    expect(await isAccountLocked(email)).toBe(true);
  });

  it('账号锁定用 login.service 的取值口径（email || username）作为键', async () => {
    const ip = '203.0.113.242';
    const username = 'plain-user';
    for (let i = 0; i < 5; i++) {
      const { request, reply } = failedLogin('/api/oauth21/v1/auth/verify-email', { username }, ip);
      await observeLoginOutcome(request, reply);
    }
    expect(await isAccountLocked(username)).toBe(true);
  });

  it('登录成功清零失败计数（不会把正常用户推进锁定）', async () => {
    const ip = '203.0.113.243';
    const email = 'ok@example.com';
    for (let i = 0; i < 3; i++) {
      const { request, reply } = failedLogin('/api/oauth21/v1/auth/login', { type: 'email', email }, ip);
      await observeLoginOutcome(request, reply);
    }
    const request = makeRequest({
      ip,
      method: 'POST',
      url: '/api/oauth21/v1/auth/login',
      body: { type: 'email', email },
      credentialRoute: true
    });
    await observeLoginOutcome(request, { statusCode: 200 });
    // 成功只清计数，不产生锁定
    expect(await isAccountLocked(email)).toBe(false);
  });

  it('超长账号字段被截断（不把外部输入原样拼进 Redis 键）', async () => {
    const ip = '203.0.113.244';
    const huge = 'x'.repeat(5000);
    for (let i = 0; i < 5; i++) {
      const { request, reply } = failedLogin('/api/oauth21/v1/auth/login', { type: 'email', email: huge }, ip);
      await observeLoginOutcome(request, reply);
    }
    // 锁定键按截断后的 128 字符记账：原文查不到，截断值查得到
    expect(await isAccountLocked(huge)).toBe(false);
    expect(await isAccountLocked('x'.repeat(128))).toBe(true);
  });
});

// ── ⑩ 挑战接入：issue 签发 / 挑战态放行 / 428 落点 ─────────────────────────────

describe('Vue 挑战页接入：issue 签发 → 求解 → verify 全链路', () => {
  /** 按 issue 返回的 salt/difficulty 求解 PoW */
  function solveFromIssue(issued) {
    const target = '0'.repeat(issued.difficulty);
    for (let answer = 0; answer < 20_000_000; answer++) {
      if (sha256Hex(`${issued.challengeId}:${issued.salt}:${answer}`).startsWith(target)) {
        return String(answer);
      }
    }
    throw new Error('PoW 求解失败');
  }

  it('issue 返回可求解的载荷，且与 verify 的绑定上下文一致 → 通过', async () => {
    // issue 只在挑战态签发（否则等于"预先买票"），先按真实路径把该 IP 判成 CHALLENGE
    await setBlock('203.0.113.251', {
      status: 'CHALLENGE',
      source: 'auto',
      permanent: false,
      expiresAt: Date.now() + 60_000
    });
    const request = makeRequest({
      ip: '203.0.113.251',
      method: 'POST',
      url: '/api/firewall/v1/challenge/issue',
      body: {}
    });
    const issued = await issueChallenge(request);

    expect(issued.ok).toBe(true);
    expect(issued.challengeId).toMatch(/^[0-9a-f]{32}$/);
    expect(issued.salt).toMatch(/^[0-9a-f]{16}$/);
    expect(issued.difficulty).toBeGreaterThanOrEqual(1);
    expect(issued.maxAttempts).toBeGreaterThanOrEqual(16 ** issued.difficulty);

    const answer = solveFromIssue(issued);
    const reply = makeReply();
    const res = await verifyChallenge({ ...request, body: { challengeId: issued.challengeId, answer } }, reply);
    expect(res).toMatchObject({ ok: true });
    expect(reply.cookies.fw_verified).toMatch(/^[0-9a-f]{64}$/);
  });

  it('非挑战态请求 issue → 403 Not Challenged（防"预先解一次换 30 分钟免挑战"）', async () => {
    const clean = makeRequest({
      ip: '203.0.113.250',
      method: 'POST',
      url: '/api/firewall/v1/challenge/issue',
      body: {}
    });
    const res = await issueChallenge(clean);
    expect(res.ok).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.reason).toBe('Not Challenged');
  });

  it('issue 的载荷换一个 IP 消费 → 拒绝（绑定上下文不可转移）', async () => {
    await setBlock('203.0.113.252', {
      status: 'CHALLENGE',
      source: 'auto',
      permanent: false,
      expiresAt: Date.now() + 60_000
    });
    const request = makeRequest({
      ip: '203.0.113.252',
      method: 'POST',
      url: '/api/firewall/v1/challenge/issue',
      body: {}
    });
    const issued = await issueChallenge(request);
    const answer = solveFromIssue(issued);

    const other = makeRequest({
      ip: '203.0.113.253',
      method: 'POST',
      url: '/api/firewall/v1/challenge/issue',
      body: {}
    });
    const res = await verifyChallenge({ ...other, body: { challengeId: issued.challengeId, answer } }, makeReply());
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('Challenge Mismatch');
  });
});

describe('挑战处置：后端只提供 API，不猜前端页面路径', () => {
  /** 建一个处于挑战态的 IP，并返回一个已构建上下文的 request/reply 对 */
  async function challengedRequest(ip, url, headers = {}) {
    await setBlock(ip, { status: 'CHALLENGE', source: 'auto', permanent: false, expiresAt: Date.now() + 60_000 });
    const request = makeRequest({ ip, url });
    Object.assign(request.headers, headers);
    await buildRequestContext(request);
    const reply = makeReply();
    reply.request = request;
    return { request, reply };
  }

  it('文档导航（含 /admin/* 这类 SPA 路径）→ 一律内置模板 200，不再 302 到前端页面', async () => {
    // 后端不托管前端产物：猜 SPA 路径只会在前端改目录时变成死链。
    // SPA 的挑战页由拦截器按自己的 BASE_URL 决定（看到 428 / X-Firewall-Challenge 就跳）。
    for (const url of ['/admin/users?page=2', '/firewall/console', '/some/page']) {
      const { request, reply } = await challengedRequest('203.0.113.255', url, {
        'sec-fetch-mode': 'navigate',
        accept: 'text/html'
      });
      expect(await checkGlobalBlockPhase(request, reply)).toBe(true);
      expect(reply.statusCode).toBe(200);
      expect(reply.responseHeaders.Location).toBeUndefined();
      expect(reply.sentBody).toContain('CHALLENGE_ID');
      expect(reply.responseHeaders['Cache-Control']).toContain('no-store');
    }
  });

  it('XHR 的 challengeUrl 一律是请求自身路径（不映射成前端挑战页）', async () => {
    for (const url of ['/api/firewall/v1/monitor/summary', '/admin/v1/users']) {
      const { request, reply } = await challengedRequest('203.0.113.257', url, {
        'sec-fetch-mode': 'cors',
        accept: 'application/json'
      });
      await checkGlobalBlockPhase(request, reply);
      expect(reply.statusCode).toBe(428);
      expect(reply.sentBody.challengeUrl).toBe(url);
      expect(reply.sentBody.requestUrl).toBe(url);
      expect(reply.responseHeaders['X-Firewall-Challenge']).toBe(url);
    }
  });
});

// ── ⑪ 实测抓到的两个自伤 bug 的回归守卫（2026-11-03） ─────────────────────────

describe('挑战态下签发接口必须可达 + 回环地址不被扫描陷阱封禁', () => {
  it('CHALLENGE 态请求 /challenge/issue → 放行（漏了就是"挑战页拉不到挑战"死锁）', async () => {
    const ip = '203.0.113.261';
    await setBlock(ip, { status: 'CHALLENGE', source: 'auto', permanent: false, expiresAt: Date.now() + 60_000 });

    for (const url of [
      '/api/firewall/v1/challenge/issue',
      '/api/firewall/v1/challenge/verify',
      '/api/firewall/v1/challenge/issue?foo=1'
    ]) {
      // 放行依据是路由声明（`config.firewall.challengeSurface`），不是 URL —— 2026-11-06 起
      const request = makeRequest({ ip, method: 'POST', url, body: {}, challengeSurface: true });
      request.headers['sec-fetch-mode'] = 'cors';
      request.headers.accept = 'application/json';
      await buildRequestContext(request);
      const reply = makeReply();
      reply.request = request;
      expect(await checkGlobalBlockPhase(request, reply)).toBe(false);
      expect(reply.sentBody).toBeUndefined();
    }
  });

  it('反例：同样的 URL 但没有声明 → 挑战态下照样被挑战（豁免不来自路径字符串）', async () => {
    // ⚠️ IP 必须与下面「回环地址刷 404」那例的对照组错开（它用 .262），
    //    否则这例留下的挑战态会让那例的扫描计数提前满额。
    const ip = '203.0.113.263';
    await setBlock(ip, { status: 'CHALLENGE', source: 'auto', permanent: false, expiresAt: Date.now() + 60_000 });

    const request = makeRequest({
      ip,
      method: 'POST',
      url: '/api/firewall/v1/challenge/issue',
      body: {}
    });
    request.headers['sec-fetch-mode'] = 'cors';
    request.headers.accept = 'application/json';
    await buildRequestContext(request);
    const reply = makeReply();
    reply.request = request;

    // 没有声明 → 走挑战分支（428）。这条断言的意义：如果哪天有人把判据退回"按路径猜"，
    // prefix 一改就会全站死锁；有它在，退回的那次改动会立刻红。
    expect(await checkGlobalBlockPhase(request, reply)).toBe(true);
    expect(reply.statusCode).toBe(428);
  });

  it('回环地址刷 404 不会被判扫描器封禁（开发期自伤）', async () => {
    // checkNotFoundTrap 已在模块顶层导入（顶部 `await import`），这里不再重复导入

    // 连刷 20 次（超过 maxNotFoundAttempts=10），不应抛 scanner-trap
    for (let i = 0; i < 20; i++) {
      await expect(checkNotFoundTrap('127.0.0.1', `/__not_${i}__`, 404)).resolves.toBeUndefined();
      await expect(checkNotFoundTrap('::1', `/__not6_${i}__`, 403)).resolves.toBeUndefined();
    }
    // 对照组：公网 IP 第 10 次必抛
    const publicIp = '203.0.113.262';
    let thrown = null;
    for (let i = 0; i < 12; i++) {
      try {
        await checkNotFoundTrap(publicIp, `/__scan_${i}__`, 404);
      } catch (err) {
        thrown = err;
        break;
      }
    }
    expect(thrown).not.toBeNull();
    expect(thrown.rule).toBe('scanner-trap');
  });
});

// ── ⑫ 通过令牌按登录态分档（2026-11-03 需求） ────────────────────────────────

describe('通过令牌：匿名只换短窗口，登录才免 30 分钟', () => {
  /** 走一遍「签发 → 求解 → 校验」，返回 verify 的结果 */
  async function solveAndVerify(ip, extraState) {
    await setBlock(ip, { status: 'CHALLENGE', source: 'auto', permanent: false, expiresAt: Date.now() + 60_000 });
    const base = makeRequest({ ip, method: 'POST', url: '/api/firewall/v1/challenge/issue', body: {} });
    const issued = await issueChallenge(base);

    const target = '0'.repeat(issued.difficulty);
    let answer = null;
    for (let i = 0; i < 20_000_000; i++) {
      if (sha256Hex(`${issued.challengeId}:${issued.salt}:${i}`).startsWith(target)) {
        answer = String(i);
        break;
      }
    }
    expect(answer).not.toBeNull();

    const req = makeRequest({ ip, method: 'POST', url: '/api/firewall/v1/challenge/verify', body: {} });
    if (extraState) Object.assign(req, extraState);
    return verifyChallenge({ ...req, body: { challengeId: issued.challengeId, answer } }, makeReply());
  }

  it('匿名通过 → 只签 2 分钟（不是 30 分钟）', async () => {
    const res = await solveAndVerify('203.0.113.271');
    expect(res.ok).toBe(true);
    expect(res.scope).toBe('anonymous');
    expect(res.passTtlSec).toBe(120);
  });

  it('已登录通过 → 30 分钟', async () => {
    const res = await solveAndVerify('203.0.113.272', { state: { user: { id: 42 } } });
    expect(res.ok).toBe(true);
    expect(res.scope).toBe('account');
    expect(res.passTtlSec).toBe(1800);
  });
});

// ── ⑬ 路由层契约：verify 的响应必须带上档位字段（2026-11-04 实测抓到） ────────────

describe('verify 路由：服务返回的档位字段必须真的发到线上', () => {
  /**
   * 用假 fastify 捕获 handler，绕开 guard 的 preHandler。
   *
   * 为什么必须打在 handler 上：上一轮的单测直接调 `verifyChallenge()`，断言的是
   * service 的返回值；而线上响应由 handler 组装 —— 它当时手写成 `{ ok: true }`，
   * 把 `passTtlSec` / `scope` 吞了。service 对、单测绿、线上错，正是这类"只测单元
   * 不测出口"的典型漏网。这里直接执行 handler，等于测 HTTP 响应的正文。
   */
  async function getVerifyHandler() {
    const routes = await captureChallengeRoutes();
    const route = routes.find(r => r.url?.endsWith('/verify'));
    expect(route).toBeDefined();
    return route.opts.handler;
  }

  /** 走一遍签发 + 求解，返回可提交的 body */
  async function issueAndSolve(ip) {
    await setBlock(ip, { status: 'CHALLENGE', source: 'auto', permanent: false, expiresAt: Date.now() + 60_000 });
    const issued = await issueChallenge(
      makeRequest({ ip, method: 'POST', url: '/api/firewall/v1/challenge/issue', body: {} })
    );
    const target = '0'.repeat(issued.difficulty);
    let answer = null;
    for (let i = 0; i < 20_000_000; i++) {
      if (sha256Hex(`${issued.challengeId}:${issued.salt}:${i}`).startsWith(target)) {
        answer = String(i);
        break;
      }
    }
    expect(answer).not.toBeNull();
    return { challengeId: issued.challengeId, answer };
  }

  it('匿名通过 → 响应正文含 passTtlSec=120 / scope=anonymous', async () => {
    const handler = await getVerifyHandler();
    const body = await issueAndSolve('203.0.113.281');

    const request = makeRequest({
      ip: '203.0.113.281',
      method: 'POST',
      url: '/api/firewall/v1/challenge/verify',
      body
    });
    const reply = makeReply();
    const res = await handler(request, reply);

    expect(reply.statusCode).toBe(200);
    expect(res).toEqual({ ok: true, passTtlSec: 120, scope: 'anonymous' });
  });

  it('失败时只回 ok/reason，不泄漏内部字段', async () => {
    const handler = await getVerifyHandler();
    const request = makeRequest({
      ip: '203.0.113.282',
      method: 'POST',
      url: '/api/firewall/v1/challenge/verify',
      body: { challengeId: 'a'.repeat(32), answer: '1' }
    });
    const reply = makeReply();
    const res = await handler(request, reply);

    // 未知/已消费的载荷 → 403 + 结构化原因
    expect(reply.statusCode).toBe(403);
    expect(reply.sentBody).toEqual({ ok: false, reason: 'Challenge Expired' });
    expect(res).toBe(reply);
  });
});

// ── ⑭ 挑战态下健康探针必须 200（2026-11-04 实测抓到：/v1/health → 428） ──────────

describe('挑战态不影响健康探针', () => {
  it('CHALLENGE 态请求 /v1/health、/live、/ready → 放行', async () => {
    const ip = '203.0.113.291';
    await setBlock(ip, { status: 'CHALLENGE', source: 'auto', permanent: false, expiresAt: Date.now() + 60_000 });

    for (const url of ['/v1/health', '/v1/health/live', '/v1/health/ready']) {
      const request = makeRequest({ ip, method: 'GET', url });
      await buildRequestContext(request);
      const reply = makeReply();
      reply.request = request;
      // false = 未拦截，继续走后续阶段（探针随后在 shouldSkipDeepCheck 里被跳过）
      expect(await checkGlobalBlockPhase(request, reply)).toBe(false);
      expect(reply.sentBody).toBeUndefined();
    }
  });

  it('硬封禁仍然拦探针（豁免只针对 CHALLENGE）', async () => {
    const ip = '203.0.113.292';
    await setBlock(ip, { status: 'BLOCKED', source: 'auto', permanent: false, expiresAt: Date.now() + 60_000 });

    const request = makeRequest({ ip, method: 'GET', url: '/v1/health' });
    await buildRequestContext(request);
    const reply = makeReply();
    reply.request = request;
    expect(await checkGlobalBlockPhase(request, reply)).toBe(true);
    expect(reply.statusCode).toBe(429);
  });
});

// ── ⑮ 扫描陷阱豁免的两层：路由声明 vs 无路由路径前缀（2026-11-04） ──────────────

describe('扫描陷阱：端点自证（路由声明）与无路由路径（safePaths）分工', () => {
  /** 连打 N 次同一状态码，返回首次抛出的错误（没抛返回 null） */
  async function hammer(ip, url, statusCode, routeConfig, times = 12) {
    for (let i = 0; i < times; i++) {
      try {
        await checkNotFoundTrap(ip, url, statusCode, null, routeConfig);
      } catch (err) {
        return err;
      }
    }
    return null;
  }

  it('路由声明 config.firewall.skipScanTrap → 连刷 12 次 403 不计数', async () => {
    const ip = '203.0.113.301';
    // 挑战端点的 403（Expired / Mismatch / Invalid Proof）属正常业务语义
    const err = await hammer(ip, '/api/firewall/v1/challenge/verify', 403, {
      firewall: { skipScanTrap: true }
    });
    expect(err).toBeNull();
  });

  it('未声明的路由 → 第 10 次 403 仍然判 SCANNER（开关必须真的生效，不能顺带把陷阱关掉）', async () => {
    const ip = '203.0.113.302';
    const err = await hammer(ip, '/api/some/protected', 403, {});
    expect(err).not.toBeNull();
    expect(err.rule).toBe('scanner-trap');
  });

  it('已登录用户的 403 不计入（权限不足 ≠ 在猜路径），且不污染匿名计数', async () => {
    const ip = '203.0.113.304';
    // 连刷 12 次「已登录」的 403：一次都不该计数
    for (let i = 0; i < 12; i++) {
      await expect(checkNotFoundTrap(ip, '/api/some/protected', 403, null, {}, true)).resolves.toBeUndefined();
    }
    // 计数器应仍是 0：匿名请求到第 10 次才命中，说明前面 12 次确实没写进去
    let anonymousErr = null;
    for (let i = 0; i < 12; i++) {
      try {
        await checkNotFoundTrap(ip, '/api/some/protected', 403, null, {});
      } catch (err) {
        anonymousErr = err;
        break;
      }
    }
    expect(anonymousErr).not.toBeNull();
    expect(anonymousErr.rule).toBe('scanner-trap');
  });

  it('没有路由的路径（favicon 404）由 safePaths 前缀兜底', async () => {
    const ip = '203.0.113.303';
    // 无路由 ⇒ routeConfig 是 null；这类请求只能靠配置里的前缀豁免
    const err = await hammer(ip, '/favicon.ico', 404, null);
    expect(err).toBeNull();
  });

  it('挑战端点确实带上了 skipScanTrap（防「加了开关没人用」）', async () => {
    const routes = await captureChallengeRoutes();
    expect(routes).toHaveLength(2);
    for (const route of routes) {
      expect(route.opts.config.firewall.skipScanTrap).toBe(true);
      // 与 rateLimit 同处一个 config 对象，互不影响
      expect(route.opts.config.rateLimit.groupId).toMatch(/^challenge-/);
    }
  });
});

// ── ⑯ safePaths 只走配置通道（无内置路径，2026-11-04） ──────────────────────────

describe('safePaths：免检前缀只来自配置，代码里不内置任何路径', () => {
  it('空配置 = 不豁免任何路径（前后端分离，前端产物不经本服务）', async () => {
    expect(isSafePath('/firewall/assets/index-abc.js', [])).toBe(false);
    expect(isSafePath('/admin/', [])).toBe(false);
    expect(isSafePath('/favicon.ico', [])).toBe(false);
  });

  it('默认值里的条目生效（favicon/robots/探针/面板 API）', async () => {
    const defaults = ['/health', '/favicon.ico', '/robots.txt', '/__fw/', '/api/firewall/'];
    expect(isSafePath('/favicon.ico', defaults)).toBe(true);
    expect(isSafePath('/api/firewall/v1/monitor/summary', defaults)).toBe(true);
    // 前端产物前缀不默认 —— 同域托管时由运维自己加
    expect(isSafePath('/firewall/assets/index-abc.js', defaults)).toBe(false);
  });

  it('配置追加的条目生效，且不影响「不在名单里的路径仍要计数」', async () => {
    expect(isSafePath('/custom/thing', ['/custom/'])).toBe(true);
    expect(isSafePath('/api/user/delete', ['/custom/'])).toBe(false);
    expect(isSafePath('/api/user/delete')).toBe(false);
  });

  it('非法条目（空串 / 非字符串 / 非数组）不会变成"匹配一切"', async () => {
    // 空前缀 startsWith('') 恒 true —— 一旦漏进配置就会把整个扫描陷阱关掉
    expect(isSafePath('/api/user/delete', ['', null, undefined, 42])).toBe(false);
    expect(isSafePath('/api/user/delete', null)).toBe(false);
    expect(isSafePath('/api/user/delete', 'not-an-array')).toBe(false);
  });
});

// ── ⑰ loopbackPrefixes：回环豁免也只走配置（代码侧空数组，2026-11-05） ──────────

describe('isLoopbackIp：回环豁免只来自配置，代码里不内置任何前缀', () => {
  const DEFAULTS = ['127.', '::1', 'localhost'];

  it('空配置 = 谁都不豁免（连本机也不）', async () => {
    // 代码侧 LOOPBACK_PREFIXES 是空数组，`isLoopbackIp(ip)` 不传第二参时也不该豁免
    expect(isLoopbackIp('127.0.0.1', [])).toBe(false);
    expect(isLoopbackIp('127.0.0.1')).toBe(false);
    expect(isLoopbackIp('::1', [])).toBe(false);
  });

  it('配置里的前缀生效（本机 IPv4 / IPv6 / localhost）', async () => {
    expect(isLoopbackIp('127.0.0.1', DEFAULTS)).toBe(true);
    expect(isLoopbackIp('127.9.9.9', DEFAULTS)).toBe(true);
    expect(isLoopbackIp('::1', DEFAULTS)).toBe(true);
    expect(isLoopbackIp('localhost', DEFAULTS)).toBe(true);
  });

  it('只豁免回环：RFC1918 与公网照常计数（否则等于关掉扫描陷阱）', async () => {
    for (const ip of ['10.1.2.3', '192.168.1.10', '172.16.0.5', '8.8.8.8', '203.0.113.7']) {
      expect(isLoopbackIp(ip, DEFAULTS)).toBe(false);
    }
  });

  it('非法条目（空串 / 非字符串 / 非数组）不会变成"豁免一切"', async () => {
    // 空前缀 startsWith('') 恒 true —— 漏进配置就等于对所有 IP 关掉扫描陷阱
    expect(isLoopbackIp('203.0.113.7', ['', null, undefined, 42])).toBe(false);
    expect(isLoopbackIp('203.0.113.7', null)).toBe(false);
    expect(isLoopbackIp('203.0.113.7', 'not-an-array')).toBe(false);
    expect(isLoopbackIp('', DEFAULTS)).toBe(false);
    expect(isLoopbackIp(null, DEFAULTS)).toBe(false);
  });
});
