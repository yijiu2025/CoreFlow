/**
 * storage.js 的类型声明（实现为纯 JS，供浏览器与 Jest 共用）
 */

/** 读取键值，不可用时读内存降级层；不存在返回 null */
export declare function safeGetItem(key: string): string | null;

/** 写入键值，不可用时写内存降级层 */
export declare function safeSetItem(key: string, value: string): void;

/** 移除键值（localStorage 与内存降级层都清） */
export declare function safeRemoveItem(key: string): void;

/** 仅测试使用：重置探测缓存与内存层 */
export declare function __resetStorageForTest(): void;
