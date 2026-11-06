/**
 * 会话风险钩子：设备 ID 回写测试（risk-hooks.js）
 *
 * 覆盖曾经的两个"补不回来"缺陷：
 * 1. 只有 device_id cookie 丢失（x-device-id 头还在）→ 旧实现用"头 || cookie"取单一
 *    clientDeviceId，与解析结果相等就跳过回写，cookie 永远补不回来；
 * 2. 只有 x-device-id 头丢失（cookie 还在）→ 同理不回写响应头，而 cookie 是 httpOnly，
 *    前端 localStorage 永远拿不回身份。
 *
 * 现在的契约：两个通道**各自独立**判定与回写。
 *
 * @author yijiu2025
 * @since 2026-11-06
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const DEVICE = 'WEB-DaBOSo0PMOl-xQqRRQ';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const COOKIE_OPTS = { httpOnly: true, path: '/', maxAge: 1 };

const getDeviceId = jest.fn();
const computeDeviceFingerprint = jest.fn(() => 'fp');
const detectSessionRisk = jest.fn(async () => ({ level: 'safe', reasons: [] }));
const isHighRiskRequest = jest.fn(() => false);

jest.unstable_mockModule('../../../framework/auth/session/session.js', () => ({
  getSessionTokenDevice: jest.fn(async () => null)
}));
jest.unstable_mockModule('../../../framework/auth/context/cookie.js', () => ({
  COOKIE_OPTIONS: { DEVICE: COOKIE_OPTS }
}));
jest.unstable_mockModule('../../../framework/auth/device/device.js', () => ({
  getDeviceId,
  computeDeviceFingerprint
}));
jest.unstable_mockModule('../../../framework/auth/risk/anomaly-detector.js', () => ({
  detectSessionRisk,
  isHighRiskRequest
}));

const { detectAndHandleRisk } = await import('../../../framework/auth/risk/risk-hooks.js');

/** 构造 mock request */
function mockRequest({ header, cookie } = {}) {
  return {
    headers: { 'user-agent': UA, ...(header ? { 'x-device-id': header } : {}) },
    cookies: cookie ? { device_id: cookie } : {},
    ip: '127.0.0.1',
    state: {}
  };
}

/** 构造 mock reply，记录回写结果 */
function mockReply() {
  const rewritten = { headers: {}, cookies: {} };
  return {
    rewritten,
    header(name, value) {
      rewritten.headers[name] = value;
      return this;
    },
    setCookie(name, value) {
      rewritten.cookies[name] = value;
      return this;
    },
    code() {
      return this;
    },
    send() {
      return this;
    }
  };
}

const sessionData = {
  userId: 27,
  uid: 'aaea9ecf-a63b-453a-9109-a2bf4851f1c5',
  deviceId: DEVICE,
  userAgent: UA,
  ip: '127.0.0.1',
  sessionId: 'sid-test'
};

beforeEach(() => {
  getDeviceId.mockReset();
  getDeviceId.mockResolvedValue(DEVICE);
  detectSessionRisk.mockClear();
});

describe('detectAndHandleRisk：设备 ID 双通道回写', () => {
  test('两个通道都正常（值一致）→ 不写任何回写头 / cookie', async () => {
    const reply = mockReply();
    await detectAndHandleRisk(mockRequest({ header: DEVICE, cookie: DEVICE }), reply, sessionData);

    expect(reply.rewritten.headers).toEqual({});
    expect(reply.rewritten.cookies).toEqual({});
  });

  test('只有 cookie 丢失（头还在）→ 必须补 Set-Cookie，不回写头', async () => {
    const reply = mockReply();
    await detectAndHandleRisk(mockRequest({ header: DEVICE }), reply, sessionData);

    expect(reply.rewritten.cookies.device_id).toBe(DEVICE);
    expect(reply.rewritten.headers['X-Device-Id']).toBeUndefined();
  });

  test('只有头丢失（cookie 还在）→ 必须回写 X-Device-Id，不重复种 cookie', async () => {
    const reply = mockReply();
    await detectAndHandleRisk(mockRequest({ cookie: DEVICE }), reply, sessionData);

    expect(reply.rewritten.headers['X-Device-Id']).toBe(DEVICE);
    expect(reply.rewritten.headers['X-Device-Id-Updated']).toBe('true');
    expect(reply.rewritten.cookies.device_id).toBeUndefined();
  });

  test('两个通道都丢失 → 头与 cookie 同时回写，且值为登录链恢复出的原 ID', async () => {
    const reply = mockReply();
    await detectAndHandleRisk(mockRequest(), reply, sessionData);

    expect(reply.rewritten.headers['X-Device-Id']).toBe(DEVICE);
    expect(reply.rewritten.headers['X-Device-Id-Updated']).toBe('true');
    expect(reply.rewritten.cookies.device_id).toBe(DEVICE);
  });

  test('cookie 里是失效旧值（与解析结果不同）→ 覆盖成正确值', async () => {
    const reply = mockReply();
    await detectAndHandleRisk(mockRequest({ header: DEVICE, cookie: 'WEB-OLDSTALE0-x1y2z3' }), reply, sessionData);

    expect(reply.rewritten.cookies.device_id).toBe(DEVICE);
    // 头一致，故不回写头
    expect(reply.rewritten.headers['X-Device-Id']).toBeUndefined();
  });
});
