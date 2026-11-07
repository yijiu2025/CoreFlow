/**
 * Fastify 基础插件注册
 *
 * 从 `src/app.js` 抽出（2026-11-07）：入口只该说"注册哪些能力"，而"每个能力怎么配"
 * 属于框架层细节。顺序在这里是**依赖顺序**（security → cors → file → ws → cookie），
 * 不是随意排的：cookie 必须在 auth 之前、静态服务必须在 websocket 之前完成注册。
 *
 * 静态资源的两个历史坑（都真实踩过）：
 *   ① `setHeaders` 回调的第一个参数是 **Fastify reply**，不是裸 `http.ServerResponse`。
 *      曾经写成 `res.setHeader(...)` —— 因为 `public/` 里长期没有文件，这条路径从没跑过，
 *      直到真正放静态资源才暴露成 `res.setHeader is not a function`。
 *   ② 之前只设了 CORP、没设 `maxAge`，等于每个资源都带 ETag 回源 304，纯浪费。
 *      文件名由服务端生成（UUID / 内容 hash），内容不会原地变 ⇒ 可以长缓存。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import websocket from '@fastify/websocket';
import cookie from '@fastify/cookie';

import { APP_CONFIG } from '../config/app-config.js';
import { PUBLIC_ROOT } from '../storage/index.js';
import { createWsPreClose, resolveWsCloseCode, DEFAULT_WS_SHUTDOWN_GRACE_MS } from '../websocket/preclose.js';
import { resolveTimeoutMs } from '../../utils/timeout.js';
import { buildHelmetOptions, buildCorsOptions } from './security-options.js';

/**
 * WebSocket 关闭参数（持久化在 `src/config/app_config.js` 的 websocket 段）
 *
 * 只在模块加载时读一次（与 HTTP 超时同源策略：调优项不支持运行时热改）：
 *   - `shutdownGraceMs`：广播关闭帧后等多久再强断（默认 1000ms）
 *   - `closeCode`：关闭帧状态码（默认 1001 = going away；1005/1006/1015 等禁发码会被回退）
 */
const WS_SHUTDOWN_GRACE_MS = resolveTimeoutMs(APP_CONFIG.websocket?.shutdownGraceMs, DEFAULT_WS_SHUTDOWN_GRACE_MS);
const WS_CLOSE_CODE = resolveWsCloseCode(APP_CONFIG.websocket?.closeCode);

/**
 * 注册基础插件（安全头 / 跨域 / 上传 / 静态 / WebSocket / Cookie）
 *
 * @param {import('fastify').FastifyInstance} app - Fastify 实例
 * @param {object} params
 * @param {boolean} params.isProduction - 是否生产环境
 * @param {string[]} [params.corsOrigins] - 受信来源白名单（同时用作 iframe 白名单）
 * @returns {Promise<void>}
 */
async function registerBasePlugins(app, { isProduction = false, corsOrigins = [] } = {}) {
  const origins = Array.isArray(corsOrigins) ? corsOrigins.filter(Boolean) : [];

  // 1. security —— iframe 白名单 = CORS 白名单（同一套受信应用域）
  await app.register(helmet, buildHelmetOptions(isProduction, origins));

  await app.register(cors, buildCorsOptions({ origins, isProduction }));

  await app.register(multipart, {
    // 全局最大 200MB，单次请求最多 1 个文件 + 10 个字段
    // 具体文件类型校验（MIME magic bytes）在路由层处理
    limits: {
      fileSize: 200 * 1024 * 1024,
      files: 1,
      fields: 10
    }
  });

  // 静态资源：root=public，prefix=/ ⇒ public/<app>/xxx 直接可访问 /<app>/xxx
  //
  // 目录约定（详见 src/framework/storage/index.js）：
  //   public/<app>/…    公开资源（作品图 / 头像 / logo / 字体）—— 任何人可访问
  //   storage/<app>/…   **私有**资源，不在这里，只能经 /api/files/v1/:app/* 鉴权下发
  //
  // 静态根只从 framework/storage 取（PUBLIC_ROOT = <repo>/public）：这里再数一次 `../`
  // 就等于第二份定义，和 storage 的 appDir/publicUrl 一旦不同步就是"写进去、读不到"。
  // 生产若前面有 nginx/CDN，这一段可整段关掉交给它（Node 不该伺候静态文件）。
  await app.register(staticPlugin, {
    root: PUBLIC_ROOT,
    prefix: '/',
    maxAge: '7d',
    etag: true,
    setHeaders: reply => {
      reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
      // 上传目录里可能混入被伪造扩展名的内容，禁止浏览器嗅探 MIME
      reply.header('X-Content-Type-Options', 'nosniff');
    }
  });

  // 自定义 preClose：广播关闭帧 + 宽限期后强制断开，避免半开 WS 连接拖住 app.close()
  // 两个参数都来自 app_config（settings 缺失时用 preclose.js 的保底值）
  await app.register(websocket, {
    preClose: createWsPreClose({ graceMs: WS_SHUTDOWN_GRACE_MS, closeCode: WS_CLOSE_CODE })
  });

  await app.register(cookie);
}

export { WS_SHUTDOWN_GRACE_MS, WS_CLOSE_CODE, registerBasePlugins };
