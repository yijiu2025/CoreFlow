/**
 * 验证模块统一配置
 *
 * 分层（2026-11-03 起）：
 *   - **调优值** → `src/config/verify_config.js`（默认值，带注释）
 *   - **运行时覆盖** → `src/data/verify_config.json`（**热改，无需重启**）
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
import { VERIFY_CONFIG } from '../../config/verify_config.js';

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
const BASE = {
  captcha: {
    ...VERIFY_CONFIG.captcha,
    // 难度档位预设（结构性数据，不随部署变化，故留在代码里）
    levels: {
      easy: { size: 3, noise: 1, fontSize: 50 },
      normal: { size: 4, noise: 3, fontSize: 45 },
      high: { size: 6, noise: 5, fontSize: 40 }
    }
  },
  sms: { ...SECRETS.sms, ...VERIFY_CONFIG.sms },
  recaptcha: { ...VERIFY_CONFIG.recaptcha, ...SECRETS.recaptcha },
  slider: { ...VERIFY_CONFIG.slider },
  qrcode: { ...VERIFY_CONFIG.qrcode },
  device: { ...VERIFY_CONFIG.device },
  common: { ...VERIFY_CONFIG.common },
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
