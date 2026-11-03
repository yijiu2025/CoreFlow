/**
 * 请求安全处理管道
 * 将 onRequest 钩子中的安全检查逻辑拆分为独立步骤，提高可读性
 *
 * 依赖方向说明：本模块**不再**从 `./index.js`（barrel）取符号，而是直接从各个
 * 实现模块导入。此前 `engine/index.js` re-export `pipeline.js` 的函数，而
 * `pipeline.js` 又从 `engine/index.js` 取符号 —— 构成真实的循环依赖
 * （AUDIT-REPORT 🟡-10）。从 barrel 取符号除了造环，还会让「谁依赖谁」变得不可读。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { buildChallengePage } from '../challenge-template.js';
import { trackRequestCount } from './detectors/rate-limiter.js';
import { checkGeoReputation, resolveGeoInfo } from './detectors/geo-filter.js';
import { checkBotChallenge } from './detectors/bot-detector.js';
import { checkLoginBruteForce } from './detectors/brute-force.js';
import { checkGlobalBlock, removeBlock, removeBlockFp, removeBlockDevice } from '../block-manager.js';
import { trackConnection } from '../util/connection-tracker.js';
import { generateFingerprint } from '../util/fingerprint.js';
import { recordFirewallEvent } from '../telemetry-sink.js';
import { readSecuritySettings } from '../interface/config-access.js';
import { hasPass, readAccessState } from '../util/redis.js';
import { getClientDeviceId } from '../../auth/index.js';
import { createLogger } from '../../log/index.js';

const log = createLogger('framework.firewall.engine.pipeline');

// ============== 跳过规则 ==============

/**
 * 挑战接口的完整路径（**签发 + 校验，两个都要**）。
 *
 * 集中一处定义：它同时是「深度检测跳过名单」和「挑战态放行名单」的判据，
 * 写成两个字面量一定会漂移（旧实现就只出现在跳过名单里，对第一阶段毫无作用）。
 *
 * ⚠️ `issue` 必须在这里 —— 挑战态下前端要**签发**一份新载荷才能开始算 PoW，
 * 漏了它就会出现"挑战页拉不到挑战"的死锁（实测踩到：Challenge issue failed 428）。
 */
const CHALLENGE_API_PATHS = ['/api/firewall/v1/challenge/verify', '/api/firewall/v1/challenge/issue'];

/** 校验接口（保留单值导出：历史引用与测试按这个名找） */
const CHALLENGE_VERIFY_PATH = '/api/firewall/v1/challenge/verify';

/**
 * 健康探针路径（编排系统的存活 / 就绪探测）。
 *
 * 与挑战验证接口同一性质：**必须保持无条件可达**，否则探针会被本系统自己的防护判成异常。
 * 具体故障链：探针通常**不带 User-Agent**（部分 Docker HEALTHCHECK、自研监控），
 * 会命中 Bot 检测的 `requestCount > botChallengeNoUaLimit`（默认 10）分支 ——
 * 按 60s 窗口、5s 一次的常规探测频率即 12 次 → 返回**挑战页 HTML 且状态码 200**，
 * 于是探针"看起来通过"却完全失效；若改判成 429，编排系统又会把健康实例摘掉，形成自伤。
 *
 * 这不是放宽安全：全局封禁 / 连接数限制阶段**照常执行**，跳过的只是 Bot / 地理 /
 * 端点限频这些启发式判定。
 *
 * ⚠️ 与 `CHALLENGE_VERIFY_PATH` 一样是**字面量路径**：若改动 `api/system/system.json`
 * 的 prefix（当前为空）或 `health.js` 里的 group prefix（当前 `/v1`），此处必须同步。
 */
const PROBE_PATHS = ['/v1/health', '/v1/health/live', '/v1/health/ready'];

