// src/app.js
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import websocket from '@fastify/websocket';
import cookie from '@fastify/cookie';
import crypto from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';

import helmet from '@fastify/helmet';
import { initLoader } from './loader/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 不安全的默认密钥列表（启动时校验，防止误部署）
const INSECURE_SECRETS = [
  'your_super_secret_key_2026',
  'change-this-in-production-secret-key-2024',
  'secret',
  'password',
  '123456'
];

export async function createApp() {
  const isDev = process.env.NODE_ENV !== 'production';

  // 生产环境校验密钥安全性
  if (!isDev) {
    const secrets = [
      process.env.APP_SECRET,
      process.env.SESSION_SECRET,
      process.env.FIREWALL_SECRET
    ];
    const insecure = secrets.filter((s) => !s || INSECURE_SECRETS.includes(s));
    if (insecure.length > 0) {
      console.error(
        '❌ 安全错误：检测到不安全的默认密钥，请在 .env 中设置强随机值：APP_SECRET / SESSION_SECRET / FIREWALL_SECRET'
      );
      process.exit(1);
    }
  }

  // 激活 Pino 内置高性能日志引擎
  const app = Fastify({
    logger: {
      level: 'info',
      // 开发环境：pino-pretty 美化输出；生产环境：纯 JSON（供 ELK/Loki 解析）
      ...(isDev
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
            // 生产环境 JSON 格式 + request-id 追踪
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
    routerOptions: {
      ignoreTrailingSlash: true
    },
    trustProxy: true
  });

  const publicPath = path.join(__dirname, '../public');

  // 1. 基础插件 (Fastify 生态)
  await app.register(helmet, {
    contentSecurityPolicy: isDev
      ? false // 开发环境禁用 CSP 避免 HMR 资源加载问题
      : {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
          }
        }
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      // 生产环境：仅允许 CORS_ORIGINS 中配置的来源（逗号分隔）
      // 开发环境：允许所有来源
      if (!isDev && origin) {
        const allowed = (process.env.CORS_ORIGINS || '')
          .split(',')
          .map((s) => s.trim());
        if (allowed.length > 0 && !allowed.includes(origin)) {
          return cb(new Error('CORS origin not allowed'), false);
        }
      }
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
      'X-Nonce'
    ],
    exposedHeaders: ['Content-Disposition', 'token', 'X-Request-Id'],
    maxAge: 86400
  });

  await app.register(multipart, {
    limits: {
      fileSize: 200 * 1024 * 1024
    }
  });

  await app.register(staticPlugin, {
    root: publicPath,
    prefix: '/'
  });

  await app.register(websocket);

  await app.register(cookie);

  // 2. 增强型全局错误处理
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || error.status || 500;

    // 利用 Pino 结构化记录错误
    if (statusCode >= 500) {
      request.log.error({ err: error, statusCode }, '服务器内部错误');
    } else {
      request.log.warn({ statusCode, message: error.message }, '请求异常');
    }

    // AJV 校验失败的错误由 Fastify 以 400 返回，直接格式化消息
    const message = error.validation
      ? error.validation.map((v) => v.message || v.instancePath).join('; ')
      : error.message || '服务器内部错误';

    reply.status(statusCode).send({
      code: statusCode,
      message,
      data: null,
      timestamp: Date.now(),
      requestId: request.id,
      stack: isDev ? error.stack : undefined,
      app: request.state?.appName || 'system'
    });
  });

  // 启动加载器模块
  await initLoader(app);

  return app;
}
