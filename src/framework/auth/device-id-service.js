/**
 * 设备 ID 服务
 *
 * 处理结构化设备 ID 的验证、规范化、安全校验
 *
 * ID 格式：{PLATFORM}-{ENCODED_TIMESTAMP}-{RANDOM_SUFFIX}
 * 示例：WEB-a3K7mP9q-8s4T
 *
 * @author yijiu2025
 * @since 2026-09-01
 */

import crypto from 'node:crypto';

const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const PLATFORM_LENGTH = 3;
const ENCODED_TS_LENGTH = 8;
const RANDOM_SUFFIX_LENGTH = 6;
const MAX_AGE_DAYS = 365; // 设备 ID 最长有效期（1 年）

/**
 * 设备 ID 验证结果
 * @typedef {Object} DeviceIdValidation
 * @property {boolean} valid - 是否有效
 * @property {string} [normalizedId] - 规范化的 ID
 * @property {string} [platform] - 设备平台
 * @property {Date} [createdAt] - 创建时间
 * @property {number} [ageDays] - 使用天数
 * @property {string} [error] - 错误信息
 */

/**
 * 验证设备 ID 格式和安全性
 * @param {string} deviceId - 设备 ID
 * @returns {Promise<DeviceIdValidation>}
 */
export async function validateDeviceId(deviceId) {
  const result = { valid: false };

  // 1. 格式校验
  const parts = deviceId.split('-');
  if (parts.length !== 3) {
    result.error = '格式错误：应为 PLATFORM-ENCODED_TS-RANDOM';
    return result;
  }

  const [platform, encodedTs, randomSuffix] = parts;

  // 2. 平台校验
  if (!['WEB', 'IOS', 'ANDROID'].includes(platform)) {
    result.error = `无效平台：${platform}`;
    return result;
  }

  // 3. 长度校验
  if (encodedTs.length !== ENCODED_TS_LENGTH) {
    result.error = `时间戳长度错误：应为 ${ENCODED_TS_LENGTH}`;
    return result;
  }

  if (randomSuffix.length !== RANDOM_SUFFIX_LENGTH) {
    result.error = `随机后缀长度错误：应为 ${RANDOM_SUFFIX_LENGTH}`;
    return result;
  }

  // 4. Base62 字符校验
  if (!isBase62(encodedTs) || !isBase62(randomSuffix)) {
    result.error = '包含非法字符（仅支持 0-9A-Za-z）';
    return result;
  }

  // 5. 时间戳解码和年龄校验
  try {
    const timestamp = decodeTimestamp(encodedTs);
    const createdAt = new Date(timestamp);
    const now = new Date();
    const ageDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

    // 检查是否未来时间（防止伪造）
    if (createdAt > now) {
      result.error = '无效时间戳（未来时间）';
      return result;
    }

    // 检查是否过期
    if (ageDays > MAX_AGE_DAYS) {
      result.error = `设备 ID 已过期（超过 ${MAX_AGE_DAYS} 天）`;
      return result;
    }

    result.valid = true;
    result.normalizedId = deviceId;
    result.platform = platform;
    result.createdAt = createdAt;
    result.ageDays = ageDays;

  } catch (error) {
    result.error = `时间戳解码失败：${error.message}`;
    return result;
  }

  // 6. 可选：熵值校验（防止弱随机）
  const entropyScore = calculateEntropy(randomSuffix);
  if (entropyScore < 30) { // 低于 30 位熵视为弱随机
    result.error = '随机后缀熵值过低（可能伪造）';
    return result;
  }

  return result;
}

/**
 * 验证并规范化设备 ID
 * 若前端 ID 无效，生成新 ID 返回
 * @param {string} clientId - 客户端提供的设备 ID
 * @param {string} userAgent - User-Agent 头（用于平台识别）
 * @returns {Promise<DeviceIdValidation>}
 */
export async function verifyAndNormalizeDeviceId(clientId, userAgent) {
  // 1. 验证客户端 ID
  const validation = await validateDeviceId(clientId);

  if (validation.valid) {
    // 2. 平台一致性校验（可选）
    const detectedPlatform = detectPlatform(userAgent);
    if (validation.platform !== detectedPlatform) {
      // 平台不匹配，记录警告但仍接受（可能是伪造）
      console.warn(`⚠️ [DeviceId] 平台不匹配：${validation.platform} vs ${detectedPlatform}`);
    }

    return validation;
  }

  // 3. 无效 ID：生成新 ID
  const newId = generateServerSideDeviceId(userAgent);
  const newValidation = await validateDeviceId(newId);

  return {
    ...newValidation,
    originalError: validation.error,
    shouldReplace: true
  };
}

