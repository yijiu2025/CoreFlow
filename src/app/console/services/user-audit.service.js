/**
 * 用户管理写操作的审计留痕
 *
 * 为什么单独一层：用户管理页的写按钮原本各自决定要不要记 —— 结果是「冻结/解冻」
 * 「新建用户」「导出」「批量授权」一条都没进 `audit_logs`，事后只能看到"这个人
 * 某天登录过"，查不出是谁把谁冻结了。审计的判据必须只有一处：哪些动作算高影响、
 * details 要带什么字段，全部收敛到这里。
 *
 * 🔴 事件码与前端 `scaffold/src/utils/operLogSummary.ts` 一一对应。
 *    新增事件码必须同步加摘要 case，否则日志页只会显示一串英文码。
 *
 * @author yijiu2025
 * @since 2026-11-17
 */
import roleDao from '../dao/role.dao.js';
import { logAuditEvent } from '../../../framework/security/auth/index.js';
import Logger from '../../../framework/support/log/index.js';

/** 用户管理相关审计事件码 */
const USER_EVENTS = {
  /** 新建账号（含首轮角色授予） */
  CREATE: 'USER_CREATE',
  /** 修改资料 / 部门 / 岗位 / 状态（字段级差集） */
  UPDATE: 'USER_UPDATE',
  /** 启用 / 冻结（单独的按钮，语义必须能单独检索） */
  STATUS: 'USER_STATUS',
  /** 导出名单（数据外带） */
  EXPORT: 'USER_EXPORT',
  /** 批量授权 */
  BATCH_GRANT: 'USER_BATCH_GRANT'
};

/**
 * 状态码 → 中文
 *
 * 与 `models/user/User.js` 的列注释一致：1 正常 / 0 冻结 / -1 已注销 / -2 待注销。
 * 日志里写 `status: 1 → 0` 没人看得懂，必须写成人话。
 */
const STATUS_TEXT = {
  1: '正常',
  0: '冻结',
  '-1': '已注销',
  '-2': '待注销'
};

/**
 * 状态码转中文
 *
 * @param {number|string|null|undefined} status 状态码
 * @returns {string} 中文；未知码原样返回（不猜）
 */
function statusText(status) {
  if (status === null || status === undefined || status === '') return '未知';
  const key = String(Number(status));
  return STATUS_TEXT[key] || `状态${key}`;
}

/** 会参与 diff 的资料字段：键名 = 前端视角，取值 = 数据库列名 */
const PROFILE_FIELDS = [
  ['username', 'username'],
  ['email', 'email'],
  ['deptId', 'dept_id'],
  ['status', 'status']
];

/**
 * 资料变更的字段级差集
 *
 * 只比**本次提交过的字段**：`undefined` 表示请求里没这个键（PUT 是部分更新语义），
 * 把它当成"改成空"会让每条日志都凭空多出几行噪音。
 *
 * 返回结构与前端 `changeText()` 的约定一致：`{ field, from, to }`。
 *
 * @param {object|null} before 变更前（数据库行或快照）
 * @param {object} submitted 本次提交的字段
 * @returns {{field: string, from: unknown, to: unknown}[]} 变化的字段
 */
function diffProfile(before, submitted) {
  const changes = [];
  for (const [key, column] of PROFILE_FIELDS) {
    const next = submitted?.[key];
    if (next === undefined) continue;
    const prev = before ? before[column] : null;
    const normalizedPrev = key === 'status' ? normalizeStatus(prev) : normalize(prev);
    const normalizedNext = key === 'status' ? normalizeStatus(next) : normalize(next);
    if (normalizedPrev === normalizedNext) continue;
    changes.push({
      field: key,
      from: key === 'status' ? statusText(normalizedPrev) : normalizedPrev,
      to: key === 'status' ? statusText(normalizedNext) : normalizedNext
    });
  }
  return changes;
}

/**
 * 归一化标量：null/undefined/'' 统一成 null，其余转字符串再比较
 *
 * 不归一化时 `null` 与 `''`、`0` 与 `'0'` 会被判成"变了"，生成一整屏假变更。
 *
 * @param {unknown} value 原值
 * @returns {string|null} 归一化结果
 */
function normalize(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

/**
 * 归一化状态码：非数字一律 null
 *
 * @param {unknown} value 原值
 * @returns {number|null} 状态码
 */
function normalizeStatus(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * 角色 ID → 角色名
 *
 * 日志里写 `roleIds: [3,7]` 等于没写，事后还要再查一次表才知道给了什么权限。
 *
 * @param {number[]|null|undefined} roleIds 角色 ID
 * @returns {Promise<string[]>} 角色名（查不到的用 `#id` 占位）
 */
async function roleNamesOf(roleIds) {
  const ids = Array.from(new Set((Array.isArray(roleIds) ? roleIds : []).map(Number).filter(n => n > 0)));
  if (ids.length === 0) return [];
  try {
    return await roleDao.findNames(ids);
  } catch (err) {
    // 名字只是可读性，查不到不能拖垮业务；ID 仍然留在 details 里
    Logger.warn(`[UserAudit] 角色名解析失败: ${err?.message}`);
    return ids.map(id => `#${id}`);
  }
}

/**
 * 写一条用户管理审计
 *
 * 统一带上操作者 / IP / UA / 设备码（设备码由 logAuditEvent 从请求上下文取），
 * 调用方只需要说清「对谁做了什么」。
 *
 * 审计失败不抛：它是业务附属，不该让"记录失败"变成"操作失败"。
 *
 * @param {object} request Fastify 请求
 * @param {string} type 事件码（见 USER_EVENTS）
 * @param {object} payload 载荷
 * @param {number|null} [payload.targetId] 目标用户 ID
 * @param {string} [payload.targetUsername] 目标账号（列表里直接可读）
 * @param {object} [payload.details] 事件详情
 * @returns {Promise<void>}
 */
async function auditUser(request, type, payload = {}) {
  const { targetId = null, targetUsername = '', details = {} } = payload;
  try {
    await logAuditEvent({
      type,
      userId: Number(request?.state?.user?.userId) || null,
      ip: request?.ip || null,
      userAgent: request?.headers?.['user-agent'] || '',
      appId: 'console',
      details: { targetId, targetUsername, ...details }
    });
  } catch (err) {
    Logger.warn(`[UserAudit] 写入失败 type=${type} target=${targetId}: ${err?.message}`);
  }
}

export { USER_EVENTS, statusText, diffProfile, roleNamesOf, auditUser };
