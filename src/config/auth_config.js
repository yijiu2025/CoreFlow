/**
 * 会话策略 —— **可选的静态覆盖层**
 *
 * ⚠️ 本文件可以整个删掉，服务照常用 core 保底值启动。
 * 这里只写**你想改的键**，未写的键一律走 core 默认值：
 *   默认值 + 取值理由 → src/framework/auth/session/session-config.js（AUTH_SESSION_DEFAULTS）
 *   运行期热改（无需重启）→ src/data/auth_config.json
 *
 * 可用键（均挂在 session 下）：
 *   rotatedRetentionSeconds  旧 refresh token「已轮转」标记保留时长（秒，默认 604800 = 7 天，
 *                            消费方兜底最小 60 秒）
 *   maxRefreshTokens         单用户最多保留的 refresh token 数（默认 10，超出裁剪最旧）
 *   maxActiveDevices         单用户最大活跃设备数（默认 20，超出裁剪最旧设备行）
 *   singleDeviceTypes        单设备单登录的 deviceType 白名单（默认全部 5 类；
 *                            置空数组 = 全部类型互顶）
 *
 * 注意 `singleDeviceTypes` 是数组：覆盖时**整体替换**，要写全量。
 *
 * 示例：
 *   const AUTH_CONFIG = {
 *     session: { maxActiveDevices: 5, singleDeviceTypes: ['app', 'desktop'] }
 *   };
 */
const AUTH_CONFIG = {};

export { AUTH_CONFIG };
