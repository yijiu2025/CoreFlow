/**
 * CSRF 保护排除路径
 *
 * CSRF 校验只在 `/oauth2.1` 作用域内生效（见 `middleware/csrf.middleware.js` 的前缀闸门），
 * 因此这里**只列 oauth21 自己的路由**。列 `/verify/`、`/auth/v1/...`、`/api/firewall/...`
 * 没有意义：它们根本进不到校验器里。
 *
 * 排除判据只有一条：**该端点不依赖浏览器 cookie 证明用户身份**。
 * 这类调用要么用客户端凭据（`client_id` / `client_secret` / PKCE），要么用请求体里的一次性
 * 凭据（`refresh_token`、`device_code`）——攻击者无法靠"浏览器自动带上的 cookie"触发，
 * double-submit 对它没有防护价值，反而会把服务端到服务端的调用挡成 403。
 *
 * 🔴 **登录 / 授权确认 / 扫码确认 / 登出都不能排除**：
 * 它们要么写入会话（登录 CSRF 会把受害者登进攻击者账号，之后受害者的一切操作都落在
 * 攻击者的账号里），要么凭既有会话做事。旧清单把 `/oauth2.1/login`、`/oauth2.1/authorize`、
 * `/oauth2.1/qr` 全排除，等于把要保护的对象本身豁免掉了 —— 这是本清单被重写的直接原因。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-10-30 收窄为"只列真正无 cookie 依赖的端点"（U21）
 */
const CSRF_EXCLUDE_PATHS = [
  // OAuth 2.1 标准端点：客户端凭据 / 一次性 token，不依赖浏览器 cookie
  '/oauth2.1/token',
  '/oauth2.1/revoke',

  // 公开密钥：纯 GET，列出来是为了让"哪些端点不需要 CSRF"一眼可见
  '/oauth2.1/crypto',

  // 设备授权流：TV / CLI 没有浏览器会话
  '/oauth2.1/device_authorization',
  '/oauth2.1/device/token'
];

export { CSRF_EXCLUDE_PATHS };
