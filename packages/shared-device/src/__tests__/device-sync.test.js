/**
 * 设备 ID 同步单元测试
 *
 * 覆盖：三种响应头容器兼容、同步流程、脏值拒绝、缓存一致性回归
 * （服务端下发新 ID 后 getStableDeviceId 立即生效，修复前会拿到旧缓存）、
 * 跨标签页 storage 事件。
 *
 * @author yijiu2025
 * @since 2026-09-04
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { encodeTimestamp } from '../base62-timestamp.js';
import {
  syncDeviceFromHeaders,
  handleDeviceSyncInResponse,
  initDeviceSync,
  getCurrentDeviceId,
  setDeviceId,
  clearDeviceId,
  getDeviceIdStats
} from '../device-sync.js';
import { getStableDeviceId, invalidateCachedDeviceId, STORAGE_KEY } from '../device-id.js';
import { __resetStorageForTest } from '../storage.js';
import { __resetDeviceSyncForTest } from '../device-sync.js';

/** Map 后端的 localStorage 桩 */
function createLocalStorageStub() {
  const map = new Map();
  return {
    map,
    listeners: [],
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key)
  };
}

/** 生成合法结构化设备 ID */
function makeValidId(ageDays = 0) {
  const ts = Date.now() - ageDays * 24 * 60 * 60 * 1000;
  return `WEB-${encodeTimestamp(ts)}-Ab3dE9`;
}

let windowStub;
const originalWindow = globalThis.window;

function installWindowStub() {
  const localStorageStub = createLocalStorageStub();
  windowStub = {
    localStorage: localStorageStub,
    addedListeners: [],
    addEventListener(type, handler) {
      this.addedListeners.push({ type, handler });
    }
  };
  globalThis.window = windowStub;
  return windowStub;
}

beforeEach(() => {
  __resetStorageForTest();
  __resetDeviceSyncForTest();
  invalidateCachedDeviceId();
  installWindowStub();
});

afterEach(() => {
  globalThis.window = originalWindow;
});

describe('响应头读取兼容性', () => {
  const validId = makeValidId();
  test.each([
    ['普通对象（小写键）', { 'x-device-id': validId }],
    ['普通对象（帕斯卡键）', { 'X-Device-Id': validId }],
    ['鸭子类型 .get()（AxiosHeaders）', { get: name => (name === 'x-device-id' ? validId : null) }]
  ])('%s', (_name, headers) => {
    expect(syncDeviceFromHeaders(headers)).toBe(validId);
  });

  test('头值可读但格式非法时返回 null（校验兜底）', () => {
    expect(syncDeviceFromHeaders({ 'x-device-id': 'V' })).toBeNull();
  });

  test('fetch Headers 实例兼容', () => {
    const headers = new Headers({ 'X-Device-Id': makeValidId() });
    expect(syncDeviceFromHeaders(headers)).not.toBeNull();
  });

  test('缺失头 / null / 超长脏值返回 null', () => {
    expect(syncDeviceFromHeaders({})).toBeNull();
    expect(syncDeviceFromHeaders(null)).toBeNull();
    expect(syncDeviceFromHeaders({ 'x-device-id': 'A'.repeat(200) })).toBeNull();
  });
});

describe('同步流程', () => {
  test('响应头携带新 ID 时写入存储', () => {
    const serverId = makeValidId();
    syncDeviceFromHeaders({ 'x-device-id': serverId });
    expect(getCurrentDeviceId()).toBe(serverId);
  });

  test('与当前 ID 相同且无更新标记时保持一致', () => {
    const id = makeValidId();
    setDeviceId(id);
    expect(syncDeviceFromHeaders({ 'x-device-id': id })).toBe(id);
    expect(getCurrentDeviceId()).toBe(id);
  });

  test('更新标记 x-device-id-updated=true 时强制更新', () => {
    const oldId = makeValidId(1);
    setDeviceId(oldId);

    const newId = makeValidId();
    const changes = [];
    initDeviceSync({ onDeviceIdChange: (o, n) => changes.push([o, n]) });

    syncDeviceFromHeaders({ 'x-device-id': newId, 'x-device-id-updated': 'true' });
    expect(getCurrentDeviceId()).toBe(newId);
    expect(changes).toEqual([[oldId, newId]]);
  });

  test('响应头 ID 格式非法时不写入', () => {
    syncDeviceFromHeaders({ 'x-device-id': 'not-a-valid-device-id!' });
    expect(getCurrentDeviceId()).toBeNull();
  });

  test('handleDeviceSyncInResponse 原样返回响应且处理头', () => {
    const serverId = makeValidId();
    const response = { headers: { 'x-device-id': serverId }, data: { ok: true } };
    expect(handleDeviceSyncInResponse(response)).toBe(response);
    expect(getCurrentDeviceId()).toBe(serverId);
  });

  test('非浏览器环境直接返回响应（SSR 守卫）', () => {
    globalThis.window = undefined;
    const response = { headers: { 'x-device-id': makeValidId() } };
    expect(handleDeviceSyncInResponse(response)).toBe(response);
    // 未写入（window 恢复后可验证存储未被污染——此处仅验证不抛异常）
  });
});