/**
 * 服务端生成设备 ID
 * @param {string} userAgent - User-Agent 头
 * @returns {string} 设备 ID
 */
export function generateServerSideDeviceId(userAgent) {
  const platform = detectPlatform(userAgent);
  const now = Date.now();
  const encodedTs = encodeTimestamp(now);
  const randomSuffix = generateBase62Random(RANDOM_SUFFIX_LENGTH);

  return `${platform}-${encodedTs}-${randomSuffix}`;
}

/**
 * 检测设备平台
 * @param {string} userAgent - User-Agent 头
 * @returns {'WEB' | 'IOS' | 'ANDROID'}
 */
function detectPlatform(userAgent) {
  const ua = userAgent.toLowerCase();
  if (/ipad|iphone|ipod/.test(ua)) return 'IOS';
  if (/android/.test(ua)) return 'ANDROID';
  return 'WEB';
}

/**
 * 加密时间戳为 Base62 字符串
 * @param {number} timestamp - 毫秒时间戳
 * @returns {string} 8 字符 Base62 编码
 */
function encodeTimestamp(timestamp) {
  const OFFSET = 1704067200000n; // 2024-01-01
  const MAGIC = 0x9E3779B97F4A7C15n;

  const adjusted = BigInt(timestamp) - OFFSET;
  const obfuscated = adjusted ^ MAGIC;
  const encoded = toBase62(obfuscated);

  return encoded.padStart(ENCODED_TS_LENGTH, '0');
}

/**
 * 解码 Base62 字符串为时间戳
 * @param {string} encoded - 8 字符 Base62 编码
 * @returns {number} 毫秒时间戳
 */
function decodeTimestamp(encoded) {
  const OFFSET = 1704067200000n;
  const MAGIC = 0x9E3779B97F4A7C15n;

  const obfuscated = fromBase62(encoded);
  const adjusted = obfuscated ^ MAGIC;

  return Number(adjusted + OFFSET);
}

/**
 * 生成指定长度的 Base62 随机字符串
 * @param {number} length - 长度
 * @returns {string} Base62 随机字符串
 */
function generateBase62Random(length) {
  const buffer = crypto.randomBytes(length);
  let result = '';

  for (let i = 0; i < length; i++) {
    result += BASE62_CHARS[buffer[i] % BASE62_CHARS.length];
  }

  return result;
}

/**
 * 数字转 Base62 字符串（支持 BigInt）
 * @param {number|bigint} num - 正整数
 * @returns {string} Base62 字符串
 */
function toBase62(num) {
  const n = typeof num === 'bigint' ? num : BigInt(num);
  if (n === 0n) return '0';

  let result = '';
  let remaining = n;

  while (remaining > 0n) {
    result = BASE62_CHARS[Number(remaining % 62n)] + result;
    remaining = remaining / 62n;
  }

  return result;
}

/**
 * Base62 字符串转数字（返回 BigInt）
 * @param {string} str - Base62 字符串
 * @returns {bigint} BigInt
 */
function fromBase62(str) {
  let result = 0n;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const value = BASE62_CHARS.indexOf(char);
    if (value === -1) throw new Error(`Invalid Base62 character: ${char}`);

    result = result * 62n + BigInt(value);
  }

  return result;
}

/**
 * 检查字符串是否为有效的 Base62
 * @param {string} str - 待检查字符串
 * @returns {boolean}
 */
function isBase62(str) {
  const pattern = /^[0-9A-Za-z]+$/;
  return pattern.test(str);
}

/**
 * 计算字符串的熵值（估计随机性质量）
 * @param {string} str - 字符串
 * @returns {number} 熵值（位）
 */
function calculateEntropy(str) {
  const freq = {};
  const length = str.length;

  // 统计字符频率
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }

  // 计算 Shannon 熵
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const probability = count / length;
    if (probability > 0) {
      entropy -= probability * Math.log2(probability);
    }
  }

  // 乘以字符集大小（62）得到总位数
  return entropy * Math.log2(BASE62_CHARS.length);
}

/**
 * 解析设备 ID 信息
 * @param {string} deviceId - 设备 ID
 * @returns {Object|null} 解析结果
 */
export function parseDeviceId(deviceId) {
  try {
    const parts = deviceId.split('-');
    if (parts.length !== 3) return null;

    const [platform, encodedTs] = parts;
    const timestamp = decodeTimestamp(encodedTs);
    const createdAt = new Date(timestamp);
    const now = new Date();
    const ageDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

    return {
      platform,
      timestamp,
      createdAt,
      ageDays
    };
  } catch {
    return null;
  }
}