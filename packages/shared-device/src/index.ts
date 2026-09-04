/**
 * 共享设备工具包入口
 *
 * 三前端（oauth21/posecraft/firewall）共用，保证 device_id 生成、传递、响应头同步逻辑一致。
 *
 * - device-id：稳定结构化设备 ID（localStorage 持久，跨账号复用）
 * - device-fingerprint：canvas + WebGL 浏览器特征指纹（默认不启用）
 * - device-sync：从响应头同步 device_id 到 localStorage
 * - sha256：Web Crypto API 哈希（非安全上下文降级纯 JS）
 * - storage：localStorage 安全封装（隐私模式内存降级）
 *
 * 实现模块为纯 JS + 手写 .d.ts（根 Jest 纯 ESM 不编译 TS，需直接 import 测试），
 * 本入口保持 TS 桶文件供 vite alias 消费。
 *
 * @author yijiu2025
 * @since 2026-09-02
 * @since 2026-09-04 补齐常量/校验/类型导出；实现层迁移为 .js + .d.ts
 */
export {
  getStableDeviceId,
  invalidateCachedDeviceId,
  validateDeviceIdFormat,
  parseDeviceId,
  getPlatform,
  decodeTimestamp,
  STORAGE_KEY,
  MAX_AGE_DAYS,
  DEVICE_PLATFORMS,
  RANDOM_SUFFIX_LENGTH
} from './device-id.js';
export type { DeviceIdInfo } from './device-id.js';
export {
  getDeviceFingerprint,
  isDeviceFingerprintEnabled
} from './device-fingerprint.js';
export {
  syncDeviceFromHeaders,
  handleDeviceSyncInResponse,
  initDeviceSync,
  getCurrentDeviceId,
  setDeviceId,
  clearDeviceId,
  getDeviceIdStats
} from './device-sync.js';
export type { DeviceSyncOptions } from './device-sync.js';
export { sha256 } from './sha256.js';