/**
 * 前端人机挑战页（**独立构建入口**，不是 SPA 深链路由）与其静态资源前缀
 *
 * 为什么必须是独立 HTML 而不是 `/firewall/challenge` 这种前端路由：
 *   ① 后端没有 SPA 回退（`@fastify/static` 对不存在的文件直接 404，全站 SPA 深链本来
 *      就刷不了），深链路由在"用户被 302 过来"这条路上必然 404；
 *   ② 挑战页**不能启动主 app**：主 app 的 bootstrap 会立刻发 userinfo / permissions 等
 *      请求，而那些请求此刻正被挑战态挡着 —— 一进页面就自我打死。
 * 独立入口 = 一个只有挑战卡片的极小应用，与主 app 的鉴权/路由/布局完全隔离。
 *
 * 为什么必须豁免：被挑战的客户端如果**连挑战页本身都被拦**，就成"点开验证页 →
 * 又被判成挑战态 → 再弹一次"的死锁。所以这些路径要像 `CHALLENGE_VERIFY_PATH` 一样无条件可达。
 *
 * ⚠️ 与 `CHALLENGE_VERIFY_PATH` 同一性质的字面量：若前端改了挑战页入口名或产物目录
 * （`vite build` 默认 `assets/`），此处必须同步。豁免的只是"挑战页外壳"，页面里不得
 * 放任何用户数据 —— 这段路径绕过了 Bot / 地理 / 端点限频判定。
 */
const CHALLENGE_PAGE_PATHS = [
  '/firewall/challenge.html',
  '/admin/challenge.html',
  // 根路径兜底：admin 若部署在**站点根**（vite `base: '/'`），它的挑战页就是
  // `/challenge.html`。多列一个不放大风险（只是"这个路径不挑战"），
  // 少列一个则会变成"同源部署的 admin 永远打不开挑战页"。
  '/challenge.html'
];

/** 挑战页静态资源前缀（构建产物目录，按 SPA 基路径各一份） */
const CHALLENGE_ASSET_PREFIXES = ['/firewall/assets/', '/admin/assets/'];

/**
 * 请求 URL 属于哪个 SPA（用于把被拦的导航指向对应的挑战页）
 *
 * @param {string} url 请求路径（含查询串也可）
 * @returns {'firewall'|'admin'|null} SPA 标识；无法判定返回 null
 */
function spaOf(url) {
  const p = pathOf(url);
  if (p === '/admin' || p.startsWith('/admin/')) return 'admin';
  if (p === '/firewall' || p.startsWith('/firewall/')) return 'firewall';
  return null;
}

/**
 * 该请求对应的挑战页路径
 *
 * @param {string} url 请求路径
 * @returns {string|null} 如 `/firewall/challenge.html`；不属于已知 SPA 时返回 null（回落到内置模板）
 */
function challengePageFor(url) {
  const spa = spaOf(url);
  return spa ? `/${spa}/challenge.html` : null;
}

/**
 * 是否为挑战页自身（或其静态资源）
 *
 * 同时接受带/不带 `.html` 的写法：前端若把入口挂成扩展名省略的形式（某些反代会改写），
 * 不应该因此掉进挑战死锁。
 *
 * @param {string} url 请求路径
 * @returns {boolean} true 表示挑战页外壳
 */
function isChallengePageUrl(url) {
  const p = pathOf(url);
  if (CHALLENGE_PAGE_PATHS.includes(p)) return true;
  if (CHALLENGE_PAGE_PATHS.includes(`${p}.html`)) return true;
  return CHALLENGE_ASSET_PREFIXES.some(prefix => p.startsWith(prefix));
}

/** 静态资源后缀：不经过深度检测 */
const SKIP_PATTERN = /\.(js|css|png|jpg|ico|svg|woff2?)$/i;

/** 遥测里 User-Agent 的最大长度（外部输入截断，见 buildRequestContext） */
const MAX_UA_LOG_LEN = 256;

/**
 * 挑战类响应的缓存策略：**必须 no-store**
 *
 * 为什么：挑战页是按任意 URL 下发的（阶段 1 早于静态资源跳过），`/assets/index.js`
 * 这种地址也可能拿到 HTML。响应不带缓存头时，前置 CDN / 反代按后缀缓存就会把
 * 挑战页当成业务响应复用给所有用户 —— 一次缓存污染的后果是全站白屏。
 */
