// src/log/index.js
import { requestContext } from '../auth/index.js';

/**
 * 日志系统：桥接到 Pino (Fastify 内置高性能日志引擎)
 *
 * 优先从 ALS 上下文中取 request.log (Pino 实例)，保证结构化输出。
 * 如果在请求生命周期外调用（如脚本、启动时），则优雅地降级为 console 输出。
 * 所有日志自动携带 requestId，便于链路追踪。
 */
function getLoggerContext() {
  try {
    const request = requestContext.getStore();
    if (request?.log) {
      return { pino: request.log, requestId: request.id };
    }
  } catch {
    // 非请求生命周期，正常降级
  }
  return { pino: null, requestId: null };
}

export class Logger {
  /**
   * 记录认证/授权事件
   * @param {Object} ctx 兼容的请求上下文对象
   * @param {Object} options 日志选项
   */
  static async auth(ctx, { event, uid, appId, details = {} }) {
    const { ip, region, city } = ctx?.state?.clientInfo || {};
    const location = region ? `${region}-${city}` : 'Unknown';
    const requestId = ctx?.request?.id;

    const logData = {
      type: 'AUTH',
      event,
      uid: uid || 'Guest',
      appId: appId || 'N/A',
      requestId,
      ip,
      location,
      details
    };

    const pino = getLoggerContext().pino ?? ctx?.request?.log;
    if (pino) {
      pino.info(logData, `[AuthLog] ${event}`);
    } else {
      console.log(
        JSON.stringify({ level: 'info', msg: `[AuthLog] ${event}`, ...logData })
      );
    }
  }

  /**
   * 普通业务日志
   */
  static info(message, data = {}) {
    const { pino, requestId } = getLoggerContext();
    if (pino) {
      pino.info({ ...data, requestId }, message);
    } else {
      console.log(
        JSON.stringify({ level: 'info', msg: message, requestId, ...data })
      );
    }
  }

  static error(message, err) {
    const { pino, requestId } = getLoggerContext();
    if (pino) {
      pino.error({ err, requestId }, message);
    } else {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: message,
          requestId,
          error: err?.message
        })
      );
    }
  }

  static warn(message, data = {}) {
    const { pino, requestId } = getLoggerContext();
    if (pino) {
      pino.warn({ ...data, requestId }, message);
    } else {
      console.warn(
        JSON.stringify({ level: 'warn', msg: message, requestId, ...data })
      );
    }
  }
}

export default Logger;
