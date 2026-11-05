/**
 * 并发连接追踪模块
 *
 * 追踪每个 IP 的并发连接数：请求进入时 +1，响应完成时 -1，超过限制时拒绝请求。
 * 同时提供统计查询和僵尸连接清理能力。
 *
 * ── 部署语义（必须知道，否则会误判保护强度）──
 * 计数保存在**进程内**（`shared.js` 的 activeConnections）。这意味着：
 *   实际放行上限 = 配置的 maxConn × 实例数
 * 配置写的是 100，跑 3 个实例时全集群实际放行 300。
 *
 * 这是**已知取舍而非缺陷**：把计数改到 Redis 需要每请求增加一次往返，
 * 而本模块处于请求热路径上。若部署形态变化（例如实例数 > 3），
 * 应当按 `maxConn ÷ 实例数` 配值，或把限制前移到边缘（Nginx / ALB 的连接限制）。
 * 两条路都比"以为配置 100 就是 100"要诚实。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-09-19 清理判据由「计数阈值」改为「最后活跃时间」，修复泄漏计数永不回收
 * @since 2026-11-02 清理周期与静默阈值改为可配置（defense.connCleanupIntervalMs / connStaleAfterMs）
 * @since 2026-11-02 热路径原地更新 entry；统计单遍维护 top-10；清理日志聚合；timer.unref
 * @since 2026-11-05 三个阈值删掉代码里的重复常量，只认 config（保底值 = framework 默认值）
 */
import { getConfig, activeConnections } from './shared.js';
import { DEFAULT_SECURITY_SETTINGS } from '../config/defaults.js';
import { createLogger } from '../../../framework/log/index.js';

const log = createLogger('app.firewall.util.connection-tracker');

/**
 * 连接表三个阈值的**唯一一份数字**：framework 默认值
 *
 * `connStaleAfterMs` / `connCleanupIntervalMs` / `connHighWater` 的生效值一律来自 config
 * （`framework/firewall/config/defaults.js` → `src/config/firewall_config.js` 静态覆盖 →
 * 面板热改落 JSON）。代码里**不再抄第二份**：
 *   - 配置缺项时 `getConfig().defense[key]` 返回的本来就是这里的值；
 *   - 只有「显式写了非法值」（0 / 负数 / 非数字）或「配置读取器尚未注册」才走到下面的兜底，
 *     兜底取的也是同一份定义 —— 全仓只有一个数字，改一处全生效。
 *
 * 为什么不彻底不留兜底：`setTimeout(tick, undefined)` 会退化成 0ms 空转，
 * 「静默阈值」变成 `now - lastAt > undefined` = 恒 false（永不回收），
 * 都属于"配置写错就把机制弄坏"的形态。宁可回到 framework 默认值，然后由运维在面板上看见。
 */
const CONN_DEFAULTS = DEFAULT_SECURITY_SETTINGS.defense;

/**
 * 追踪 IP 的当前并发连接数
 * 在请求进入时 delta=+1，响应完成时 delta=-1。
 * 超过最大连接数限制时抛出 429 异常。
 *
 * @param {string} ip 客户端 IP 地址
 * @param {number} delta 连接数变化量（+1 表示新连接，-1 表示连接关闭）
 * @returns {number} 该 IP 当前的并发连接数
 * @throws {Error} 超过连接数限制时抛出，statusCode=429，rule='connection-limit'
 *
 * ⚠️ 隐性契约：-1 侧**没有**前置 +1 校验，这是刻意的。onSend 里的 -1 会对
 * 「从未走过 +1 的响应」触发（如 @fastify/rate-limit 在防火墙钩子之前 429、
 * buildRequestContext 抛错走 500），此时 `current <= 0` 直接 delete，天然无害。
 * 给 -1 加「存在性 guard」反而会引入两种钩子触发顺序下的失衡，不要加。
 */
