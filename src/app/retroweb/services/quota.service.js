/**
 * RetroWeb 配额服务
 *
 * 规则（用户拍板）：**普通用户 2 个任务，会员用户 50 个**。
 *
 * 🔴 会员判定用**权限点** `retroweb:quota:member`，不是角色码：
 *    权限可单独授予给某个用户（管理后台勾一下即可），角色只是打包。
 *    写死 `role === 'retroweb_member'` 会让"给一个人单独提额"变成改代码。
 *
 * 🔴 校验只在**新建任务**入口做一次。快照更新（改树、采纳分支）绝不做配额校验 ——
 *    否则用户配额满了就**连已有任务都改不动**，这是最糟糕的失败形态。
 *
 * 🔴 软删任务仍占配额：`paranoid` 的软删只是不显示，"删了再建"不能用来绕过上限。
 *
 * @since 2026-10-09
 */
import { getModel } from '../../../framework/db/index.js';
import { RETROWEB_PERMISSIONS } from '../permission/index.js';

/** 任务数上限：普通 2 / 会员 50 */
const TASK_QUOTA = {
  FREE: 2,
  MEMBER: 50
};

/** 配额超限（路由层转成 429） */
class QuotaExceededError extends Error {
  /**
   * @param {number} limit 上限
   * @param {number} used  当前用量
   */
  constructor(limit, used) {
    super(`任务数已达上限（${limit} 个，当前 ${used} 个）`);
    this.name = 'QuotaExceededError';
    this.limit = limit;
    this.used = used;
  }
}

/**
 * 该用户的任务上限
 * @param {{permissions?: string[]}} user request.state.user（含 permissions）
 * @returns {number}
 */
function limitFor(user) {
  const perms = user?.permissions;
  if (Array.isArray(perms) && perms.includes(RETROWEB_PERMISSIONS.QUOTA.MEMBER)) {
    return TASK_QUOTA.MEMBER;
  }
  return TASK_QUOTA.FREE;
}

/** 当前任务数（含软删的，见头部注释） */
async function countTasks(userId) {
  const Task = getModel('retroweb.Task');
  return await Task.count({ where: { user_id: userId }, paranoid: false });
}

/**
 * 配额概览
 * @param {object} user request.state.user
 * @returns {Promise<{limit: number, used: number, remaining: number, member: boolean}>}
 */
async function quotaOf(user) {
  const limit = limitFor(user);
  const used = await countTasks(user.userId);
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    member: limit === TASK_QUOTA.MEMBER
  };
}

/**
 * 新建任务前调用：超限抛 QuotaExceededError
 * @param {object} user request.state.user
 * @returns {Promise<{limit: number, used: number, remaining: number, member: boolean}>}
 */
async function assertCanCreate(user) {
  const quota = await quotaOf(user);
  if (quota.used >= quota.limit) throw new QuotaExceededError(quota.limit, quota.used);
  return quota;
}

export { TASK_QUOTA, QuotaExceededError, limitFor, countTasks, quotaOf, assertCanCreate };
