/**
 * 验证模块统一配置
 * 读取环境变量，提供默认值，所有 verify 子模块引用此文件
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

  // 通用
  common: {
    rateLimit: parseInt(process.env.VERIFY_RATE_LIMIT || '60'),
    codeTtl: parseInt(process.env.VERIFY_CODE_TTL || '600')
  }
};
