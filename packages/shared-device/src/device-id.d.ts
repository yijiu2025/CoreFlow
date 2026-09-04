/**
 * device-id.js 的类型声明（实现为纯 JS，供浏览器与 Jest 共用）
 */

/** 设备 ID 在 localStorage 的存储键 */
export declare const STORAGE_KEY: string;

/** 设备 ID 最长有效期（天），与后端一致 */
export declare const MAX_AGE_DAYS: number;

/** 合法平台枚举 */
export declare const DEVICE_PLATFORMS: readonly ['WEB', 'IOS', 'ANDROID'];

/** 随机后缀长度（6 字符 Base62） */
export declare const RANDOM_SUFFIX_LENGTH: number;

/** 时钟偏差容差（毫秒，±5 分钟），与后端 CLOCK_SKEW_TOLERANCE_MS 一致 */
export declare const CLOCK_SKEW_TOLERANCE_MS: number;

/** 获取稳定 device_id（持久化 + 内存缓存，首次生成结构化 ID） */
export declare function getStableDeviceId(): string;

/** 使内存缓存的设备 ID 失效（下次 getStableDeviceId 重新读存储） */
export declare function invalidateCachedDeviceId(): void;

/**
 * 校验设备 ID 格式（与后端 validateDeviceId 逐条对齐，同步版）
 */
export declare function validateDeviceIdFormat(deviceId: string): {
  valid: boolean;
  reason?: string;
};

/** 检测设备平台（与后端 detectPlatform 同规则） */
export declare function getPlatform(): 'WEB' | 'IOS' | 'ANDROID';

/** 设备 ID 解析结果 */
export interface DeviceIdInfo {
  platform: string;
  timestamp: number;
  createdAt: Date;
  /** 距今天数 */
  age: number;
}

/** 调试工具：解析设备 ID 信息（宽松解析），非法返回 null */
export declare function parseDeviceId(deviceId: string): DeviceIdInfo | null;

/** 解码 Base64 时间戳段为毫秒时间戳（转发自 base62-timestamp） */
export declare function decodeTimestamp(encoded: string): number;
