/**
 * 设备 ID 生成和验证测试
 *
 * 测试前端结构化设备 ID 的生成、解析和唯一性
 *
 * @author yijiu2025
 * @since 2026-09-01
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { generateStructuredDeviceId, parseDeviceId } from '../../src/utils/device-id';

describe('设备 ID 生成和验证', () => {
  beforeEach(() => {
    // 清空 localStorage
    localStorage.removeItem('cf_device_id');
  });

  test('生成结构化设备 ID 格式正确', () => {
    const deviceId = generateStructuredDeviceId();

    // 格式：PLATFORM-ENCODED_TS-RANDOM_SUFFIX
    const parts = deviceId.split('-');
    expect(parts.length).toBe(3);

    const [platform, encodedTs, randomSuffix] = parts;

    // 平台检查
    expect(['WEB', 'IOS', 'ANDROID']).toContain(platform);

    // 长度检查
    expect(encodedTs.length).toBe(8);
    expect(randomSuffix.length).toBe(6);

    // Base62 字符检查
    const base62Pattern = /^[0-9A-Za-z]+$/;
    expect(base62Pattern.test(encodedTs)).toBe(true);
    expect(base62Pattern.test(randomSuffix)).toBe(true);
  });

  test('生成设备 ID 唯一性', () => {
    const ids = new Set();
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      const deviceId = generateStructuredDeviceId();
      ids.add(deviceId);
    }

    // 100 次生成应该都是唯一的
    expect(ids.size).toBe(iterations);
  });

  test('解析设备 ID 信息正确', () => {
    const deviceId = generateStructuredDeviceId();
    const info = parseDeviceId(deviceId);

    expect(info).not.toBeNull();
    expect(info).toHaveProperty('platform');
    expect(info).toHaveProperty('timestamp');
    expect(info).toHaveProperty('createdAt');
    expect(info).toHaveProperty('age');

    // 平台应在有效范围内
    expect(['WEB', 'IOS', 'ANDROID']).toContain(info!.platform);

    // 时间戳应该是合理的（过去 1 年内）
    const now = Date.now();
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
    expect(info!.timestamp).toBeLessThanOrEqual(now);
    expect(info!.timestamp).toBeGreaterThan(oneYearAgo);

    // 创建时间应该是有效的 Date 对象
    expect(info!.createdAt).toBeInstanceOf(Date);
    expect(info!.createdAt.getTime()).toBe(info!.timestamp);

    // 年龄应该是非负数
    expect(info!.age).toBeGreaterThanOrEqual(0);
  });

  test('时间戳加密和解码正确', () => {
    const originalTimestamp = Date.now();
    const deviceId = generateStructuredDeviceId();

    const info = parseDeviceId(deviceId);

    // 解码的时间戳应该在合理范围内（1 秒内）
    const timeDiff = Math.abs(info!.timestamp - originalTimestamp);
    expect(timeDiff).toBeLessThan(1000);
  });

  test('设备 ID 可在 localStorage 持久化', () => {
    const deviceId = generateStructuredDeviceId();

    // 写入 localStorage
    localStorage.setItem('cf_device_id', deviceId);

    // 读取并验证
    const storedId = localStorage.getItem('cf_device_id');
    expect(storedId).toBe(deviceId);

    // 清理
    localStorage.removeItem('cf_device_id');
  });

  test('无效设备 ID 解析返回 null', () => {
    const invalidIds = [
      'invalid-format',
      '',
      'WEB-12345',
      'INVALID-a3K7mP9q-8s4T'
    ];

    for (const invalidId of invalidIds) {
      const info = parseDeviceId(invalidId);
      expect(info).toBeNull();
    }
  });

  test('设备 ID 在不同浏览器中格式一致', () => {
    // 测试多次生成格式一致性
    const ids = [];
    for (let i = 0; i < 10; i++) {
      const deviceId = generateStructuredDeviceId();
      ids.push(deviceId);

      // 验证每个 ID 的格式
      const parts = deviceId.split('-');
      expect(parts.length).toBe(3);
      expect(parts[0].length).toBe(3); // PLATFORM
      expect(parts[1].length).toBe(8); // ENCODED_TS
      expect(parts[2].length).toBe(6); // RANDOM_SUFFIX
    }

    // 检查平台是否一致（相同运行环境）
    const platforms = ids.map(id => id.split('-')[0]);
    const uniquePlatforms = new Set(platforms);
    expect(uniquePlatforms.size).toBe(1); // 同一环境应该是相同平台
  });
});