const CHALLENGE_NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  Vary: 'Accept, User-Agent'
};

/**
 * 去掉查询串，取纯路径
 *
 * @param {string} url 原始 url
 * @returns {string} 路径部分
 */
function pathOf(url) {
  const s = String(url || '');
  const q = s.indexOf('?');
  return q === -1 ? s : s.slice(0, q);
}

/**
 * 是否为挑战接口（签发 / 校验）
 *
 * @param {string} url 请求路径
 * @returns {boolean} true 表示是挑战接口
 */
function isChallengeApiUrl(url) {
  return CHALLENGE_API_PATHS.includes(pathOf(url));
}

/**
 * 是否为挑战**校验**接口（历史名，等价于只看 verify 一个）
 *
 * @param {string} url 请求路径
 * @returns {boolean} true 表示是验证接口
 */
function isChallengeVerifyUrl(url) {
  return pathOf(url) === CHALLENGE_VERIFY_PATH;
}

/**
 * 是否为健康探针路径
 *
 * @param {string} url 请求路径
 * @returns {boolean} true 表示是编排系统的健康探测
 */
function isProbeUrl(url) {
  return PROBE_PATHS.includes(pathOf(url));
}

/**
 * 判断请求是否应跳过深度检测
 * @param {string} url 请求路径
 * @returns {boolean} true 表示跳过
 */
function shouldSkipDeepCheck(url) {
  return isChallengeApiUrl(url) || isChallengePageUrl(url) || isProbeUrl(url) || SKIP_PATTERN.test(pathOf(url));
}

/**
 * 判断请求是否「已注定被守卫拒绝」——路由声明必须登录，而请求一个凭据都没带
 *
 * 为什么能判断出来：Fastify 的 `onRequest` 在**路由匹配之后**执行，因此
 * `request.routeOptions.config` 可读；`registerSecureRoute` 已把 `requireLogin`
 * 一并写进路由 config（`api/guard.js`），这里读它即可，无需跨 app 去查 guard 的配置表
 * （app 之间不互相依赖）。实测未匹配到路由时 `routeOptions.config` 是空对象，不会误判。
 *
 * 判定刻意收紧为「**一个凭据都没有**」而不是「认证没成功」：带了 sid/token 却没通过认证
 * 是更可疑的信号（失效、伪造、越权试探），必须继续走深度检测。
 *
 * ⚠️ 这是一项**配置开关**（`defense.skipDeepCheckForAnonymous`，默认关闭）而非默认行为：
 * 跳过深度检测后，匿名探测受保护端点不再进入 Bot / 地理 / 端点限频判定，端点枚举的阻力
 * 会下降（第一层全局限流与封禁/白名单阶段仍然生效）。打开它换的是 CPU 与 Redis 往返。
 *
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @returns {boolean} true 表示可以跳过深度检测
 */
function willBeRejectedAsAnonymous(request) {
  if (request.routeOptions?.config?.requireLogin !== true) return false;
  if (request.state?.user) return false;
  const hasCredential = Boolean(request.cookies?.sid || request.cookies?.access_token || request.headers.authorization);
  return !hasCredential;
}

// ============== 请求上下文构建 ==============

/**
 * 构建防火墙日志上下文
 * 在请求进入时调用，生成 fingerprint / deviceId 和基础日志字段
 *
 * `deviceId` 用 auth 的 `getClientDeviceId`（只认客户端自报且校验通过的值，**不补发**）：
 * 补发的 ID 每请求都可能不同，拿它当封禁维度等于永远封不住人。
 * 拿不到时返回 null，后续所有判定自动退回 IP / 指纹维度。
 *
 * 成本：结构化 ID 校验是纯 CPU（split + Base62 解码），无 I/O，可放在热路径上。
 *
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @returns {Promise<object>} 包含 ip、ua、fingerprint、deviceId、geoInfo 的上下文
 */
