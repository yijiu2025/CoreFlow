/**
 * 稳定设备标识（device_id）
 *
 * 跨域 iframe 场景下 cookie 不可靠（oauth21 域写的 device_id cookie 在
 * posecraft 域请求带不过去），改用 localStorage 存稳定结构化 ID，每个请求
 * 通过 x-device-id 头主动发送。后端 getDeviceId 优先读头。
 *
 * ID 结构：{PLATFORM}-{ENCODED_TIMESTAMP}-{RANDOM_SUFFIX}
 * 示例：WEB-DaBOSbNdSuc-8s4T（ENCODED_TIMESTAMP 为 11 字符 Base62）
 *
 * - PLATFORM: 设备平台（WEB/IOS/ANDROID）
 * - ENCODED_TIMESTAMP: Base62 编码的时间戳（毫秒级）+ 64 位魔数位混淆，固定 11 字符
 * - RANDOM_SUFFIX: 6 字符 Base62 随机码（高熵值）
 *
 * 同设备跨账号复用：localStorage 不随账号退出清除，登录 A 再登录 B
 * 用同一个 device_id（设备不变）。
 *
 * 唯一性保证：毫秒级时间戳 + 随机后缀，碰撞概率 < 10^-15
 * 混淆性：时间戳使用位混淆 + Base62 编码，不直接可读（公开常量混淆，非加密）
 *
 * 本地校验与后端 src/framework/auth/device-id-service.js 的 validateDeviceId
 * 逐条对齐（平台枚举 / 长度 / 字符集 / 未来时间 / 有效期）：存量非法 ID 在
 * 本地即重生，避免"本地可用、后端全拒"的每请求重生循环（81350f1 故障模式）。
 *
 * 实现为纯 JS（而非 TS）：根 Jest 配置 transform: {}（纯 ESM 不编译 TS），
 * 单元测试直接 import 本文件（与 base62-timestamp.js 同一约定）。
 *
 * @author yijiu2025
 * @since 2026-08-25
 * @since 2026-09-01 结构化方案（混淆时间戳 + 高唯一性）
 * @since 2026-09-03 长度注释对齐实际编码输出（11 字符，与后端校验一致）
 * @since 2026-09-03 编解码抽到 base62-timestamp.js 前后端共享；存量 ID 自查；隐私模式降级告警；随机码拒绝采样
 * @since 2026-09-04 校验与后端逐条对齐；存储走 storage.js；缓存失效出口；随机源守卫
 */

import { BASE62_CHARS, ENCODED_TS_LENGTH, encodeTimestamp, decodeTimestamp } from './base62-timestamp.js';
import { safeGetItem, safeSetItem, safeRemoveItem } from './storage.js';

/** 设备 ID 在 localStorage 的存储键（device-sync.ts 同步逻辑共用此常量） */
export const STORAGE_KEY = 'cf_device_id';

/** 设备 ID 最长有效期（天），与后端 device-id-service.js 的 MAX_AGE_DAYS 保持一致 */
export const MAX_AGE_DAYS = 365;

/** 合法平台枚举，与后端 detectPlatform / validateDeviceId 保持一致 */
export const DEVICE_PLATFORMS = ['WEB', 'IOS', 'ANDROID'];

/** 随机后缀长度（6 字符 Base62），与后端 RANDOM_SUFFIX_LENGTH 保持一致 */
export const RANDOM_SUFFIX_LENGTH = 6;

/** 时钟偏差容差（毫秒）：本机时钟回拨在此范围内时，存量 ID 的"轻微未来"时间戳
 *  不触发重生，避免用户校准时钟后设备身份无谓漂移。与后端 device-id-service.js
 *  的 CLOCK_SKEW_TOLERANCE_MS 保持一致（前后端同规则）。 */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/** 内存缓存的当前设备 ID（getStableDeviceId 高频调用，避免每次读存储） */
let cachedId = null;

