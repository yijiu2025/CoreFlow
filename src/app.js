/**
 * 应用工厂：创建并配置 Fastify 实例
 * 注册基础插件（helmet / cors / multipart / static / websocket / cookie）、
 * 安全响应头、全局错误处理器，启动加载器引擎
 *
 * @author yijiu2025
 * @since 2026-07-22
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import websocket from '@fastify/websocket';
import cookie from '@fastify/cookie';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import helmet from '@fastify/helmet';
import { initLoader } from './framework/loader/index.js';
import { flushGuardConfig } from './api/guard-config.js';
import { startScheduler } from './framework/scheduler/index.js';
import { ApiException } from './shared/exceptions.js';
import { configureLog, createLogger, initLogErrorTraps } from './framework/log/index.js';
import { createWsPreClose, DEFAULT_WS_SHUTDOWN_GRACE_MS } from './framework/websocket/preclose.js';

// ════════════════════════════════════════════════════════════════════
// 日志：全局配置（全项目仅此一处 configureLog，热生效、只调一次）
// ════════════════════════════════════════════════════════════════════
// 设计约定：
//   ① 文件通道默认关闭 —— 不写 file 就只输出控制台，不会产生任何日志文件
//   ② 要落盘时把下面 file 的注释打开（或直接设 LOG_FILE=true 用环境变量兜底）
//   ③ 控制台与文件级别互相独立：控制台可以安静，文件照样记全量
//   ④ 模块如需自己的文件，在模块内 log.config({ file: {...} }) 覆盖（不会重复写）
//
// 环境变量可覆盖此处任意项：LOG_LEVEL / LOG_DEBUG / LOG_CONSOLE_LEVEL / LOG_FILE ...
configureLog({
  level: 'info', // 全局总门槛：info 及以上（trace/debug 另由 LOG_DEBUG 控制）
  console: true, // 控制台始终开启
  consoleLevel: 'info', // 控制台通道级别：'info' 及以上；也可用数组 ['warn','error','fatal']
  debugKeywords: process.env.LOG_DEBUG || ''

  // ── 文件通道（默认关闭；需要落盘时取消注释）──────────────────────
  // file: {
  //   name: 'app',        // 文件名（默认 app）→ app-2026-09-14.log
  //   dir: 'logs',        // 目录（默认 logs）
  //   ext: '.log',        // 扩展名
  //   suffix: '',         // 文件名后缀；'pid' = 进程号（多进程部署防行交错）
  //   date: true,         // 按天滚动；false = 单文件
  //   dateDir: false,     // 日期做子目录 logs/2026-09-14/app.log
  //   subdir: 'auto',     // 模块子目录：'auto' 按 tag 首段分类
  //   level: 'info',      // 文件通道级别：'info'（及以上）/ 'all'（全量）/ ['info','error']（白名单）
  //   error: true,        // warn+ 另写一份 error 文件
  //   keepDays: 30        // 保留天数，过期自动清理；0 = 永久
  // }
});

// 注册全局 log：其他文件可直接 `import { log } from './framework/log/index.js'` 使用，
// 无需再 createLogger。必须在应用入口最先执行（本文件顶部即满足）。
const log = createLogger('app', true);

// 全局异常兜底：uncaughtException / unhandledRejection 统一走日志系统
initLogErrorTraps();

// 应用层不信任任意代理 IP，仅允许本地回环。
// 生产环境若有反向代理（Nginx / Cloudflare / ALB），通过 PROXY_TRUST_CIDR 环境变量指定信任网段
const PROXY_TRUST_CIDR = process.env.PROXY_TRUST_CIDR?.trim();
const trustProxy = PROXY_TRUST_CIDR ? PROXY_TRUST_CIDR.split(',').map(s => s.trim()) : ['127.0.0.1', '::1'];

// 启动时解析 CORS 白名单，避免每次请求重复解析环境变量
const CORS_ORIGINS = (process.env.CORS_ORIGINS?.trim() || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 解析毫秒级超时配置
 * 非数字 / 负数一律回退默认值 —— 静默退化成 0 会**关掉保护**，比配错更危险
 *
 * @param {string|undefined} raw - 环境变量原始值
 * @param {number} fallback - 默认值（毫秒）
 * @returns {number} 有效毫秒数（0 表示交给 Fastify 内置默认值）
 */
