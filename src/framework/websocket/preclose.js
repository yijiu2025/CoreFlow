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

/**
 * 默认宽限期（毫秒）：广播关闭帧后等这么久，再强制断开残留连接
 *
 * ⚠️ 这是**保底值**（core 默认值归使用处）。部署要改请写
 * `src/config/app_config.js` 的 `websocket.shutdownGraceMs`，
 * 由 `framework/http/plugins.js` 解析后传进来 —— 本文件不读环境变量、不读配置。
 */
const DEFAULT_WS_SHUTDOWN_GRACE_MS = 1_000;

/** WebSocket 正常关闭码：1001 = going away（服务端即将下线）。同样是保底值，可被配置覆盖 */
const WS_CLOSE_GOING_AWAY = 1001;

/** 允许配置的关闭码区间：1000-2999 协议保留 / 3000-3999 库保留 / 4000-4999 应用自定义 */
const WS_CLOSE_CODE_MIN = 1000;
const WS_CLOSE_CODE_MAX = 4999;

/**
 * 协议**禁止发送**的保留码（只能由协议栈内部产生，主动发送会被客户端判为协议错误）
 *   1005 = 未收到状态码、1006 = 连接异常断开、1015 = TLS 握手失败
 */
const WS_CLOSE_CODE_FORBIDDEN = [1005, 1006, 1015];

/**
 * 解析并校验可配置的关闭码
 *
 * 非法值（非整数 / 越界 / 协议禁发码）一律回退 1001，**绝不把非法码发出去**：
 * 客户端收到 1005/1006 这类码会直接按协议错误断开，表现为"停机时前端报错"，
 * 而服务端日志里只有一条看不出原因的关闭记录。
 *
 * @param {number|string|undefined|null} raw - 配置值（`websocket.closeCode`）
 * @returns {number} 合法的关闭码；缺省或非法时返回 1001
 */
function resolveWsCloseCode(raw) {
  if (raw === undefined || raw === null || raw === '') return WS_CLOSE_GOING_AWAY;

  const code = Number(raw);
  if (!Number.isInteger(code)) return WS_CLOSE_GOING_AWAY;
  if (code < WS_CLOSE_CODE_MIN || code > WS_CLOSE_CODE_MAX) return WS_CLOSE_GOING_AWAY;
  if (WS_CLOSE_CODE_FORBIDDEN.includes(code)) return WS_CLOSE_GOING_AWAY;

  return code;
}

/**
 * 归一化 preClose 选项
 *
 * 兼容两种调用形态：
 *   - `createWsPreClose(150)`：老签名（只给宽限期），测试与历史调用方仍可用
 *   - `createWsPreClose({ graceMs, closeCode })`：显式形态（推荐）
 *
 * @param {number|object|undefined} options - 原始选项
 * @returns {{graceMs?: number, closeCode?: number}} 归一化结果
 */
function normalizePreCloseOptions(options) {
  if (typeof options === 'number') return { graceMs: options };
  if (!options || typeof options !== 'object') return {};
  return options;
}

/**
 * 构造 WebSocket preClose 钩子
 *
 * 策略：
 * ① 广播关闭帧（默认 1001 = going away，可由 `websocket.closeCode` 覆盖）——
 *    规范客户端会立即回帧并断开；
 * ② 宽限期后对残留客户端 `terminate()` —— 强制 destroy 底层 socket，
 *    使 Fastify 随后调用的 `server.close()` 得以完成。
 *
 * @param {number|object} [options] - 宽限期毫秒数（老签名），或 `{ graceMs, closeCode }`
 * @param {number} [options.graceMs] - 宽限期毫秒数，默认 1000
 * @param {number} [options.closeCode] - 关闭帧状态码，默认 1001（非法值回退 1001）
 * @returns {(done: () => void) => void} preClose 钩子（`this` 为 Fastify 实例）
 */
function createWsPreClose(options = DEFAULT_WS_SHUTDOWN_GRACE_MS) {
  const { graceMs, closeCode } = normalizePreCloseOptions(options);
  const grace = Number.isFinite(graceMs) && graceMs >= 0 ? graceMs : DEFAULT_WS_SHUTDOWN_GRACE_MS;
  const code = resolveWsCloseCode(closeCode);

  return function wsPreClose(done) {
    const wss = this.websocketServer;
    if (!wss || !wss.clients || wss.clients.size === 0) {
      if (wss) wss.close();
      return done();
    }

    // ① 优雅：广播关闭帧，规范客户端收到后会立即回帧并断开
    for (const client of wss.clients) {
      try {
        client.close(code, 'server shutting down');
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

export {
  createWsPreClose,
  resolveWsCloseCode,
  DEFAULT_WS_SHUTDOWN_GRACE_MS,
  WS_CLOSE_GOING_AWAY,
  WS_CLOSE_CODE_MIN,
  WS_CLOSE_CODE_MAX,
  WS_CLOSE_CODE_FORBIDDEN
};
