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
import { initLoader } from './loader/index.js';
import { flushGuardConfig } from './api/guard-config.js';
import { ApiException } from './shared/exceptions.js';

// 应用层不信任任意代理 IP，仅允许本地回环。
// 生产环境若有反向代理（Nginx / Cloudflare / ALB），通过 PROXY_TRUST_CIDR 环境变量指定信任网段
const PROXY_TRUST_CIDR = process.env.PROXY_TRUST_CIDR?.trim();
const trustProxy = PROXY_TRUST_CIDR ? PROXY_TRUST_CIDR.split(',').map((s) => s.trim()) : ['127.0.0.1', '::1'];

// 启动时解析 CORS 白名单，避免每次请求重复解析环境变量
const CORS_ORIGINS = (process.env.CORS_ORIGINS?.trim() || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* eslint-disable no-console */

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
  const weak = secrets.filter((s) => !s || s.length < 32 || INSECURE_SECRETS.includes(s));
  if (weak.length > 0) {
    console.error(
      `❌ [App] 安全错误：检测到不安全的默认密钥或密钥长度不足 32 位，请在 .env 中设置强随机值：APP_SECRET / SESSION_SECRET / FIREWALL_SECRET`
    );
    process.exit(1);
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
      message = error.validation.map((v) => v.message || v.instancePath).join('; ');
    }

    // 500+ 记录完整错误栈，400 仅记录摘要
    if (statusCode >= 500) {
      request.log.error({ err: error, statusCode }, '服务器内部错误');
    } else {
      request.log.warn({ statusCode, message }, '请求异常');
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
export async function createApp() {
  const isProduction = process.env.NODE_ENV === 'production';

  // 生产环境必须配置强密钥，防止使用默认值误部署到公网
  if (isProduction) {
    validateSecrets();
  }

  // 创建 Fastify 实例，开发环境 pino-pretty 美化，生产环境 JSON 结构化供 ELK/Loki 解析
  const app = Fastify({
    bodyLimit: 5242880, // 5MB JSON 请求体限制
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
    genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
    // 尾部斜杠由网关层（Nginx）统一处理，应用层不做模糊匹配以提升路由性能
    trustProxy
  });

  const publicPath = path.join(__dirname, '../public');

  // 1. 注册 Fastify 生态插件（按依赖顺序：security → cors → file → ws → cookie）
  await app.register(helmet, {
    contentSecurityPolicy: !isProduction
      ? false // 开发环境禁用 CSP 避免 HMR 资源加载因内联脚本被拦截
      : {
          directives: {
            defaultSrc: ["'self'"],
            // TODO: 迁移到 nonce 或 hash 模式，彻底关闭 unsafe-inline 以启用 XSS 防护
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
          }
        },
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
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'token', 'X-Sign', 'X-Timestamp', 'X-Nonce'],
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
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
  });

  await app.register(websocket);

  await app.register(cookie);

  // 2. 全局错误处理：统一响应格式，生产环境隐藏堆栈信息
  app.setErrorHandler(createErrorHandler(isProduction));

  // 启动加载器引擎，按顺序初始化 Redis → DB → Auth → Firewall → Models → API → Apps
  await initLoader(app);

  // 注册优雅关闭钩子：确保防抖中的守卫配置在退出前写入数据库
  app.addHook('onClose', async () => {
    await flushGuardConfig();
  });

  return app;
}
