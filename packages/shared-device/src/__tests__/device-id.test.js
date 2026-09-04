/**
 * 稳定设备 ID 单元测试
 *
 * 覆盖：生成/持久化/复用、存量 ID 自查（格式/过期/未来时间）、
 * 校验与后端规则对齐、平台检测、缓存失效、隐私模式降级、随机后缀质量。
 *
 * @author yijiu2025
 * @since 2026-09-04
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { encodeTimestamp } from '../base62-timestamp.js';
import {
  getStableDeviceId,
  invalidateCachedDeviceId,
  validateDeviceIdFormat,
  parseDeviceId,
  getPlatform,
  STORAGE_KEY
} from '../device-id.js';
import { __resetStorageForTest } from '../storage.js';

/** Map 后端的 localStorage 桩（可注入故障） */
function createLocalStorageStub({ throwOnWrite = false } = {}) {
  const map = new Map();
  return {
    map,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      if (throwOnWrite) throw new Error('quota');
      map.set(key, String(value));
    },
    removeItem: key => map.delete(key)
  };
}

/** 安装/卸载全局 window 与 navigator 桩 */
let originalWindow;
let originalNavigator;

function installBrowserStubs({ localStorageStub, userAgent }) {
  originalWindow = globalThis.window;
  originalNavigator = globalThis.navigator;
  globalThis.window = { localStorage: localStorageStub };
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent },
    configurable: true
  });
}

function restoreBrowserStubs() {
  globalThis.window = originalWindow;
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator,
    configurable: true,
    writable: originalNavigator !== undefined
  });
}

/** 生成一个合法的结构化设备 ID（可指定时间戳偏移天数，正数为未来） */
function makeValidId({ ageDays = 0 } = {}) {
  const ts = Date.now() - ageDays * 24 * 60 * 60 * 1000;
  return `WEB-${encodeTimestamp(ts)}-Ab3dE9`;
}

beforeEach(() => {
  __resetStorageForTest();
  invalidateCachedDeviceId();
});

afterEach(() => {
  restoreBrowserStubs();
});

describe('设备 ID 生成与持久化', () => {
  test('首次生成结构化 ID：WEB-{11位}-{6位Base62}', () => {
    installBrowserStubs({ localStorageStub: createLocalStorageStub(), userAgent: 'Mozilla Chrome' });

    const id = getStableDeviceId();
    expect(id).toMatch(/^WEB-[0-9A-Za-z]{11}-[0-9A-Za-z]{6}$/);
  });

  test('同一会话内重复获取返回同一 ID（内存缓存）', () => {
    installBrowserStubs({ localStorageStub: createLocalStorageStub(), userAgent: 'Mozilla Chrome' });

    const a = getStableDeviceId();
    const b = getStableDeviceId();
    expect(b).toBe(a);
  });

  test('ID 持久化到 localStorage，跨"页面"（缓存失效后）复用', () => {
    installBrowserStubs({ localStorageStub: createLocalStorageStub(), userAgent: 'Mozilla Chrome' });

    const a = getStableDeviceId();
    invalidateCachedDeviceId();
    expect(getStableDeviceId()).toBe(a);
  });

  test('随机后缀落在 Base62 字符集内（批量分布抽查）', () => {
    installBrowserStubs({ localStorageStub: createLocalStorageStub(), userAgent: 'Mozilla Chrome' });

    const ids = new Set();
    for (let i = 0; i < 20; i++) {
      invalidateCachedDeviceId();
      globalThis.window.localStorage.map.delete(STORAGE_KEY);
      const id = getStableDeviceId();
      ids.add(id);
      expect(id.slice(-6)).toMatch(/^[0-9A-Za-z]{6}$/);
    }
    expect(ids.size).toBe(20);
  });
});

describe('存量 ID 自查（与后端 validateDeviceId 规则对齐）', () => {
  test('老格式 UUID 等非法存量值被清除重生', () => {
    const stub = createLocalStorageStub();
    stub.map.set(STORAGE_KEY, '550e8400-e29b-41d4-a716-446655440000');
    installBrowserStubs({ localStorageStub: stub, userAgent: 'Mozilla Chrome' });

    const id = getStableDeviceId();
    expect(id).toMatch(/^WEB-/);
    expect(id).not.toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(stub.map.get(STORAGE_KEY)).toBe(id);
  });

  test('超有效期（>365 天）的存量 ID 被重生', () => {
    const stub = createLocalStorageStub();
    const expiredId = makeValidId({ ageDays: 400 });
    stub.map.set(STORAGE_KEY, expiredId);
    installBrowserStubs({ localStorageStub: stub, userAgent: 'Mozilla Chrome' });

    const id = getStableDeviceId();
    expect(id).not.toBe(expiredId); // 已重生
    expect(stub.map.get(STORAGE_KEY)).toBe(id); // 新 ID 已写回
  });

  test('未来时间戳的存量 ID 被重生（后端会拒绝，本地必须先行拦截）', () => {
    const stub = createLocalStorageStub();
    stub.map.set(STORAGE_KEY, makeValidId({ ageDays: -30 })); // 30 天后的未来时间
    installBrowserStubs({ localStorageStub: stub, userAgent: 'Mozilla Chrome' });

    getStableDeviceId();
    expect(validateDeviceIdFormat(stub.map.get(STORAGE_KEY)).valid).toBe(true);
  });
});

