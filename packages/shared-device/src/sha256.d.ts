/**
 * sha256.js 的类型声明（实现为纯 JS，供浏览器与 Jest 共用）
 */

/**
 * SHA-256 哈希函数
 * @param message 待哈希字符串（UTF-8 编码）
 * @returns 64 位小写 hex 字符串
 */
export declare function sha256(message: string): Promise<string>;

/**
 * 纯 JS SHA-256 降级实现（不依赖 Web Crypto）
 * @param message 待哈希字符串
 * @returns 64 位小写 hex 字符串
 */
export declare function sha256Pure(message: string): string;
