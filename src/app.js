// src/app.js
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import websocket from '@fastify/websocket';
import cookie from '@fastify/cookie';
import path from 'path';
import { fileURLToPath } from 'url';

import helmet from '@fastify/helmet';
import { initLoader } from './loader/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createApp() {
  const isDev = process.env.NODE_ENV !== 'production';

  // 激活 Pino 内置高性能日志引擎
  const app = Fastify({
    logger: {
      level: isDev ? 'info' : 'warn',
      // 开发环境使用 pino-pretty 美化输出，生产环境输出纯 JSON (供 ELK 解析)
      ...(isDev && {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname'
          }
        }
      })
    },
    routerOptions: {
      ignoreTrailingSlash: true
    },
    trustProxy: true
  });

  const publicPath = path.join(__dirname, '../public');

  // 1. 基础插件 (Fastify 生态)
  await app.register(helmet, {
    contentSecurityPolicy: false // 开发/内部环境通常禁用 CSP 以避免资源加载问题
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'token'],
    exposedHeaders: ['Content-Disposition', 'token'],
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
      stack: isDev ? error.stack : undefined,
      app: request.state?.appName || 'system'
    });
  });

  // 启动加载器模块
  await initLoader(app);

  return app;
}