async function buildRequestContext(request) {
  const ip = request.ip;
  const ua = request.headers['user-agent'] || '';
  const fingerprint = generateFingerprint(request);
  const deviceId = await getClientDeviceId(request);
  request._fingerprint = fingerprint;
  request._deviceId = deviceId;

  const geoInfo = resolveGeoInfo(ip);
  request._firewallLog = {
    time: new Date().toISOString(),
    ip,
    fingerprint,
    deviceId,
    method: request.method,
    url: request.url,
    // 截断后再入遥测：UA 是纯外部输入，未截断时 1000 条环形缓冲最坏可被
    // 16KB 级 UA 撑到十几 MB，并原样落盘 traffic_stats.json（安全规范：外部输入
    // 进日志前必须截断）。Bot 检测仍用完整 ua（见 runDetectionPipeline 的入参）。
    userAgent: ua.slice(0, MAX_UA_LOG_LEN),
    blocked: false,
    ...geoInfo
  };

  return { ip, ua, fingerprint, deviceId, geoInfo };
}

// ============== 挑战态处置 ==============

/**
 * 撤销命中者身上的「挑战」状态（**只清 CHALLENGE**，绝不误伤 SCANNER/BLOCKED）。
 *
 * 挑战与硬封禁共用同一套封禁键，只有状态串不同。用户通过验证后必须把挑战态清掉，
 * 否则他会一直看到挑战页直到 TTL 到期。
 *
 * 三个维度都要清：挑战可能是被其中一个维度命中的，残留任意一个都会让用户
 * 「刚通过又立刻被挑战」。
 *
 * @param {string} ip 客户端 IP
 * @param {string} fingerprint 请求指纹
 * @param {string|null} deviceId 设备 ID（可能为 null）
 * @returns {Promise<void>}
 */
async function clearChallengeState(ip, fingerprint, deviceId) {
  try {
    const state = await readAccessState({ ip, fingerprint, deviceId });
    if (state.devBlock?.status === 'CHALLENGE' && deviceId) await removeBlockDevice(deviceId);
    if (state.fpBlock?.status === 'CHALLENGE') await removeBlockFp(fingerprint);
    if (state.ipBlock?.status === 'CHALLENGE') await removeBlock(ip);
  } catch (err) {
    // 清理失败不影响放行：挑战态仍会再次判定，最坏是用户再看一次挑战页
    log.warn(`⚠️ [Firewall] 清除挑战态失败 ip=${ip}`, err);
  }
}

/**
 * 判断这是不是一个「能把挑战页渲染出来」的文档型请求
 *
 * 为什么必须区分：挑战页是一段**内联脚本的 HTML**，只有作为文档加载才有执行环境。
 * 历史上对所有请求一律回 `200 + text/html`，于是：
 *   - 被挑战的 SPA 后续 `fetch/axios` 拿到 HTML+200 → 前端 JSON 解析报错，
 *     用户看不到验证入口，只能等 30 分钟挑战 TTL 过期；
 *   - 无 UA 的 API / SDK / 支付回调 10 次/60s 即被挑战，把 HTML 当成功响应 → 静默数据错误
 *     （`PROBE_PATHS` 的注释记的就是这个事故，当时只给三个探针路径打了补丁）。
 * 现在：能渲染的给页面，其余给可编程的 428 + `X-Firewall-Challenge`。
 *
 * 判定顺序（强信号优先）：
 *   ① `Sec-Fetch-Mode`（现代浏览器必带）：只有 `navigate` 才是文档请求；
 *   ② 降级看 `Accept` 是否声明 `text/html`；
 *   ③ 两者都没有（脚本/老客户端/测试替身）→ 按历史行为渲染页面，宁可能用不可误伤。
 *
 * @param {import('fastify').FastifyRequest} [request] 请求对象（可能为空：测试替身 reply）
 * @returns {boolean} true 表示可以下发挑战页 HTML
 */
