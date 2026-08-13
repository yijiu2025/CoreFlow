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
 * 指纹输入：x-device-id 头 + User-Agent + sec-ch-ua-platform，
 * 同一浏览器/客户端稳定一致，便于同设备互踢与去重。
 * 前缀来自 detectPlatform，便于按 web/android/ios/miniapp 分辨。
 *
 * @param {import('fastify').FastifyRequest} request
 * @returns {string} 形如 `web-a1b2c3d4e5f6a7b8`
 */
export function getDeviceId(request) {
  const platform = detectPlatform(request);
  const header = request?.headers?.['x-device-id'] || '';
  const ua = request?.headers?.['user-agent'] || '';
  const platformHint = request?.headers?.['sec-ch-ua-platform'] || '';
  const hash = crypto.createHash('sha256').update(`${header}|${ua}|${platformHint}`).digest('hex').slice(0, 16);
  return `${platform}-${hash}`;
}
