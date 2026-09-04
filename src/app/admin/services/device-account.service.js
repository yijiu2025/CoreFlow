/**
 * 设备账户关联查询服务（管理端）
 *
 * 按 device_id 反查该设备登录过的所有账户：session_tokens 以 device_id 为索引
 * （同 user_id+device_id upsert 幂等，一行即一个"用户×设备"组合），关联 User
 * 模型聚合出账户视图，供安全审计使用。
 *
 * 扩展点：响应中每个账户含 uid 列表，后续"账户关联"功能可直接基于
 * 同设备 uid 集合建立关联关系（本服务只做只读查询，不做任何写操作）。
 *
 * 隐私边界：仅管理端（allowRoles: ['admin']）可调用；用户信息只出
 * uid/username/email/avatar/status，不外露内部数字 id。
 *
 * @author yijiu2025
 * @since 2026-09-05
 */
import { getModel } from '../../../framework/db/index.js';
import { parseDeviceId } from '../../../framework/auth/device-id-service.js';

/** device_id 字段列宽（SessionToken.device_id STRING(100)），防御超长输入 */
const MAX_DEVICE_ID_LENGTH = 100;

/**
 * 单行会话记录 → 账户条目（聚合中间态）
 * @param {object} row SessionToken 行（含 user include）
 * @returns {object} 账户条目
 */
function toAccountEntry(row) {
  const user = row.user || {};
  return {
    uid: user.uid || null,
    username: user.username || null,
    email: user.email || null,
    avatar: user.avatar || null,
    status: user.status ?? null,
    loginCount: 1,
    apps: row.app_id ? [row.app_id] : [],
    firstSeenAt: row.created_at || row.updated_at || null,
    lastActiveAt: row.last_active || null,
    hasActiveSession: row.revoked === false
  };
}

/**
 * 合并同一账户的多条会话记录（同 user+device upsert 幂等，通常一行；
 * 历史数据可能存在多行，此处按 uid 聚合兜底）
 * @param {object} acc 聚合中的账户条目
 * @param {object} row 新的会话行
 */
function mergeAccountEntry(acc, row) {
  acc.loginCount += 1;
  if (row.app_id && !acc.apps.includes(row.app_id)) acc.apps.push(row.app_id);
  const seen = row.created_at || row.updated_at;
  if (seen && (!acc.firstSeenAt || new Date(seen) < new Date(acc.firstSeenAt))) {
    acc.firstSeenAt = seen;
  }
  if (row.last_active && (!acc.lastActiveAt || new Date(row.last_active) > new Date(acc.lastActiveAt))) {
    acc.lastActiveAt = row.last_active;
  }
  if (row.revoked === false) acc.hasActiveSession = true;
}

/**
 * 按 device_id 查询该设备登录过的账户摘要
 *
 * 查询使用 Sequelize 模型方法（参数绑定，device_id 走独立索引），
 * 不拼接 SQL。老格式 UUID 等非结构化存量 device_id 也可查询
 * （parseDeviceId 仅用于补充结构化信息，不作为过滤条件）。
 *
 * @param {string} deviceId 设备 ID
 * @returns {Promise<object|null>} 设备账户摘要；入参非法返回 null
 * @property {string} deviceId 回显的设备 ID
 * @property {object|null} structured 结构化信息（platform/createdAt/age），非结构化 ID 为 null
 * @property {number} totalAccounts 该设备登录过的账户数
 * @property {Array} accounts 账户列表（按最后活跃倒序）
 * @property {string|null} firstSeenAt 该设备最早出现时间
 * @property {string|null} lastActiveAt 该设备最后活跃时间
 */
export async function getDeviceAccountSummary(deviceId) {
  if (typeof deviceId !== 'string' || !deviceId || deviceId.length > MAX_DEVICE_ID_LENGTH) {
    return null;
  }

  const SessionToken = getModel('SessionToken');
  const User = getModel('User');
  if (!SessionToken || !User) {
    const err = new Error('SessionToken / User 模型未加载');
    err.code = 'MODEL_NOT_LOADED';
    throw err;
  }

  const rows = await SessionToken.findAll({
    where: { device_id: deviceId },
    include: [{ model: User, as: 'user', attributes: ['uid', 'username', 'email', 'avatar', 'status'] }],
    order: [['last_active', 'DESC']],
    attributes: ['user_id', 'app_id', 'device_id', 'last_active', 'revoked', 'created_at', 'updated_at']
  });

  // 按 uid 聚合（rows 已按 last_active 倒序，首条即该账户最近活跃条目）
  const byUid = new Map();
  for (const row of rows) {
    const entry = toAccountEntry(row);
    const existing = byUid.get(entry.uid);
    if (existing) {
      mergeAccountEntry(existing, row);
    } else {
      byUid.set(entry.uid, entry);
    }
  }

  const accounts = [...byUid.values()];
  const structuredInfo = parseDeviceId(deviceId);

  return {
    deviceId,
    structured: structuredInfo
      ? { platform: structuredInfo.platform, createdAt: structuredInfo.createdAt, ageDays: structuredInfo.ageDays }
      : null,
    totalAccounts: accounts.length,
    accounts,
    firstSeenAt: accounts.reduce(
      (min, a) => (a.firstSeenAt && (!min || new Date(a.firstSeenAt) < new Date(min)) ? a.firstSeenAt : min),
      null
    ),
    lastActiveAt: rows[0]?.last_active || null
  };
}
