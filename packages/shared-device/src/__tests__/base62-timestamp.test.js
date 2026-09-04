/**
 * Base62 时间戳编解码单元测试
 *
 * 前后端算法一致性由 src/__tests__/framework/auth/device-id-parity.test.js
 * 守护，本文件覆盖编解码自身的边界行为（往返、非法输入、长度常量）。
 *
 * @author yijiu2025
 * @since 2026-09-04
 */

import { describe, test, expect } from '@jest/globals';
import {
  BASE62_CHARS,
  ENCODED_TS_LENGTH,
  TS_OFFSET,
  TS_MAGIC,
  toBase62,
  fromBase62,
  encodeTimestamp,
  decodeTimestamp
} from '../base62-timestamp.js';

describe('Base62 基础编解码', () => {
  test('字符表为 62 个不重复字符（0-9A-Za-z）', () => {
    expect(BASE62_CHARS).toHaveLength(62);
    expect(new Set(BASE62_CHARS).size).toBe(62);
    expect(BASE62_CHARS).toMatch(/^[0-9A-Za-z]+$/);
  });

  test('toBase62(0) 返回 "0"', () => {
    expect(toBase62(0)).toBe('0');
    expect(toBase62(0n)).toBe('0');
  });

  test('toBase62/fromBase62 往返一致', () => {
    for (let i = 0; i < 50; i++) {
      const n = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
      expect(fromBase62(toBase62(n))).toBe(n);
    }
  });

  test('fromBase62 拒绝非法字符', () => {
    expect(() => fromBase62('abc-xyz')).toThrow(/Invalid Base62/);
    expect(() => fromBase62('你好')).toThrow(/Invalid Base62/);
  });
});

describe('时间戳混淆编解码', () => {
  test('编码产出固定 11 字符（长度漂移是 81350f1 故障根源，单独兜底）', () => {
    const samples = [Date.now(), TS_OFFSET + 1n, 1704067200000, 4102444800000];
    for (const ts of samples) {
      expect(encodeTimestamp(ts)).toHaveLength(ENCODED_TS_LENGTH);
      expect(ENCODED_TS_LENGTH).toBe(11);
    }
  });

  test('编解码往返一致（覆盖偏移前后时间戳）', () => {
    const samples = [
      Date.now(),
      Date.now() - 365 * 24 * 60 * 60 * 1000,
      Date.now() - 60 * 1000,
      Number(TS_OFFSET) // 偏移起点，adjusted = 0
    ];
    for (const ts of samples) {
      expect(decodeTimestamp(encodeTimestamp(ts))).toBe(ts);
    }
  });

  test('偏移起点编码后混淆值不等于原始值（确认混淆生效）', () => {
    // adjusted=0 时 XOR 魔数仍改变结果，且编码后必为 11 字符
    const encoded = encodeTimestamp(Number(TS_OFFSET));
    expect(encoded).not.toBe(toBase62(0n).padStart(ENCODED_TS_LENGTH, '0'));
    expect(TS_MAGIC).toBe(0x9e3779b97f4a7c15n);
  });

  test('解码非法 Base62 抛错', () => {
    expect(() => decodeTimestamp('!!!illegal!')).toThrow(/Invalid Base62/);
  });

  test('相邻毫秒编码不同（时间维度无碰撞）', () => {
    const now = Date.now();
    expect(encodeTimestamp(now)).not.toBe(encodeTimestamp(now + 1));
  });
});
