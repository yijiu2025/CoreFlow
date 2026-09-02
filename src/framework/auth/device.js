/**
 * 设备识别模块
 *
 * 统一管理设备类型判定与设备标识生成：
 * - detectDeviceType：返回设备类型语义值（存 session.deviceType 字段）
 * - detectPlatform：返回平台短前缀（web/android/ios/miniapp/desktop/api）
 * - getDeviceId：验证并规范化结构化设备 ID（WEB-a3K7mP9q-8s4T）
 *
 * device_id 采用结构化格式（如 WEB-a3K7mP9q-8s4T），前端生成后端验证，
 * 若无效则生成新 ID，确保唯一性和安全性。
 *
 * @author yijiu
 * @since 2026-08-14
 * @since 2026-09-01 结构化设备 ID（加密时间戳 + 高唯一性）
 */

import crypto from 'node:crypto';
import { verifyAndNormalizeDeviceId, generateServerSideDeviceId } from './device-id-service.js';
import { COOKIE_OPTIONS } from './cookie.js';

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
 * 验证并规范化设备标识
 *
 * 混合方案：
 * 1. 前端生成临时结构化 ID（WEB-a3K7mP9q-8s4T）
 * 2. 后端验证格式、安全性、有效性
 * 3. 无效则生成新 ID 并返回
 *
 * 指纹输入优先级：
 *   1. x-device-id 头（前端主动传的结构化 ID）
 *   2. cookie 里的 device_id（向后兼容旧版本）
 *   3. 服务端生成（兜底）
 *
 * @param {import('fastify').FastifyRequest} request
 * @returns {string} 形如 `WEB-a3K7mP9q-8s4T`
 */
export async function getDeviceId(request) {
  const userAgent = request?.headers?.['user-agent'] || '';
  const header = request?.headers?.['x-device-id'] || '';
  const cookieDeviceId = request?.cookies?.device_id || '';

  // 1. 优先验证前端传的结构化 ID
  const clientId = header || cookieDeviceId;
  if (clientId) {
    try {
      const validation = await verifyAndNormalizeDeviceId(clientId, userAgent);

      if (validation.valid) {
        // 验证通过，使用规范化 ID
        if (validation.shouldReplace) {
          console.warn(`⚠️ [DeviceId] 前端 ID 无效，已替换：${clientId} → ${validation.normalizedId}`);
        }
        return validation.normalizedId;
      }
    } catch (error) {
      console.warn(`⚠️ [DeviceId] 验证失败：${error.message}`);
    }
  }

  // 2. 后端生成新 ID（兜底）
  const serverId = generateServerSideDeviceId(userAgent);
  console.log(`📱 [DeviceId] 服务端生成：${serverId}`);
  return serverId;
}

/**
 * 获取设备 ID 并包装响应
 *
 * Cookie 选项统一用 COOKIE_OPTIONS.DEVICE（httpOnly:true / secure:按生产 / 10年），
 * 与 bind-session 写业务域 device_id cookie 一致，避免双套选项导致属性不一致。
 * 前端改用 x-device-id 头 + localStorage 持久化后不依赖读 cookie，httpOnly 无副作用。
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {string} 设备 ID
 */
export async function getDeviceIdAndWrapResponse(request, reply) {
  const deviceId = await getDeviceId(request);

  // 1. 写入响应头（前端可以读取）
  reply.header('X-Device-Id', deviceId);

  // 2. 写入 Cookie（后续请求自动带上，统一选项与 bind-session 一致）
  reply.setCookie('device_id', deviceId, COOKIE_OPTIONS.DEVICE);

  // 3. 如果是首次生成（无效的 cookie），通过响应体通知前端更新
  const cookieDeviceId = request?.cookies?.device_id || '';
  if (!cookieDeviceId) {
    reply.header('X-Device-Id-Updated', 'true');
  }

  return deviceId;
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
