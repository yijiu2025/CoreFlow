/**
 * 全局错误处理器
 *
 * 从 `src/app.js` 抽出（2026-11-07）。这里藏着一条**必须被测试盯住的安全属性**：
 * 生产环境的非预期 500 不回显内部错误原文（否则 SQL / 路径 / 内网地址会顺着响应外泄）。
 * 正因为如此，它必须能被单独 import 驱动 —— 放在入口文件里时，任何想做单测的人
 * 都得连带 mock 静态插件（`@fastify/static` 依赖 ESM-only 的 content-disposition，
 * jest 的 CJS 运行时加载即炸），于是历史上出现过"复制一份 handler 来测"的假绿。
 *
 * 统一响应格式：ApiException 携带业务码、AJV 校验失败聚合为 400、通用错误保持原状。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */
import { ApiException } from '../../shared/exceptions.js';
import { createLogger } from '../log/index.js';

const log = createLogger('app.http.error');

/**
 * 创建全局错误处理器
 *
 * @param {boolean} isProduction - 是否生产环境（控制堆栈与原文是否外泄）
 * @returns {import('fastify').ErrorHandler} Fastify 错误处理函数
 */
function createErrorHandler(isProduction) {
  return (error, request, reply) => {
    let statusCode = error.statusCode ?? error.status ?? 500;
    let bizCode = null;
    let message = error.message || '服务器内部错误';
    let data = null;

    if (error instanceof ApiException) {
      statusCode = error.statusCode;
      bizCode = error.bizCode;
      message = error.message;
      data = error.data;
    } else if (error.validation) {
      // AJV 校验失败以 400 返回，拼接所有校验错误信息方便前端定位
      statusCode = 400;
      message = error.validation.map(v => v.message || v.instancePath).join('; ');
    } else if (isProduction && statusCode >= 500) {
      // 生产环境非预期 500 不回显内部错误原文（可能含 SQL/路径/内网地址）
      message = '服务器内部错误，请稍后重试';
    }

    // 500+ 记录完整错误栈，400 仅记录摘要（统一日志出口，落 logs/*.log）
    if (statusCode >= 500) {
      log.error('服务器内部错误', error, { statusCode });
    } else {
      log.warn('请求异常', { statusCode, message });
    }

    reply.status(statusCode).send({
      code: bizCode ?? statusCode,
      message,
      data: data ?? null,
      timestamp: Date.now(),
      requestId: request.id,
      stack: !isProduction ? error.stack : undefined,
      app: request.state?.appName || 'system'
    });
  };
}

export { createErrorHandler };