function isDocumentRequest(request) {
  if (!request) return true;
  const method = String(request.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return false;

  const headers = request.headers || {};
  const fetchMode = headers['sec-fetch-mode'];
  if (typeof fetchMode === 'string' && fetchMode !== '') return fetchMode === 'navigate';

  const accept = headers.accept;
  if (typeof accept !== 'string' || accept === '') return true;
  return accept.includes('text/html');
}

/**
 * 渲染挑战页
 *
 * @param {import('fastify').FastifyReply} reply 响应对象
 * @param {string} ip 客户端 IP
 * @param {string} fingerprint 请求指纹
 * @param {string|null} deviceId 设备 ID（可能为 null）
 * @returns {Promise<void>}
 */
async function sendChallengePage(reply, ip, fingerprint, deviceId) {
  const html = await buildChallengePage(ip, fingerprint, deviceId);
  reply.headers(CHALLENGE_NO_STORE).type('text/html').send(html);
}

/**
 * 挑战处置：能渲染的给页面，其余给可编程的 428
 *
 * 三种落点（按优先级）：
 *   ① 请求属于已知 SPA（`/firewall/*`、`/admin/*`）且是**文档请求**
 *      → 302 到该 SPA 的 Vue 挑战页（带 `return`），路径与 assets 已在防护层豁免；
 *   ② 其余文档请求（非 SPA 客户端、直连 API 的浏览器、移动端内嵌页）
 *      → 渲染内置 HTML 模板（**兜底**，不依赖前端构建产物是否存在）；
 *   ③ 非文档请求（XHR / 脚本 / 非浏览器客户端）→ 428 + `X-Firewall-Challenge`。
 *
 * 428（Precondition Required）而不是 429：它表达「少一个前置条件」，不会被
 * 客户端的限流退避逻辑当成"过一会儿重试就行"；`challengeUrl` 是**建议值**，
 * 前端应该用自己基路径 + `challenge` 路由（后端无法可靠推断跨域 SPA 的基路径）。
 *
 * @param {import('fastify').FastifyReply} reply 响应对象
 * @param {string} ip 客户端 IP
 * @param {string} fingerprint 请求指纹
 * @param {string|null} deviceId 设备 ID
 * @param {import('fastify').FastifyRequest} [request] 请求对象（用于判定请求类型 / 构造 return）
 * @returns {Promise<number>} 实际下发的状态码（200 = 内置页面，302 = 跳 SPA，428 = 提示）
 */
async function sendChallengeResponse(reply, ip, fingerprint, deviceId, request) {
  const document = isDocumentRequest(request);

  if (document) {
    // ① 已知 SPA 的导航：交给 Vue 挑战页（可维护、可复用组件、样式与站点一致）
    const pagePath = challengePageFor(request?.url || '');
    if (pagePath) {
      const back = String(request.url || '/');
      reply
        .headers({ ...CHALLENGE_NO_STORE, Location: `${pagePath}?return=${encodeURIComponent(back)}` })
        .code(302)
        .send('');
      return 302;
    }

    // ② 其余文档请求：内置模板兜底
    await sendChallengePage(reply, ip, fingerprint, deviceId);
    return 200;
  }

  // ③ 非文档请求：可编程的 428
  //
  // 这里的 `challengeUrl` 只给"挑战页在哪"，**不拼 return**：XHR 的 URL 是接口地址，
  // 拿它当返回目标会把用户送到一个 JSON 接口上。真正的返回目标是**页面地址**
  // （`location.pathname`），只有前端自己知道，由拦截器补。
  const originalUrl = pathOf(request?.url);
  const challengeUrl = challengePageFor(request?.url || '') || originalUrl;

  reply
    .headers({ ...CHALLENGE_NO_STORE, 'X-Firewall-Challenge': challengeUrl })
    .code(428)
    .send({
      code: 428,
      error: 'Challenge Required',
      message: '需要完成人机验证后才能继续访问；请以文档方式打开 challengeUrl 完成验证。',
      challengeUrl,
      requestUrl: originalUrl
    });
  return 428;
}

// ============== 第一阶段：全局封禁检查 ==============

/**
 * 全局封禁检查（连接数 + 黑名单）
 * 请求进入时最先执行，被封禁的请求直接拒绝，不进入后续检测。
 *
 * `CHALLENGE` 状态**不是**硬封禁，三种去向（修复前一律落成 429，形成死锁）：
 *   ① 客户端已持有有效通过令牌 → 撤销挑战态并放行；
 *   ② 请求的就是验证接口 → 放行（否则挑战永远解不开）；
 *   ③ 其余 → 返回挑战页。
 *
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @param {import('fastify').FastifyReply} reply 响应对象
 * @returns {Promise<boolean>} true 表示已响应（调用方直接 return），false 表示放行
 */
async function checkGlobalBlockPhase(request, reply) {
  const ip = request.ip;
  const fingerprint = request._fingerprint;
  const deviceId = request._deviceId || null;
  const firewallLog = request._firewallLog;

  try {
    trackConnection(ip, 1);
    await checkGlobalBlock(ip, fingerprint, deviceId);
    return false; // 放行
  } catch (err) {
    // ---- 挑战态：不硬封禁 ----
    if (err.isChallenge) {
      const token = request.cookies?.fw_verified;

      // ① 已通过验证：撤销挑战态，正常放行
      if (token && (await hasPass({ ip, fingerprint, deviceId, token }))) {
        await clearChallengeState(ip, fingerprint, deviceId);
        return false;
      }

      // ② 验证/签发接口、挑战页自身与其静态资源必须无条件可达（否则挑战打不开 = 死锁）
      if (isChallengeApiUrl(request.url) || isChallengePageUrl(request.url)) return false;

      // ③ 其余请求 → 挑战页（文档请求）或 428（XHR / 脚本 / 非浏览器客户端）
      firewallLog.blocked = true;
      firewallLog.statusCode = await sendChallengeResponse(reply, ip, fingerprint, deviceId, request);
      recordFirewallEvent({ ...firewallLog });
      return true;
    }

    // ---- 硬封禁：403 / 429 ----
    firewallLog.blocked = true;
    firewallLog.statusCode = err.statusCode || 429;
    recordFirewallEvent({ ...firewallLog });
    // 透传封禁错误自带的响应头（如 Retry-After）：buildBlockError 刻意设置了它，
    // 供客户端退避；此前的全局封禁阶段漏了这一步，导致该响应头从未真正下发
    // （检测流水线里的同款回包是有透传的，两处行为此前不一致）。
    if (err.headers) reply.headers(err.headers);
    reply.code(err.statusCode || 429).send({
      error: 'Security Policy Blocked',
      message: err.message
    });
    return true; // 已封禁
  }
}

// ============== 第二阶段：挑战 Cookie 验证 ==============

/**
 * 检查请求是否携带有效的挑战验证 Cookie
 * token 绑定在设备 / 指纹 / IP 三个维度上，任一通过即放行
 *
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @param {string} ip 客户端 IP
 * @param {string} fingerprint 请求指纹
 * @returns {Promise<boolean>} true 表示已通过挑战验证，false 表示需要继续检测
 */
async function checkChallengeCookie(request, ip, fingerprint) {
  const clientToken = request.cookies?.fw_verified;
  if (!clientToken) return false;

  // 一次原子校验（设备 / 指纹 / IP 任一命中即通过），且无需再判 redis 是否为空
  return hasPass({ ip, fingerprint, deviceId: request._deviceId || null, token: clientToken });
}

// ============== 第三阶段：深度检测管道 ==============

/**
 * 深度检测管道
 * 执行 Bot 检测、地理信誉检查、端点限频等。
 * 触发挑战或封禁时直接响应请求。
 *
 * @param {string} ip 客户端 IP
 * @param {string} ua User-Agent
 * @param {string} url 请求路径
 * @param {object} firewallLog 日志对象引用
 * @param {string} fingerprint 请求指纹
 * @param {import('fastify').FastifyReply} reply 响应对象
 * @param {string|null} [deviceId] 设备 ID（可为空；命中挑战时会一并写设备维度，使挑战跨 IP 有效）
 * @returns {Promise<boolean>} true 表示被拦截（已响应），false 表示放行
 */
async function runDetectionPipeline(ip, ua, url, firewallLog, fingerprint, reply, deviceId = null) {
  try {
    // Bot 检测：基于 UA 模式 + 请求频率
    const requestCount = trackRequestCount(ip);
    const isBot = await checkBotChallenge(ip, ua, requestCount, deviceId);

    if (isBot) {
      const err = new Error('Challenge required');
      err.isChallenge = true;
      throw err;
    }

    // 地理信誉：IDC 限频、境外敏感路径拦截
    await checkGeoReputation(reply.request, url);

    // 端点级限流**不在这里**：由各路由自己的 config.rateLimit 承担
    // （@fastify/rate-limit 的 onRoute 钩子，在 onRequest 更早的位置执行）。
    // 历史上这里还有一套 defense.endpointRateLimits 自研路径规则，因 path 全部写错
    // 且封禁键不是 IP，整套空转，已于 2026-11-02 移除。

    return false; // 放行
  } catch (err) {
    // 只认结构化标记。旧实现额外用 `err.message.includes('CHALLENGE')` 兜底，
    // 方向是 **fail-open**：任何消息里带该字样的错误都会把「硬封禁」降级成
    // 「返回挑战页 200」。一旦有错误把 Redis key 拼进 message（key 形如
    // `fw:block:...`），行为就会静默改变。
    const isChallenge = err.isChallenge === true;

    // 挑战请求：文档请求给 HTML 页面（200），其余给可编程的 428。
    // 状态码要按实际下发的值记账，否则遥测里「被拦截」会全部显示成 200。
    if (isChallenge) {
      firewallLog.blocked = true;
      firewallLog.statusCode = await sendChallengeResponse(reply, ip, fingerprint, deviceId, reply.request);
      recordFirewallEvent({ ...firewallLog });
      return true;
    }

    firewallLog.blocked = true;
    firewallLog.statusCode = err.statusCode || 429;
    recordFirewallEvent({ ...firewallLog });

    // 封禁请求返回 JSON 错误
    if (err.headers) reply.headers(err.headers);
    reply.code(err.statusCode || 429).send({
      error: 'Security Policy Blocked',
      message: err.message
    });
    return true; // 已拦截
  }
}

// ============== 登录结果观测（暴力破解防护接线） ==============

/**
 * 登录类路径（账号密码 / 快捷登录 / 邮箱二次验证）
 *
 * 注意：这里刻意**不**在 oauth21 的登录服务里 import firewall 的检测器 ——
 * 本仓的架构约定是「app 之间不互相依赖」。防火墙自己挂在 `onResponse` 上观测
 * 登录请求的结果，从而实现同一件事，且依赖方向仍然是 oauth21 ⊥ firewall。
 */
const LOGIN_PATH_PATTERN = /\/(mini-login|login|verify-email)$/;

/** 视为「凭证失败」的状态码（参数错误 400 不计入，避免把用户填错字段当成爆破） */
const CREDENTIAL_FAILURE_CODES = [401, 403, 422, 423];

/** 账号字段最大长度（进 Redis 键前截断，见 observeLoginOutcome 注释） */
const MAX_ACCOUNT_KEY_LEN = 128;

/**
 * 从登录 body 里取出「可用于账号维度计数」的标识
 *
 * 优先级 username > email：两者语义等价（`login.service.js` 用 `email || username`
 * 查锁定标记，因此只要**任一路径**写入了同一个值，锁定就能命中）。
 *
 * @param {object} body 请求体
 * @returns {string|undefined} 账号标识；取不到时 undefined（调用方退回 IP 维度）
 */
function extractLoginAccount(body) {
  const raw = body?.username ?? body?.email;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_ACCOUNT_KEY_LEN);
}

