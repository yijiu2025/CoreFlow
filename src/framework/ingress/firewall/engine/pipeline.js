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
import crypto from 'node:crypto';
import {
  buildChallengePage,
  buildChallengeRedirect,
  challengePageCsp,
  recordChallengeEvent
} from '../challenge/index.js';
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
import { getClientDeviceId } from '../../../security/auth/index.js';
import { createLogger } from '../../../support/log/index.js';

const log = createLogger('framework.firewall.engine.pipeline');

// ============== 跳过规则 ==============

/**
 * 「本路由属于挑战接口」——由**路由自己声明**（`config.firewall.challengeSurface`）
 *
 * ```js
 * // api/firewall/v1/challenge.js
 * registerSecureRoute(fastify, { url: '/issue', config: { firewall: { challengeSurface: true } } })
 * ```
 *
 * 它同时是两张名单的判据：「深度检测跳过」和「挑战态放行」。两张都要，
 * 因为旧实现只把它放进前者，对第一阶段（挑战态）毫无作用 —— 实测症状是
 * "Challenge issue failed 428"：挑战页连一份载荷都拉不到，**所有用户死锁**。
 *
 * ⚠️ `issue` 与 `verify` **都要声明** —— 挑战态下前端要先**签发**载荷才能开始算 PoW。
 *
 * ## 为什么改成路由声明（2026-11-06）
 *
 * 上一版是常量数组 `['/api/firewall/v1/challenge/verify', '/api/firewall/v1/challenge/issue']`，
 * 而这两个字面量是把三段手拼出来的：
 *
 * ```
 * /api/firewall   ← api/firewall/system.json 的 prefix
 * /v1/challenge   ← registerGroupMetadata 的 prefix
 * /verify         ← registerSecureRoute 的 url
 * ```
 *
 * **任何一段改了，常量都不会跟着变** —— 而失效后果不是"少统计某类攻击"，是
 * 「挑战接口自己被挑战」→ 挑战永远解不开 → 全站登录死锁。所以它既不该是配置项
 * （`defaults.js` 早就写明"必须与路由注册一一对应，可配 = 允许漂移"），也不该是常量
 * （常量一样会漂）。声明是唯一让「URL 与判据」物理上无法分离的写法：两个字段在同一个
 * 对象字面量里，改 URL 的人眼前就是这行声明。
 *
 * 漏声明的兜底：`challenge-surface-wiring.test.js` 的正查（像挑战接口的路由必须声明）。
 *
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @returns {boolean} true 表示是挑战接口
 */
function isChallengeApiUrl(request) {
  return request?.routeOptions?.config?.firewall?.challengeSurface === true;
}

/**
 * 健康探针路径（编排系统的存活 / 就绪探测）—— **代码兜底值**
 *
 * 与挑战接口同一性质：**必须保持无条件可达**，否则探针会被本系统自己的防护判成异常。
 * 具体故障链：探针通常**不带 User-Agent**（部分 Docker HEALTHCHECK、自研监控），
 * 会命中 Bot 检测的 `requestCount > botChallengeNoUaLimit`（默认 10）分支 ——
 * 按 60s 窗口、5s 一次的常规探测频率即 12 次 → 返回**挑战页 HTML 且状态码 200**，
 * 于是探针"看起来通过"却完全失效；若改判成 429，编排系统又会把健康实例摘掉，形成自伤。
 *
 * 这不是放宽安全：全局封禁 / 连接数限制阶段**照常执行**，跳过的只是 Bot / 地理 /
 * 端点限频这些启发式判定。
 *
 * ## 豁免由两条腿组成（**并集**，任一条命中即放行）
 *
 * | 来源 | 覆盖什么 | 会不会漂 |
 * | --- | --- | --- |
 * | 路由声明 `config.firewall.probeEndpoint` | 本服务**注册了的**探针路由（默认三条） | 不漂：随路由走，prefix 改了自动跟上 |
 * | `defense.probePaths`（本常量是其兜底） | 部署方**额外**探的路径，可能没有对应路由（`/healthz`） | 靠人同步 |
 *
 * 为什么两条都要：
 *   · 只有配置 → 默认三条会随 prefix 漂（`system.json` 改成 `/sys` 后，真实路由变成
 *     `/sys/v1/health/live`，而配置里还是旧值）→ 探针拿到 428 → **容器重启循环**。
 *     这与挑战接口的常量漂移是同一类 bug，只有声明能结构性消除。
 *   · 只有声明 → 覆盖不到"没有路由的探针路径"，而那正是运营最常自定义的形态。
 *
 * 并集方向是**故意选 fail-open**（多豁免 > 少豁免）：这里少豁免的后果是容器起不来，
 * 多豁免的代价只是在固定文案端点上少跑几条启发式判定。
 *
 * ⚠️ 本常量仍是 `readPathsFromConfig` 的兜底：firewall app 卸载后 `defense` 读取器
 *    不存在，此时它是配置那条腿的唯一来源（声明那条腿始终有效，它不依赖配置）。
 */
