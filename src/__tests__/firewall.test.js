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
// `src/data/traffic_stats.json`（一个被 git 跟踪的文件）。jest 进程普遍活过 10 秒
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
  setBroadcastHandler: () => {}
}));

const { buildChallengePage } = await import('../app/firewall/data/challenge-template.js');
const { verifyChallenge } = await import('../app/firewall/services/challenge.service.js');
const { sha256Hex } = await import('../app/firewall/util/pow-sha256.js');
const { generateFingerprint } = await import('../app/firewall/util/fingerprint.js');
const { hasPass } = await import('../app/firewall/util/redis.js');
const { ipRequestTimestamps } = await import('../app/firewall/util/shared.js');
const { setBlock, setBlockDevice, setWhitelistDevice, getActiveBlocks, getActiveWhitelist, checkGlobalBlock } =
  await import('../app/firewall/dao/block-manager.js');
const { buildRequestContext, checkGlobalBlockPhase, willBeRejectedAsAnonymous } =
  await import('../app/firewall/engine/pipeline.js');
const { generateServerSideDeviceId } = await import('../framework/auth/device-id-service.js');
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
  method = 'GET'
}) {
  const headers = { 'user-agent': ua };
  if (deviceId) headers['x-device-id'] = deviceId;
  return { ip, url, method, headers, cookies, body };
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

    const { setWhitelist } = await import('../app/firewall/dao/block-manager.js');
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

    expect(res).toEqual({ ok: true });
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
    expect(res).toEqual({ ok: true });
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

  it('initFirewall 只有唯一注册点，且 config.js 不再声明 init', async () => {
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

    const registerSites = [];
    for (const f of walk(srcRoot)) {
      const src = fs.readFileSync(f, 'utf-8');
      const code = src
        .split('\n')
        .filter(l => {
          const t = l.trimStart();
          return !(t.startsWith('*') || t.startsWith('//') || t.startsWith('/*'));
        })
        .join('\n');
      if (/register\(\s*initFirewall\s*\)/.test(code))
        registerSites.push(path.relative(srcRoot, f).replace(/\\/g, '/'));
    }
    expect(registerSites).toEqual(['framework/loader/registry/05-firewall.js']);

    // config.js 若声明 init，会被 10-apps 再注册一次（且位置更晚 → 限流静默失效）
    const firewallConfigSrc = fs.readFileSync(path.join(srcRoot, 'app', 'firewall', 'config.js'), 'utf-8');
    const declaredInit = firewallConfigSrc
      .split('\n')
      .some(l => !l.trimStart().startsWith('*') && /^\s*init\s*:/.test(l));
    expect(declaredInit).toBe(false);
  });
});
