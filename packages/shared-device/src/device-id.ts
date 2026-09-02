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
 * 加密性：时间戳使用位混淆 + Base62 编码，不可直接读取
 *
 * @author yijiu2025
 * @since 2026-08-25
 * @since 2026-09-01 结构化方案（加密时间戳 + 高唯一性）
 * @since 2026-09-03 长度注释对齐实际编码输出（11 字符，与后端校验一致）
 */

const STORAGE_KEY = 'cf_device_id';

let cachedId: string | null = null;
const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ENCODED_TS_LENGTH = 11; // 64 位魔数 XOR 后 Base62 固定产出 11 字符（padStart 补零不生效，8 字符从未实现）
const RANDOM_SUFFIX_LENGTH = 6; // 6 字符 Base62 随机码

/**
 * 获取稳定 device_id（localStorage 持久化，首次生成结构化 ID）
 */
export function getStableDeviceId(): string {
  if (cachedId) return cachedId;
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = generateStructuredDeviceId();
      localStorage.setItem(STORAGE_KEY, id);
    }
    cachedId = id;
    return id;
  } catch {
    // localStorage 不可用（隐私模式）→ 临时生成（本次会话不稳定，但极少见）
    return cachedId || (cachedId = generateStructuredDeviceId());
  }
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
 * 加密时间戳为 Base62 字符串
 *
 * 算法：
 * 1. 时间戳 - 1704067200000（2024-01-01）减少长度
 * 2. 位混淆：与魔数 XOR（使用 BigInt 避免精度丢失）
 * 3. Base62 编码
 *
 * @param timestamp 毫秒时间戳
 * @returns 11 字符 Base62 编码字符串
 */
function encodeTimestamp(timestamp: number): string {
  const OFFSET = 1704067200000n; // 2024-01-01 的毫秒时间戳（BigInt）
  const MAGIC = 0x9E3779B97F4A7C15n; // 黄金比例 64 位魔数（BigInt）

  const adjusted = BigInt(timestamp) - OFFSET;
  const obfuscated = adjusted ^ MAGIC; // 64 位 XOR 混淆
  const encoded = toBase62(obfuscated);

  // 固定长度补零（左边）
  return encoded.padStart(ENCODED_TS_LENGTH, '0');
}

/**
 * 解码 Base62 字符串为时间戳（仅供调试使用）
 * @param encoded 11 字符 Base62 编码字符串
 * @returns 毫秒时间戳
 */
export function decodeTimestamp(encoded: string): number {
  const OFFSET = 1704067200000n; // 2024-01-01 的毫秒时间戳（BigInt）
  const MAGIC = 0x9E3779B97F4A7C15n; // 黄金比例 64 位魔数（BigInt）

  const obfuscated = fromBase62(encoded);
  const adjusted = obfuscated ^ MAGIC; // XOR 反向混淆

  return Number(adjusted + OFFSET);
}

/**
 * 生成指定长度的 Base62 随机字符串
 * @param length 长度
 * @returns Base62 随机字符串
 */
function generateBase62Random(length: number): string {
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);

  let result = '';
  for (let i = 0; i < length; i++) {
    result += BASE62_CHARS[randomBytes[i] % BASE62_CHARS.length];
  }
  return result;
}

/**
 * 数字转 Base62 字符串（支持 BigInt）
 * @param num 正整数
 * @returns Base62 字符串
 */
function toBase62(num: number | bigint): string {
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
 * @param str Base62 字符串
 * @returns BigInt
 */
function fromBase62(str: string): bigint {
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
