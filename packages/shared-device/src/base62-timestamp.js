/**
 * Base62 时间戳编解码（前后端共享算法）
 *
 * device-id.ts（浏览器）与 src/framework/auth/device-id-service.js（Node）
 * 的编码算法必须保持一致，本模块是唯一事实来源：
 * - 浏览器侧 device-id.ts 直接 import 复用
 * - Node 侧保持自身实现（不可依赖浏览器包），由 jest 一致性测试
 *   断言两边产出相同（见 src/__tests__/framework/device-id-parity.test.js）
 *
 * 任何一端修改魔数 / OFFSET / 字符表 / 长度常量，测试会立即失败。
 *
 * @author yijiu2025
 * @since 2026-09-03
 */

export const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** 64 位魔数 XOR 后的值约 1.139e19，Base62 编码固定产出 11 字符（padStart 补零不生效） */
export const ENCODED_TS_LENGTH = 11;

/** 2024-01-01 的毫秒时间戳（BigInt），减去后缩短编码长度 */
export const TS_OFFSET = 1704067200000n;

/** 黄金比例 64 位魔数（BigInt），用于时间戳位混淆 */
export const TS_MAGIC = 0x9e3779b97f4a7c15n;

/**
 * 数字转 Base62 字符串（支持 BigInt）
 * @param {number|bigint} num - 正整数
 * @returns {string} Base62 字符串
 */
export function toBase62(num) {
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
 * @throws {Error} 含非法字符时抛出
 */
export function fromBase62(str) {
  let result = 0n;

  for (let i = 0; i < str.length; i++) {
    const value = BASE62_CHARS.indexOf(str[i]);
    if (value === -1) throw new Error(`Invalid Base62 character: ${str[i]}`);

    result = result * 62n + BigInt(value);
  }

  return result;
}

/**
 * 混淆时间戳为 Base62 字符串
 * 算法：时间戳 - OFFSET 缩短 → 64 位魔数 XOR 混淆 → Base62 编码
 * @param {number} timestamp - 毫秒时间戳
 * @returns {string} 11 字符 Base62 编码字符串
 */
export function encodeTimestamp(timestamp) {
  const adjusted = BigInt(timestamp) - TS_OFFSET;
  const obfuscated = adjusted ^ TS_MAGIC;
  const encoded = toBase62(obfuscated);

  return encoded.padStart(ENCODED_TS_LENGTH, '0');
}

/**
 * 解码 Base62 字符串为毫秒时间戳（混淆的逆运算）
 * @param {string} encoded - 11 字符 Base62 编码字符串
 * @returns {number} 毫秒时间戳
 * @throws {Error} 含非法字符时抛出
 */
export function decodeTimestamp(encoded) {
  const obfuscated = fromBase62(encoded);
  const adjusted = obfuscated ^ TS_MAGIC;

  return Number(adjusted + TS_OFFSET);
}
