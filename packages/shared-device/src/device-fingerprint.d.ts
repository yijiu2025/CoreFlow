/**
 * device-fingerprint.js 的类型声明（实现为纯 JS，供浏览器与 Jest 共用）
 */

/**
 * 采集完整设备指纹（canvas + WebGL 合并后 SHA-256，取前 32 位 hex）
 * 结果进程内缓存，并发调用去重；两者均采集失败返回空串
 */
export declare function getDeviceFingerprint(): Promise<string>;

/**
 * 是否启用设备指纹（页面 meta[name=device-fp]=true 或
 * VITE_DEVICE_FINGERPRINT=true），默认不启用
 */
export declare function isDeviceFingerprintEnabled(): boolean;
