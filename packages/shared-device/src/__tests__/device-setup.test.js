/**
 * 一站式接入模块测试（device-setup）
 *
 * stub axios 实例捕获注册的拦截器回调，验证：请求头注入、指纹开关、
 * 响应同步、initDeviceSync 透传、dispose eject、入参防御。
 *
 * @author yijiu2025
 * @since 2026-09-05
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { setupDeviceSync, getDeviceHeaders } from '../device-setup.js';
import { __resetDeviceSyncForTest } from '../device-sync.js';
import { __resetStorageForTest } from '../storage.js';
import { __resetFingerprintForTest } from '../device-fingerprint.js';
import { invalidateCachedDeviceId } from '../device-id.js';
import { encodeTimestamp } from '../base62-timestamp.js';

/** 构造可捕获拦截器的 axios 实例 stub */
function createAxiosStub() {
  const requestInterceptors = [];
  const responseInterceptors = [];
  let nextId = 1;
  return {
    requestInterceptors,
    responseInterceptors,
    interceptors: {
      request: {
        use: jest.fn(handler => {
          const id = nextId++;
          requestInterceptors.push({ id, handler });
          return id;
        }),
        eject: jest.fn(id => {
          const idx = requestInterceptors.findIndex(i => i.id === id);
          if (idx !== -1) requestInterceptors.splice(idx, 1);
        })
      },
      response: {
        use: jest.fn(handler => {
          const id = nextId++;
          responseInterceptors.push({ id, handler });
          return id;
        }),
        eject: jest.fn(id => {
          const idx = responseInterceptors.findIndex(i => i.id === id);
          if (idx !== -1) responseInterceptors.splice(idx, 1);
        })
      }
    }
  };
}

/** 安装 window 桩（storage 探测 + storage 监听） */
let originalWindow;

beforeEach(() => {
  __resetStorageForTest();
  __resetDeviceSyncForTest();
  __resetFingerprintForTest();
  invalidateCachedDeviceId();
  originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      map: new Map(),
      getItem(k) {
        return this.map.has(k) ? this.map.get(k) : null;
      },
      setItem(k, v) {
        this.map.set(k, String(v));
      },
      removeItem(k) {
        this.map.delete(k);
      }
    },
    addEventListener: () => {},
    deviceSync: undefined
  };
});

afterEach(() => {
  globalThis.window = originalWindow;
});

