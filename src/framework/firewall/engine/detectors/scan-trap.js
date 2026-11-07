/**
 * 404/403 扫描陷阱检测
 * 短时间内大量访问不存在的路径 → 判定为扫描器 → 自动封禁
 *
 * 优化点：旧实现用 `eval(script, 1, key, window)`（node-redis v5 要求 `{ keys, arguments }`），
 * 真实 Redis 上必然抛错 —— 扫描陷阱计数**从未生效过**（每次 404 只留一条 WARN 日志）。
 * 现在统一走访问层 `bumpCounter`（单 Lua 原子 INCR+EXPIRE），并顺带把阈值判定统一为 `>=`，
 * 与 Redis 分支的旧语义对齐（内存分支过去是 `> limit`，比 Redis 分支宽松一次）。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { getConfig } from '../../util/shared.js';
import { readAccessState, bumpCounter, removeKeys, rel } from '../../util/redis.js';
import { setBlockForSubject } from '../../block-manager.js';
import { notifyAttack } from '../auto-responder.js';
import { createLogger } from '../../../log/index.js';

const log = createLogger('framework.firewall.engine.detectors.scan-trap');

/**
 * 回环地址前缀 —— **代码里不给值**（2026-11-05 上收到配置）
 *
 * 保底值住在 `defense.loopbackPrefixes`（framework/firewall/config/defaults.js 必有），
 * `src/config/firewall_config.js` 可覆盖，面板热改走 JSON。这里有意的空数组是
 * "最基础的一层"：想豁免哪段地址是**部署事实**（本机开发 / 探针直连 / SSR 自调用），
 * 不该由 core 代码替某个部署形态拍板 —— 与 `safePaths` 同一套处理方式。
 */
const LOOPBACK_PREFIXES = [];

/**
 * 该 IP 是否属于本机回环（免于自动封禁）。
 *
 * 防呆与 `isSafePath` 一致：非数组 / 非字符串 / 空串一律忽略 ——
 * `startsWith('')` 恒真，一条空串就能让扫描陷阱对**所有** IP 失效。
 *
 * @param {string} ip 客户端 IP
 * @param {string[]} [configured] `defense.loopbackPrefixes`（缺失/坏值 = 不豁免）
 * @returns {boolean} true 表示豁免自动封禁
 */