/**
 * 观测登录请求的结果并维护暴力破解计数
 *
 * 旧实现里 `checkLoginBruteForce` / `isAccountLocked` 定义了却**零调用**，
 * 所谓「登录暴力破解防护」从未生效。这里给 `checkLoginBruteForce` 接上真实调用点。
 *
 * ⚠️ 账号取值只能用 `request.body` 里**明文存在**的字段（`username` / `email`）：
 *   · 密码登录：body 是 `{ encrypted, timestamp, nonce, kid }`，账号名在 RSA 密文里，
 *     且 `decryptLoginRequest` 只返回解密结果、**不回写** `request.body`
 *     → 防火墙拿不到账号，只能做 **IP 维度**计数（这是硬限制，不要假装能取到）；
 *   · 邮箱验证码登录：body 是 `{ type:'email', email, code }` → **邮箱可用**，
 *     账号维度从这里生效；
 *   · `/login/verify-email`：body 只有 `{ verifyToken, code }`，邮箱在服务端的
 *     `login_email_verify` 存储里 → 这一条路径仍只有 IP 维度（跨 app，需架构决策）。
 *
 * 历史缺陷（2026-11-03 修）：只读 `body.username`，而三条登录路径的 body 里都没有
 * 这个字段，于是 `username` 恒为 undefined → `brute:user:*` / `lock:*` 永不写入
 * → `isAccountLocked()` 恒 false → 账号锁定（5 次/900s）从未生效，注释还写着
 * 「邮箱验证码登录会明文带上 username」（错的）。现在改为 `username || email`。
 *
 * 账号值会进入 Redis 键（`brute:user:*` / `lock:*`），因此**先截断再使用**：
 * 登录 schema 对 email/username 没有 maxLength，未截断时一个 1MB 的 email 就能
 * 造出 1MB 的键（键空间与日志双重膨胀）。
 *
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @param {import('fastify').FastifyReply} reply 响应对象
 * @returns {Promise<void>}
 */
