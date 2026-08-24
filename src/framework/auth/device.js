/**
 * 设备识别模块
 *
 * 统一管理设备类型判定与设备标识生成：
 * - detectDeviceType：返回设备类型语义值（存 session.deviceType 字段）
 * - detectPlatform：返回平台短前缀（web/android/ios/miniapp/desktop/api）
 * - getDeviceId：生成 `{平台前缀}-{指纹hash}` 格式的设备标识
 *
 * device_id 采用带前缀格式（如 web-a1b2c3d4…），便于按前缀分辨
 * web / android / 小程序 / ios 等平台，也便于按平台做会话统计与排查。
 *
 * @author yijiu
 * @since 2026-08-14
 */

import crypto from 'node:crypto';

/**
 * 设备类型常量（语义值，存 session.deviceType）
 */
export const DEVICE_TYPE = {
  BROWSER: 'browser', // 浏览器（Chrome/Firefox/Safari 等）
  APP: 'app', // 移动端 App（Android/iOS）
  DESKTOP: 'desktop', // 桌面客户端（Electron 等）
  MINIAPP: 'miniapp', // 小程序（微信/支付宝等）
  API: 'api' // API 调用（服务间通信，无 UA）
};

/**
 * 从 User-Agent 推断设备类型（语义值）
 * @param {string} ua User-Agent 字符串
 * @returns {string} DEVICE_TYPE 之一
 */
export function detectDeviceType(ua) {
  if (!ua) return DEVICE_TYPE.API;
  const lower = ua.toLowerCase();
  if (lower.includes('miniprogram') || lower.includes('micromessenger')) return DEVICE_TYPE.MINIAPP;
  if (lower.includes('android') || lower.includes('iphone') || lower.includes('mobile')) return DEVICE_TYPE.APP;
  if (lower.includes('electron') || lower.includes('desktop')) return DEVICE_TYPE.DESKTOP;
  return DEVICE_TYPE.BROWSER;
}

/**
 * 推断平台短前缀（用于 device_id 前缀，粒度比 detectDeviceType 更细，
 * 区分 android / ios，便于按平台分辨与统计）
 * @param {import('fastify').FastifyRequest} request
 * @returns {'web'|'android'|'ios'|'miniapp'|'desktop'|'api'}
 */
export function detectPlatform(request) {
  const ua = request?.headers?.['user-agent'] || '';
  if (!ua) return 'api';
  const lower = ua.toLowerCase();
  if (lower.includes('miniprogram') || lower.includes('micromessage')) return 'miniapp';
  if (lower.includes('android')) return 'android';
  if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('ipod')) return 'ios';
  if (lower.includes('electron') || lower.includes('desktop')) return 'desktop';
  return 'web';
}

/**
 * 生成设备标识：`{平台前缀}-{16位指纹hash}`
 *
 * 指纹输入优先级（保证同浏览器/同账号跨版本更新 device_id 稳定，避免 session_tokens 表堆积）：
 *   1. x-device-id 头（前端主动传，最稳）
 *   2. cookie 里的 device_id（首次登录后端写回，跨请求稳定）
 *   3. User-Agent + sec-ch-ua-platform 计算（兜底，浏览器更新后可能变）
 *
 * 前缀来自 detectPlatform，便于按 web/android/ios/miniapp 分辨。
 *
 * @param {import('fastify').FastifyRequest} request
 * @returns {string} 形如 `web-a1b2c3d4e5f6a7b8`
 */
export function getDeviceId(request) {
  const platform = detectPlatform(request);
  // 1. 优先用前端主动传的 x-device-id 头
  const header = request?.headers?.['x-device-id'] || '';
  // 2. 其次读 cookie 里的 device_id（首次登录后端写入，后续请求自动带上）
  const cookieDeviceId = request?.cookies?.device_id || '';
  // 3. 兜底用 UA + platform 计算
  const ua = request?.headers?.['user-agent'] || '';
  const platformHint = request?.headers?.['sec-ch-ua-platform'] || '';

  // 稳定来源优先：header > cookie
  const stableId = header || cookieDeviceId;
  if (stableId) {
    // 带平台前缀，统一格式（前端传的可能无前缀）
    return stableId.includes('-') ? stableId : `${platform}-${stableId}`;
  }
  const hash = crypto.createHash('sha256').update(`${header}|${ua}|${platformHint}`).digest('hex').slice(0, 16);
  return `${platform}-${hash}`;
}

/**
 * Cookie device_id 用的稳定随机值（无前缀，getDeviceId 会补前缀）
 * 首次登录无 cookie 时生成，写回 cookie，后续请求稳定带上。
 */
export function generateDeviceCookie() {
  return crypto.randomUUID();
}

/**
 * 计算复合设备指纹（device_id + UA + uid 等哈希）
 *
 * 区别于 device_id（设备级稳定标识，跨账号共用）：
 * device_fingerprint 绑定"设备 + 账号"，同设备换账号/同账号换设备都会变。
 * 每次登录计算并记录到 session_tokens，访问时比对——突变则可能账号被盗/换设备。
 *
 * 输入：device_id + UA + uid + sec-ch-ua-platform（浏览器特征，防 UA 轻微变化误报）
 *
 * @param {object} opts - { deviceId, userAgent, uid, platformHint? }
 * @returns {string} 32 位指纹
 */
export function computeDeviceFingerprint({ deviceId, userAgent, uid, platformHint }) {
  const material = `${deviceId || ''}|${uid || ''}|${userAgent || ''}|${platformHint || ''}`;
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 32);
}
