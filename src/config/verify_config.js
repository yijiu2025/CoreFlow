/**
 * 验证模块（验证码 / 短信 / 滑块 / 扫码 / 人机验证）—— **可选的静态覆盖层**
 *
 * ⚠️ 本文件可以整个删掉，服务照常用 core 保底值启动。
 * 这里只写**你想改的键**，未写的键一律走 core 默认值：
 *   默认值 + 取值理由 → src/framework/verify/config.js（VERIFY_DEFAULTS）
 *   运行期热改（无需重启）→ src/data/verify_config.json
 *
 * 可用键：
 *   captcha    { size, noise, ttl, extendTtl, maxAttempts }
 *   sms        { codeLength, ttl, rateLimit }        ← 密钥/签名/模板仍走 env
 *   recaptcha  { enabled, provider, minScore, expectedHostname, expectedAction }
 *   slider     { tolerance, ttl }
 *   qrcode     { ttl, pollInterval }
 *   device     { enabled, fingerprintFields }
 *   common     { rateLimit, codeTtl }
 *
 * **密钥与账号类仍走 env**（每部署不同、且不应落进配置文件）：
 *   SMS_PROVIDER / SMS_ACCESS_KEY_ID / SMS_ACCESS_KEY_SECRET / SMS_SIGN_NAME /
 *   SMS_TEMPLATE_CODE / RECAPTCHA_SECRET_KEY / RECAPTCHA_SITE_KEY /
 *   TURNSTILE_SECRET_KEY / TURNSTILE_SITE_KEY / PASSWORD_RESET_MODE
 *
 * 示例：
 *   const VERIFY_CONFIG = {
 *     captcha: { maxAttempts: 8 },
 *     recaptcha: { enabled: true, provider: 'turnstile' }
 *   };
 */
const VERIFY_CONFIG = {};

export { VERIFY_CONFIG };
