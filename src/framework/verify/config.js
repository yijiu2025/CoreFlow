/**
 * 验证模块统一配置
 * 读取环境变量，提供默认值，所有 verify 子模块引用此文件
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
export default {
  // 图形验证码
  captcha: {
    size: parseInt(process.env.CAPTCHA_SIZE || '4'),
    noise: parseInt(process.env.CAPTCHA_NOISE || '3'),
    ttl: parseInt(process.env.CAPTCHA_TTL || '600'),
    extendTtl: parseInt(process.env.CAPTCHA_EXTEND_TTL || '300'),
    levels: {
      easy: { size: 3, noise: 1, fontSize: 50 },
      normal: { size: 4, noise: 3, fontSize: 45 },
      high: { size: 6, noise: 5, fontSize: 40 }
    }
  },

  // 短信验证码
  sms: {
    provider: process.env.SMS_PROVIDER || 'aliyun',
    accessKeyId: process.env.SMS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.SMS_ACCESS_KEY_SECRET || '',
    signName: process.env.SMS_SIGN_NAME || '',
    templateCode: process.env.SMS_TEMPLATE_CODE || '',
    codeLength: parseInt(process.env.SMS_CODE_LENGTH || '6'),
    ttl: parseInt(process.env.SMS_CODE_TTL || '300'),
    rateLimit: parseInt(process.env.SMS_RATE_LIMIT || '60')
  },

  // 人机验证
  recaptcha: {
    provider: process.env.RECAPTCHA_PROVIDER || 'google',
    secretKey: process.env.RECAPTCHA_SECRET_KEY || '',
    siteKey: process.env.RECAPTCHA_SITE_KEY || '',
    minScore: parseFloat(process.env.RECAPTCHA_MIN_SCORE || '0.5')
  },

  // 滑块验证码
  slider: {
    tolerance: parseInt(process.env.SLIDER_TOLERANCE || '5'),
    ttl: parseInt(process.env.SLIDER_TTL || '300')
  },

  // 二维码扫码
  qrcode: {
    ttl: parseInt(process.env.QRCODE_TTL || '300'),
    pollInterval: parseInt(process.env.QRCODE_POLL_INTERVAL || '2000')
  },

  // 设备指纹（canvas + WebGL），增强验证码/consentKey 的客户端绑定
  // 默认关闭：canvas/WebGL 指纹有隐私争议，且依赖浏览器环境
  // 启用后：前端采集指纹随请求回传，后端与 IP+UA 一起参与指纹计算
  device: {
    enabled: process.env.DEVICE_FINGERPRINT_ENABLED === 'true',
    // 指纹权重：IP+UA 基础指纹 + canvas/WebGL 增强指纹，启用时合并参与校验
    // 不启用时仅用 IP+UA（向后兼容，现有 V4/V5 指纹逻辑不变）
    fingerprintFields: process.env.DEVICE_FINGERPRINT_FIELDS || 'ip,ua'
  },

  // 通用
  common: {
    rateLimit: parseInt(process.env.VERIFY_RATE_LIMIT || '60'),
    codeTtl: parseInt(process.env.VERIFY_CODE_TTL || '600')
  }
};
