/**
 * device-sync.js 的类型声明（实现为纯 JS，供浏览器与 Jest 共用）
 */

/** 设备 ID 同步选项 */
export interface DeviceSyncOptions {
  /** 强制重新获取设备 ID */
  forceRefresh?: boolean;
  /** 设备 ID 变更回调 */
  onDeviceIdChange?: (oldId: string, newId: string) => void;
}

/** 设备 ID 解析结果（转发自 device-id） */
export interface DeviceIdInfo {
  platform: string;
  timestamp: number;
  createdAt: Date;
  age: number;
}

/** 获取当前设备 ID（从存储读取，隐私模式降级层也可读） */
export declare function getCurrentDeviceId(): string | null;

/**
 * 设置设备 ID 并持久化到存储（入口校验，写后失效内存缓存）
 * @returns 是否写入成功（非法格式拒绝写入返回 false）
 */
export declare function setDeviceId(deviceId: string): boolean;

/**
 * 从响应头同步设备 ID
 * @param headers HTTP 响应头（Headers / AxiosHeaders / 普通对象）
 * @param options 同步选项
 * @returns 同步后的设备 ID；响应头无有效 ID 返回 null
 */
export declare function syncDeviceFromHeaders(
  headers: unknown,
  options?: DeviceSyncOptions
): string | null;

/** HTTP 响应拦截器集成（axios 响应对象 / fetch Response 均可），原样返回响应 */
export declare function handleDeviceSyncInResponse<T>(response: T, options?: DeviceSyncOptions): T;

/** 初始化设备 ID 全局配置（重复调用不会重复注册监听器） */
export declare function initDeviceSync(options?: DeviceSyncOptions): void;

/** 清除设备 ID（存储与内存缓存同步清除） */
export declare function clearDeviceId(): void;

/** 设备 ID 使用统计（调试用） */
export declare function getDeviceIdStats(): {
  id: string | null;
  info: DeviceIdInfo | null;
  source: 'localStorage' | 'none';
};

declare global {
  interface Window {
    /** 设备 ID 同步全局配置（initDeviceSync 写入） */
    deviceSync?: {
      onDeviceIdChange?: (oldId: string, newId: string) => void;
    };
  }
}
