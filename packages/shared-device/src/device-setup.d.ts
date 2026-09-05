/**
 * device-setup.js 的类型声明（实现为纯 JS，供浏览器与 Jest 共用）
 */

import type { DeviceSyncOptions } from './device-sync.js';

/** 最小 axios 实例结构（真 axios 实例结构兼容可直接传入） */
export interface AxiosLikeInstance {
  interceptors: {
    request: {
      use(onFulfilled: (config: any) => any): number;
      eject(id: number): void;
    };
    response: {
      use(onFulfilled: (response: any) => any): number;
      eject(id: number): void;
    };
  };
}

/** setupDeviceSync 配置项 */
export interface SetupDeviceSyncOptions extends DeviceSyncOptions {
  /**
   * 设备指纹注入开关：true 强制注入；false 强制关闭；
   * 缺省每请求按 isDeviceFingerprintEnabled()（meta 标签 / VITE_DEVICE_FINGERPRINT）判定
   */
  fingerprint?: boolean;
}

/**
 * 一站式接入设备 ID 体系（axios 实例）：注册请求/响应拦截器 + 自动 initDeviceSync
 * @returns dispose 函数：eject 本函数注册的拦截器
 */
export declare function setupDeviceSync(
  axiosInstance: AxiosLikeInstance,
  options?: SetupDeviceSyncOptions
): () => void;

/** 获取设备 ID 请求头（同步，供 fetch 场景与显式带头使用） */
export declare function getDeviceHeaders(): { 'x-device-id': string };
