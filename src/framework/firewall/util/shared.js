/**
 * 防火墙共享状态
 *
 * 只保留「跨模块共用的纯内存状态」与配置读取入口：
 *   - activeConnections / ipRequestTimestamps：**进程内**计数
 *   - getConfig()：读取当前安全配置（委托 interface 层，不做快照缓存）
 *
 * ⚠️ 关于"进程内"的准确含义（原文写「无需跨实例共享」，那句话没有依据且会误导）：
 * 这两张表都是**单实例视角**的状态，多实例部署下语义会变 ——
 *   · activeConnections：每实例各计一份 → 实际放行上限 = maxConn × 实例数；
 *   · ipRequestTimestamps：Bot 检测依据的"短时高频"会被按实例切分，
 *     同一 IP 的请求分散到 N 个实例后，每个实例看到的频率只有 1/N，
 *     因此对"低速分散"的爬虫会**漏判**。
 * 这是两处已知的语义折损。改到 Redis 需要每请求增加一次往返，而这张表在请求热路径上，
 * 属于需要**先有压测数据再决定**的改动；在此之前，请按实例数配值或把限制前移到边缘。
 *
 * Redis key 构造、Lua 脚本、内存降级、封禁/白名单读写一律在 `util/redis.js`，
 * 本文件不再持有这些内容（历史上散落在这里的 KEY / HASH_* / LUA_* / memoryBlocks* 已收敛）。
 *
 * ── 为什么这两张表**不走** getStore（2026-11-02 评估，勿再重试同一路子）──
 * 「统一到 getStore」看着诱人，但 KV 抽象承载不了这两张表，四条硬伤：
 *   · **无原子自增**：两端 store 的高层 API 都只有 get/set/delete。Redis 侧的 incr 得靠
 *     `store.call(client => ...)` 或 Proxy 转发裸客户端，而 **MapStore 没有这两条路** ——
 *     写成读-改-写则在并发下丢更新（并发连接计数恰恰全是并发写）。
 *   · **同步→异步传染**：`trackConnection` 是同步热路径（返回值即当前计数、直接 throw 429），
 *     换 store 要 await，且 +1/-1 各一次往返 —— Redis 抖动会拖慢每个请求。
 *   · **降级分叉**：Redis 不可用时一部分请求计到内存、一部分计到 Redis（`redisAvailable()`
 *     在运行中会翻转），比现在「一律进程内、上限 = maxConn × 实例数」更难推理。
 *   · **统计要全表**：`getConnectionStats` 遍历全部 IP，Redis 侧只能 SCAN（O(N)，面板轮询放大）。
 * 结论：要跨实例精确限流，前移到边缘（Nginx limit_conn / ALB）或另建专用 Redis 计数器原语
 * （Lua 原子 INCRBY + TTL）并先压测；不要用 getStore 的 KV 硬套 gauge。
 * 补充：`ipRequestTimestamps` 只是 **Bot 检测的频次信号**（内存、进程内），不是限流计数器。
 * 限流统一由 `@fastify/rate-limit` 承担（路由声明 + `createRateLimit`）；历史上
 * `util/redis.js` 里那套自研 ZSET 滑窗（`consumeRateWindow`）已于 2026-11-02 删除 ——
 * 它与插件的固定窗口是**同一件事的两套实现**，且超限封禁写的是非 IP 键（从未生效）。
 *
 * ── 那「只用内存、接 MapStore」行不行（2026-11-02 一并评估）──
 * `getStore(prefix, { memory: true })` 会把后端锁成 MapStore，看似等价替换，实际三条新故障：
 *   · **异步门面丢掉原子性**：`getMapStore()` 的每个方法都是 async。`trackConnection` 的
 *     读-改-写之间一旦有 await，同进程内两个并发请求会各自读到 N 再写回 N+1 ——
 *     丢计数与后端是不是 Redis 无关，是「跨越让出点」本身带来的。裸 Map 的同步性是本模块
 *     正确性的前提，不是性能优化。真要走 store 必须用 `MapStore.get/set` 的**同步静态**
 *     API（barrel 有导出），但那又绕开了 getStore 门面。
 *   · **maxSize 上限会变成攻击面**：MapStore 每个 prefix 默认 `maxSize: 10000`，超限时
 *     `set()` **抛 TypeError 拒绝写入**（`_rejectIfFull`）。伪造源 IP 的洪水下 distinct IP
 *     轻易破万，于是新 IP 的计数写不进去；而 `trackConnection` 在 `checkGlobalBlockPhase`
 *     的 try 里，这个 TypeError 会被当成封禁错误回 429 —— 攻击期间**正常的新访客也吃到 429**。
 *     裸 Map 只会增长内存（10 分钟清理自然收敛），不会把异常抛进拦截链路。
 *   · **每次写入更贵**：`MapStore.set` 对已存在的 key 先 `_deleteKey` 再 push（keys 数组
 *     交换删除 + 游标维护），比 `Map.set` 多几步；TTL 也只是键级兜底（默认兜底清理间隔 1h），
 *     「最后活跃时间」判据与滑动窗口仍得自己在 value 里维护。
 * 结论：技术上能接（同步静态 API 可保原子性），但换来的是「命名空间 + TTL 兜底 + 可观测」，
 * 代价是上限拒绝这条新攻击面与每请求额外开销 —— 对这两张表不划算。**保持裸 Map**。
 *
 * ── 内存模型（上限由「窗口内不同来源 IP 数」决定，与运行时长无关）──
 * 两张表都有回收，不会随 uptime 单调增长：
 *   · activeConnections：条目在 -1 归零时删；漏掉 -1 的（WebSocket 升级、连接中断）由
 *     清理任务按「静默超过 connStaleAfterMs」回收 ⇒ 工作集 ≈ 最近 10~15 分钟的 distinct IP。
 *     实测每条 ≈ 125B：10 万 IP ≈ 12MB，100 万 IP ≈ 120MB。
 *   · ipRequestTimestamps：该 IP 再来请求时裁剪自身，沉默 IP 靠本文件 60s 清扫回收 ⇒
 *     工作集 ≈ 60 秒内的 distinct IP。实测 60 次/IP ≈ 773B，**大小随窗口内请求数线性增长**
 *     （已在该路径封顶 1000 条，见 rate-limiter.js 的 MAX_WINDOW_ENTRIES）。
 * 因此真正的风险不是「跑久了漏」而是「洪水期爆」：条数无绝对上限，只有高水位告警
 * （本条路径 5 万条、连接表 5 万条）。`request.ip` 的可信度是前提 —— trustProxy 默认只信
 * 回环（app.js），若把 PROXY_TRUST_CIDR 放得过宽，X-Forwarded-For 可伪造 ⇒ distinct IP
 * 变成攻击者可控，这两张表才会真正无界增长。
 *
 * 拆环（2026-09-16）：本文件此前直接 `import { getSecuritySettings } from '../dao/dao.js'`，
 * 而 `dao/dao.js` 又依赖 `util/redis.js`，构成 `util ↔ dao` 的环。
 * 现在改为经 `interface/config-access.js` 读取 —— 该模块零 import，是依赖图最底层节点；
 * 配置真身仍在 dao 的单例里，由 dao 在加载时把读取器注册进去，因此**没有副本、没有缓存**。
 *
 * 注意：注释里写 `HASH_*` 紧跟 `/`（即 `HASH_*` + `/LUA_*`）会拼出 `*` 加 `/` 序列，
 * 那正是块注释的结束标记，会**提前闭合注释**并让整个文件语法错误。此处用空格隔开。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-09-16 配置读取改走 interface 层，断开 util ↔ dao 环
 */