const PROBE_PATHS = ['/v1/health', '/v1/health/live', '/v1/health/ready'];

/**
 * 读一份「路径清单」配置，缺失/写空时回退到代码常量
 *
 * 三层兜底：代码常量（最基础）← defense.*（必有的默认值）← src/config / 面板热改。
 * 配置写成空数组或全是非法条目时**回退**而不是「不豁免任何路径」——
 * 这几份清单是正确性保证（探针拿不到 200 会被编排摘掉），配错=自伤，不该比默认更危险。
 *
 * @param {string} key defense 下的配置键
 * @param {readonly string[]} fallback 代码兜底清单
 * @returns {readonly string[]} 生效清单
 */
function readPathsFromConfig(key, fallback) {
  let configured;
  try {
    configured = readSecuritySettings()?.defense?.[key];
  } catch {
    // 配置层尚未就绪（读取器未注册等）：回退代码兜底。
    // 探针 / 挑战页属于"必须活着"的路径，不能因为读配置失败就失去豁免。
    return fallback;
  }
  if (!Array.isArray(configured)) return fallback;
  const list = configured.filter(p => typeof p === 'string' && p.length > 0);
  return list.length > 0 ? list : fallback;
}

/** 静态资源后缀：不经过深度检测 */
const SKIP_PATTERN = /\.(js|css|png|jpg|ico|svg|woff2?)$/i;

/**
 * 防火墙总开关（`defense.enableFirewall`）
 *
 * false = 整套防护旁路：不计数、不查封禁、不下挑战、不拦请求。**排障用**。
 * 配置层尚未就绪时按"开启"处理 —— 安全功能的兜底方向是保留防护，不是放行。
 *
 * @returns {boolean} true = 正常执行防护
 */
function isFirewallEnabled() {
  try {
    return readSecuritySettings()?.defense?.enableFirewall !== false;
  } catch {
    return true;
  }
}

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
 * 是否为健康探针（**并集**：路由声明 ∪ 配置清单）
 *
 * 两条腿的分工与"为什么必须都要"见 `PROBE_PATHS` 的注释。
 *
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @returns {boolean} true 表示是编排系统的健康探测
 */
function isProbeUrl(request) {
  if (request?.routeOptions?.config?.firewall?.probeEndpoint === true) return true;
  return readPathsFromConfig('probePaths', PROBE_PATHS).includes(pathOf(request?.url));
}

/**
 * 是否为「**无条件可达**」端点（挑战接口 / 健康探针）
 *
 * 这两类在**任何状态**下都放行：深度检测跳过 + 挑战态放行。原因是失效后果都是死锁型：
 *
 * | 类别 | 判据 | 失效后果 |
 * | --- | --- | --- |
 * | 挑战接口 | `config.firewall.challengeSurface`（路由声明） | 挑战态下拿不到载荷 → 挑战永远解不开 → **全站登录死锁** |
 * | 健康探针 | `config.firewall.probeEndpoint`（声明）∪ `defense.probePaths`（配置） | 探针拿到 428/挑战页 → 编排判死 → **容器重启循环** |
 *
 * ## 这个函数存在的唯一理由：把"哪些类别享有无条件可达"收成一处
 *
 * 2026-11-03 的真实事故就是它被抄成了两份 —— `issue` 加进了「深度检测跳过」那份，
 * 漏了「挑战态放行」那份，症状是挑战页连一份载荷都拉不到（`Challenge issue failed 428`）。
 * 两份名单放在两个函数里，改一份忘一份是必然会发生的。现在两个消费点
 * （`shouldSkipDeepCheck` 与 `checkGlobalBlockPhase` 的挑战态分支）**都只调本函数**，
 * 新增一类只改这里一处。
 *
 * ⚠️ 硬封禁（BLOCKED / SCANNER）**不**在此豁免范围内：真正的封禁仍然拦探针与挑战接口。
 * 让被硬封的机器还能无限问挑战，等于把封禁降级成限速。
 *
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @returns {boolean} true 表示任何状态下都放行
 */