describe('setupDeviceSync 一站式接入', () => {
  test('注册请求 + 响应两个拦截器，返回 dispose 函数', () => {
    const stub = createAxiosStub();
    const dispose = setupDeviceSync(stub);

    expect(stub.interceptors.request.use).toHaveBeenCalledTimes(1);
    expect(stub.interceptors.response.use).toHaveBeenCalledTimes(1);
    expect(typeof dispose).toBe('function');
  });

  test('请求拦截器注入 x-device-id 头（首次生成设备 ID）', async () => {
    const stub = createAxiosStub();
    setupDeviceSync(stub);

    const handler = stub.requestInterceptors[0].handler;
    const config = await handler({ headers: {} });

    expect(config.headers['x-device-id']).toMatch(/^WEB-[0-9A-Za-z]{11}-[0-9A-Za-z]{6}$/);
  });

  test('环境默认（node 无 document）不注入指纹头', async () => {
    const stub = createAxiosStub();
    setupDeviceSync(stub);

    const config = await stub.requestInterceptors[0].handler({ headers: {} });
    expect(config.headers['x-device-fp']).toBeUndefined();
  });

  test('options.fingerprint: true 强制注入指纹头（stub canvas 采集）', async () => {
    globalThis.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        toDataURL: () => 'data:image/png;base64,stub',
        getContext: type => {
          if (type === '2d') {
            return {
              textBaseline: '',
              font: '',
              fillStyle: '',
              fillRect: () => {},
              fillText: () => {}
            };
          }
          return null;
        }
      }),
      querySelector: () => null
    };

    try {
      const stub = createAxiosStub();
      setupDeviceSync(stub, { fingerprint: true });

      const config = await stub.requestInterceptors[0].handler({ headers: {} });
      expect(config.headers['x-device-fp']).toMatch(/^[0-9a-f]{32}$/);
    } finally {
      delete globalThis.document;
    }
  });

  test('options.fingerprint: false 强制关闭（即使环境判定为真也不注入）', async () => {
    globalThis.document = { querySelector: () => ({ getAttribute: () => 'true' }) };
    try {
      const stub = createAxiosStub();
      setupDeviceSync(stub, { fingerprint: false });

      const config = await stub.requestInterceptors[0].handler({ headers: {} });
      expect(config.headers['x-device-fp']).toBeUndefined();
    } finally {
      delete globalThis.document;
    }
  });

  test('响应拦截器执行设备同步（服务端下发新 ID 回写并立即生效）', async () => {
    const stub = createAxiosStub();
    setupDeviceSync(stub);

    // 先触发本地 ID 进入内存缓存
    const localConfig = await stub.requestInterceptors[0].handler({ headers: {} });
    const localId = localConfig.headers['x-device-id'];

    // 服务端下发不同的合法新 ID
    const serverId = `WEB-${encodeTimestamp(Date.now() - 60 * 1000)}-Zz9Yx8`;
    await stub.responseInterceptors[0].handler({ headers: { 'x-device-id': serverId } });

    // 下一个请求立即携带统一 ID（缓存失效回归）
    const nextConfig = await stub.requestInterceptors[0].handler({ headers: {} });
    expect(nextConfig.headers['x-device-id']).toBe(serverId);
    expect(localId).not.toBe(serverId);
  });

  test('options.onDeviceIdChange 透传给 initDeviceSync（ID 变更时回调）', async () => {
    const stub = createAxiosStub();
    const changes = [];
    setupDeviceSync(stub, { onDeviceIdChange: (o, n) => changes.push([o, n]) });

    const first = (await stub.requestInterceptors[0].handler({ headers: {} })).headers['x-device-id'];
    const second = `WEB-${encodeTimestamp(Date.now() - 30 * 1000)}-Ab3dE9`;
    await stub.responseInterceptors[0].handler({ headers: { 'x-device-id': second } });

    expect(changes).toContainEqual([first, second]);
  });

  test('dispose 后拦截器被 eject（不再注入）', () => {
    const stub = createAxiosStub();
    const dispose = setupDeviceSync(stub);
    expect(stub.requestInterceptors).toHaveLength(1);

    dispose();
    expect(stub.requestInterceptors).toHaveLength(0);
    expect(stub.responseInterceptors).toHaveLength(0);
  });

  test('重复 setup 不重复注册 storage 监听（initDeviceSync 幂等）', () => {
    const listeners = [];
    globalThis.window.addEventListener = (type, handler) => listeners.push({ type, handler });

    const stubA = createAxiosStub();
    const stubB = createAxiosStub();
    setupDeviceSync(stubA);
    setupDeviceSync(stubB);

    expect(listeners.filter(l => l.type === 'storage')).toHaveLength(1);
  });

  test('非法入参（无 interceptors）抛 TypeError', () => {
    expect(() => setupDeviceSync({})).toThrow(TypeError);
    expect(() => setupDeviceSync(null)).toThrow(TypeError);
  });
});

describe('getDeviceHeaders 显式带头', () => {
  test('返回包含 x-device-id 的头对象（首次生成并持久化）', () => {
    const headers = getDeviceHeaders();
    expect(headers['x-device-id']).toMatch(/^WEB-[0-9A-Za-z]{11}-[0-9A-Za-z]{6}$/);
    // 二次调用返回同一 ID（内存缓存）
    expect(getDeviceHeaders()['x-device-id']).toBe(headers['x-device-id']);
  });
});
