/**
 * 共享设备工具包入口
 *
 * 三前端（oauth21/posecraft/firewall）共用，保证 device_id 生成、传递、响应头同步逻辑一致。
 *
 * - device-id：稳定结构化设备 ID（localStorage 持久，跨账号复用）
 * - device-fingerprint：canvas + WebGL 浏览器特征指纹（默认不启用）
 * - device-sync：从响应头同步 device_id 到 localStorage
 * - sha256：Web Crypto API 哈希
 *
 * @author yijiu2025
 * @since 2026-09-02
 */
export { getStableDeviceId, parseDeviceId, decodeTimestamp } from './device-id';
export {
  getDeviceFingerprint,
  isDeviceFingerprintEnabled
} from './device-fingerprint';
export {
  syncDeviceFromHeaders,
  handleDeviceSyncInResponse,
  initDeviceSync,
  getCurrentDeviceId,
  setDeviceId,
  clearDeviceId,
  getDeviceIdStats
} from './device-sync';
export { sha256 } from './sha256';