/**
 * 获取稳定 device_id（持久化 + 内存缓存，首次生成结构化 ID）
 *
 * 存量自查：localStorage 中的老格式 UUID、损坏值、非法格式、超有效期的
 * ID 会被清除并重新生成（校验规则与后端 validateDeviceId 逐条对齐）。
 * @returns {string} 结构化设备 ID
 */
export function getStableDeviceId() {
  if (cachedId) return cachedId;
  let id = safeGetItem(STORAGE_KEY);
  if (!isUsableDeviceId(id)) {
    if (id) {
      // 老格式 / 损坏 / 过期的存量 ID，清除后重生
      safeRemoveItem(STORAGE_KEY);
    }
    id = generateStructuredDeviceId();
    safeSetItem(STORAGE_KEY, id);
  }
  cachedId = /** @type {string} */ (id);
  return cachedId;
}

/**
 * 使内存缓存的设备 ID 失效（下次 getStableDeviceId 重新读存储）
 *
 * 供 device-sync 的 setDeviceId / clearDeviceId 在写入/清除存储后调用，
 * 保证服务端下发新 ID 后下一个请求立即生效（无需刷新页面）。
 */
export function invalidateCachedDeviceId() {
  cachedId = null;
}

/**
 * 校验设备 ID 格式（与后端 validateDeviceId 逐条对齐，同步版）
 *
 * 校验项：3 段式结构、平台枚举、时间戳段 11 字符、随机后缀 6 字符、
 * 全段 Base62 字符集、时间戳可解码、非未来时间、未超 365 天有效期。
 * @param {string} deviceId 待校验的设备 ID
 * @returns {{valid: boolean, reason?: string}} 校验结果（失败时带原因）
 */
export function validateDeviceIdFormat(deviceId) {
  if (typeof deviceId !== 'string' || !deviceId) {
    return { valid: false, reason: '空值或非字符串' };
  }

  // 长度上限：合法 ID 最长 3+1+11+1+6=22 字符，超长输入直接拒绝（防脏数据进解析）
  if (deviceId.length > 64) {
    return { valid: false, reason: '超长' };
  }

  const parts = deviceId.split('-');
  if (parts.length !== 3) {
    return { valid: false, reason: '格式错误：应为 PLATFORM-ENCODED_TS-RANDOM' };
  }

  const [platform, encodedTs, randomSuffix] = parts;

  if (!DEVICE_PLATFORMS.includes(platform)) {
    return { valid: false, reason: `无效平台：${platform}` };
  }

  if (encodedTs.length !== ENCODED_TS_LENGTH) {
    return { valid: false, reason: `时间戳长度错误：应为 ${ENCODED_TS_LENGTH}` };
  }

  if (randomSuffix.length !== RANDOM_SUFFIX_LENGTH) {
    return { valid: false, reason: `随机后缀长度错误：应为 ${RANDOM_SUFFIX_LENGTH}` };
  }

  if (!isBase62(encodedTs) || !isBase62(randomSuffix)) {
    return { valid: false, reason: '包含非法字符（仅支持 0-9A-Za-z）' };
  }

  let timestamp;
  try {
    timestamp = decodeTimestamp(encodedTs);
  } catch {
    return { valid: false, reason: '时间戳解码失败' };
  }

  if (!Number.isFinite(timestamp)) {
    return { valid: false, reason: '时间戳解码结果非法' };
  }

  const now = Date.now();
  // 未来时间拒绝带时钟偏差容差（与后端一致）：容差内的轻微未来时间放行，
  // 防止本机时钟回拨后存量 ID 被误判重生、或服务端（时钟稍快）下发的 ID 被拒写
  if (timestamp > now + CLOCK_SKEW_TOLERANCE_MS) {
    return { valid: false, reason: '无效时间戳（未来时间）' };
  }

  const ageDays = Math.floor((now - timestamp) / (1000 * 60 * 60 * 24));
  if (ageDays > MAX_AGE_DAYS) {
    return { valid: false, reason: `设备 ID 已过期（超过 ${MAX_AGE_DAYS} 天）` };
  }

  return { valid: true };
}

