/**
 * 用户会话视图服务
 *
 * 从 api/user/v1/sessions.js 下沉：活跃会话列表的格式化（截断 sessionId、标记当前会话）。
 * 纯投影函数，无副作用。
 *
 * @author yijiu
 * @since 2026-08-16
 */

import { LONG_SESSION_TTL } from '../../../framework/security/auth/index.js';

/**
 * 会话是否已"过期"（记录还在，但 Redis 侧会话大概率已消失）
 *
 * 表里只存 sha256(sid)，反查不到 `session:<rawSid>`，所以按最后活跃时间 + **最长**
 * 会话 TTL 推断：宁可漏判（把已过期的显示成活跃）也不误判（把记住我的活会话标成过期）。
 *
 * @param {{revoked: boolean|number, last_active?: string|Date|null}} row 设备行
 * @returns {boolean} 是否过期
 */
function isStaleSession(row) {
  if (row.revoked) return false;
  const ts = row.last_active ? new Date(row.last_active).getTime() : 0;
  if (!ts) return false;
  return Date.now() - ts > LONG_SESSION_TTL * 1000;
}

/** 格式化会话列表为前端视图
 * @param {Array} sessions - checkMaxSessions 返回的原始会话列表
 * @param {string} [currentSid] - 当前请求的 sid cookie（用于标记 isCurrent）
 * @returns {{sessions: Array, total: number}}
 */
function formatSessionList(sessions, currentSid) {
  return {
    sessions: sessions.map(s => ({
      sessionId: s.sessionId?.substring(0, 16) + '...',
      deviceType: s.deviceType || 'browser',
      ip: s.ip,
      lastActive: s.lastActive,
      isCurrent: currentSid?.includes(s.sessionId?.substring(0, 16))
    })),
    total: sessions.length
  };
}

/**
 * 设备 ID 打码：保平台前缀 + 后缀，中间用星号替换
 *
 * WEB-DaBOSbMqVhX-Ude5aP → WEB-DaBO***Ude5aP
 * 格式：平台-加密时间戳-随机后缀，三段用 - 分隔；保第一段首部 + 第三段尾部，中间打码。
 * 便于用户辨认（看到自己设备的平台和大致尾号），不暴露完整指纹。
 *
 * @param {string} deviceId 原始设备 ID
 * @returns {string} 打码后的设备 ID
 */
function maskDeviceId(deviceId) {
  if (!deviceId || typeof deviceId !== 'string') return '';
  const parts = deviceId.split('-');
  // 非标准格式（无三段）：整体保首尾各 4 字符
  if (parts.length < 3) {
    if (deviceId.length <= 8) return deviceId;
    return deviceId.slice(0, 4) + '***' + deviceId.slice(-4);
  }
  const platform = parts[0]; // WEB / IOS / AND
  const timestamp = parts[1]; // 加密时间戳段
  const suffix = parts[2]; // 随机后缀
  // 时间戳段保前 4 后 0，中间星号
  const maskedTs = timestamp.length <= 4 ? timestamp : timestamp.slice(0, 4) + '***';
  return `${platform}-${maskedTs}-${suffix}`;
}

/**
 * 格式化用户登录设备列表（DB session_tokens 维度，含历史）
 *
 * @param {Array} rows - SessionToken.findAll 返回的原始行（含 token 字段用于标记当前会话）
 * @param {string} [currentTokenHash] - 当前会话的 sha256(sid)（用于标记 isCurrent，比对 r.token）
 * @returns {{devices: Array, total: number}}
 */
function formatDeviceList(rows, currentTokenHash) {
  return {
    devices: rows.map(r => ({
      id: r.id,
      appId: r.app_id,
      deviceId: maskDeviceId(r.device_id),
      ip: r.ip,
      userAgent: r.user_agent,
      lastActive: r.last_active,
      revoked: r.revoked,
      stale: isStaleSession(r),
      isCurrent: currentTokenHash ? r.token === currentTokenHash : false
    })),
    total: rows.length
  };
}

export { formatSessionList, maskDeviceId, formatDeviceList };
