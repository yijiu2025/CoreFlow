/**
 * base62-timestamp.js 的类型声明（实现为纯 JS，供浏览器与 Jest 共用）
 */

/** 混淆时间戳为 Base62 字符串，返回 11 字符 */
export declare function encodeTimestamp(timestamp: number): string;

/** 解码 Base62 字符串为毫秒时间戳，含非法字符时抛错 */
export declare function decodeTimestamp(encoded: string): number;

/** 数字转 Base62 字符串（支持 BigInt） */
export declare function toBase62(num: number | bigint): string;

/** Base62 字符串转数字（BigInt），含非法字符时抛错 */
export declare function fromBase62(str: string): bigint;

export declare const BASE62_CHARS: string;

export declare const ENCODED_TS_LENGTH: number;

export declare const TS_OFFSET: bigint;

export declare const TS_MAGIC: bigint;
