/**
 * 授权记录数据访问层
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import sequelize from '../../../framework/persistence/db/index.js';
import { getModel } from '../../../framework/persistence/db/index.js';
import { getAppConfig, resolvePermissionAppId } from '../../../framework/config/app-registry.js';
import {
  NORMAL_RANK_MAX,
  defaultRoleCandidates,
  getDeclaredDefaultRole
} from '../../../framework/security/pbac/index.js';
import { createLogger } from '../../../framework/support/log/index.js';

const log = createLogger('app.oauth21.approval');

/** 获取 OauthApproval 模型 (延迟加载) */
const getOauthApproval = () => getModel('OauthApproval');

/**
 * 解析某应用的默认普通角色
 *
 * 三级来源，逐级回落且**每级都留痕**：
 *   1. `config.js` 的 `default_role` —— 主口径（运维改配置优先于改代码）；
 *   2. `roles.js` 里 `is_default: true` 的角色 —— 辅口径（贴着定义写，不易漏）；
 *   3. 该命名空间**职级最低**的角色，但必须落在 `NORMAL_RANK_MAX` 以内。
 *
 * 🔴 旧实现写死 `rank_level: 1`，而业务应用的最低职级都是 10
 *    （posecraft_user / fw_viewer / oauth_viewer / retroweb_user / admin_viewer），
 *    全库唯一 rank=1 的是 GLOBAL 的 `user_banned` ⇒ 查询恒为 null，
 *    "授权即自动授予普通角色"**从未真正生效**，而且是静默失败。
 *
 * 🔴 查询用**权限命名空间**而不是 OAuth client id：console 的登录应用是 `console`，
 *    角色住在 `admin`（`config.permission_app_id`）。按 `app_id: appId` 查，
 *    console 授权时一条角色都取不到 —— 与 `loadUserPermissions` 里踩过的是同一个坑。
 *
 * `config.default_role: null` 是**显式"不自动授予"**（如只发管理员的 notice），
 * 此时直接返回 null，不再走兜底 —— 否则"我明确说了不要"会被最低职级覆盖。
 *
 * @param {string} appId 应用 ID（OAuth client id，如 `console` / `posecraft`）
 * @param {object} transaction 事务
 * @returns {Promise<object|null>} 角色实例；该应用没有可当默认的角色时为 null
 */
async function resolveDefaultRole(appId, transaction) {
  const Role = getModel('Role');
  const config = getAppConfig(appId);
  const namespace = resolvePermissionAppId(appId) || appId;

  if (config && Object.prototype.hasOwnProperty.call(config, 'default_role') && config.default_role === null) {
    log.dev(`应用 ${appId} 显式声明 default_role: null，跳过自动授予`);
    return null;
  }

  const candidates = defaultRoleCandidates({
    configDefaultRole: typeof config?.default_role === 'string' ? config.default_role : null,
    codeDefaultRole: getDeclaredDefaultRole(namespace)
  });

  for (const { code, source } of candidates) {
    const pinned = await Role.findOne({
      where: { app_id: namespace, code, delete_version: 0 },
      transaction
    });
    if (!pinned) {
      // 声明了却查不到：继续走下一来源，但必须留痕 —— 否则又是一次静默失效
      log.warn(
        `应用 ${appId} 的默认角色候选 ${code}（来源: ${source === 'config' ? 'config.default_role' : 'roles.js is_default'}）` +
          `在命名空间 ${namespace} 下不存在，继续回落`
      );
      continue;
    }

    if (Number(pinned.rank_level) > NORMAL_RANK_MAX) {
      // 显式声明错了就别偷偷换成别的角色 —— 那是"看起来授了，授的却是另一个身份"
      log.error(
        `应用 ${appId} 的默认角色 ${code}（来源: ${source}）rank_level=${pinned.rank_level} 超过普通档上限 ` +
          `${NORMAL_RANK_MAX}，已拒绝授予；请修正 config.default_role / roles.js 的 is_default`
      );
      return null;
    }

    return pinned;
  }

  const lowest = await Role.findOne({
    where: { app_id: namespace, delete_version: 0 },
    order: [
      ['rank_level', 'ASC'],
      ['id', 'ASC']
    ],
    transaction
  });
  if (!lowest) {
    log.warn(`应用 ${appId}（命名空间 ${namespace}）没有任何角色，授权时无法授予默认角色`);
    return null;
  }
  if (Number(lowest.rank_level) > NORMAL_RANK_MAX) {
    // 宁可"什么都不授"，也不能把管理员角色当普通角色发出去
    log.warn(
      `应用 ${appId} 最低职级角色 ${lowest.code}(rank=${lowest.rank_level}) 超过普通档上限 ` +
        `${NORMAL_RANK_MAX}，已跳过自动授予；请在该应用 config 里显式声明 default_role（有意不授予就写 null）`
    );
    return null;
  }
  return lowest;
}

