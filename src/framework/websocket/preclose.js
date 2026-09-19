/**
 * WebSocket 优雅关闭
 *
 * 提供 `@fastify/websocket` 的 `preClose` 实现，解决"半开连接拖住 app.close()"。
 *
 * 【为什么不能用插件的默认实现】
 * 默认实现只对每个客户端调 `client.close()`（发出关闭帧后**等对端回应**），再
 * `server.close(done)`。遇到半开连接（移动端断网、浏览器崩溃、NAT 超时后服务端
 * 仍以为连接活着）就会一直等下去，`app.close()` 因而永不返回 ——
 * 最终被入口的 30s 兜底强杀，**退出码 1**，编排系统判为异常退出。
 *
 * 【为什么 forceCloseConnections 救不了】
 * 实测（Node 24 / Fastify 5.8.5 / @fastify/websocket 11.2.0）：
 * **已 upgrade 的连接不受** `server.closeAllConnections()` 与 `closeIdleConnections()`
 * 影响 —— 两者调用后 `server._connections` 仍为 1、`server.close()` 回调不触发；
 * 只有真正 destroy 底层 socket 才能解卡。
 * （`forceCloseConnections: true` 仍然值得开，它解决的是普通 keep-alive 连接，
 *   实测可把 close 从"等超时"变成 1ms 返回。）
 *
 * 【实测数据】
 * - 规范 ws 客户端：收到关闭帧后立即断开，整体 close 耗时约 5ms；
 * - 不回关闭帧的挂死连接：不处理时 `app.close()` 超过 5s 仍未返回；
 *   走本模块的宽限期 terminate 后按期完成。
 *
 * @author yijiu2025
 * @since 2026-09-19
 */

/** 默认宽限期（毫秒）：广播关闭帧后等这么久，再强制断开残留连接 */
const DEFAULT_WS_SHUTDOWN_GRACE_MS = 1_000;

/** WebSocket 正常关闭码：1001 = going away（服务端即将下线） */
const WS_CLOSE_GOING_AWAY = 1001;

/**
 * 构造 WebSocket preClose 钩子
 *
 * 策略：
 * ① 广播关闭帧（1001 = going away）—— 规范客户端会立即回帧并断开；
 * ② 宽限期后对残留客户端 `terminate()` —— 强制 destroy 底层 socket，
 *    使 Fastify 随后调用的 `server.close()` 得以完成。
 *
 * @param {number} [graceMs] - 宽限期毫秒数，默认 1000
 * @returns {(done: () => void) => void} preClose 钩子（`this` 为 Fastify 实例）
 */
function createWsPreClose(graceMs = DEFAULT_WS_SHUTDOWN_GRACE_MS) {
  const grace = Number.isFinite(graceMs) && graceMs >= 0 ? graceMs : DEFAULT_WS_SHUTDOWN_GRACE_MS;

  return function wsPreClose(done) {
    const wss = this.websocketServer;
    if (!wss || !wss.clients || wss.clients.size === 0) {
      if (wss) wss.close();
      return done();
    }

    // ① 优雅：广播关闭帧，规范客户端收到后会立即回帧并断开
    for (const client of wss.clients) {
      try {
        client.close(WS_CLOSE_GOING_AWAY, 'server shutting down');
      } catch {
        // 该客户端在本次遍历前已断开，忽略
      }
    }

    // ② 兜底：宽限期后强制断开仍未响应的连接。
    // 定时器 unref —— 即使从未触发也不应阻止进程退出。
    const forceTimer = setTimeout(() => {
      for (const client of wss.clients) {
        try {
          client.terminate();
        } catch {
          // 已断开
        }
      }
    }, grace);
    forceTimer.unref();

    // 不与 wss.close 的回调耦合：它同样会等待残留客户端而可能永不返回。
    // done() 立即返回是安全的 —— 真正的"解卡"由上面的 terminate 完成，
    // 而 Fastify 是在 preClose 全部完成之后才调用 server.close()。
    wss.close();
    done();
  };
}

export { createWsPreClose, DEFAULT_WS_SHUTDOWN_GRACE_MS, WS_CLOSE_GOING_AWAY };
