/**
 * 设备 ID 同步工具
 *
 * 处理前端与后端设备 ID 的同步逻辑：
 * 1. 首次登录：从响应头获取新设备 ID
 * 2. 后续请求：自动携带 localStorage 中的设备 ID
 * 3. 设备 ID 更新：检测响应头中的更新标记，同步更新
 *
 * 所有 localStorage 操作均走安全封装（try/catch），隐私模式下不抛异常、
 * 不中断调用方的响应处理链路。
 *
 * @author yijiu2025
 * @since 2026-09-01
 * @since 2026-09-03 localStorage 安全封装；AxiosHeaders 鸭子类型兼容；STORAGE_KEY 单一来源；initDeviceSync 防重复注册
 */

import { parseDeviceId, STORAGE_KEY } from './device-id';

export interface DeviceSyncOptions {
  /** 强制重新获取设备 ID */
  forceRefresh?: boolean;
  /** 设备 ID 变更回调 */
  onDeviceIdChange?: (oldId: string, newId: string) => void;
}

// 扩展 Window 接口以包含 deviceSync 属性
declare global {
  interface Window {
    deviceSync?: {
      onDeviceIdChange?: (oldId: string, newId: string) => void;
    };
  }
}

/** initDeviceSync 是否已注册过全局监听（防止重复调用导致重复注册） */
let storageListenerRegistered = false;

/**
 * 安全读取 localStorage（隐私模式/配额异常时返回 null，不抛异常）
 */
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * 安全写入 localStorage（隐私模式下静默失败）
 */
function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 隐私模式写入失败，保持内存态即可 */
  }
}

/**
 * 安全移除 localStorage 项
 */
function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * 从各类响应头容器读取指定头（大小写不敏感）
 *
 * 兼容三种形态：
 * - Headers 实例（fetch）
 * - AxiosHeaders 实例（axios，也有 .get 方法且大小写不敏感，鸭子类型识别）
 * - 普通对象（小写 / 原样键）
 *
 * @param headers 响应头容器
 * @param lowerName 头名称（小写）
 */
function readHeader(headers: any, lowerName: string): string | null {
  if (typeof headers !== 'object' || headers === null) return null;

  if (typeof headers.get === 'function') {
    const value = headers.get(lowerName);
    return value === null || value === undefined ? null : String(value);
  }

  const pascalName = lowerName
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-');
  const value = headers[lowerName] ?? headers[pascalName];
  return value === null || value === undefined ? null : String(value);
}

/**
 * 获取当前设备 ID（优先从 localStorage 读取，隐私模式返回 null）
 */
export function getCurrentDeviceId(): string | null {
  return safeGetItem(STORAGE_KEY);
}

/**
 * 设置设备 ID 并持久化到 localStorage
 */
export function setDeviceId(deviceId: string): void {
  const oldId = getCurrentDeviceId();
  safeSetItem(STORAGE_KEY, deviceId);

  // 通知设备 ID 变更
  if (oldId && oldId !== deviceId) {
    if (window.deviceSync?.onDeviceIdChange) {
      window.deviceSync.onDeviceIdChange(oldId, deviceId);
    }
  }
}

/**
 * 从响应头同步设备 ID
 * @param headers - HTTP 响应头（Headers / AxiosHeaders / 普通对象）
 * @param options - 同步选项
 * @returns 同步后的设备 ID
 */
export function syncDeviceFromHeaders(headers: any, options?: DeviceSyncOptions): string | null {
  // 1. 获取响应头中的设备 ID 与更新标记
  const responseDeviceId = readHeader(headers, 'x-device-id');
  const hasDeviceIdUpdated = readHeader(headers, 'x-device-id-updated');

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
 * HTTP 响应拦截器集成（axios 响应对象 / fetch Response 均可）
 * @param response - 响应对象（需带 headers）
 * @param options - 同步选项
 */
export function handleDeviceSyncInResponse(response: any, options?: DeviceSyncOptions): any {
  // 检查是否在浏览器环境中
  if (typeof window === 'undefined' || !response?.headers) {
    return response;
  }

  syncDeviceFromHeaders(response.headers, options);
  return response;
}

/**
 * 初始化设备 ID 全局配置（重复调用不会重复注册监听器）
 * @param options - 配置选项
 */
export function initDeviceSync(options: DeviceSyncOptions = {}): void {
  window.deviceSync = {
    onDeviceIdChange: options.onDeviceIdChange
  };

  if (storageListenerRegistered) return;
  storageListenerRegistered = true;

  // 监听本地存储变化（跨标签页同步；oldValue 为 null 是另一标签页首次写入，同样通知）
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY && event.newValue && event.newValue !== event.oldValue) {
      if (window.deviceSync?.onDeviceIdChange) {
        window.deviceSync.onDeviceIdChange(event.oldValue ?? '', event.newValue);
      }
    }
  });
}

/**
 * 清除设备 ID（仅在需要时使用，通常保持持久化）
 */
export function clearDeviceId(): void {
  safeRemoveItem(STORAGE_KEY);
}

/**
 * 获取设备 ID 使用统计
 */
export function getDeviceIdStats(): {
  id: string | null;
  info: ReturnType<typeof parseDeviceId>;
  source: 'localStorage' | 'none';
} {
  const currentId = getCurrentDeviceId();

  if (currentId) {
    return {
      id: currentId,
      info: parseDeviceId(currentId),
      source: 'localStorage'
    };
  }

  return {
    id: null,
    info: null,
    source: 'none'
  };
}
