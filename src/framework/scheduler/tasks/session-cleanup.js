/**
 * Session Tokens 清理任务
 *
 * 清理 session_tokens 表的陈旧孤儿行：
 * - device_id 重生（verifyAndNormalizeDeviceId 对超 365 天的老 ID 重生）后，旧 device_id 的行变孤儿
 * - checkMaxSessions 已把超 30 天的标 revoked=true（保留审计），本任务只删 revoked 且再超
 *   retentionDays 的行，既防 DB 膨胀又留够审计窗口
 *
 * 硬删（SessionToken 无 paranoid）。配置见 scheduler_config.json 的 tasks.sessionCleanup。
 *
 * @author yijiu2025
 * @since 2026-09-03
 */
import { pruneStaleSessionTokens } from '../../auth/session.js';
import { C } from '../../../utils/colors.js';

export default {
  /**
   * @param {object} app Fastify 实例（本任务不强依赖，保留参数供未来任务用）
   * @param {object} taskConfig 任务配置 { enabled, intervalHours, retentionDays }
   */
  async run(app, taskConfig) {
    const retentionDays = taskConfig?.retentionDays ?? 90;
    const deleted = await pruneStaleSessionTokens(retentionDays);
    if (deleted > 0) {
      console.log(`🧹 [Scheduler:sessionCleanup] ${C.cyan}清理陈旧 session_tokens: ${deleted} 行 (revoked 且超 ${retentionDays} 天)${C.reset}`);
    }
  }
};
