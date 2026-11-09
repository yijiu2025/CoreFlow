/**
 * 安全配置变更的授权判据
 *
 * 单独成文件而不是塞进 stepup.service，有两个理由：
 * 1. 判据要同时被"发码入口"和"写入路径"使用，放在任一方都会让另一方产生多余依赖；
 * 2. 它是纯函数、不碰 DB/Redis/邮件，测试可以真实加载 ——
 *    若把它和 step-up 的状态机混在一起，测试就只能用假桩，等于没测到判据本身。
 *
 * ── 谁能改 ──
 * 只认**超级管理员**：角色含 `superadmin`，或权限集含通配 `*`。
 * 刻意不看 `fw:config:write` —— 那个权限可以授给运维，
 * 而安全配置的变更权不该随运维角色扩散。
 *
 * ── 超管邮箱 ──
 * 环境变量 `GUARD_SUPERADMIN_EMAILS`（逗号分隔）可进一步锁定允许的邮箱。
 * 目的是防"超管账号被换绑邮箱后用新邮箱收码"。
 * 未配置时退化为"超管账号自己绑定的邮箱"（不 fail-closed，否则新部署无从改配置），
 * 但会在使用时告警一次。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */
import { parseCsvList } from '../../../utils/index.js';

/** 超级管理员角色码（定义见各 app 的 permission/roles.js 与 scripts/setup-superadmin.js） */
const SUPERADMIN_ROLE = 'superadmin';

/**
 * 是否为超级管理员
 *
 * `permissions` 的形状是 `{allows, denies}`（见 framework/security/auth/permission/permission-loader.js），
 * 这里同时兼容旧数组形状，避免历史会话里的结构差异导致误判。
 *
 * @param {object} user request.state.user
 * @returns {boolean}
 */
function isSuperAdmin(user) {
  if (!user) return false;

  const roles = Array.isArray(user.roles) ? user.roles : [];
  if (roles.includes(SUPERADMIN_ROLE)) return true;

  const perms = user.permissions;
  const allows = Array.isArray(perms) ? perms : Array.isArray(perms?.allows) ? perms.allows : [];
  return allows.includes('*');
}

/**
 * 超管邮箱白名单
 *
 * @returns {string[]} 小写化的邮箱列表；未配置时为空数组
 */
function allowedSuperAdminEmails() {
  // 邮箱域大小写不敏感 → 统一小写后再比对（见 assertChangeAuthority）
  return parseCsvList(process.env.GUARD_SUPERADMIN_EMAILS).map(email => email.toLowerCase());
}

/**
 * 校验"这个操作者是否可以发起安全配置变更"
 *
 * @param {object} user request.state.user
 * @param {string} [email] 账号在库中绑定的邮箱（email 方式时用于白名单比对）
 * @returns {{ok:true} | {ok:false, statusCode:number, message:string}}
 */
function assertChangeAuthority(user, email) {
  if (!isSuperAdmin(user)) {
    return { ok: false, statusCode: 403, message: '安全配置仅允许超级管理员操作' };
  }

  const allowed = allowedSuperAdminEmails();
  // 未配置白名单 = 只靠角色兜底：不阻断，否则新部署会因为漏配一个环境变量而无法改配置
  if (allowed.length === 0) return { ok: true };

  if (!email) {
    return { ok: false, statusCode: 403, message: '超管邮箱白名单已启用，但当前账号未绑定邮箱' };
  }
  if (!allowed.includes(String(email).toLowerCase())) {
    return { ok: false, statusCode: 403, message: '当前账号绑定的邮箱不在超管邮箱白名单内' };
  }

  return { ok: true };
}

export { SUPERADMIN_ROLE, isSuperAdmin, allowedSuperAdminEmails, assertChangeAuthority };
