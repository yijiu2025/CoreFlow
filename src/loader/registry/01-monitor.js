/**
 * 请求监控
 * - 记录请求耗时
 * - 慢请求告警（可配置阈值）
 *
 * 环境变量：
 *   SLOW_REQUEST_THRESHOLD - 慢请求阈值毫秒数（默认 2000）
 */
const SLOW_THRESHOLD = parseInt(process.env.SLOW_REQUEST_THRESHOLD || '2000');

export default async (app) => {
  // 记录请求开始时间（使用高精度计时器）
  app.addHook('onRequest', async (request) => {
    request.startTime = performance.now();
  });

  // 请求完成时计算耗时，超过阈值则告警
  app.addHook('onResponse', async (request, reply) => {
    const ms = Math.round(performance.now() - (request.startTime || performance.now()));

    // 所有请求记录到响应头（方便调试）
    reply.header('X-Response-Time', `${ms}ms`);

    // 慢请求告警
    if (ms > SLOW_THRESHOLD) {
      request.log.warn({
        duration: `${ms}ms`,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        userId: request.state?.user?.uid || '-'
      }, `慢请求 (> ${SLOW_THRESHOLD}ms)`);
    }
  });
};
