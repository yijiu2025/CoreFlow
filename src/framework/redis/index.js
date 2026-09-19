/**
 * Redis 模块统一出口
 *
 * 所有公开 API 均从此文件导出，外部只需导入这一个文件即可使用全部功能。
 *
 * @author yijiu2025
 * @since 2026-07-25
 */

export { default } from './plugin.js';
export { connectStandalone, disconnectStandalone } from './plugin.js';
export { ResilientStore, createBoundStore } from './resilient-store.js';
export { RedisStore, setLogger, setTtlJitter } from './redis-store.js';
export { getStore } from './get-store.js';
export { MapStore } from './map-store.js';
export { createQueue } from './queue-store.js';
export { createRingQueue } from './ring-queue-store.js';
export { createStream } from './stream-store.js';
export { createLock } from './lock-store.js';
export { createNonceStore } from './nonce-store.js';
export { RedisRequiredError } from './errors.js';
export { cacheThrough } from './cache.js';
// 供调用方判断"Redis 是否可用"（用于内存降级决策）：外部必须走本 barrel，
// 不要深层导入 `framework/redis/utils.js`。
export { isRedisReady } from './utils.js';
export { getInstanceId, isPubSubReady, subscribe, publish, closePubSub, resetPubSub } from './pubsub.js';