/**
 * 补齐用户在该应用下的默认角色（幂等）
 *
 * 放在授权流程里、且**不区分首次/重复授权**：修复前授权的老用户没有角色，
 * 重新登录一次即可自愈，不需要一次性回填脚本。
 *
 * @param {object} params 参数
 * @param {string} params.sub 用户 sub（即 uid）
 * @param {string} params.appId 应用 ID
 * @param {object} params.transaction 事务
 * @returns {Promise<void>}
 */
async function grantDefaultRole({ sub, appId, transaction }) {
  const defaultRole = await resolveDefaultRole(appId, transaction);
  if (!defaultRole) return;

  const user = await getModel('User').findOne({ where: { uid: sub }, transaction });
  if (!user) return;

  await getModel('UserRole').findOrCreate({
    where: { user_id: user.id, app_id: appId, role_id: defaultRole.id },
    defaults: { user_id: user.id, app_id: appId, role_id: defaultRole.id },
    transaction
  });
}

class ApprovalDao {
  /**
   * 检查用户是否已授权某应用
   * @param {string} sub 用户 UUID
   * @param {string} appId 应用ID
   * @returns {Promise<object|null>}
   */
  async getEffectiveApproval(sub, appId) {
    const OauthApproval = getOauthApproval();
    return await OauthApproval.findOne({
      where: {
        sub,
        app_id: appId, // 使用下划线关联查询底层物理字段
        status: 1 // 必须是正常状态
      }
    });
  }

  /**
   * 保存或更新授权记录 (幂等操作)，并自动授予默认角色
   * @param {object} params
   */
  async saveApproval({ uid, sub, appId, scopes }) {
    const OauthApproval = getOauthApproval();
    const userSub = sub || uid; // 兼容并包：允许传入 uid 或 sub，一律映射为 sub
    const t = await sequelize.transaction();
    try {
      const [approval, created] = await OauthApproval.findOrCreate({
        where: { sub: userSub, app_id: appId },
        defaults: {
          sub: userSub,
          app_id: appId,
          scopes, // Natively handles JSON array, no need for JSON.stringify()
          status: 1
        },
        transaction: t
      });

      if (!created) {
        // 如果已存在，仅更新 scopes 和授权时间
        approval.scopes = scopes; // Natively handles JSON array
        approval.status = 1;
        approval.last_auth_at = new Date();
        await approval.save({ transaction: t });
      }

      /*
       * 首次授权与重复授权都补齐默认角色（幂等）。
       *
       * 刻意放在分支外：修复前授权的老用户库里没有应用角色（旧实现查 rank_level=1
       * 恒为空），让他们下次登录就自愈，比写一次性回填脚本更可靠 —— 回填脚本只跑一次，
       * 而漏掉的用户会在下一次授权时自动补上。
       */
      await grantDefaultRole({ sub: userSub, appId, transaction: t });

      await t.commit();
      return approval;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  /**
   * 封禁/撤销授权
   */
  async revokeApproval(sub, appId) {
    const OauthApproval = getOauthApproval();
    return await OauthApproval.update({ status: 0 }, { where: { sub, app_id: appId } });
  }
}

const approvalDao = new ApprovalDao();

export default approvalDao;
