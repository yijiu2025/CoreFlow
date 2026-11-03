/**
 * 验证模块（验证码 / 短信 / 滑块 / 扫码 / 人机验证）默认值
 *
 * ⚠️ 本文件只放**值**（叶子模块，禁止 import 任何 src 代码，见 config-leaf 守护测试）。
 * 运行时覆盖与热改机制在 `src/framework/config/runtime.js`：
 * 改 `src/data/verify_config.json` 即可热生效（无需重启），本文件是兜底默认值。
 *
 * **密钥与账号类仍走 env**（每部署不同、且不应落进可热改的 JSON）：
 *   SMS_PROVIDER / SMS_ACCESS_KEY_ID / SMS_ACCESS_KEY_SECRET / SMS_SIGN_NAME /
 *   SMS_TEMPLATE_CODE / RECAPTCHA_SECRET_KEY / RECAPTCHA_SITE_KEY /
 *   TURNSTILE_SECRET_KEY / TURNSTILE_SITE_KEY / PASSWORD_RESET_MODE
 *
 * env 兜底已退役（2026-11-03）：CAPTCHA_* / SLIDER_* / QRCODE_* / VERIFY_* /
 * SMS_CODE_* / SMS_RATE_LIMIT / RECAPTCHA_ENABLED|PROVIDER|MIN_SCORE|HOSTNAME|ACTION /
 * DEVICE_FINGERPRINT_* 不再读环境变量。
 *
 * @author yijiu2025
 * @since 2026-11-03
 */
const VERIFY_CONFIG = {
  // 图形验证码
  captcha: {
    // 图码字符数：4 位 + 10 分钟 TTL + 5 次失败上限，配合路由层限频足够
    size: 4,
    // 干扰线数量
    noise: 3,
    // 有效期（秒）
    ttl: 600,
    // 每次校验失败后的续期（秒）：给"看错一次重输"留余地，又不至于无限续命
    extendTtl: 300,
    // 同一 captchaKey 允许的失败次数上限：达到即作废（重新取图）。
    // 4–6 位图码在 10 分钟 TTL 内可被反复试错，只靠路由层按 IP 限频兜底并不可靠
    // （攻击者可换 IP 打同一个 key）。默认 5 次，够正常人看错两次。
    maxAttempts: 5
  },

  // 短信验证码
  sms: {
    // 码长（位）
    codeLength: 6,
    // 有效期（秒）
    ttl: 300,
    // 单号码发送频率上限（次/窗口）
    rateLimit: 60
  },

  // 人机验证（hCaptcha / Google reCAPTCHA / Cloudflare Turnstile）
  // enabled=false（默认）：不校验，注册流程不受影响（开发/未配密钥时）
  // provider: 'google' | 'hcaptcha' | 'turnstile'（国内推荐 turnstile）
  recaptcha: {
    enabled: false,
    provider: 'google',
    // 分数阈值（仅 reCAPTCHA v3 有效）：低于此分判为人机
    minScore: 0.5,
    // 可选：校验结果是否来自预期域名/动作（生产建议配置，防 token 跨域挪用）
    expectedHostname: '',
    expectedAction: ''
  },

  // 滑块验证码
  slider: {
    // 允许的像素误差
    tolerance: 5,
    // 有效期（秒）
    ttl: 300
  },

  // 二维码扫码登录
  qrcode: {
    // 有效期（秒）
    ttl: 300,
    // 前端轮询间隔（毫秒）
    pollInterval: 2000
  },

  // 设备指纹（canvas + WebGL），增强验证码/consentKey 的客户端绑定
  // 默认关闭：canvas/WebGL 指纹有隐私争议，且依赖浏览器环境
  device: {
    enabled: false,
    // 参与指纹计算的字段（逗号分隔）：不启用增强指纹时仅 IP+UA
    fingerprintFields: 'ip,ua'
  },

  // 通用
  common: {
    // 验证类端点限频（次/窗口）
    rateLimit: 60,
    // 通用验证码有效期（秒）
    codeTtl: 600
  }
};

export { VERIFY_CONFIG };
