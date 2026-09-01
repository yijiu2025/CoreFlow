/**
 * 防缓存工具
 *
 * 用于生成随机数戳，防止浏览器缓存静态资源
 * 主要用途：
 * 1. 防止CSS/JS文件被缓存
 * 2. 防止API请求被缓存
 * 3. 防止图片等静态资源被缓存
 */

/**
 * 生成随机数（16位小数）
 * @returns 随机数字符串，如 '0.7164508668310778'
 */
export function generateRandomTimestamp(): string {
  return '0.' + Math.random().toString().substring(2, 18);
}

/**
 * 生成紧凑型随机数（8位）
 * 格式: 纯8位随机数，如 'aB3xY9z'
 * @returns 短随机数字符串
 */
export function generateCompactRandom(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 生成格式化随机数（带前缀）
 * 格式: prefix-timestamp-random，如 'cache-1719876543123-456'
 * @param prefix 前缀，默认为 'cache'
 * @returns 格式化的随机数字符串
 */
export function generateFormattedRandom(prefix: string = 'cache'): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * 生成高精度随机数（24位）
 * 格式: 0. + 22位随机数，如 '0.123456789012345678901234'
 * @returns 高精度随机数字符串
 */
export function generateHighPrecisionRandom(): string {
  const random = Math.random().toString().substring(2, 24);
  return `0.${random}`;
}

/**
 * 生成时间戳随机数（毫秒级）
 * @param timestamp 可选的时间戳，默认为当前时间
 * @returns 时间戳+随机数，如 '1719876543123.456'
 */
export function generateTimestampRandom(timestamp?: number): string {
  const ts = timestamp || Date.now();
  return `${ts}.${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
}

/**
 * 生成UUID v4（替代随机数，更唯一）
 * @returns UUID字符串，如 '550e8400-e29b-41d4-a716-446655440000'
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * 生成短ID（8位随机字母数字）
 * @returns 短ID字符串，如 'aB3xY9z'
 */
export function generateShortId(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 为URL添加防缓存参数
 * @param baseUrl 基础URL
 * @param params 额外的查询参数
 * @returns 添加了防缓存参数的完整URL
 */
export function addAntiCacheParam(baseUrl: string, params?: Record<string, string>): string {
  const url = new URL(baseUrl, window.location.origin);
  const rnd = generateRandomTimestamp();

  // 添加防缓存参数
  url.searchParams.set('rnd', rnd);

  // 添加额外参数
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  return url.toString();
}

/**
 * 检查URL是否包含防缓存参数
 * @param url URL字符串
 * @returns 是否包含防缓存参数
 */
export function hasAntiCacheParam(url: string): boolean {
  try {
    const urlObj = new URL(url, window.location.origin);
    return urlObj.searchParams.has('rnd');
  } catch {
    return false;
  }
}