import { readSecuritySettings } from '../interface/config-access.js';
import { createLogger } from '../../log/index.js';

const log = createLogger('app.firewall.util.shared');

// ============== 内存状态 ==============

/** IP → 当前活跃连接数（请求进入 +1，响应结束 -1） */
const activeConnections = new Map();

/** IP → 最近 60 秒的请求时间戳（Bot 检测的「短时高频」判据） */
const ipRequestTimestamps = new Map();

// ============== 配置读取 ==============

/**
 * 读取安全配置
 *
 * 不做缓存：`readSecuritySettings()` 只是返回 dao 里那个对象的引用（O(1)），
 * 而缓存版本的注释写着「避免每个请求都读文件快照」—— 那是早已不存在的实现。
 * 缓存反而引入了一处真实缺陷：`updateSecuritySettings` 是**整体替换**对象，
 * 缓存会继续持有旧对象最多 30 秒，于是「刚在面板上改的开关」在一段时间内
 * 对一部分调用点（如封禁检查里的手动黑名单兜底）不可见，而另一些调用点
 * 立刻可见 —— 同一个进程里两套视图。
 *
 * @returns {object} 安全配置对象（含 defense 段）
 */
function getConfig() {
  return readSecuritySettings();
}

// ============== 定时清理 ==============

/**
 * 窗口外时间戳的兜底清扫（每 60 秒）
 *
 * 为什么扫：`trackRequestCount` 只在该 IP **再次来请求时**才裁剪自己的数组，
 * 沉默的 IP 不会被任何请求触碰 —— 没有兜底清扫，这些数组会永久留在内存里，
 * 表的大小就变成「历史去重 IP 总数」，那才是随时间增长的泄漏。
 *
 * 成本：每轮遍历全部 IP（同步、O(n)），是这条路径上唯一的全表扫描。
 * 单条记录约 100B 起、随窗口内请求数线性增长（实测 60 次 ≈ 773B），
 * 因此超过高水位时打一条告警，供运维在 OOM 前看到趋势。
 */
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of ipRequestTimestamps) {
    // 索引式裁剪，一次 splice 移走整段过期记录（逐个 shift 在高频 IP 上是 O(n²)）
    let drop = 0;
    while (drop < timestamps.length && timestamps[drop] < now - 60_000) drop++;
    if (drop > 0) timestamps.splice(0, drop);
    if (timestamps.length === 0) {
      ipRequestTimestamps.delete(ip);
    }
  }
  if (ipRequestTimestamps.size > 50000) {
    log.warn(
      `[Firewall] ipRequestTimestamps 追踪 IP 数 ${ipRequestTimestamps.size} 超过高水位 50000，` +
        `60 秒窗口内有大量不同来源 IP；内存按条增长（60 次/IP ≈ 773B），必要时缩短窗口或前移到边缘限流`
    );
  }
}, 60000).unref();

export { activeConnections, ipRequestTimestamps, getConfig };