function resolveTimeoutMs(raw, fallback) {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

// ════════════════════════════════════════════════════════════════════
// HTTP 连接层超时
// ════════════════════════════════════════════════════════════════════
// 这些值决定"坏连接能占住资源多久"与"停机能有多快"，因此显式声明而非依赖 Fastify 的
// 隐式默认，并允许按反代 / 网关的 keepalive 设置对齐。
//
// ⚠️ Fastify 的选项校验会**静默丢弃**不在其 schema 内的键 —— 实测传入 `headersTimeout`
// 或 `timeout` 既不报错也不生效（`app.server.headersTimeout` 仍是 Node 默认 60000）。
// 只有下面几个键是 Fastify 5 认识并真正透传到 http server 的（已实测确认）。
// 慢 header 攻击由 Node 内建的 headersTimeout（60s）兜底，Fastify 未透出该选项。
//
// keepAliveTimeout：默认 72s（与 Fastify 内置默认一致，故零行为变更）。
//   必须大于前置反代的 keepalive，否则会出现"反代刚复用连接而应用已关闭"的
//   间歇性 502 —— 若上游是 Nginx(75s) / ALB(60s)，按需调大或调小。
// requestTimeout：单请求（含请求体）接收总时长上限，默认 300s = Node 自身默认值。
//   Fastify 把它默认关掉了（0），显式打开是为了封住"慢速发 body"（RUDY 类）攻击 ——
//   防火墙的 6 个检测器里**没有**慢连接检测，这一层是唯一防线。
//   300s 是留给 200MB multipart 上传的余量（约 0.67MB/s 即达标）；若上游都是高速
//   网络可下调，若面向弱网移动端则调大，不要下调到低于最慢的真实上传耗时。
const HTTP_KEEP_ALIVE_TIMEOUT_MS = resolveTimeoutMs(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS, 72_000);
const HTTP_REQUEST_TIMEOUT_MS = resolveTimeoutMs(process.env.HTTP_REQUEST_TIMEOUT_MS, 300_000);

/** WebSocket 关闭宽限期（毫秒）：广播关闭帧后，等这么久再强制断开残留连接 */
const WS_SHUTDOWN_GRACE_MS = resolveTimeoutMs(process.env.WS_SHUTDOWN_GRACE_MS, DEFAULT_WS_SHUTDOWN_GRACE_MS);

// 不安全的默认密钥列表（启动时校验，防止误部署）
const INSECURE_SECRETS = [
  'your_super_secret_key_2026',
  'change-this-in-production-secret-key-2024',
  'secret',
  'password',
  '123456'
];

/**
 * 校验生产环境密钥安全性
 * 检测到不安全的默认密钥时输出错误信息并退出进程
 *
 * @throws {never} 校验失败时调用 process.exit(1) 终止进程
 */
function validateSecrets() {
  const secrets = [process.env.APP_SECRET, process.env.SESSION_SECRET, process.env.FIREWALL_SECRET];
  const weak = secrets.filter(s => !s || s.length < 32 || INSECURE_SECRETS.includes(s));
  if (weak.length > 0) {
    log.error(
      `❌ [App] 安全错误：检测到不安全的默认密钥或密钥长度不足 32 位，请在 .env 中设置强随机值：APP_SECRET / SESSION_SECRET / FIREWALL_SECRET`
    );
    // 给 stderr 100ms 刷新时间，确保 CI/Docker 环境下错误消息完整输出
    setTimeout(() => process.exit(1), 100);
  }
}

/**
 * 创建全局错误处理器
 * 统一响应格式：ApiException 携带业务码、AJV 校验失败聚合为 400、
 * 通用错误保持原状。500+ 记录完整错误栈，生产环境隐藏堆栈信息。
 *
 * @param {boolean} isProduction - 是否生产环境（控制堆栈是否泄露）
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

/**
 * 创建并配置 Fastify 应用实例
 * 按顺序注册：Helmet → CORS → Multipart → Static → WebSocket → Cookie
 * → 安全响应头 → 全局错误处理器 → 加载器引擎
 *
 * @returns {Promise<import('fastify').FastifyInstance>} 配置完成的 Fastify 实例
 * @throws {Error} 密钥校验失败时退出进程，插件注册失败时抛出
 */
async function createApp() {
  const isProduction = process.env.NODE_ENV === 'production';

  // 生产环境必须配置强密钥，防止使用默认值误部署到公网
  if (isProduction) {
    validateSecrets();
  }

  // 生产环境未配置 CORS 白名单时记录警告，避免运维人员误以为跨域请求可以正常访问
  if (isProduction && CORS_ORIGINS.length === 0) {
    log.warn('⚠️ [App] 生产环境未配置 CORS_ORIGINS，所有跨域请求将被拒绝。请在 .env 中设置允许的来源（逗号分隔）');
  }

  // 创建 Fastify 实例，开发环境 pino-pretty 美化，生产环境 JSON 结构化供 ELK/Loki 解析
  const app = Fastify({
    bodyLimit: 5242880, // 5MB JSON 请求体限制
    // 停机时不等长连接：普通 keep-alive 连接会被立即关闭（实测 close 由"等超时"变为 1ms）。
    // ⚠️ 它对**已 upgrade 的 WebSocket 连接无效**，那部分由下面的 wsPreClose 负责。
    forceCloseConnections: true,
    keepAliveTimeout: HTTP_KEEP_ALIVE_TIMEOUT_MS,
    requestTimeout: HTTP_REQUEST_TIMEOUT_MS,
    logger: {
      level: 'info',
      ...(!isProduction
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss',
                ignore: 'pid,hostname'
              }
            }
          }
        : {
            // 生产环境附带 request-id 方便全链路追踪
            serializers: {
              req(request) {
                return {
                  method: request.method,
                  url: request.url,
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
          })
    },
    genReqId: req => req.headers['x-request-id'] || crypto.randomUUID(),
    // 尾部斜杠由网关层（Nginx）统一处理，应用层不做模糊匹配以提升路由性能
    trustProxy
  });

  const publicPath = path.join(__dirname, '../public');

  // 1. 注册 Fastify 生态插件（按依赖顺序：security → cors → file → ws → cookie）
  // iframe 白名单 = CORS_ORIGINS（同一套受信应用域）：posecraft/firewall/admin 互相 iframe 嵌入 SSO
  // frame-ancestors：允许本站被这些域 iframe 嵌入（oauth21 登录页被 posecraft 嵌入）
  // frame-src：允许本站 iframe 嵌入这些域的页面（posecraft 嵌 oauth21 登录页）
  const iframeWhitelist = CORS_ORIGINS.length ? CORS_ORIGINS : [];
  await app.register(helmet, {
    contentSecurityPolicy: !isProduction
      ? false // 开发环境禁用 CSP 避免 HMR 资源加载因内联脚本被拦截
      : {
          directives: {
            defaultSrc: ["'self'"],
            // TODO: 迁移到 nonce 或 hash 模式，彻底关闭 unsafe-inline 以启用 XSS 防护
            // 方案：使用 @fastify/helmet 的 nonce 功能，在 onRequest 钩子中生成 nonce，
            // 注入到 reply 的 locals 中，前端模板通过 `__NONCE__` 占位符获取。
            // 参考：https://github.com/helmetjs/helmet/tree/main#content-security-policy
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'", ...iframeWhitelist],
            // 允许 iframe 嵌入受信应用域（SSO 登录页 iframe 互嵌），白名单为空时禁用
            frameSrc: iframeWhitelist.length ? ["'self'", ...iframeWhitelist] : ["'self'"],
            frameAncestors: iframeWhitelist.length ? ["'self'", ...iframeWhitelist] : ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
          }
        },
    // frameguard：用 CSP frame-ancestors 统一控制（更现代），关闭 helmet 的 frameguard 避免冲突
    frameguard: false,
    // Helmet 默认已包含 nosniff / frameguard / xssFilter / referrerPolicy
    // 生产环境额外启用 HSTS（开发环境不需要，避免 localhost 被强制 HTTPS）
    hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: false } : false
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      // 生产环境：仅允许 CORS_ORIGINS 白名单来源，防止 CSRF 和信息泄露
      if (isProduction && origin) {
        // 没有配置白名单或当前 origin 不在白名单内 → 拒绝
        if (CORS_ORIGINS.length === 0 || !CORS_ORIGINS.includes(origin)) {
          return cb(new Error('CORS origin not allowed'), false);
        }
      }
      // origin 为 undefined 时是同源请求（无跨域），无需校验直接放行
      cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'token',
      'X-Sign',
      'X-Timestamp',
      'X-Nonce',
      'x-device-id',
      'X-Device-Fp',
      'x-verify-token'
    ],
    exposedHeaders: ['Content-Disposition', 'token', 'X-Request-Id'],
    maxAge: 86400
  });

  await app.register(multipart, {
    // 全局最大 200MB，单次请求最多 1 个文件 + 10 个字段
    // 具体文件类型校验（MIME magic bytes）在路由层处理
    limits: {
      fileSize: 200 * 1024 * 1024,
      files: 1,
      fields: 10
    }
  });

  await app.register(staticPlugin, {
    root: publicPath,
    prefix: '/',
    setHeaders: res => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
  });

  // 自定义 preClose：广播关闭帧 + 宽限期后强制断开，避免半开 WS 连接拖住 app.close()
  await app.register(websocket, { preClose: createWsPreClose(WS_SHUTDOWN_GRACE_MS) });

  await app.register(cookie);

  // 2. 全局错误处理：统一响应格式，生产环境隐藏堆栈信息
  app.setErrorHandler(createErrorHandler(isProduction));

  // 启动加载器引擎，按顺序初始化 Redis → DB → Auth → Firewall → Models → API → Apps
  await initLoader(app);

  // 启动定时任务调度器（session_tokens 清理等，频率从 src/data/scheduler_config.json 读）
  // scheduler 内部注册 onClose 钩子清理定时器，不阻塞启动
  await startScheduler(app);

  // 注册优雅关闭钩子：确保防抖中的守卫配置在退出前写入数据库
  app.addHook('onClose', async () => {
    try {
      await flushGuardConfig();
    } catch (err) {
      // Fastify onClose 不暴露异步错误，必须在此捕获防止静默丢失
      log.error(`❌ [App] 优雅关闭时保存守卫配置失败`, err);
    }
  });

  return app;
}

export { createApp };
