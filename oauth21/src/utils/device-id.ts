/**
 * 稳定设备标识（device_id）
 *
 * 跨域 iframe 场景下 cookie 不可靠（oauth21 域写的 device_id cookie 在
 * posecraft 域请求带不过去），改用 localStorage 存稳定 UUID，每个请求
 * 通过 x-device-id 头主动发送。后端 getDeviceId 优先读头。
 *
 * 同设备跨账号复用：localStorage 不随账号退出清除，登录 A 再登录 B
 * 用同一个 device_id（设备不变）。
 *
 * @author yijiu2025
 * @since 2026-08-25
 */

const STORAGE_KEY = 'cf_device_id';

let cachedId: string | null = null;

/**
 * 获取稳定 device_id（localStorage 持久化，首次生成 UUID）
 * 不带平台前缀（后端 getDeviceId 会按 UA 补前缀）
 */
export function getStableDeviceId(): string {
  if (cachedId) return cachedId;
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = generateUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    cachedId = id;
    return id;
  } catch {
    // localStorage 不可用（隐私模式）→ 临时生成（本次会话不稳定，但极少见）
    return cachedId || (cachedId = generateUUID());
  }
}

/** RFC4122 v4 UUID */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // 兜底（老浏览器）
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
