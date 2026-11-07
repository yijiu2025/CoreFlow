/**
 * 会话策略 —— **可选的静态覆盖层**
 *
 * ⚠️ 本文件可以整个删掉，服务照常用 core 保底值启动。
 * 这里只写**你想改的键**，未写的键一律走 core 默认值：
 *   默认值 + 取值理由 → src/framework/security/auth/session/session-config.js（AUTH_SESSION_DEFAULTS）
 *   运行期热改（无需重启）→ data/auth_config.json
 *
 * 可用键（jwt 组）：
 *   jwt.enabled              JWT 认证总开关（默认 false = Session 认证）。
 *                            **唯一来源**：framework 的 bearer 校验与 oauth21 的签发都读它，
 *                            不要在 src/config/oauth21_config.js 里重复配（会不一致）。
 *                            ⚠️ 打开需配套 RS256 密钥。
 *
 * 可用键（keys 组）：
 *   keys.retirementGraceSeconds  轮转后旧密钥的退役宽限期（秒，默认 2592000 = 30 天）。
 *                                宽限期内旧密钥仍留在 JWKS 供旧 token 验签，应 >= 最长 token TTL。
 *
 * 可用键（session 组）：
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
 *     jwt: { enabled: true },
 *     session: { maxActiveDevices: 5, singleDeviceTypes: ['app', 'desktop'] }
 *   };
 */
const AUTH_CONFIG = {};

export { AUTH_CONFIG };