async function observeLoginOutcome(request, reply) {
  if (request.method !== 'POST') return;
  if (!LOGIN_PATH_PATTERN.test(pathOf(request.url))) return;

  try {
    if (!readSecuritySettings().defense?.enableBruteForce) return;

    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const account = extractLoginAccount(body);
    const success = reply.statusCode >= 200 && reply.statusCode < 300;

    if (success) {
      // 登录成功即清零，避免历史失败把正常用户推进挑战/封禁
      await checkLoginBruteForce(request.ip, account, true, request._deviceId || null);
      return;
    }
    if (!CREDENTIAL_FAILURE_CODES.includes(reply.statusCode)) return;

    await checkLoginBruteForce(request.ip, account, false, request._deviceId || null);
  } catch (err) {
    // 观测失败绝不影响业务响应
    log.warn('⚠️ [Firewall] 登录结果观测失败', err);
  }
}

// ============== 日志记录 ==============

/**
 * 记录请求日志到流量统计
 * 在响应发送前调用，将 firewallLog 推入环形缓冲区
 *
 * @param {object} firewallLog 日志对象
 * @param {number} statusCode HTTP 状态码
 * @param {boolean} [alreadyLogged=false] 是否已记录（防止重复）
 */
function recordLog(firewallLog, statusCode, alreadyLogged = false) {
  if (firewallLog && !alreadyLogged) {
    recordFirewallEvent({ ...firewallLog, statusCode });
  }
}

export {
  CHALLENGE_API_PATHS,
  CHALLENGE_VERIFY_PATH,
  CHALLENGE_PAGE_PATHS,
  PROBE_PATHS,
  isChallengeApiUrl,
  isChallengePageUrl,
  isChallengeVerifyUrl,
  isProbeUrl,
  shouldSkipDeepCheck,
  willBeRejectedAsAnonymous,
  buildRequestContext,
  checkGlobalBlockPhase,
  checkChallengeCookie,
  runDetectionPipeline,
  observeLoginOutcome,
  recordLog
};