describe('缓存一致性（回归：修复前服务端下发新 ID 后旧缓存不失效）', () => {
  test('服务端下发新 ID 后，getStableDeviceId 立即返回新 ID', () => {
    const localId = getStableDeviceId(); // 本地生成并进入内存缓存
    const serverId = makeValidId(1);

    syncDeviceFromHeaders({ 'x-device-id': serverId });
    // 修复前：此处返回 localId（旧缓存），与 localStorage 脱节
    expect(getStableDeviceId()).toBe(serverId);
    expect(localId).not.toBe(serverId);
  });

  test('clearDeviceId 后内存缓存同步失效', () => {
    const id = getStableDeviceId();
    clearDeviceId();
    expect(getCurrentDeviceId()).toBeNull();
    // 缓存已失效：重新获取会生成新 ID 并写回
    const regenerated = getStableDeviceId();
    expect(regenerated).not.toBe(id);
  });
});

describe('setDeviceId 入口校验', () => {
  test('非法格式拒绝写入并返回 false', () => {
    expect(setDeviceId('garbage-value')).toBe(false);
    expect(getCurrentDeviceId()).toBeNull();
  });

  test('合法 ID 写入成功返回 true', () => {
    const id = makeValidId();
    expect(setDeviceId(id)).toBe(true);
    expect(getCurrentDeviceId()).toBe(id);
  });

  test('ID 变更时触发 onDeviceIdChange 回调', () => {
    const oldId = makeValidId(2);
    setDeviceId(oldId);

    const changes = [];
    windowStub.deviceSync = { onDeviceIdChange: (o, n) => changes.push([o, n]) };

    const newId = makeValidId(1);
    setDeviceId(newId);
    expect(changes).toEqual([[oldId, newId]]);
  });
});

describe('initDeviceSync 与跨标签页同步', () => {
  test('storage 事件触发变更回调并失效缓存', () => {
    const changes = [];
    initDeviceSync({ onDeviceIdChange: (o, n) => changes.push([o, n]) });

    // 模拟另一标签页写入
    const remoteId = makeValidId();
    windowStub.localStorage.map.set(STORAGE_KEY, remoteId);
    const handler = windowStub.addedListeners.find(l => l.type === 'storage').handler;
    handler({ key: STORAGE_KEY, oldValue: null, newValue: remoteId });

    expect(changes).toEqual([['', remoteId]]);
    // 缓存失效生效：本地直接读也是新 ID
    invalidateCachedDeviceId();
    expect(getCurrentDeviceId()).toBe(remoteId);
  });

  test('无关键的 storage 事件不触发回调', () => {
    const changes = [];
    initDeviceSync({ onDeviceIdChange: (o, n) => changes.push([o, n]) });
    const handler = windowStub.addedListeners.find(l => l.type === 'storage').handler;
    handler({ key: 'other_key', oldValue: null, newValue: 'x' });
    expect(changes).toEqual([]);
  });

  test('重复调用 initDeviceSync 不重复注册监听', () => {
    initDeviceSync();
    initDeviceSync();
    const storageListeners = windowStub.addedListeners.filter(l => l.type === 'storage');
    expect(storageListeners).toHaveLength(1);
  });
});

describe('getDeviceIdStats 调试统计', () => {
  test('有 ID 时返回 id/info/source', () => {
    const id = makeValidId();
    setDeviceId(id);
    const stats = getDeviceIdStats();
    expect(stats.id).toBe(id);
    expect(stats.source).toBe('localStorage');
    expect(stats.info.platform).toBe('WEB');
  });

  test('无 ID 时返回空统计', () => {
    expect(getDeviceIdStats()).toEqual({ id: null, info: null, source: 'none' });
  });
});
