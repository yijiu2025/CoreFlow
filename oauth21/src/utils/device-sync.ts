/**
 * 设备 ID 同步工具
 *
 * 处理前端与后端设备 ID 的同步逻辑：
 * 1. 首次登录：从响应头获取新设备 ID
 * 2. 后续请求：自动携带 localStorage 中的设备 ID
 * 3. 设备 ID 更新：检测响应头中的更新标记，同步更新
 *
 * @author yijiu2025
 * @since 2026-09-01
 */

import { parseDeviceId } from './device-id';

export interface DeviceSyncOptions {
  /** 强制重新获取设备 ID */
  forceRefresh?: boolean;
  /** 设备 ID 变更回调 */
  onDeviceIdChange?: (oldId: string, newId: string) => void;
}

const STORAGE_KEY = 'cf_device_id';

/**
 * 获取当前设备 ID（优先从 localStorage 读取）
 */
export function getCurrentDeviceId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

/**
 * 设置设备 ID 并持久化到 localStorage
 */
export function setDeviceId(deviceId: string): void {
  const oldId = getCurrentDeviceId();
  localStorage.setItem(STORAGE_KEY, deviceId);

  // 通知设备 ID 变更
  if (oldId && oldId !== deviceId) {
    if (window.deviceSync?.onDeviceIdChange) {
      window.deviceSync.onDeviceIdChange(oldId, deviceId);
    }
  }
}

/**
 * 从响应头同步设备 ID
 * @param headers - HTTP 响应头
 * @param options - 同步选项
 * @returns 同步后的设备 ID
 */
export function syncDeviceFromHeaders(headers: Headers, options?: DeviceSyncOptions): string | null {
  // 1. 获取响应头中的设备 ID
  let responseDeviceId: string | null = null;
  let hasDeviceIdUpdated: string | null = null;

  // 检查 headers 类型并安全获取
  if (typeof headers === 'object' && headers !== null) {
    if (headers instanceof Headers) {
      responseDeviceId = headers.get('X-Device-Id');
      hasDeviceIdUpdated = headers.get('X-Device-Id-Updated');
    } else if (headers['x-device-id'] || headers['X-Device-Id']) {
      // 处理普通对象格式的 headers
      responseDeviceId = headers['x-device-id'] || headers['X-Device-Id'];
      hasDeviceIdUpdated = headers['x-device-id-updated'] || headers['X-Device-Id-Updated'];
    }
  }

  if (!responseDeviceId) {
    return null;
  }

  // 2. 解析并验证设备 ID
  const parsed = parseDeviceId(responseDeviceId);
  if (!parsed) {
    console.warn(`⚠️ [DeviceSync] 无效的设备 ID 格式: ${responseDeviceId}`);
    return null;
  }

  // 3. 获取当前设备 ID
  const currentId = getCurrentDeviceId();

  // 4. 判断是否需要更新
  const shouldUpdate =
    options?.forceRefresh ||
    !currentId ||
    currentId !== responseDeviceId ||
    hasDeviceIdUpdated === 'true';

  if (shouldUpdate) {
    setDeviceId(responseDeviceId);
  }

  return responseDeviceId;
}

/**
 * HTTP 请求拦截器集成
 * @param response - Axios/Fetch 响应对象
 * @param options - 同步选项
 */
export function handleDeviceSyncInResponse(response: any, options?: DeviceSyncOptions): any {
  // 检查是否在浏览器环境中
  if (typeof window === 'undefined' || !response?.headers) {
    return response;
  }

  const headers = new Headers(response.headers);
  syncDeviceFromHeaders(headers, options);
  return response;
}

/**
 * 初始化设备 ID 全局配置
 * @param options - 配置选项
 */
export function initDeviceSync(options: DeviceSyncOptions = {}): void {
  window.deviceSync = {
    onDeviceIdChange: options.onDeviceIdChange
  };

  // 监听本地存储变化（跨标签页同步）
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      if (window.deviceSync?.onDeviceIdChange && event.oldValue) {
        window.deviceSync.onDeviceIdChange(event.oldValue, event.newValue);
      }
    }
  });
}

/**
 * 清除设备 ID（仅在需要时使用，通常保持持久化）
 */
export function clearDeviceId(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 获取设备 ID 使用统计
 */
export function getDeviceIdStats(): {
  id: string | null;
  info: any;
  source: 'localStorage' | 'header' | 'generated';
} {
  const currentId = getCurrentDeviceId();

  if (currentId) {
    const info = parseDeviceId(currentId);
    return {
      id: currentId,
      info,
      source: 'localStorage'
    };
  }

  return {
    id: null,
    info: null,
    source: 'generated'
  };
}