function isLoopbackIp(ip, configured = LOOPBACK_PREFIXES) {
  if (typeof ip !== 'string' || !ip) return false;
  if (!Array.isArray(configured)) return false;
  for (const prefix of configured) {
    if (typeof prefix === 'string' && prefix && ip.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * 该路径是否免于扫描计数（**只看配置**）
 *
 * 免检前缀的唯一来源是 `defense.safePaths`（config 通道：默认值 → src/config 静态覆盖 →
 * 面板热改）。这里刻意**不内置**任何路径：
 *   - 本仓是前后端分离部署，前端产物由 nginx/CDN 承担，`/firewall/`、`/admin/` 这类
 *     路径打到本服务本就是 404 —— 不该由代码替某个部署假设兜底；
 *   - 若某个部署确实把前端产物挂在同一个域下，运维在 `defense.safePaths` 里加上前缀即可。
 *
 * 抽成纯函数是为了能直接测「空配置 / 非法条目」这类边界（`startsWith('')` 恒真，
 * 一条空串就能把整个扫描陷阱关掉）。
 *
 * @param {string} url 请求路径
 * @param {string[]} [configured] `defense.safePaths`（可为空/缺失）
 * @returns {boolean} true 表示免检
 */
function isSafePath(url, configured = []) {
  if (typeof url !== 'string' || !url) return false;
  if (!Array.isArray(configured)) return false;
  for (const prefix of configured) {
    if (typeof prefix === 'string' && prefix && url.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * 检测 404/403 扫描陷阱
 *
 * 命中后写「IP + 设备」两个维度（`setBlockForSubject`）：扫描器最典型的规避手段就是
 * 换 IP 继续扫，只封 IP 等于给它留了后门。
 *
 * 豁免分 **路径两类 + 地址一类**（别混成一类）：
 *   ① 路由声明 `config.firewall.skipScanTrap: true` —— 有路由的端点自证「我的 403/405
 *      是正常业务语义」（如挑战失败回 403），随路由走、改名不用动 core；
 *   ② `defense.safePaths` 前缀清单 —— 只兜**没有路由**的路径（静态产物、SPA 深链、
 *      favicon/robots）。这类请求 404 时 `routeOptions.config` 是空对象，根本无从声明。
 *   ③ `defense.loopbackPrefixes` 地址前缀 —— 回环来源（本机开发 / 探针直连 / SSR 自调用）
 *      永不自动封禁；同样只走 config，代码侧不内置（见文件顶部 LOOPBACK_PREFIXES）。
 *
 * @param {string} ip 客户端 IP
 * @param {string} url 请求路径
 * @param {number} statusCode 响应状态码
 * @param {string|null} [deviceId] 设备 ID（客户端未携带合法值时传 null）
 * @param {object|null} [routeConfig] Fastify `request.routeOptions.config`（无路由时为 null）
 * @param {boolean} [authenticated=false] 本次请求是否已登录（决定 403 是否计入）
 * @returns {Promise<void>}
 * @throws {Error} 命中陷阱时抛出（statusCode 403，rule='scanner-trap'）
 */
const checkNotFoundTrap = async (ip, url, statusCode, deviceId = null, routeConfig = null, authenticated = false) => {
  const settings = getConfig().defense;
  if (!settings.enableAutoBlacklist) return;

  // ① 路由级豁免：该端点声明了「我的 403/404 属正常业务」，不计入扫描计数
  if (routeConfig?.firewall?.skipScanTrap === true) return;

  // 回环地址永不自动封禁（2026-11-03）：本机流量只可能来自"我自己" —— 开发期在
  // 127.0.0.1 上刷前端、探针直连、SSR 自调用都会产生 404/403，一旦判成 SCANNER 就封掉
  // 开发机自己（实测踩到：开发时被自己封 1 小时，所有接口 403，排查方向被完全带偏）。
  //
  // 只豁免回环、**不**豁免整份 `internalIpPrefixes`：那份含 RFC1918，若代理部署在
  // 10.x / 192.168.x 且 PROXY_TRUST_CIDR 覆盖它，`request.ip` 会全部变成内网地址，
  // 豁免整份等于把扫描陷阱整个关掉。
  if (isLoopbackIp(ip, settings.loopbackPrefixes)) return;

  // ② 路径前缀豁免：只认 config 通道（defense.safePaths，无内置项）
  if (isSafePath(url, settings.safePaths)) return;
  if (![404, 403, 405].includes(statusCode)) return;

  // 🔴 403 只计**匿名**请求（2026-11-08 修复）
  //
  // 403 在语义上有两种来源，混在一起会误伤真实用户：
  //   · 匿名：在猜受保护路径 → 确实是扫描器行为，该计；
  //   · 已登录：权限不足（`reply.result.forbidden`、草稿预览、来源/CSRF 校验失败）
  //     → 是"这个人没这个权限"，不是"这个人在找不存在的路径"。
  // 旧实现一律计入，默认 10 次/60s 就会给正常用户（前端重试循环 / 权限被回收）
  // 打上 SCANNER，并且 `setBlockForSubject` 连设备一起封 1 小时 —— 换网络也解不开。
  // 现在匿名 403 仍计入（扫描器通常无身份），已登录的 403 交给业务与权限层。
  if (statusCode === 403 && authenticated) return;

  const subject = { ip, deviceId: settings.enableDeviceBlock === false ? null : deviceId };

  // 已封禁则不再累计
  const state = await readAccessState({ ip, fingerprint: null, deviceId: subject.deviceId });
  if (state.ipBlock || state.devBlock) return;

  const limit = settings.maxNotFoundAttempts || 15;
  const window = settings.notFoundWindow || 60;
  const duration = settings.blacklistDuration || 3600;

  const trapKey = rel.trap(ip);
  const count = await bumpCounter(trapKey, window);

  if (count >= limit) {
    // 同一个 now 推导 createdAt / expiresAt，避免两次 Date.now() 差 1ms 让时长不守恒
    const now = Date.now();
    await setBlockForSubject(subject, {
      status: 'SCANNER',
      source: 'auto',
      permanent: false,
      createdAt: now,
      expiresAt: now + duration * 1000
    });
    // 封禁后清掉陷阱计数，避免解封后立即再次触发
    await removeKeys([trapKey]);
    log.warn(`[Firewall] Scanner detected: ${ip}, blocked ${duration}s`);

    // 旁路告警（未配置 email/webhook 时是空操作，不影响主流程）
    await notifyAttack(ip, 'scan', { url, statusCode, count, blockedSeconds: duration });

    const err = new Error('Scanner detected');
    err.statusCode = 403;
    err.rule = 'scanner-trap';
    throw err;
  }
};

export { checkNotFoundTrap, isSafePath, isLoopbackIp };
