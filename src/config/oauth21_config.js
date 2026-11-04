/**
 * OAuth 2.1 服务配置 —— **可选的静态覆盖层**
 *
 * ⚠️ 本文件可以整个删掉，服务照常用 core 保底值启动。
 * 这里只写**你想改的键**，未写的键一律走 core 默认值：
 *   默认值 + 取值理由 → src/app/oauth21/config/config.js（OAUTH21_DEFAULTS）
 *   运行期热改（无需重启）→ data/oauth21_config.json
 *
 * 可用键（四组，**TTL 不归 jwt 组** —— 默认 Session 模式同样生效）：
 *   tokens            { accessTokenTTL, refreshTokenTTL, idTokenTTL }   单位：秒
 *   authorizationCode { ttl }                                           一次性码，与 JWT 无关
 *   jwt               { enabled }                                       仅签发模式开关
 *   session           { maxSessionsPerApp }                             每应用最大活跃会话
 *
 * 注意：签名算法（RS256）是结构性常量，不是可调项，改它等于换实现 → 不在本文件。
 * 每用户 refresh token 上限属于框架会话层，见 src/config/auth_config.js。
 *
 * 示例：
 *   const OAUTH21_CONFIG = {
 *     tokens: { accessTokenTTL: 900 },
 *     jwt: { enabled: true }
 *   };
 */
const OAUTH21_CONFIG = {};

export { OAUTH21_CONFIG };