function isUnconditionallyReachable(request) {
  return isChallengeApiUrl(request) || isProbeUrl(request);
}

/**
 * 判断请求是否应跳过深度检测
 *
 * @param {import('fastify').FastifyRequest} request 请求对象（挑战接口的判据在路由声明里，
 *   所以必须传 request 而不是 url —— 单看路径已经认不出挑战接口了）
 * @returns {boolean} true 表示跳过
 */
function shouldSkipDeepCheck(request) {
  return isUnconditionallyReachable(request) || SKIP_PATTERN.test(pathOf(request?.url));
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
 * 响应头里那份 CSP 是**必须**的，不是可选加固：全局 helmet 策略是 `script-src 'self'`，
 * 而本页脚本是内联的 → 不放行就整段脚本被拦，页面永远停在 "Verifying your browser"。
 * nonce 由这里生成并同时喂给模板与响应头，两者不可能对不上。
 *
 * 这里刻意**不区分环境**（开发环境 helmet 也不发 CSP）：让本地看到的就是线上行为，
 * 否则这类问题只能在生产环境暴露。
 *
 * @param {import('fastify').FastifyReply} reply 响应对象
 * @param {string} ip 客户端 IP
 * @param {string} fingerprint 请求指纹
 * @param {string|null} deviceId 设备 ID（可能为 null）
 * @returns {Promise<void>}
 */
async function sendChallengePage(reply, ip, fingerprint, deviceId, options = {}) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const html = await buildChallengePage(ip, fingerprint, deviceId, { nonce, loggedIn: options.loggedIn });
  reply
    .headers({ ...CHALLENGE_NO_STORE, 'Content-Security-Policy': challengePageCsp(nonce) })
    .type('text/html')
    .send(html);
}

/**
 * 挑战处置：能渲染的给内置页面，其余给可编程的 428
 *
 * ⚠️ 后端**只提供 API**，不托管任何前端产物（前端由 nginx/CDN 独立部署），因此这里
 * 不猜 SPA 的路径、也不做 302 跳转：
 *   ① 文档请求（非 SPA 客户端、直连 API 的浏览器、移动端内嵌页）
 *      → 渲染内置 HTML 模板（自包含，不依赖任何构建产物）；
 *   ② 非文档请求（XHR / 脚本 / 非浏览器客户端）→ 428 + `X-Firewall-Challenge`。
 *
 * 三种去向（**都不是**硬编码前端路径）：
 *   ① 文档请求 + 配了 `defense.challengePageUrl` → **302** 到该地址（带 `?return=`），
 *      让"浏览器直接打开被挑战 URL"这类流量也走前端那套 UI；
 *   ② 文档请求 + 没配（或刚从前端页回退）→ 内置 HTML 模板（自包含、零外链）；
 *   ③ 非文档请求（XHR / 脚本 / 非浏览器客户端）→ 428 + `X-Firewall-Challenge`，
 *      由前端拦截器按**自家** `BASE_URL` 跳转（后端无从得知也不该得知前端目录：
 *      写死 `/firewall/`、`/admin/` 只会在前端改目录时变成"永远打不开的死链"）。
 *
 * 428（Precondition Required）而不是 429：它表达"少一个前置条件"，不会被客户端的限流
 * 退避逻辑当成"过一会儿重试就行"。
 *
 * @param {import('fastify').FastifyReply} reply 响应对象
 * @param {string} ip 客户端 IP
 * @param {string} fingerprint 请求指纹
 * @param {string|null} deviceId 设备 ID
 * @param {import('fastify').FastifyRequest} [request] 请求对象（用于判定请求类型）
 * @returns {Promise<number>} 实际下发的状态码（200 = 内置页面，302 = 前端页，428 = 提示）
 */
