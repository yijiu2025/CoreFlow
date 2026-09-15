/**
 * 防火墙共享状态
 *
 * 只保留「跨模块共用的纯内存状态」与配置读取入口：
 *   - activeConnections / ipRequestTimestamps：进程内计数，无需跨实例共享
 *   - getConfig()：读取当前安全配置（直接委托 dao，不做快照缓存）
 *
 * Redis key 构造、Lua 脚本、内存降级、封禁/白名单读写一律在 `util/redis.js`，
 * 本文件不再持有这些内容（历史上散落在这里的 KEY / HASH_* / LUA_* / memoryBlocks* 已收敛）。
 *
 * 注意：注释里写 `HASH_*` 紧跟 `/`（即 `HASH_*` + `/LUA_*`）会拼出 `*` 加 `/` 序列，
 * 那正是块注释的结束标记，会**提前闭合注释**并让整个文件语法错误。此处用空格隔开。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { getSecuritySettings } from '../dao/dao.js';

// ============== 内存状态 ==============

/** IP → 当前活跃连接数（请求进入 +1，响应结束 -1） */
const activeConnections = new Map();

/** IP → 最近 60 秒的请求时间戳（Bot 检测的「短时高频」判据） */
const ipRequestTimestamps = new Map();

// ============== 配置读取 ==============

/**
 * 读取安全配置
 *
 * 不再做 30 秒缓存：`getSecuritySettings()` 只是返回 dao 里那个对象的引用（O(1)），
 * 而缓存版本的注释写着「避免每个请求都读文件快照」—— 那是早已不存在的实现。
 * 缓存反而引入了一处真实缺陷：`updateSecuritySettings` 是**整体替换**对象，
 * 缓存会继续持有旧对象最多 30 秒，于是「刚在面板上改的开关」在一段时间内
 * 对一部分调用点（如封禁检查里的手动黑名单兜底）不可见，而另一些调用点
 * （直接读 `getSecuritySettings()`）立刻可见 —— 同一个进程里两套视图。
 *
 * @returns {object} 安全配置对象（含 defense 段）
 */
function getConfig() {
  return getSecuritySettings();
}

// ============== 定时清理 ==============

setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of ipRequestTimestamps) {
    while (timestamps.length && timestamps[0] < now - 60_000) {
      timestamps.shift();
    }
    if (timestamps.length === 0) {
      ipRequestTimestamps.delete(ip);
    }
  }
}, 60000).unref();

export { activeConnections, ipRequestTimestamps, getConfig };