const trackConnection = (ip, delta) => {
  const settings = getConfig().defense;

  // 并发连接限制开关：此前没有任何读取点，运维关掉「并发连接限制」后限制照旧生效。
  if (!settings.enableConnLimit) return 0;

  // 上限只认 `defense.maxConn`（framework 默认值兜底）。
  // 两处历史包袱一并清掉（2026-11-05）：
  //   · `settings.maxConnections` —— 全仓**没有任何写入点**（配置项叫 maxConn），
  //     留着等于给一个不存在的键开门，写进去还以为生效；
  //   · 结尾的 `|| 100` —— 与 defaults.js 的 maxConn 默认值重复，两份数字各改各的。
  // 顺带修一个静默失效：旧写法 `|| "abc"` 会取到字符串，`current > "abc"` 恒 false
  // = 连接限制被一条写错的配置整个关掉；现在非正数/非数字一律回退默认值。
  const configuredMax = Number(settings.maxConn);
  const maxConn = Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : CONN_DEFAULTS.maxConn;

  const entry = activeConnections.get(ip);
  const current = (entry ? entry.count : 0) + delta;

  // 连接数归零或为负时清理记录
  if (current <= 0) {
    activeConnections.delete(ip);
    return 0;
  }

  // 记录**最后活跃时间**：清理判据必须用它而不是计数阈值。
  // 原实现只在 count > maxConn*2 时才回收，而真实泄漏往往只多 1~2 个计数
  // （异常路径没走到 onSend），永远到不了阈值 —— 那条记录会永久占着该 IP 的配额。
  // 热路径上原地更新已有 entry，不再每次分配新对象。
  const now = Date.now();
  if (entry) {
    entry.count = current;
    entry.lastAt = now;
  } else {
    activeConnections.set(ip, { count: current, lastAt: now });
  }

  // 仅在新连接建立时检查超限（delta > 0），避免关闭连接时误触发。
  // 注意：被拒请求的 +1 已经落账，随后被拒响应走 onSend 的 -1 会把它减回去 —— 两相平衡。
  if (delta > 0 && current > maxConn) {
    const err = new Error(`Connection limit exceeded: ${current}/${maxConn}`);
    err.statusCode = 429;
    err.rule = 'connection-limit';
    throw err;
  }

  return current;
};

/**
 * 获取连接统计摘要
 * 用于监控面板展示当前并发连接分布情况。
 *
 * 面板会轮询调用，而攻击期活跃 IP 可达数千：单遍遍历同时算总量并维护 top-10，
 * 避免全量排序（O(n log n)）与 entries 数组的整体分配。
 *
 * @returns {object} 统计信息
 * @returns {number} return.totalIPs 活跃 IP 数量
 * @returns {number} return.totalConnections 总并发连接数
 * @returns {Array<{ip: string, count: number}>} return.topIPs 连接数最多的前 10 个 IP
 */
function getConnectionStats() {
  let totalConnections = 0;
  const topIPs = [];
  for (const [ip, entry] of activeConnections) {
    totalConnections += entry.count;
    // 候选只在前十门槛之上才进入，插入后裁剪到 10 条
    if (topIPs.length < 10 || entry.count > topIPs[topIPs.length - 1].count) {
      topIPs.push({ ip, count: entry.count });
      topIPs.sort((a, b) => b.count - a.count);
      if (topIPs.length > 10) topIPs.pop();
    }
  }
  return {
    totalIPs: activeConnections.size,
    totalConnections,
    topIPs
  };
}

/**
 * 清理僵尸连接记录
 *
 * 判据是「最后活跃时间」而非「计数阈值」：任何超过静默阈值（`defense.connStaleAfterMs`，
 * 缺项/非法时回退 `CONN_DEFAULTS.connStaleAfterMs`）没有再活跃的记录一律回收，
 * **与残留计数多少无关**。这样即使只泄漏 1 个计数也能被收回，不会像原先那样永久占用该 IP 的配额。
 *
 * ⚠️ 该阈值必须**大于单请求的最长生命周期**（上游 `requestTimeout` 默认 300s），否则正常
 * 长请求的 +1 会在请求结束前被回收，随后的 -1 就变成"减一个不存在的记录"，计数失真。
 * 取值与理由见 defaults.js 的 connStaleAfterMs。
 *
 * 配置读取抛错（如 `defense` 整个为 null）时**刻意不在这里兜住** —— 让它冒到
 * `startCleanupTask` 的 tick 里：那里有 try/finally 保证续排，而本函数半途放弃回收
 * 也不会破坏计数一致性。就地吞掉反而会把"配置坏了"变成"看起来一切正常"。
 *
 * @returns {number} 本次回收的记录数
 */
