/**
 * 密码策略模块
 * 密码强度校验、历史密码检查、强制修改周期
 */

/** 默认密码策略 */
const DEFAULT_POLICY = {
  minLength: 8,           // 最小长度
  maxLength: 128,         // 最大长度
  requireUppercase: true, // 需要大写字母
  requireLowercase: true, // 需要小写字母
  requireNumbers: true,   // 需要数字
  requireSpecial: false,  // 需要特殊字符
  maxHistory: 5,          // 记住最近 N 个密码，防止重复使用
  maxAgeDays: 0           // 密码有效期（天），0 表示永不过期
};

/**
 * 校验密码强度
 * @param {string} password 密码
 * @param {object} [policy] 策略配置（覆盖默认值）
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePasswordStrength(password, policy = {}) {
  const cfg = { ...DEFAULT_POLICY, ...policy };
  const errors = [];

  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['密码不能为空'] };
  }

  if (password.length < cfg.minLength) {
    errors.push(`密码长度不能少于 ${cfg.minLength} 个字符`);
  }

  if (password.length > cfg.maxLength) {
    errors.push(`密码长度不能超过 ${cfg.maxLength} 个字符`);
  }

  if (cfg.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('密码必须包含至少一个大写字母');
  }

  if (cfg.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('密码必须包含至少一个小写字母');
  }

  if (cfg.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('密码必须包含至少一个数字');
  }

  if (cfg.requireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('密码必须包含至少一个特殊字符');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 检查密码是否在历史记录中（防止重复使用）
 * @param {string} password 新密码
 * @param {string[]} passwordHistory 历史密码哈希列表（最近 N 个）
 * @param {Function} hashFn 哈希函数（如 bcrypt.compare）
 * @returns {Promise<boolean>} true = 密码在历史记录中，应拒绝
 */
export async function isPasswordReused(password, passwordHistory, hashFn) {
  if (!passwordHistory || passwordHistory.length === 0) return false;

  for (const oldHash of passwordHistory) {
    if (await hashFn(password, oldHash)) {
      return true;
    }
  }
  return false;
}

/**
 * 检查密码是否已过期
 * @param {Date} lastPasswordChange 最后修改密码时间
 * @param {number} maxAgeDays 有效期天数（0 = 永不过期）
 * @returns {{ expired: boolean, daysRemaining: number }}
 */
export function checkPasswordAge(lastPasswordChange, maxAgeDays = 0) {
  if (maxAgeDays <= 0) {
    return { expired: false, daysRemaining: -1 };
  }

  if (!lastPasswordChange) {
    return { expired: true, daysRemaining: 0 };
  }

  const now = new Date();
  const diffDays = Math.floor((now - lastPasswordChange) / (1000 * 60 * 60 * 24));
  const daysRemaining = maxAgeDays - diffDays;

  return {
    expired: daysRemaining <= 0,
    daysRemaining: Math.max(0, daysRemaining)
  };
}

export default DEFAULT_POLICY;
