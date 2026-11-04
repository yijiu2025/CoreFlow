/**
 * 验证模块统一配置
 *
 * 分层（2026-11-03 起）：
 *   - **调优值** → `src/config/verify_config.js`（默认值，带注释）
 *   - **运行时覆盖** → `data/verify_config.json`（**热改，无需重启**）
 *   - **密钥/账号类** → 仍走 env（每部署不同，不该落进可热改文件）
 *
 * ⚠️ 热改实现：`runtime.bind(verifyConfig)` 会在覆盖文件变化时**原地更新**本对象，
 * 因此消费方继续 `import verifyConfig` 读属性即可 —— 但**每次使用时读属性**，
 * 不要提前把 `verifyConfig.captcha.ttl` 拷进模块级常量（那样就退回"改完要重启"）。
 *
 * @author yijiu2025
 * @since 2026-08-17；2026-11-03 调优值迁出 env 并支持热改
 */

import { createRuntimeConfig } from '../config/runtime.js';
import { loadOverrides } from '../config/overrides.js';

/**
 * core 保底默认值（改内置默认才动这里；按部署微调写 src/config/verify_config.js，
 * 运行期热改写 data/verify_config.json）
 */
const VERIFY_DEFAULTS = {
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

/** src/config/verify_config.js 的静态覆盖（可选；缺失则为 {}） */
const OVERRIDES = loadOverrides('verify_config.js', 'VERIFY_CONFIG');

/** 密钥与账号类配置：必须留在 env（不进可热改文件） */
const SECRETS = {
  sms: {
    provider: process.env.SMS_PROVIDER || 'aliyun',
    accessKeyId: process.env.SMS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.SMS_ACCESS_KEY_SECRET || '',
    signName: process.env.SMS_SIGN_NAME || '',
    templateCode: process.env.SMS_TEMPLATE_CODE || ''
  },
  recaptcha: {
    // google + hcaptcha 共用（API 兼容）
    secretKey: process.env.RECAPTCHA_SECRET_KEY || '',
    siteKey: process.env.RECAPTCHA_SITE_KEY || '',
    // turnstile 独立配置（API 与上面不兼容）
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY || '',
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || ''
  }
};

/**
 * 生效配置对象（默认值 + 密钥拼装后的完整形态）
 *
 * 作为 runtime 的 defaults：热改覆盖会整体重写它，因此密钥也必须在 defaults 里
 * （否则每次热改都会被"删除缺失键"逻辑抹掉），故显式拼在下面。
 */
// 生效值 = core 保底 ← 静态覆盖（运行期 JSON 覆盖由 runtime 再叠一层）
const VERIFY = {
  ...VERIFY_DEFAULTS,
  captcha: { ...VERIFY_DEFAULTS.captcha, ...OVERRIDES.captcha },
  sms: { ...VERIFY_DEFAULTS.sms, ...OVERRIDES.sms },
  recaptcha: { ...VERIFY_DEFAULTS.recaptcha, ...OVERRIDES.recaptcha },
  slider: { ...VERIFY_DEFAULTS.slider, ...OVERRIDES.slider },
  qrcode: { ...VERIFY_DEFAULTS.qrcode, ...OVERRIDES.qrcode },
  device: { ...VERIFY_DEFAULTS.device, ...OVERRIDES.device },
  common: { ...VERIFY_DEFAULTS.common, ...OVERRIDES.common }
};

const BASE = {
  captcha: {
    ...VERIFY.captcha,
    // 难度档位预设（结构性数据，不随部署变化，故留在代码里）
    levels: {
      easy: { size: 3, noise: 1, fontSize: 50 },
      normal: { size: 4, noise: 3, fontSize: 45 },
      high: { size: 6, noise: 5, fontSize: 40 }
    }
  },
  sms: { ...SECRETS.sms, ...VERIFY.sms },
  recaptcha: { ...VERIFY.recaptcha, ...SECRETS.recaptcha },
  slider: { ...VERIFY.slider },
  qrcode: { ...VERIFY.qrcode },
  device: { ...VERIFY.device },
  common: { ...VERIFY.common },
  // 密码重置方式：code（验证码重置）/ link（邮件链接重置）。
  // 决定 /user/v1/reset-password vs /user/v1/send-reset-link 哪条生效，
  // 未启用方式的端点返回 403（防绕过前端直接调后端）。
  // 需与前端 oauth21/.env 的 VITE_PASSWORD_RESET_MODE 保持一致，故留在 env。
  passwordReset: { mode: process.env.PASSWORD_RESET_MODE || 'code' }
};

const runtime = createRuntimeConfig({ name: 'verify', defaults: BASE });

/** 全模块共享的配置对象（热改后原地更新，引用不变） */
const verifyConfig = runtime.bind({});

export default verifyConfig;
