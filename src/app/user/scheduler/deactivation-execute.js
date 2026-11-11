/**
 * 到期注销执行任务（应用级任务，由调度器按 `src/app/<app>/scheduler/` 约定发现）
 *
 * 做什么：把 `user_deactivation` 里 **缓冲期已满** 的申请正式执行 ——
 * 清该用户在各应用的 OAuth 授权 / 令牌 / 会话 / 角色 / 岗位 / 偏好，并在 `scope=all`
 * 时软删主账号。然后顺手清理过期的临时密码（短时凭据，没有长期留存的理由）。
 *
 * 为什么需要它：注销设计成"先拒登录、到期再清理"，如果没人扫到期队列，那些账号就
 * 永远停在"待注销"状态 —— 登录被拒、数据还在，比直接删更糟（用户以为注销了，实则没有）。
 *
 * 配置（data/scheduler_config.json → tasks.deactivation-execute）：
 * - `intervalHours`：扫描间隔（默认 1 小时）
 * - `batchSize`：单轮最多处理多少条（防止一次拉太多把库压住）
 * - `retentionDays`：临时密码过期后再保留多久（审计窗口）
 *
 * @author yijiu2025
 * @since 2026-11-11
 */
import deactivationDao from '../dao/deactivation.js';
import deactivationService from '../services/deactivation.service.js';
import tempPasswordService from '../services/temp-password.service.js';
import { C } from '../../../utils/index.js';
import { createLogger } from '../../../framework/support/log/index.js';

const log = createLogger('app.user.scheduler.deactivation-execute');

/** 单轮默认处理条数（超过就留到下一轮，避免长事务把库拖住） */
const DEFAULT_BATCH = 50;

const deactivationExecuteTask = {
  /**
   * @param {object} app Fastify 实例（本任务不强依赖）
   * @param {object} taskConfig 任务配置
   * @returns {Promise<void>}
   */
  async run(app, taskConfig) {
    const batch = Math.max(Number(taskConfig?.batchSize) || DEFAULT_BATCH, 1);
    const retentionDays = Number(taskConfig?.retentionDays ?? 7);

    const due = await deactivationDao.findExecutable(batch);
    let executed = 0;
    let failed = 0;

    for (const row of due) {
      try {
        // 不传 force：DAO 已经筛出"已到期"，这里再让 service 校一次，双保险

        await deactivationService.executeDeactivation(row.id, {});
        executed += 1;
      } catch (err) {
        failed += 1;
        // 单条失败不中断整轮：一条脏数据不该让其他待注销账号永远排队
        log.error(`❌ [Scheduler:deactivation] 执行注销 #${row.id} 失败`, err);
      }
    }

    /*
     * 补踢残留会话：注销时如果 Redis 不可用，活跃会话只 revoke 了 DB、留在 Redis 里。
     * 只在登录时补踢不够 —— 离职 / 交接的账号可能再也不登录了，而他的会话还活着。
     */
    const kicked = await deactivationService.retryAllPendingKicks(batch);

    const pruned = await tempPasswordService.prune(retentionDays);

    if (executed > 0 || failed > 0 || kicked.cleared > 0 || kicked.failed > 0 || pruned > 0) {
      log.info(
        `🧹 [Scheduler:deactivation] ${C.cyan}到期注销 ${executed} 条` +
          `${failed > 0 ? `（失败 ${failed} 条）` : ''}` +
          `，补踢会话 ${kicked.cleared} 条${kicked.failed > 0 ? `（仍失败 ${kicked.failed} 条）` : ''}` +
          `，清理过期临时密码 ${pruned} 条${C.reset}`
      );
    }
  }
};

export default deactivationExecuteTask;
