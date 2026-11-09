/**
 * Fastify 实例构造参数
 *
 * 从 `src/app.js` 抽出（2026-11-07）：这些选项决定"坏连接能占住资源多久""停机能有多快"
 * "日志长什么样"，全是**运行期形态**，与启动编排无关，混在入口里只会把 boot 顺序冲淡。
 *
 * ⚠️ 两个不能凭直觉改的点（都是踩过的）：
 *
 * ① **Fastify 的选项校验会静默丢弃不在其 schema 内的键** —— 实测传入 `headersTimeout`
 *    或 `timeout` 既不报错也不生效（`app.server.headersTimeout` 仍是 Node 默认 60000）。
 *    只有本文件里出现的这几个键是 Fastify 5 认识并真正透传到 http server 的。
 *    慢 header 攻击由 Node 内建的 headersTimeout（60s）兜底，Fastify 未透出该选项。
 * ② **`forceCloseConnections` 对已 upgrade 的 WebSocket 连接无效** —— 那部分由
 *    `framework/ingress/websocket/preclose.js` 的 preClose 负责，两者缺一都会拖慢停机。
 *
 * 取值来自 `src/config/app_config.js` 的**可选覆盖**（缺失即用 core 保底值；env 通道已退役
 * —— 调优项不属于「必须设定的 env」）。三个值都只在本模块加载时读取一次，
 * **不支持运行时热改**；需要热改的调优项走 firewall_config.json 的 deepMerge 那套。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */
import crypto from 'node:crypto';
import { APP_CONFIG } from '../../config/app-config.js';
import { resolveTimeoutMs } from '../../../utils/index.js';

/** 保底值：配置缺失时使用，保证"坏连接占用上限"永远有明确数字 */
const DEFAULT_HTTP_OPTIONS = Object.freeze({
  bodyLimitBytes: 5 * 1024 * 1024, // 5MB JSON 请求体限制
  keepAliveTimeoutMs: 72_000,
  requestTimeoutMs: 300_000
});

/**
 * 解析 HTTP 连接层超时（keep-alive / 请求）
 *
 * 显式声明而不依赖 Fastify 隐式默认：这两个值直接决定反代 / 网关的 keepalive 是否对得上，
 * 也对齐停机时长的预期。
 *
 * @returns {{keepAliveTimeoutMs: number, requestTimeoutMs: number}}
 */
function resolveHttpTimeouts() {
  return {
    keepAliveTimeoutMs: resolveTimeoutMs(APP_CONFIG.http?.keepAliveTimeoutMs, DEFAULT_HTTP_OPTIONS.keepAliveTimeoutMs),
    requestTimeoutMs: resolveTimeoutMs(APP_CONFIG.http?.requestTimeoutMs, DEFAULT_HTTP_OPTIONS.requestTimeoutMs)
  };
}

/**
 * 构造 pino 日志选项
 *
 * 开发环境用 pino-pretty 美化；生产环境用 JSON 结构化（供 ELK/Loki 解析），
 * 并给 req 挂上精简序列化器 —— 只记路径、剥离 query，避免 `code` / `token` / `sign`
 * 这类敏感参数被写进日志。
 *
 * @param {boolean} isProduction - 是否生产环境
 * @returns {Record<string, unknown>} 可直接给 Fastify 的 `logger` 选项
 */
function buildLoggerOptions(isProduction) {
  if (!isProduction) {
    return {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname'
        }
      }
    };
  }

  return {
    level: 'info',
    serializers: {
      req(request) {
        return {
          method: request.method,
          // 只记路径，剥离 query 中的 code/token/sign 等敏感参数
          url: request.url.split('?')[0],
          hostname: request.hostname,
          remoteAddress: request.ip,
          requestId: request.id
        };
      },
      res(reply) {
        return {
          statusCode: reply.statusCode
        };
      }
    }
  };
}

/**
 * 请求 ID 生成器：优先沿用入站的 `X-Request-Id`（便于全链路追踪）
 *
 * 只信任受限安全字符与长度，否则退回 UUID —— 否则攻击者可以往日志里注入换行 /
 * 超长字符串，把日志系统和链路追踪一起污染。
 *
 * @param {import('node:http').IncomingMessage} req
 * @returns {string}
 */
function genReqId(req) {
  const raw = req.headers['x-request-id'];
  if (typeof raw === 'string' && raw.length >= 1 && raw.length <= 128 && /^[\w.-]+$/.test(raw)) {
    return raw;
  }
  return crypto.randomUUID();
}

/**
 * 生成 Fastify 构造参数
 *
 * @param {object} params
 * @param {boolean} [params.isProduction] - 是否生产环境（决定日志形态）
 * @param {string[]|string} [params.trustProxy] - 受信代理地址/网段（生产必须收窄！）
 * @returns {import('fastify').FastifyServerOptions} Fastify 选项
 */
function buildServerOptions({ isProduction = false, trustProxy = [] } = {}) {
  const { keepAliveTimeoutMs, requestTimeoutMs } = resolveHttpTimeouts();

  return {
    bodyLimit: DEFAULT_HTTP_OPTIONS.bodyLimitBytes,
    // 停机时不等长连接：普通 keep-alive 连接会被立即关闭（实测 close 由"等超时"变为 1ms）。
    // ⚠️ 它对**已 upgrade 的 WebSocket 连接无效**，那部分由框架注册 websocket 时的 preClose 负责。
    forceCloseConnections: true,
    keepAliveTimeout: keepAliveTimeoutMs,
    requestTimeout: requestTimeoutMs,
    logger: buildLoggerOptions(isProduction),
    genReqId,
    // 尾部斜杠由网关层（Nginx）统一处理，应用层不做模糊匹配以提升路由性能
    trustProxy
  };
}

export { DEFAULT_HTTP_OPTIONS, resolveHttpTimeouts, buildLoggerOptions, genReqId, buildServerOptions };
