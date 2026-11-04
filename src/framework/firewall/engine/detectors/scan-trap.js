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

/** 本机回环地址前缀：**永不自动封禁**（理由见 checkNotFoundTrap 注释） */
const LOOPBACK_PREFIXES = ['127.', '::1', 'localhost'];

/**
 * 内置免检路径（**不可被配置关闭**）
 *
 * 为什么写死在代码里而不是只放在 `defense.safePaths`：那份是数组，`deepMerge` 对数组是
 * **整体替换** —— 部署里旧的 JSON 只写了 5 条时，升级新增的 `/firewall/`、`/admin/`
 * 会被静默顶掉（实测踩到：本机 `src/data/firewall_config.json` 就是旧 5 条，于是
 * "刷新前端深链 → 404 累计 → 判扫描器封 1 小时" 的修复在真实部署里根本没生效）。
 *
 * 这几条是**正确性保证**（后端没有 SPA 回退，刷新深链必然 404），不是可调策略，
 * 所以内置不可删；`defense.safePaths` 仍然生效，语义是「在内置之外再追加」。
 */
const BUILTIN_SAFE_PATHS = [
  '/health', // 老探针路径（真实路由是 /v1/health*，这里兜误配的监控）
  '/favicon.ico',
  '/robots.txt',
  '/__fw/',
  '/api/firewall/', // 面板旧构建调已删端点 → 404，不能把它们算成扫描
  '/firewall/', // 前端产物 + 深链
  '/admin/' // 同上
];

/**
 * 该路径是否免于扫描计数（内置 ∪ 配置）
 *
 * 抽成纯函数是为了能直接测「配置把 safePaths 写空/写少」时内置项仍生效 ——
 * 这正是数组整体替换踩过的坑，靠集成测试很难复现（要改全局配置读取器）。
 *
 * @param {string} url 请求路径
 * @param {string[]} [configured] `defense.safePaths`（可为空/缺失）
 * @returns {boolean} true 表示免检
 */
function isSafePath(url, configured = []) {
  if (typeof url !== 'string' || !url) return false;
  for (const prefix of BUILTIN_SAFE_PATHS) {
    if (url.startsWith(prefix)) return true;
  }
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
 * 豁免分两类（**别把两类混成一类**）：
 *   ① 路由声明 `config.firewall.skipScanTrap: true` —— 有路由的端点自证「我的 403/405
 *      是正常业务语义」（如挑战失败回 403），随路由走、改名不用动 core；
 *   ② `defense.safePaths` 前缀清单 —— 只兜**没有路由**的路径（静态产物、SPA 深链、
 *      favicon/robots）。这类请求 404 时 `routeOptions.config` 是空对象，根本无从声明。
 *
 * @param {string} ip 客户端 IP
 * @param {string} url 请求路径
 * @param {number} statusCode 响应状态码
 * @param {string|null} [deviceId] 设备 ID（客户端未携带合法值时传 null）
 * @param {object|null} [routeConfig] Fastify `request.routeOptions.config`（无路由时为 null）
 * @returns {Promise<void>}
 * @throws {Error} 命中陷阱时抛出（statusCode 403，rule='scanner-trap'）
 */
const checkNotFoundTrap = async (ip, url, statusCode, deviceId = null, routeConfig = null) => {
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
  if (typeof ip === 'string' && LOOPBACK_PREFIXES.some(prefix => ip.startsWith(prefix))) return;

  // ② 路径前缀豁免：内置（不可关）+ 配置追加（defense.safePaths）
  if (isSafePath(url, settings.safePaths)) return;
  if (![404, 403, 405].includes(statusCode)) return;

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

export { checkNotFoundTrap, isSafePath, BUILTIN_SAFE_PATHS };