/**
 * 校验存量 ID 是否可用：格式合法（与后端校验对齐）
 * @param {string|null} id 待校验的 ID
 * @returns {boolean} 是否可用
 */
function isUsableDeviceId(id) {
  if (!id) return false;
  return validateDeviceIdFormat(id).valid;
}

/**
 * 生成结构化设备 ID
 * 格式：{PLATFORM}-{ENCODED_TIMESTAMP}-{RANDOM_SUFFIX}
 * 示例：WEB-DaBOSbNdSuc-8s4T
 *
 * @returns {string} 约 22 字符的结构化设备 ID
 */
function generateStructuredDeviceId() {
  const platform = getPlatform();
  const now = Date.now();
  const encodedTs = encodeTimestamp(now);
  const randomSuffix = generateBase62Random(RANDOM_SUFFIX_LENGTH);

  return `${platform}-${encodedTs}-${randomSuffix}`;
}

/**
 * 检测设备平台
 *
 * 刻意与后端 detectPlatform 保持同一规则（小写 UA 关键词匹配），
 * 不做 iPadOS 13+（UA 报 Macintosh）识别——否则前端判 IOS、后端判 WEB，
 * 每个请求都会触发后端"平台不匹配"告警。iPadOS 识别需两端同步升级。
 * @returns {'WEB'|'IOS'|'ANDROID'} 平台枚举
 */
export function getPlatform() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  if (/ipad|iphone|ipod/.test(ua)) return 'IOS';
  if (/android/.test(ua)) return 'ANDROID';
  return 'WEB';
}

/**
 * 生成指定长度的 Base62 随机字符串（拒绝采样，无模偏差）
 * @param {number} length 长度
 * @returns {string} Base62 随机字符串
 */
function generateBase62Random(length) {
  // crypto.getRandomValues 不可用（极旧浏览器/非预期环境）时降级：
  // 设备 ID 非密钥材料，可用性优先，但必须告警
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    console.warn('⚠️ [DeviceId] crypto.getRandomValues 不可用，随机后缀降级为 Math.random（熵降低）');
    let fallback = '';
    while (fallback.length < length) {
      fallback += BASE62_CHARS[Math.floor(Math.random() * BASE62_CHARS.length)];
    }
    return fallback;
  }

  // 256 % 62 = 8，直接取模会让前 8 个字符概率偏高，用拒绝采样消除
  const maxUsable = Math.floor(256 / BASE62_CHARS.length) * BASE62_CHARS.length;
  let result = '';
  while (result.length < length) {
    const batch = new Uint8Array(length * 2);
    crypto.getRandomValues(batch);
    for (let i = 0; i < batch.length && result.length < length; i++) {
      if (batch[i] < maxUsable) {
        result += BASE62_CHARS[batch[i] % BASE62_CHARS.length];
      }
    }
  }
  return result;
}

/**
 * 调试工具：解析设备 ID 信息（宽松解析，不校验有效期/平台枚举）
 * @param {string} deviceId 设备 ID 字符串
 * @returns {{platform: string, timestamp: number, createdAt: Date, age: number}|null} 解析结果；非法返回 null
 */
export function parseDeviceId(deviceId) {
  try {
    const parts = deviceId.split('-');
    if (parts.length !== 3) return null;

    const [platform, encodedTs] = parts;
    if (encodedTs.length !== ENCODED_TS_LENGTH) return null;

    const timestamp = decodeTimestamp(encodedTs);
    const createdAt = new Date(timestamp);
    const age = (Date.now() - timestamp) / (1000 * 60 * 60 * 24); // 天数

    return {
      platform,
      timestamp,
      createdAt,
      age: Math.floor(age)
    };
  } catch {
    return null;
  }
}

export { decodeTimestamp };

/**
 * 检查字符串是否全为 Base62 字符（与后端 isBase62 一致）
 * @param {string} str 待检查字符串
 * @returns {boolean} 是否合法
 */
function isBase62(str) {
  return /^[0-9A-Za-z]+$/.test(str);
}