async function sendChallengeResponse(reply, ip, fingerprint, deviceId, request) {
  if (isDocumentRequest(request)) {
    // ① 配了 `defense.challengePageUrl` → 302 到独立前端挑战页（带 `?return=` 原 URL）
    //
    // 前端页自己起不来时（chunk 404 / 加载超时）会跳回 `return` —— 那又是一次文档请求，
    // 会再次命中这里。用**一次性标记 cookie** 打破这个环：带标记就不再跳，直接给内置页
    // （内置页零外链、由后端生成，必然可用）。cookie 只活 30s，且只用于"选哪个页面"，
    // 不参与任何安全判定，所以 SameSite=Lax 足够（顶层导航会带）。
    const fellBack = request?.cookies?.fw_chal_page === '1';
    const redirectTo = fellBack
      ? null
      : buildChallengeRedirect(readSecuritySettings().defense?.challengePageUrl, request?.raw?.url || request?.url);

    if (redirectTo) {
      // 观测：文档请求走的是**前端页**（302）。与内置页/428 分开计数，
      // 才能回答"内嵌页到底还有多少真实流量"（决定它要不要保留）
      recordChallengeEvent({ type: 'surface', surface: 'page' });
      reply.setCookie('fw_chal_page', '1', {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30
      });
      reply
        .headers({ ...CHALLENGE_NO_STORE, Location: redirectTo })
        .code(302)
        .send();
      return 302;
    }

    // ② 没配 / 回退 → 内置页
    recordChallengeEvent({ type: 'surface', surface: 'inline' });
    // `state.user` 由 04-auth 的 onRequest 钩子先填充（早于防火墙），所以这里能拿到登录态。
    // 它只影响递进难度的"降一档"（默认关闭时无效果），不参与任何放行判定。
    // 🔴 判据是 `userId`（不是 `id`）：装配侧的字段名见 plugin.js / bearer-auth.js，
    // 写成 `id` 恒 undefined → 登录用户永远拿不到降档。
    await sendChallengePage(reply, ip, fingerprint, deviceId, {
      loggedIn: Boolean(request?.state?.user?.userId)
    });
    return 200;
  }

  // 非文档请求：`challengeUrl` 只是"这条请求本身"的地址，不含 return。
  // 真实验证页在哪由前端按自己的基路径决定。
  const originalUrl = pathOf(request?.url);

  recordChallengeEvent({ type: 'surface', surface: 'xhr' });
  reply
    .headers({ ...CHALLENGE_NO_STORE, 'X-Firewall-Challenge': originalUrl })
    .code(428)
    .send({
      code: 428,
      error: 'Challenge Required',
      message: '需要完成人机验证后才能继续访问；请以文档方式打开 challengeUrl 完成验证。',
      challengeUrl: originalUrl,
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

  if (!isFirewallEnabled()) return false;

  const settings = readSecuritySettings().defense ?? {};

  try {
    trackConnection(ip, 1);
    // 封禁闸门：关掉后不再看黑名单 / 已封禁态（含由 Bot 检测写入的挑战态），
    // 只保留上面的连接数统计。这条闸关闭时"封禁"整类处置都失效 —— 排障用。
    if (settings.enableGlobalBlock === false) return false;
    await checkGlobalBlock(ip, fingerprint, deviceId);
    return false; // 放行
  } catch (err) {
    // ---- 挑战态：不硬封禁 ----
    if (err.isChallenge) {
      // 挑战闸门：关掉后挑战态一律放行（不再渲染挑战页 / 428）。
      // ⚠️ 此时 Bot 检测也没有处置手段了 —— runDetectionPipeline 会一并跳过 Bot 判定。
      if (settings.enableChallenge === false) return false;

      const token = request.cookies?.fw_verified;

      // ① 已通过验证：撤销挑战态，正常放行
      if (token && (await hasPass({ ip, fingerprint, deviceId, token }))) {
        await clearChallengeState(ip, fingerprint, deviceId);
        return false;
      }

      // ② 无条件可达的端点：挑战接口 + 健康探针
      //
      // 必须在这里（第一阶段）就放行，不能只写在 `shouldSkipDeepCheck` 里 ——
      // 那是**第二阶段**的跳过名单，而挑战态在第一阶段就 return 了。
      // 2026-11-03 的 `Challenge issue failed 428` 与 2026-11-04 的 `探针拿到 428` 都是这个错位：
      // 名单只加在了第二阶段。
      //
      // 两类各自的判据见 `isUnconditionallyReachable` 的注释（声明 / 配置两条腿）。
      // 硬封禁（BLOCKED/SCANNER）**不**豁免 —— 那是下一段分支，真正的封禁仍然生效。
      if (isUnconditionallyReachable(request)) return false;

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
 * @param {{skipChallenge?: boolean}} [options] skipChallenge=true 表示「只计数、不再判定挑战」
 *   （通过令牌命中时用：pass 只豁免**再次挑战**，不豁免计数）
 * @returns {Promise<boolean>} true 表示被拦截（已响应），false 表示放行
 */
async function runDetectionPipeline(ip, ua, url, firewallLog, fingerprint, reply, deviceId = null, options = {}) {
  const { skipChallenge = false } = options;
  // 总开关：整机旁路时不计数、不做任何检测
  if (!isFirewallEnabled()) return false;

  const settings = readSecuritySettings().defense ?? {};
  try {
    // 计数必须先做：它既是挑战判定的输入，也是「频次窗口」的事实来源。
    // 通过令牌命中时也照常计数（只跳过下面的挑战判定），否则 pass 窗口内等于完全不记账，
    // 「2 分钟」就变成一扇不监控的门，而不是配额。
    const requestCount = trackRequestCount(ip);

    // 挑战闸门关掉后 Bot 检测**没有处置手段**（它只会写挑战态，而挑战态已不拦人），
    // 继续跑只会白烧 CPU 并往库里写一堆没人读的状态 —— 一并跳过。
    if (!skipChallenge && settings.enableChallenge !== false) {
      // Bot 检测：基于 UA 模式 + 请求频率（命中会写挑战态，所以不能只读）
      const isBot = await checkBotChallenge(ip, ua, requestCount, deviceId);
      if (isBot) {
        const err = new Error('Challenge required');
        err.isChallenge = true;
        throw err;
      }
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
 * 「这个端点消费凭证」——由**路由自己声明**，不由路径正则猜
 *
 * ```js
 * // api/oauth21/v1/auth/login.js
 * registerSecureRoute(fastify, { url: '/login', config: { firewall: { credentialRoute: true } }, ... })
 * ```
 *
 * 为什么不用路径正则（2026-11-06 改）：本仓的架构约定是「app 之间不互相依赖」，
 * 所以 firewall 不 import oauth21 的登录服务，而是自己挂在 `onResponse` 上观测结果 ——
 * 方向仍然是对的。但**上一版是用正则硬编码 oauth21 的 URL 字面量**
 * （`/\/(mini-login|login|verify-email)$/`），依赖没消失，只是从 `import` 变成了字符串，
 * 还带来两种**静默失效**：
 *
 *   · 路由改名（`/login` → `/signin`）→ 不再匹配 → 暴力破解计数直接不写了，零报错零日志；
 *   · 新增登录端点（短信登录等）→ 忘记同步正则 → 同样静默不计。
 *
 * 根因是正则枚举的是「**名字**」，而真正该声明的性质是「**这个端点消费凭证**」——
 * 改名不该改变这个性质。改成路由声明后，名字怎么写都不影响计数是否生效，
 * 与 `config.firewall.skipScanTrap` / `riskExempt` 同一套机制（声明位即单一事实源）。
 *
 * ⚠️ 声明是**唯一入口**：`onResponse` 阶段路由已匹配（`request.routeOptions` 可读），
 * 未匹配到路由的请求（404）拿不到 config，但 404 本来就不在
 * `CREDENTIAL_FAILURE_CODES` 里，没有损失。
 *
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @returns {boolean} true 表示该路由声明了自己消费凭证
 */
function isCredentialRoute(request) {
  return request.routeOptions?.config?.firewall?.credentialRoute === true;
}

/**
 * 视为「凭证失败」的状态码（参数错误 400 不计入，避免把用户填错字段当成爆破）
 *
 * ⚠️ 这是**与登录模块响应码的契约**，不是可调策略 —— 所以刻意不进 `defense` 配置：
 * 没有任何部署需要一组不同的值，而配错的后果很隐蔽（把 400 加进去 → 用户邮箱格式
 * 填错就被记一次爆破 → 5 次锁号，症状是"用户莫名其妙被锁"，联想不到这里）。
 * 与 `login.service.js` 是否漂移由 `login-brute-force-wiring.test.js` 静态对账。
 */
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
 * 只对**声明了 `config.firewall.credentialRoute: true`** 的路由生效
 * （见 `isCredentialRoute` 的注释：为什么不用路径正则）。
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
  if (!isCredentialRoute(request)) return;

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
  PROBE_PATHS,
  // 凭证失败判定用的状态码集合：导出给「与登录服务是否漂移」的对账测试读，
  // 也让改登录响应码的人能直接看到自己要不要同步这里。
  CREDENTIAL_FAILURE_CODES,
  isFirewallEnabled,
  isChallengeApiUrl,
  isProbeUrl,
  isUnconditionallyReachable,
  shouldSkipDeepCheck,
  willBeRejectedAsAnonymous,
  buildRequestContext,
  checkGlobalBlockPhase,
  checkChallengeCookie,
  runDetectionPipeline,
  observeLoginOutcome,
  recordLog
};
