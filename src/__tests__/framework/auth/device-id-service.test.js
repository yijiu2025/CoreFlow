/**
 * 设备 ID 服务测试
 *
 * 测试后端设备 ID 验证、规范化和安全校验
 *
 * @author yijiu2025
 * @since 2026-09-01
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
  validateDeviceId,
  verifyAndNormalizeDeviceId,
  generateServerSideDeviceId,
  parseDeviceId
} from '../../../src/framework/auth/device-id-service.js';

describe('设备 ID 服务测试', () => {
  const validUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

  test('验证有效的设备 ID', async () => {
    const validId = 'WEB-a3K7mP9q-8s4T';
    const result = await validateDeviceId(validId);

    expect(result.valid).toBe(true);
    expect(result.normalizedId).toBe(validId);
    expect(result.platform).toBe('WEB');
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.ageDays).toBeGreaterThanOrEqual(0);
  });

  test('拒绝格式错误的设备 ID', async () => {
    const invalidIds = [
      'invalid-format',
      'WEB-12345',
      'INVALID-a3K7mP9q-8s4T',
      'WEB-a3K7mP9q', // 缺少随机后缀
      'WEB-a3K7mP9q-8s4T-extra' // 过多部分
    ];

    for (const invalidId of invalidIds) {
      const result = await validateDeviceId(invalidId);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    }
  });

  test('拒绝非法字符', async () => {
    const invalidIds = [
      'WEB-a3K7mP$#-8s4T',
      'WEB-a3K7mP9q-8s4@',
      'WEB-@#$%^&*-8s4T'
    ];

    for (const invalidId of invalidIds) {
      const result = await validateDeviceId(invalidId);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('非法字符');
    }
  });

  test('拒绝错误长度的部分', async () => {
    const invalidIds = [
      'WEB-a3K7mP9q-8s4', // 随机后缀太短
      'WEB-a3K7mP9-8s4T5', // 时间戳太短，随机后缀太长
      'WEB-a3K7mP9q8-8s4T' // 时间戳太长
    ];

    for (const invalidId of invalidIds) {
      const result = await validateDeviceId(invalidId);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('长度错误');
    }
  });

  test('服务端生成有效设备 ID', () => {
    const deviceId = generateServerSideDeviceId(validUserAgent);

    const parts = deviceId.split('-');
    expect(parts.length).toBe(3);

    const [platform, encodedTs, randomSuffix] = parts;

    // 平台应该是 WEB（基于 User-Agent）
    expect(['WEB', 'IOS', 'ANDROID']).toContain(platform);

    // 长度检查
    expect(encodedTs.length).toBe(8);
    expect(randomSuffix.length).toBe(6);
  });

  test('验证并规范化设备 ID - 有效 ID', async () => {
    const validId = 'WEB-a3K7mP9q-8s4T';
    const result = await verifyAndNormalizeDeviceId(validId, validUserAgent);

    expect(result.valid).toBe(true);
    expect(result.shouldReplace).toBe(false);
    expect(result.normalizedId).toBe(validId);
  });

  test('验证并规范化设备 ID - 无效 ID 生成新 ID', async () => {
    const invalidId = 'invalid-format';
    const result = await verifyAndNormalizeDeviceId(invalidId, validUserAgent);

    expect(result.valid).toBe(true);
    expect(result.shouldReplace).toBe(true);
    expect(result.originalError).toBeDefined();
    expect(result.normalizedId).not.toBe(invalidId);

    // 验证新生成的 ID 格式正确
    const parts = result.normalizedId.split('-');
    expect(parts.length).toBe(3);
  });

  test('解析设备 ID 信息', () => {
    const deviceId = generateServerSideDeviceId(validUserAgent);
    const info = parseDeviceId(deviceId);

    expect(info).not.toBeNull();
    expect(info).toHaveProperty('platform');
    expect(info).toHaveProperty('timestamp');
    expect(info).toHaveProperty('createdAt');
    expect(info).toHaveProperty('age');

    // 验证时间戳合理性
    const now = Date.now();
    expect(info!.timestamp).toBeLessThanOrEqual(now);
    expect(info!.timestamp).toBeGreaterThan(now - 60000); // 1 分钟内
  });

  test('检测设备平台正确', () => {
    const testCases = [
      {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        expected: 'IOS'
      },
      {
        userAgent: 'Mozilla/5.0 (Linux; Android 10)',
        expected: 'ANDROID'
      },
      {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        expected: 'WEB'
      },
      {
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)',
        expected: 'IOS'
      }
    ];

    for (const { userAgent, expected } of testCases) {
      const deviceId = generateServerSideDeviceId(userAgent);
      const platform = deviceId.split('-')[0];
      expect(platform).toBe(expected);
    }
  });

  test('设备 ID 唯一性', () => {
    const ids = new Set();
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      const deviceId = generateServerSideDeviceId(validUserAgent);
      ids.add(deviceId);
    }

    // 100 次生成应该都是唯一的
    expect(ids.size).toBe(iterations);
  });

  test('不同平台生成不同的 ID 前缀', () => {
    const webId = generateServerSideDeviceId('Mozilla/5.0 (Windows NT 10.0)');
    const iosId = generateServerSideDeviceId('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)');
    const androidId = generateServerSideDeviceId('Mozilla/5.0 (Linux; Android 10)');

    expect(webId.split('-')[0]).toBe('WEB');
    expect(iosId.split('-')[0]).toBe('IOS');
    expect(androidId.split('-')[0]).toBe('ANDROID');
  });
});