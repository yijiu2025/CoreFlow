/**
 * 设备识别模块测试（device.js）
 *
 * 重点覆盖 cookie 兜底恢复：localStorage 被清（手动清除 / Safari ITP 7 天清除）
 * 时前端会立即生成"刚出生"的新 ID 且请求头优先于 cookie，若不恢复，
 * httpOnly cookie 里的旧设备身份将永久丢失（Safari 用户最多每 7 天换一次身份）。
 *
 * @author yijiu2025
 * @since 2026-09-05
 */

import { describe, test, expect } from '@jest/globals';
import { getDeviceId } from '../../../framework/auth/device.js';
import { generateServerSideDeviceId } from '../../../framework/auth/device-id-service.js';
import { encodeTimestamp as feEncode } from '../../../../packages/shared-device/src/base62-timestamp.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const DAY = 24 * 60 * 60 * 1000;

/** 生成合法结构化 ID，ageMs 为距今年龄（负数为未来） */
function makeId(ageMs = 0) {
  return `WEB-${feEncode(Date.now() - ageMs)}-Ab3dE9`;
}

/** 构造 mock request */
function mockRequest({ header, cookie } = {}) {
  return {
    headers: { 'user-agent': UA, ...(header ? { 'x-device-id': header } : {}) },
    cookies: cookie ? { device_id: cookie } : {}
  };
}

describe('getDeviceId：cookie 兜底恢复', () => {
  test('header 刚出生（<10s）+ cookie 存有合法不同 ID → 恢复 cookie 身份', async () => {
    const freshId = makeId(); // 模拟 localStorage 被清后前端刚生成
    const cookieId = makeId(100 * DAY); // 100 天前登录时服务端写入的旧身份

    const deviceId = await getDeviceId(mockRequest({ header: freshId, cookie: cookieId }));
    expect(deviceId).toBe(cookieId);
  });

  test('header 不可解析（老格式 UUID）+ cookie 合法 → 恢复 cookie 身份', async () => {
    const legacyUuid = '550e8400-e29b-41d4-a716-446655440000';
    const cookieId = makeId(50 * DAY);

    const deviceId = await getDeviceId(mockRequest({ header: legacyUuid, cookie: cookieId }));
    expect(deviceId).toBe(cookieId);
  });

  test('header 较旧（>10s，正常复用中）→ 不触发恢复，采用 header', async () => {
    const stableId = makeId(60 * 1000); // 60 秒前生成，正常持久复用中
    const cookieId = makeId(100 * DAY);

    const deviceId = await getDeviceId(mockRequest({ header: stableId, cookie: cookieId }));
    expect(deviceId).toBe(stableId);
  });

  test('header 刚出生但无 cookie（新设备）→ 采用 header', async () => {
    const freshId = makeId();

    const deviceId = await getDeviceId(mockRequest({ header: freshId }));
    expect(deviceId).toBe(freshId);
  });

  test('header 刚出生但 cookie 已过期（>365 天）→ 不恢复，采用 header', async () => {
    const freshId = makeId();
    const expiredCookie = makeId(400 * DAY);

    const deviceId = await getDeviceId(mockRequest({ header: freshId, cookie: expiredCookie }));
    expect(deviceId).toBe(freshId);
  });

  test('header 与 cookie 一致（正常状态）→ 直接采用，不触发恢复', async () => {
    const sameId = makeId(30 * DAY);

    const deviceId = await getDeviceId(mockRequest({ header: sameId, cookie: sameId }));
    expect(deviceId).toBe(sameId);
  });

  test('无 header 无 cookie（旧客户端兜底）→ 服务端生成', async () => {
    const deviceId = await getDeviceId(mockRequest({}));
    expect(deviceId).toMatch(/^(WEB|IOS|ANDROID)-[0-9A-Za-z]{11}-[0-9A-Za-z]{6}$/);
  });

  test('恢复路径产出的 ID 与服务端生成器格式一致（防回归）', async () => {
    const cookieId = generateServerSideDeviceId(UA);
    const freshId = makeId();

    const deviceId = await getDeviceId(mockRequest({ header: freshId, cookie: cookieId }));
    expect(deviceId).toBe(cookieId);
  });
});