function cleanupStaleConnections() {
  const configured = Number(getConfig().defense.connStaleAfterMs);
  const staleAfterMs = Number.isFinite(configured) && configured > 0 ? configured : CONN_DEFAULTS.connStaleAfterMs;

  const now = Date.now();
  let cleaned = 0;
  const samples = [];
  for (const [ip, entry] of activeConnections) {
    if (now - entry.lastAt > staleAfterMs) {
      if (samples.length < 5) {
        samples.push(`${ip}(计数=${entry.count}, 静默 ${Math.round((now - entry.lastAt) / 1000)}s)`);
      }
      activeConnections.delete(ip);
      cleaned++;
    }
  }
  // 聚合为一条日志：大批泄漏（如 Redis 故障恢复后）时逐条 warn 会形成日志风暴
  if (cleaned > 0) {
    const suffix = cleaned > samples.length ? ` 等共 ${cleaned} 条` : '';
    log.warn(`[Firewall] 回收僵尸连接记录 ${cleaned} 条: ${samples.join(', ')}${suffix}`);
  }

  // 高水位告警：内存 = 条数 × ~125B（实测）。不强制淘汰 —— 淘汰等于把配额让给攻击者。
  const highWater = readHighWater();
  if (activeConnections.size > highWater) {
    log.warn(
      `[Firewall] activeConnections 活跃 IP 数 ${activeConnections.size} 超过高水位 ${highWater}` +
        `（约 ${Math.round((activeConnections.size * 125) / 1048576)}MB），` +
        `若持续上涨请调小 defense.connStaleAfterMs / defense.connHighWater，或把并发限制前移到边缘`
    );
  }
  return cleaned;
}

/**
 * 读高水位阈值（`defense.connHighWater`），非法值回退 framework 默认值
 *
 * 只做告警阈值，不影响放行 —— 但阈值配成 0/负数会让每次清理都喊一次，
 * 所以要求严格正数，否则回退。
 *
 * @returns {number} 生效阈值（条）
 */
function readHighWater() {
  let configured;
  try {
    configured = Number(getConfig().defense.connHighWater);
  } catch {
    // 配置层尚未就绪：只影响告警阈值，回退默认值即可
    return CONN_DEFAULTS.connHighWater;
  }
  return Number.isFinite(configured) && configured > 0 ? configured : CONN_DEFAULTS.connHighWater;
}

/**
 * 启动僵尸连接清理定时任务，服务关闭时自动停止。
 *
 * 周期来自 `defense.connCleanupIntervalMs`（FW_CONN_CLEANUP_INTERVAL / 磁盘配置可覆盖）。
 * 用自续 setTimeout 而非 setInterval：每轮跑完**重新读配置**再排下一轮，
 * 面板上改周期无需重启即生效；配置缺项或非法（非正数）时回退 framework 默认值。
 *
 * ⚠️ 自续 setTimeout 必须自己保证「单轮失败不断链」：setInterval 的回调抛错不会杀死
 * 定时器，而自续 setTimeout 一旦让异常逃出回调，`schedule()` 就不会被再次调用 ——
 * 清理从此永久停摆，`activeConnections` 才真的变成只增不减（真泄漏）。
 * 因此 tick 用 try/catch/finally 兜住，并在 finally 里续排。
 *
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 */
function startCleanupTask(app) {
  let timer = null;
  let closed = false;

  /** 读取清理周期；配置读取本身失败（如读取器未注册）也不能拖垮任务 */
  const resolveInterval = () => {
    try {
      const configured = Number(getConfig().defense.connCleanupIntervalMs);
      if (Number.isFinite(configured) && configured > 0) return configured;
    } catch (err) {
      log.warn(`[Firewall] 读取清理周期失败，本轮回退 ${CONN_DEFAULTS.connCleanupIntervalMs}ms: ${err.message}`);
    }
    return CONN_DEFAULTS.connCleanupIntervalMs;
  };

  const schedule = () => {
    timer = setTimeout(tick, resolveInterval());
    // 每轮新定时器都要 unref：不钉住事件循环，onClose 正常清理即可，
    // 极端关闭路径（onClose 未触发）也不会阻止进程退出 —— 本表是纯内存状态，丢了就丢了。
    // 用 typeof 判断而非直接调用：测试的 fake timer 实现可能没有 unref。
    if (typeof timer.unref === 'function') timer.unref();
  };

  const tick = () => {
    try {
      cleanupStaleConnections();
    } catch (err) {
      log.warn(`[Firewall] 僵尸连接清理失败（不影响下一轮）: ${err.message}`);
    } finally {
      if (!closed) schedule();
    }
  };

  schedule();
  app.addHook('onClose', () => {
    closed = true;
    if (timer) clearTimeout(timer);
  });
}

export { trackConnection, getConnectionStats, cleanupStaleConnections, startCleanupTask };
