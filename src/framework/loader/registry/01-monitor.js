/**
 * 请求监控
 * 记录请求耗时，添加 X-Response-Time 响应头，慢请求告警
 *
 * 环境变量：
 *   SLOW_REQUEST_THRESHOLD - 慢请求阈值毫秒数（默认 2000），非数字值时使用默认值
 *
 * @author yijiu2025
 * @since 2026-07-24
 */

import { createLogger } from '../../log/index.js';

const log = createLogger('framework.loader.monitor');

const SLOW_THRESHOLD = parseInt(process.env.SLOW_REQUEST_THRESHOLD || '2000', 10) || 2000;

export default async app => {
  // 记录请求开始时间（使用高精度计时器）
  app.addHook('onRequest', async request => {
    request.startTime = performance.now();
  });

  // 请求完成时计算耗时，超过阈值则告警
  app.addHook('onResponse', async (request, reply) => {
    const ms = Math.round(performance.now() - (request.startTime || performance.now()));

    // 所有请求记录到响应头（方便调试）
    reply.header('X-Response-Time', `${ms}ms`);

    // 慢请求告警（统一日志出口，落 logs/*.log 文件）
    if (ms > SLOW_THRESHOLD) {
      log.warn(`慢请求 (> ${SLOW_THRESHOLD}ms)`, {
        duration: `${ms}ms`,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        userId: request.state?.user?.uid || '-'
      });
    }
  });
};