describe('validateDeviceIdFormat 校验规则', () => {
  test('合法 ID 通过', () => {
    expect(validateDeviceIdFormat(makeValidId({ ageDays: 100 }))).toEqual({ valid: true });
  });

  const invalidCases = [
    ['空值', '', /空值/],
    ['段数错误', 'WEB-abc', /格式错误/],
    ['平台非法', `FOO-${encodeTimestamp(Date.now())}-Ab3dE9`, /无效平台/],
    ['时间戳段长度错误', `WEB-${encodeTimestamp(Date.now()).slice(1)}-Ab3dE9`, /时间戳长度错误/],
    ['后缀长度错误', `WEB-${encodeTimestamp(Date.now())}-Ab3dE`, /随机后缀长度错误/],
    ['含非法字符', `WEB-${encodeTimestamp(Date.now())}-Ab3dE+`, /非法字符/],
    ['未来时间', makeValidId({ ageDays: -1 }), /未来时间/],
    ['超有效期', makeValidId({ ageDays: 366 }), /过期/],
    ['超长输入', `WEB-${encodeTimestamp(Date.now())}-Ab3dE9${'x'.repeat(100)}`, /超长/]
  ];

  test.each(invalidCases)('拒绝：%s', (_name, input, reasonPattern) => {
    const result = validateDeviceIdFormat(input);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(reasonPattern);
  });

  test('未来时间在时钟偏差容差（±5 分钟）内放行（与后端同规则）', () => {
    const nearFuture = `WEB-${encodeTimestamp(Date.now() + 2 * 60 * 1000)}-Ab3dE9`;
    expect(validateDeviceIdFormat(nearFuture)).toEqual({ valid: true });
  });

  test('未来时间超过容差（5 分钟）被拒绝', () => {
    const farFuture = `WEB-${encodeTimestamp(Date.now() + 6 * 60 * 1000)}-Ab3dE9`;
    const result = validateDeviceIdFormat(farFuture);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/未来时间/);
  });
});

describe('parseDeviceId 宽松解析', () => {
  test('解析出平台/时间戳/年龄', () => {
    installBrowserStubs({ localStorageStub: createLocalStorageStub(), userAgent: 'Mozilla Chrome' });

    const ts = Date.now() - 10 * 24 * 60 * 60 * 1000;
    const info = parseDeviceId(`IOS-${encodeTimestamp(ts)}-Ab3dE9`);
    expect(info.platform).toBe('IOS');
    expect(info.timestamp).toBe(ts);
    expect(info.age).toBeGreaterThanOrEqual(9);
    expect(info.createdAt).toBeInstanceOf(Date);
  });

  test('非法输入返回 null 而不抛异常', () => {
    expect(parseDeviceId('not-an-id')).toBeNull();
    expect(parseDeviceId('WEB-!!!illegal!!-Ab3dE9')).toBeNull();
  });
});

describe('平台检测（与后端 detectPlatform 同规则）', () => {
  test.each([
    ['IOS', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'],
    ['IOS', 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)'],
    ['ANDROID', 'Mozilla/5.0 (Linux; Android 14; Pixel 8)'],
    ['WEB', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0']
  ])('%s UA 识别', (expected, ua) => {
    installBrowserStubs({ localStorageStub: createLocalStorageStub(), userAgent: ua });
    expect(getPlatform()).toBe(expected);
  });

  test('无 navigator 环境默认 WEB（不抛异常）', () => {
    originalWindow = undefined;
    originalNavigator = globalThis.navigator;
    globalThis.window = undefined;
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      configurable: true
    });
    expect(getPlatform()).toBe('WEB');
  });
});

describe('隐私模式降级', () => {
  test('localStorage 写入抛错时仍能产出会话内稳定 ID', () => {
    installBrowserStubs({
      localStorageStub: createLocalStorageStub({ throwOnWrite: true }),
      userAgent: 'Mozilla Chrome'
    });

    const a = getStableDeviceId();
    const b = getStableDeviceId();
    expect(a).toMatch(/^WEB-[0-9A-Za-z]{11}-[0-9A-Za-z]{6}$/);
    expect(b).toBe(a);
  });
});

describe('缓存失效出口', () => {
  test('invalidateCachedDeviceId 后重新读存储', () => {
    const stub = createLocalStorageStub();
    installBrowserStubs({ localStorageStub: stub, userAgent: 'Mozilla Chrome' });

    const first = getStableDeviceId();
    // 模拟另一来源写入新 ID
    const second = makeValidId({ ageDays: 1 });
    stub.map.set(STORAGE_KEY, second);

    expect(getStableDeviceId()).toBe(first); // 缓存仍生效
    invalidateCachedDeviceId();
    expect(getStableDeviceId()).toBe(second); // 失效后读新值
  });
});
