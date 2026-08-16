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
