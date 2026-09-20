/**
 * 有界 TCP 可达性探测
 *
 * === 为什么需要它 ===
 * `connectStandalone()` 依赖 node-redis 的 `reconnectStrategy`，而该策略在
 * 主 Redis 连接上刻意设计为「**永不放弃**」——超过 `REDIS_MAX_RETRIES` 后转入
 * 30s 低频探测，以便 Redis 恢复后自动连回。这对常驻服务是正确的，但对
 * CLI / 脚本 / 验收关卡是灾难：
 *
 *   - `client.connect()` 在策略永不返回 Error 时**永不 reject**，
 *     于是 `await connectStandalone()` 会一直挂着 —— 不是「90 秒后失败」，
 *     而是**可能永不返回**（实测 verify 关卡挂到 3 分钟以上仍无结论）。
 *   - 后果：环境不可用与代码回归在观感上无法区分，而「长期亮红灯的检查
 *     等于没有检查」正是这些关卡要避免的事。
 *
 * 因此探测分两步，本模块负责第一步：**先做一次有界 TCP 连接**。
 * 端口不通就在毫秒级给出结论，完全不进入客户端退避逻辑。
 *
 * 注意：TCP 可达 ≠ Redis 可用（还可能是别的服务占用端口、或需要 AUTH），
 * 所以它只用来**快速否决**，不能用来**快速通过**。
 *
 * @author yijiu2025
 * @since 2026-09-20
 */

import net from 'node:net';

/** 探测默认超时（毫秒） */
const DEFAULT_PROBE_TIMEOUT = 3000;

/**
 * 有界探测 host:port 的 TCP 可达性
 *
 * 任何终止路径（成功 / 拒绝 / 超时 / DNS 失败）都会在 `timeoutMs` 内 settle，
 * 且必定销毁 socket，不会留下挂起的句柄。
 *
 * @param {string} host - 主机名或 IP
 * @param {number} port - 端口
 * @param {number} [timeoutMs=3000] - 超时上限（毫秒），非法值回退默认
 * @returns {Promise<{ok: boolean, code: string, ms: number}>}
 *          ok=true 时 code='OK'；失败时 code 为 'TIMEOUT' / 'ECONNREFUSED' / 'ENOTFOUND' 等
 */
function probeTcp(host, port, timeoutMs = DEFAULT_PROBE_TIMEOUT) {
  const budget =
    Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_PROBE_TIMEOUT;
  const startedAt = Date.now();

  return new Promise(resolve => {
    let settled = false;
    let timer;

    const finish = (ok, code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        /* 已销毁，安全忽略 */
      }
      resolve({ ok, code, ms: Date.now() - startedAt });
    };

    const socket = net.connect({ host, port });
    timer = setTimeout(() => finish(false, 'TIMEOUT'), budget);

    socket.once('connect', () => finish(true, 'OK'));
    socket.once('error', err => finish(false, err && err.code ? err.code : 'CONNECT_ERROR'));
  });
}

export { probeTcp, DEFAULT_PROBE_TIMEOUT };
