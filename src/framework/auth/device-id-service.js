/**
 * 设备 ID 服务
 *
 * 处理结构化设备 ID 的验证、规范化、安全校验
 *
 * ID 格式：{PLATFORM}-{ENCODED_TIMESTAMP}-{RANDOM_SUFFIX}
 * 示例：WEB-DaBOSbNdSuc-8s4T（ENCODED_TIMESTAMP 为 11 字符 Base62）
 *
 * 时间戳混淆 + Base62 编解码算法以 npm 包 stable-deviceid/base62-timestamp
 * 为唯一事实来源（前端浏览器与后端 Node 共用同一实现，物理上不可能漂移；
 * device-id-parity.test.js 守护"后端校验规则 × 共享算法"的集成行为）。
 * 依赖前后端分开部署安全：算法来自 npm registry，不依赖 monorepo 目录结构。
 *
 * @author yijiu2025
 * @since 2026-09-01
 * @since 2026-09-03 校验长度对齐实际编码输出（11 字符），移除不可达的熵值检查
 * @since 2026-09-05 时钟偏差容差 ±5 分钟；Base62 算法单源化至 stable-deviceid 包
 */

import crypto from 'node:crypto';
import { BASE62_CHARS, ENCODED_TS_LENGTH, encodeTimestamp, decodeTimestamp } from 'stable-deviceid/base62-timestamp';

const RANDOM_SUFFIX_LENGTH = 6;
const MAX_AGE_DAYS = 365; // 设备 ID 最长有效期（1 年）

/** 时钟偏差容差：客户端时钟超前服务器在此范围内不视为"未来时间"伪造，避免无谓的替换轮次。
 *  与前端共享包 device-id 的 CLOCK_SKEW_TOLERANCE_MS 保持一致（前后端同规则）。 */
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/** 设备 ID 长度上限（合法 ID 最长 22 字符），防超长 x-device-id 头刷日志/浪费解析 */
const MAX_DEVICE_ID_LENGTH = 128;

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

  // 0. 长度防御：合法 ID 最长 22 字符，超长输入直接拒绝（防脏数据进解析与日志）
  if (typeof deviceId !== 'string' || !deviceId || deviceId.length > MAX_DEVICE_ID_LENGTH) {
    result.error = '格式错误：非法输入或超长';
    return result;
  }

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

    // 检查是否未来时间（防止伪造；±时钟偏差容差内的"轻微未来"放行，
    // 避免客户端时钟微小超前时每次生成都被拒、服务端反复换 ID）
    if (createdAt.getTime() > now.getTime() + CLOCK_SKEW_TOLERANCE_MS) {
      result.error = '无效时间戳（未来时间）';
      return result;
    }

    // 检查是否过期（ageDays 钳为非负：容差内的轻微未来时间不应报负数天数）
    if (ageDays > MAX_AGE_DAYS) {
      result.error = `设备 ID 已过期（超过 ${MAX_AGE_DAYS} 天）`;
      return result;
    }

    result.valid = true;
    result.normalizedId = deviceId;
    result.platform = platform;
    result.createdAt = createdAt;
    result.ageDays = Math.max(0, ageDays);
  } catch (error) {
    result.error = `时间戳解码失败：${error.message}`;
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
export function detectPlatform(userAgent) {
  const ua = userAgent.toLowerCase();
  if (/ipad|iphone|ipod/.test(ua)) return 'IOS';
  if (/android/.test(ua)) return 'ANDROID';
  return 'WEB';
}

/**
 * 生成指定长度的 Base62 随机字符串（拒绝采样，无模偏差）
 * @param {number} length - 长度
 * @returns {string} Base62 随机字符串
 */
function generateBase62Random(length) {
  // 256 % 62 = 8，直接取模会让前 8 个字符概率偏高，用拒绝采样消除
  const maxUsable = Math.floor(256 / BASE62_CHARS.length) * BASE62_CHARS.length;
  let result = '';

  while (result.length < length) {
    const buffer = crypto.randomBytes(length * 2);
    for (let i = 0; i < buffer.length && result.length < length; i++) {
      if (buffer[i] < maxUsable) {
        result += BASE62_CHARS[buffer[i] % BASE62_CHARS.length];
      }
    }
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

export { decodeTimestamp };
