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
 * @author yijiu2025
 * @since 2026-08-25
 * @since 2026-09-01 结构化方案（混淆时间戳 + 高唯一性）
 * @since 2026-09-03 长度注释对齐实际编码输出（11 字符，与后端校验一致）
 * @since 2026-09-03 编解码抽到 base62-timestamp.js 前后端共享；存量 ID 自查（无效/过期重生）；隐私模式降级告警；随机码拒绝采样
 */

import {
  BASE62_CHARS,
  ENCODED_TS_LENGTH,
  encodeTimestamp,
  decodeTimestamp
} from './base62-timestamp';

/** 设备 ID 在 localStorage 的存储键（device-sync.ts 同步逻辑共用此常量） */
export const STORAGE_KEY = 'cf_device_id';

/** 设备 ID 最长有效期（天），与后端 device-id-service.js 的 MAX_AGE_DAYS 保持一致 */
const MAX_AGE_DAYS = 365;

let cachedId: string | null = null;
const RANDOM_SUFFIX_LENGTH = 6; // 6 字符 Base62 随机码

/**
 * 获取稳定 device_id（localStorage 持久化，首次生成结构化 ID）
 *
 * 存量自查：localStorage 中的老格式 UUID、损坏值、超有效期的 ID 会被
 * 清除并重新生成，避免依赖后端重生收敛（少一次往返 + 减少指纹基准漂移窗口）。
 */
export function getStableDeviceId(): string {
  if (cachedId) return cachedId;
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!isUsableDeviceId(id)) {
      if (id) {
        // 老格式 / 损坏 / 过期的存量 ID，清除后重生
        localStorage.removeItem(STORAGE_KEY);
      }
      id = generateStructuredDeviceId();
      localStorage.setItem(STORAGE_KEY, id);
    }
    cachedId = id as string;
    return cachedId;
  } catch {
    // localStorage 不可用（隐私模式）→ 临时生成（本次会话不稳定，但极少见）
    if (!cachedId) {
      console.warn('⚠️ [DeviceId] localStorage 不可用（隐私模式？），本次会话内使用临时设备 ID，刷新后会变化，可能频繁触发人机验证');
      cachedId = generateStructuredDeviceId();
    }
    return cachedId;
  }
}

/**
 * 校验存量 ID 是否可用：结构化格式可解析且未超过有效期
 * @param id 待校验的 ID（可能为 null）
 * @returns 是否可用
 */
function isUsableDeviceId(id: string | null): id is string {
  if (!id) return false;
  const parsed = parseDeviceId(id);
  return parsed !== null && parsed.age <= MAX_AGE_DAYS;
}

/**
 * 生成结构化设备 ID
 * 格式：{PLATFORM}-{ENCODED_TIMESTAMP}-{RANDOM_SUFFIX}
 * 示例：WEB-DaBOSbNdSuc-8s4T
 *
 * @returns 约 20-22 字符的结构化设备 ID
 */
function generateStructuredDeviceId(): string {
  const platform = getPlatform();
  const now = Date.now();
  const encodedTs = encodeTimestamp(now);
  const randomSuffix = generateBase62Random(RANDOM_SUFFIX_LENGTH);

  return `${platform}-${encodedTs}-${randomSuffix}`;
}

/**
 * 检测设备平台
 * @returns 'WEB' | 'IOS' | 'ANDROID'
 */
function getPlatform(): string {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'IOS';
  if (/Android/.test(ua)) return 'ANDROID';
  return 'WEB';
}

/**
 * 生成指定长度的 Base62 随机字符串（拒绝采样，无模偏差）
 * @param length 长度
 * @returns Base62 随机字符串
 */
function generateBase62Random(length: number): string {
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
 * 调试工具：解析设备 ID 信息
 * @param deviceId 设备 ID 字符串
 * @returns 解析结果 { platform, timestamp, age }
 */
export function parseDeviceId(deviceId: string): {
  platform: string;
  timestamp: number;
  createdAt: Date;
  age: number; // 天数
} | null {
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
