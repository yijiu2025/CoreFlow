/**
 * 用户会话视图服务
 *
 * 从 api/user/v1/sessions.js 下沉：活跃会话列表的格式化（截断 sessionId、标记当前会话）。
 * 纯投影函数，无副作用。
 *
 * @author yijiu
 * @since 2026-08-16
 */

/**
 * 格式化会话列表为前端视图
 * @param {Array} sessions - checkMaxSessions 返回的原始会话列表
 * @param {string} [currentSid] - 当前请求的 sid cookie（用于标记 isCurrent）
 * @returns {{sessions: Array, total: number}}
 */
export function formatSessionList(sessions, currentSid) {
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
export function maskDeviceId(deviceId) {
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
  const maskedTs =
    timestamp.length <= 4 ? timestamp : timestamp.slice(0, 4) + '***';
  return `${platform}-${maskedTs}-${suffix}`;
}

/**
 * 格式化用户登录设备列表（DB session_tokens 维度，含历史）
 *
 * @param {Array} rows - SessionToken.findAll 返回的原始行（含 token 字段用于标记当前会话）
 * @param {string} [currentTokenHash] - 当前会话的 sha256(sid)（用于标记 isCurrent，比对 r.token）
 * @returns {{devices: Array, total: number}}
 */
export function formatDeviceList(rows, currentTokenHash) {
  return {
    devices: rows.map(r => ({
      id: r.id,
      appId: r.app_id,
      deviceId: maskDeviceId(r.device_id),
      ip: r.ip,
      userAgent: r.user_agent,
      lastActive: r.last_active,
      revoked: r.revoked,
      isCurrent: currentTokenHash ? r.token === currentTokenHash : false
    })),
    total: rows.length
  };
}

