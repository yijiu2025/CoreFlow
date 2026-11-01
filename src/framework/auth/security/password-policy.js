/**
 * 密码策略模块
 * 密码强度校验（含 bcrypt 72 字节截断防护）
 *
 * 设计说明：曾包含 isPasswordReused / checkPasswordAge（历史密码防重用与有效期），
 * 因全仓零引用且缺少配套存储（无密码历史表），于 2026-11-01 按
 * docs/PLACEMENT-password-policy.md 的 P0 决策移除，文件收窄为「强度校验」。
 * 若将来要实现防重用，需先补 password_history 存储与改密追加写入路径。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */

/** bcrypt 只取前 72 字节参与哈希（超出部分静默忽略），见 docs/PLACEMENT-password-policy.md 实测 */
const BCRYPT_MAX_BYTES = 72;

/** 默认密码策略 */
const DEFAULT_POLICY = {
  minLength: 8, // 最小长度（字符）
  maxLength: 128, // 最大长度（字符）；实际硬上限由 BCRYPT_MAX_BYTES 字节校验兜住
  requireUppercase: true, // 需要大写字母
  requireLowercase: true, // 需要小写字母
  requireNumbers: true, // 需要数字
  requireSpecial: false // 需要特殊字符
};

/**
 * 校验密码强度
 * @param {string} password 密码
 * @param {object} [policy] 策略配置（覆盖默认值）
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePasswordStrength(password, policy = {}) {
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

  // 🔴 bcrypt 72 字节截断防护：超出 72 字节的部分不参与哈希，
  // 用户以为设置了更长密码实则没有；多字节字符（中文 3 字节/字）24 个字即触发。
  if (Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_BYTES) {
    errors.push(`密码长度不能超过 ${BCRYPT_MAX_BYTES} 字节（中文字符按 3 字节计）`);
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

  if (cfg.requireSpecial && !/[!@#$%^&*()_+\-={}[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('密码必须包含至少一个特殊字符');
  }

  return { valid: errors.length === 0, errors };
}

export { validatePasswordStrength, BCRYPT_MAX_BYTES };
export default DEFAULT_POLICY;
