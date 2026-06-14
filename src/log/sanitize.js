/**
 * 日志脱敏工具
 *
 * 防止敏感数据（密码、token、密钥）泄露到日志中
 */

/** 需要脱敏的字段名模式 */
const SENSITIVE_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /cookie/i,
  /credential/i,
  /key/i
];

/** 脱敏占位符 */
const MASK = '***';

/**
 * 对对象进行日志脱敏
 * @param {object} obj - 要脱敏的对象
 * @param {number} depth - 递归深度限制
 * @returns {object} 脱敏后的对象副本
 */
export function sanitizeForLog(obj, depth = 3) {
  if (depth <= 0 || !obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForLog(item, depth - 1));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitive(key)) {
      result[key] = MASK;
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeForLog(value, depth - 1);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * 判断字段名是否敏感
 */
function isSensitive(key) {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
}

/**
 * 脱敏 URL 中的敏感参数
 * @param {string} url - URL 字符串
 * @returns {string} 脱敏后的 URL
 */
export function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return url;
  // 脱敏 query 参数中的敏感字段
  return url.replace(/([?&])(password|token|secret|key)=([^&]*)/gi, '$1$2=***');
}

/**
 * 脱敏 User-Agent（保留浏览器类型，去掉详细版本）
 * @param {string} ua - User-Agent 字符串
 * @returns {string} 脱敏后的 UA
 */
export function sanitizeUserAgent(ua) {
  if (!ua || typeof ua !== 'string') return ua;
  // 只保留前 100 个字符
  return ua.length > 100 ? ua.substring(0, 100) + '...' : ua;
}
