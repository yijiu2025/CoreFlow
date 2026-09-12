/**
 * 设备 ID 前后端一致性测试
 *
 * 前端（packages/shared-device/src/base62-timestamp.js）与后端
 * （src/framework/auth/device-id-service.js）各自实现了同一套
 * 时间戳混淆 + Base62 编码算法，历史上因长度常量漂移导致过
 * "所有 ID 校验失败 → 每请求重生 → 验证死循环"的故障（81350f1）。
 *
 * 本测试断言：前端编码的产出必须通过后端校验、且两端解码一致，
 * 任一端单方面修改算法/魔数/OFFSET/长度常量都会在此失败。
 *
 * @author yijiu2025
 * @since 2026-09-03
 */

import { describe, test, expect } from '@jest/globals';
import { randomInt } from 'node:crypto';
import {
  encodeTimestamp as feEncode,
  decodeTimestamp as feDecode,
  ENCODED_TS_LENGTH as FE_TS_LEN
} from '../../../../packages/shared-device/src/base62-timestamp.js';
import { validateDeviceId, parseDeviceId } from '../../../framework/auth/device-id-service.js';

describe('设备 ID 前后端一致性', () => {
  test('前端编码的时间戳段通过后端 validateDeviceId 校验', async () => {
    // 取一批有代表性的时间戳（device_id 永久有效，仅未来时间被拒，
    // 故此处全部为过去/当前时间，用于编码一致性验证）
    const day = 24 * 60 * 60 * 1000;
    const samples = [
      Date.now() - 365 * day - day, // 超 1 年的老 ID（永久有效，应放行）
      Date.now() - 180 * day, // 半年前
      Date.now(),
      Date.now() - 1000 // 刚刚
    ];

    for (const ts of samples) {
      const encoded = feEncode(ts);
      const deviceId = `WEB-${encoded}-Ab3dE9`;

      expect(encoded.length).toBe(FE_TS_LEN);

      const result = await validateDeviceId(deviceId);
      expect(result.valid).toBe(true);
      expect(result.createdAt.getTime()).toBe(ts);
    }
  });

  test('前后端解码结果一致', () => {
    for (let i = 0; i < 20; i++) {
      const ts = 1704067200000 + randomInt(0, 100_000_000_000);
      const encoded = feEncode(ts);

      const fe = feDecode(encoded);
      const be = parseDeviceId(`WEB-${encoded}-Ab3dE9`);

      expect(fe).toBe(ts);
      expect(be).not.toBeNull();
      expect(be.timestamp).toBe(ts);
    }
  });

  test('时间戳段长度常量两端一致（11 字符）', async () => {
    // 长度漂移是 81350f1 故障的根源，单独断言兜底
    const encoded = feEncode(Date.now() - 60 * 1000);

    expect(encoded.length).toBe(FE_TS_LEN);
    expect(FE_TS_LEN).toBe(11);

    const result = await validateDeviceId(`WEB-${encoded}-Ab3dE9`);
    expect(result.valid).toBe(true);
  });

  test('超 365 天的老 ID 仍放行（device_id 永久有效，非凭证，过期重生反致指纹突变）', async () => {
    const tooOld = 1704067200000; // 2024-01-01，早于当前 365 天
    const encoded = feEncode(tooOld);
    const deviceId = `WEB-${encoded}-Ab3dE9`;

    // device_id 永久有效——非安全凭证，过期重生会导致 device_id 变化 → 指纹突变 → 风控误报
    const result = await validateDeviceId(deviceId);
    expect(result.valid).toBe(true);
  });
});
