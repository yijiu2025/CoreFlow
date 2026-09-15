/**
 * 请求上下文（AsyncLocalStorage 单例）
 *
 * 独立零依赖模块，只做一件事：提供请求级 ALS 实例。
 * - `index.js`（插件入口）负责写入：`requestContext.run(request, ...)`
 * - `StpUtil.js` / `getCtx()` 负责读取：`requestContext.getStore()`
 *
 * 为什么单独成文件（而不是留在 index.js）：
 * 1. `StpUtil.js` 曾从 `index.js` 导入本实例，形成 `index.js ↔ StpUtil.js` 循环依赖
 *    （AUDIT-REPORT-2026-09-12.md 🟡-1，依赖图脚本实测有环）；
 * 2. 连带副作用：只想用 StpUtil 这个纯权限工具类，却会把整条 auth 插件链拉起来
 *    （cookie.js 顶层 SESSION_SECRET 校验、session.js → db/redis 建连）；
 * 3. 分层原则：基础层（上下文/工具）不应依赖入口层。
 *
 * @author yijiu2025
 * @since 2026-09-14
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * 请求级 AsyncLocalStorage 实例
 *
 * 在 HTTP 请求生命周期内传递 FastifyRequest，实现"静态上下文穿透"——工具类无需
 * 手动接收 request 参数。非请求上下文（脚本、定时任务、单元测试）返回 `undefined`，
 * 调用方必须自行判空（如 `StpUtil._getRequest()` 会抛出明确错误）。
 *
 * @type {AsyncLocalStorage<import('fastify').FastifyRequest>}
 */
const requestContext = new AsyncLocalStorage();

export { requestContext };
