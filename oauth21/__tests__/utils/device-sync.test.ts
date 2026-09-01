/**
 * 设备 ID 同步工具测试
 *
 * 测试前端设备 ID 的同步和更新逻辑
 *
 * @author yijiu2025
 * @since 2026-09-01
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  getCurrentDeviceId,
  setDeviceId,
  syncDeviceFromHeaders,
  handleDeviceSyncInResponse,
  clearDeviceId,
  getDeviceIdStats,
  initDeviceSync
} from '../../src/utils/device-sync';

describe('设备 ID 同步工具测试', () => {
  const mockHeaders = new Headers({
    'X-Device-Id': 'WEB-a3K7mP9q-8s4T',
    'X-Device-Id-Updated': 'true'
  });

  beforeEach(() => {
    // 清空 localStorage
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    window.deviceSync = undefined;
  });

  test('获取当前设备 ID 为空', () => {
    expect(getCurrentDeviceId()).toBeNull();
  });

  test('设置和获取设备 ID', () => {
    const deviceId = 'WEB-a3K7mP9q-8s4T';
    setDeviceId(deviceId);

    expect(getCurrentDeviceId()).toBe(deviceId);
  });

  test('从响应头同步设备 ID', () => {
    const result = syncDeviceFromHeaders(mockHeaders);

    expect(result).toBe('WEB-a3K7mP9q-8s4T');
    expect(getCurrentDeviceId()).toBe('WEB-a3K7mP9q-8s4T');
  });

  test('重复同步相同设备 ID 不更新', () => {
    // 先设置一个设备 ID
    setDeviceId('WEB-a3K7mP9q-8s4T');

    // 再次同步相同 ID（无 X-Device-Id-Updated 头）
    const headersWithoutUpdate = new Headers({
      'X-Device-Id': 'WEB-a3K7mP9q-8s4T'
    });

    const result = syncDeviceFromHeaders(headersWithoutUpdate);

    expect(result).toBe('WEB-a3K7mP9q-8s4T');
    // 不应该触发重复的更新日志
  });

  test('强制刷新设备 ID', () => {
    // 先设置一个旧的设备 ID
    setDeviceId('WEB-old-123456');

    // 强制刷新
    const result = syncDeviceFromHeaders(mockHeaders, { forceRefresh: true });

    expect(result).toBe('WEB-a3K7mP9q-8s4T');
    expect(getCurrentDeviceId()).toBe('WEB-a3K7mP9q-8s4T');
  });

  test('设备 ID 变更回调', () => {
    const callback = vi.fn();

    syncDeviceFromHeaders(mockHeaders, { onDeviceIdChange: callback });

    // 清空后重新设置触发回调
    setDeviceId('WEB-a3K7mP9q-8s4T');
    callback.mockClear();

    // 模拟响应头更新
    const updatedHeaders = new Headers({
      'X-Device-Id': 'WEB-new-ABCDEF',
      'X-Device-Id-Updated': 'true'
    });

    syncDeviceFromHeaders(updatedHeaders, { onDeviceIdChange: callback });

    expect(callback).toHaveBeenCalledWith('WEB-a3K7mP9q-8s4T', 'WEB-new-ABCDEF');
  });

  test('处理无效的设备 ID 格式', () => {
    const invalidHeaders = new Headers({
      'X-Device-Id': 'invalid-format'
    });

    const result = syncDeviceFromHeaders(invalidHeaders);

    expect(result).toBeNull();
    expect(getCurrentDeviceId()).toBeNull();
  });

  test('HTTP 响应集成测试', () => {
    const mockResponse = {
      headers: {
        'x-device-id': 'WEB-a3K7mP9q-8s4T',
        'x-device-id-updated': 'true'
      }
    };

    const result = handleDeviceSyncInResponse(mockResponse);

    expect(result).toBe(mockResponse);
    expect(getCurrentDeviceId()).toBe('WEB-a3K7mP9q-8s4T');
  });

  test('清除设备 ID', () => {
    setDeviceId('WEB-a3K7mP9q-8s4T');
    expect(getCurrentDeviceId()).toBe('WEB-a3K7mP9q-8s4T');

    clearDeviceId();
    expect(getCurrentDeviceId()).toBeNull();
  });

  test('获取设备 ID 统计', () => {
    // 初始状态
    let stats = getDeviceIdStats();
    expect(stats.id).toBeNull();
    expect(stats.info).toBeNull();
    expect(stats.source).toBe('generated');

    // 设置设备 ID 后
    setDeviceId('WEB-a3K7mP9q-8s4T');
    stats = getDeviceIdStats();

    expect(stats.id).toBe('WEB-a3K7mP9q-8s4T');
    expect(stats.info).toHaveProperty('platform', 'WEB');
    expect(stats.info).toHaveProperty('ageDays');
    expect(stats.source).toBe('localStorage');
  });

  test('跨标签页存储事件监听', () => {
    // 模拟 storage 事件
    const storageEvent = new StorageEvent('storage', {
      key: 'cf_device_id',
      oldValue: 'WEB-old-123456',
      newValue: 'WEB-new-ABCDEF',
      url: window.location.href
    });

    let triggerCount = 0;
    let oldId: string | null = null;
    let newId: string | null = null;

    // 初始化设备同步
    initDeviceSync({
      onDeviceIdChange: (oldVal, newVal) => {
        triggerCount++;
        oldId = oldVal;
        newId = newVal;
      }
    });

    // 触发 storage 事件
    window.dispatchEvent(storageEvent);

    expect(triggerCount).toBe(1);
    expect(oldId).toBe('WEB-old-123456');
    expect(newId).toBe('WEB-new-ABCDEF');
  });

  test('无设备 ID 响应头时正常处理', () => {
    const emptyHeaders = new Headers();

    const result = syncDeviceFromHeaders(emptyHeaders);

    expect(result).toBeNull();
    expect(getCurrentDeviceId()).toBeNull();
  });
});