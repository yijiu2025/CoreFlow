/**
 * 应用级调优配置 —— **可选的静态覆盖层**
 *
 * 📖 完整使用指导（可配置项总表 / 合法范围 / 各项默认值出处 / 失败行为 / 新增步骤）见
 *    `src/framework/config/app-config.js` 头部注释。下面只是**速查**，改键请以那份为准。
 *
 * ⚠️ 本文件可以整个删掉，服务照常用 core 保底值启动。
 * 这里只写**你想改的键**，未写的键一律走 core 在使用处写的默认值：
 *
 *   http.keepAliveTimeoutMs           默认 72000   ← app.js
 *     **必须大于前置反代的 keepalive**，否则出现"反代刚复用连接而应用已关闭"的间歇 502
 *     （Nginx 默认 75s、ALB 60s）
 *   http.requestTimeoutMs             默认 300000  ← app.js
 *     单请求（含请求体）总时长上限，封堵慢速发 body（RUDY）；给 200MB 上传留余量
 *   websocket.shutdownGraceMs         默认 1000    ← framework/ingress/http/plugins.js
 *     停机宽限期：广播关闭帧后等这么久再强断残留连接
 *   websocket.closeCode               默认 1001    ← framework/ingress/websocket/preclose.js
 *     停机时广播的关闭帧状态码（1001 = going away）。1005/1006/1015 等协议禁发码会被回退成 1001；
 *     一般不需要改 —— 只有客户端按特定码做重连/提示时才配置
 *   guard.syncIntervalMs              默认 30000   ← api/guard-config.js
 *     守卫配置跨实例同步轮询；单实例部署设 0 关闭
 *   monitor.slowRequestThresholdMs    默认 2000    ← framework/lifecycle/loader/registry/01-monitor.js
 *     慢请求告警阈值（只记日志，硬断开由 requestTimeoutMs 负责）
 *   passwordHash.scryptMaxConcurrency 默认 16      ← framework/security/auth/security/password-hash.js
 *     每次 scrypt 约 16MB 内存，超限抛 SCRYPT_BUSY 由上层 503 背压
 *   passwordHash.bcryptMaxConcurrency 默认 4       ← 同上
 *     历史 bcrypt 校验并发（每次阻塞主线程约 68ms），超限判为不匹配
 *
 * 以上均为**启动期读取**（Fastify 构造参数 / 模块常量），改完需重启；
 * 需要热改的项不在本文件（走 data/*.json）。
 * 拼写错误与越界值会在启动时告警（framework/config/app-config-schema.js）。
 *
 * 示例：
 *   const APP_CONFIG = {
 *     http: { keepAliveTimeoutMs: 90_000 },
 *     monitor: { slowRequestThresholdMs: 1_000 }
 *   };
 */
const APP_CONFIG = {};

export { APP_CONFIG };
