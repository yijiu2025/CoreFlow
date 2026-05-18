// src/log/index.js
import { als } from '../oauth21/utils/als.js';

/**
 * 日志系统：桥接到 Pino (Fastify 内置高性能日志引擎)
 *
 * 优先从 ALS 上下文中取 request.log (Pino 实例)，保证结构化输出。
 * 如果在请求生命周期外调用（如脚本、启动时），则优雅地降级为 console 输出。
 */
function getPinoLogger() {
  try {
    const ctx = als.getStore();
    if (ctx?.request?.log) return ctx.request.log;
  } catch {
    // 非请求生命周期，正常降级
  }
  return null;
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

    const logData = {
      type: 'AUTH',
      event,
      uid: uid || 'Guest',
      appId: appId || 'N/A',
      ip,
      location,
      details
    };

    const pino = getPinoLogger() ?? ctx?.request?.log;
    if (pino) {
      pino.info(logData, `[AuthLog] ${event}`);
    } else {
      console.log(`🛡️  [AuthLog] ${event} | UID: ${uid || 'Guest'} | App: ${appId || 'N/A'}`);
    }
  }

  /**
   * 普通业务日志
   */
  static info(message, data = {}) {
    const pino = getPinoLogger();
    if (pino) {
      pino.info({ ...data }, message);
    } else {
      console.log(`💡 [INFO] ${message}`, Object.keys(data).length ? data : '');
    }
  }

  static error(message, err) {
    const pino = getPinoLogger();
    if (pino) {
      pino.error({ err }, message);
    } else {
      console.error(`🚨 [ERROR] ${message}`, err);
    }
  }
}

export default Logger;
