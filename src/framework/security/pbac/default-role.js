/**
 * 默认（授权即送）角色的解析与审计
 *
 * 「用户授权某应用时自动授予一个普通角色」这件事，默认角色从哪来，历史上只有一条
 * 路：`resolveDefaultRole()` 查该应用**职级最低**的角色。那条路是隐式的 ——
 * 角色定义写完就能跑，谁也没意识到"最低职级"可能是管理员，直到 2026-11 的
 * 一次排查发现 `user_banned`(rank=1) 成了 GLOBAL 的默认角色。
 *
 * 现在改成**显式声明 + 兜底**两级来源：
 *
 *   1. `src/app/<app>/config.js` 的 `default_role`（编码）—— 主口径，可运维覆盖；
 *   2. `roles.js` 里该角色上的 `is_default: true` —— 辅口径，贴着定义写，不容易漏；
 *   3. 两者都没有时才回落最低职级，并要求 `rank_level <= NORMAL_RANK_MAX`。
 *
 * 本模块只做三件**无副作用**的事：登记代码声明、给出有序候选、审计配置一致性。
 * 查库与授予仍在 `app/oauth21/dao/approval.dao.js`（那里才有模型与事务）。
 *
 * 为什么单独成文件而不是塞进 `pbac/index.js`：index 是注册表门面（define* 与两个
 * registry），这里是不带状态的策略判定；`framework/security/auth` 与 loader 都要读它，
 * 从门面 re-export 会让 import 图变宽而无收益。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */

/**
 * 「普通用户」档位的职级上限
 *
 * 超过它的角色不可能是"授权即送"的默认角色（`notice_admin` 60 这种唯一角色，
 * 若被当成默认角色，等于给每个授权的人发管理员）。
 */
const NORMAL_RANK_MAX = 20;

/**
 * `iam_role.rank_level` 的合法区间
 *
 * 与 `models/iam/Role.js` 的 `validate: { min: 0, max: 99 }` 是同一条规则的两处写法 ——
 * 这里不能 import 模型（framework/security 反向依赖 persistence 会成环），
 * 所以由 `__tests__/permission/role-rank-levels.test.js` 断言两边一致。
 */
const RANK_LEVEL_MIN = 0;
const RANK_LEVEL_MAX = 99;

/** namespace（`iam_role.app_id`）→ 被标记为默认角色的 code */
const declaredDefaults = new Map();

/**
 * 登记一条「代码声明」的默认角色（由 `defineRoles` 在校验通过后调用）
 *
 * 不做唯一性校验 —— 冲突在 `defineRoles` 里就要抛错，走到这里的一定是干净的。
 *
 * @param {string} appId 权限命名空间（`role.app_id`）
 * @param {string} code 角色编码
 * @returns {void}
 */
function registerDeclaredDefaultRole(appId, code) {
  if (!appId || !code) return;
  declaredDefaults.set(String(appId), String(code));
}

/**
 * 取某命名空间下由 `roles.js` 声明的默认角色编码
 *
 * @param {string} appId 权限命名空间（`iam_role.app_id`，注意不是 OAuth client id）
 * @returns {string|null} 未声明时为 null
 */
function getDeclaredDefaultRole(appId) {
  if (!appId) return null;
  return declaredDefaults.get(String(appId)) ?? null;
}

/**
 * 全部代码声明（调试 / 审计用）
 *
 * @returns {Array<{appId: string, code: string}>}
 */
function listDeclaredDefaultRoles() {
  return [...declaredDefaults.entries()].map(([appId, code]) => ({ appId, code }));
}

/**
 * 清空代码声明（**仅供测试**）
 * @returns {void}
 */
function resetDeclaredDefaultRolesForTesting() {
  declaredDefaults.clear();
}

/**
 * 有序的默认角色候选：**config 优先，代码声明为辅**，同码去重
 *
 * 调用方按顺序查库，第一个命中即用；前一个失效时继续下一个并在日志里留痕，
 * 而不是直接掉到"最低职级"这个兜底 —— 少一层回落就少一次静默失效。
 *
 * @param {object} params 参数
 * @param {string|null} [params.configDefaultRole] config.js 声明的编码
 * @param {string|null} [params.codeDefaultRole] roles.js 里 is_default 的编码
 * @returns {Array<{code: string, source: 'config'|'role'}>} 候选（可能为空数组）
 */
function defaultRoleCandidates({ configDefaultRole, codeDefaultRole } = {}) {
  const candidates = [];

  for (const [code, source] of [
    [configDefaultRole, 'config'],
    [codeDefaultRole, 'role']
  ]) {
    if (typeof code !== 'string' || !code.trim()) continue;
    if (candidates.some(item => item.code === code)) continue;
    candidates.push({ code, source });
  }

  return candidates;
}

/**
 * 取职级最低的角色（同职级按定义顺序）
 *
 * @param {Array<object>} roles 角色定义数组
 * @returns {object|null}
 */
function pickLowestRole(roles) {
  if (!Array.isArray(roles) || roles.length === 0) return null;

  return roles.reduce((lowest, role) => {
    if (!lowest) return role;
    return Number(role.rank_level) < Number(lowest.rank_level) ? role : lowest;
  }, null);
}

/**
 * 职级是否落在"普通用户"档（可作为授权即送的默认角色）
 *
 * @param {number} rank 职级
 * @returns {boolean}
 */
function isNormalRank(rank) {
  const value = Number(rank);
  return Number.isFinite(value) && value <= NORMAL_RANK_MAX;
}

/**
 * 审计「默认角色」声明的一致性（**不查库**，只看内存里的 config 与角色定义）
 *
 * 为什么要在启动期做这件事：默认角色的三种失效方式全是静默的 ——
 *   · config 声明的 code 拼错 → 查不到 → 悄悄回落到最低职级（可能是管理员）；
 *   · 什么都没声明 → 靠最低职级兜底，谁也没注意兜到的是哪个角色；
 *   · 一个应用标了两个 `is_default` → 授予哪一个取决于代码顺序。
 * 前两条在这里报出来，第三条在 `defineRoles` 里直接抛错。
 *
 * 判据用**内存定义**而不是库表：`iam_role` 是这批定义的投影，库里多出来的历史行
 * 不该影响"应该授予谁"的结论；而且这样审计可以在同步 DB 之前/之后任意位置跑。
 *
 * @param {object} params 参数
 * @param {object[]} [params.configs] 已登记的 `config.js`（`listAppConfigs()`）
 * @param {object[]} [params.roleDefs] 已注册的角色定义（`roleRegistry`）
 * @returns {Array<{level: 'warn'|'error', appId: string, message: string}>} 问题清单（空 = 全部合规）
 */
function auditDefaultRoles({ configs = [], roleDefs = [] } = {}) {
  const issues = [];
  const rolesByApp = new Map();

  for (const role of roleDefs) {
    if (!rolesByApp.has(role.app_id)) rolesByApp.set(role.app_id, []);
    rolesByApp.get(role.app_id).push(role);
  }

  /**
   * config 反查：`app_id` 与 `permission_app_id` 都指向同一份配置
   *
   * console 就是那个例外 —— 登录应用是 `console`，角色住在历史命名空间 `admin`。
   * 只按 `app_id` 找会漏掉它，而漏掉的后果恰好是"看起来没配、其实配了"。
   */
  const configFor = appId => configs.find(cfg => cfg?.app_id === appId || cfg?.permission_app_id === appId) ?? null;

  for (const [appId, roles] of rolesByApp) {
    const cfg = configFor(appId);
    const declaredInConfig =
      cfg && Object.prototype.hasOwnProperty.call(cfg, 'default_role') ? cfg.default_role : undefined;
    const declaredInCode = getDeclaredDefaultRole(appId);

    // ① config 显式写 null = 有意不自动授予（如只发管理员的 notice）
    if (declaredInConfig === null) {
      if (declaredInCode) {
        issues.push({
          level: 'warn',
          appId,
          message:
            `应用 ${appId} 的 config.js 声明 default_role: null（不自动授予），` +
            `但 roles.js 里 "${declaredInCode}" 标了 is_default —— 以 config 为准，该标记不会生效`
        });
      }
      continue;
    }

    // ② config 声明了编码：它是主口径，写错必须报出来（否则静默回落到最低职级）
    if (typeof declaredInConfig === 'string' && declaredInConfig.trim()) {
      const hit = roles.find(role => role.code === declaredInConfig);

      if (!hit) {
        issues.push({
          level: 'error',
          appId,
          message:
            `应用 ${appId} 的 config.js 声明 default_role="${declaredInConfig}"，` +
            `但 ${appId} 的角色定义里没有这个 code（现有：${roles.map(role => role.code).join(' / ')}）` +
            ' ⇒ 授权时会静默回落到最低职级角色，请修正 config'
        });
      } else if (!isNormalRank(hit.rank_level)) {
        issues.push({
          level: 'error',
          appId,
          message:
            `应用 ${appId} 的默认角色 "${declaredInConfig}" 的 rank_level=${hit.rank_level} ` +
            `超过普通档上限 ${NORMAL_RANK_MAX} ⇒ 授权时会被拒绝授予（默认角色不能是管理档）`
        });
      } else if (declaredInCode && declaredInCode !== declaredInConfig) {
        issues.push({
          level: 'warn',
          appId,
          message:
            `应用 ${appId} 的默认角色两处声明不一致：config="${declaredInConfig}"、` +
            `roles.js="${declaredInCode}" —— 以 config 为准，建议把 roles.js 的 is_default 一起改掉`
        });
      }
      continue;
    }

    // ③ 只有代码声明
    if (declaredInCode) {
      const hit = roles.find(role => role.code === declaredInCode);
      if (!hit) {
        issues.push({
          level: 'error',
          appId,
          message: `应用 ${appId} 的 roles.js 把 "${declaredInCode}" 标为 is_default，但该角色不在注册表里`
        });
      }
      continue;
    }

    // ④ 都没声明 → 只剩最低职级兜底
    const lowest = pickLowestRole(roles);
    if (!lowest) continue;

    if (!isNormalRank(lowest.rank_level)) {
      issues.push({
        level: 'error',
        appId,
        message:
          `应用 ${appId} 没有声明任何默认角色，最低职级 "${lowest.code}"(rank=${lowest.rank_level}) ` +
          `又超过普通档上限 ${NORMAL_RANK_MAX} ⇒ 授权时不会授予任何角色。` +
          '请在 config.js 写 default_role（有意不授予就写 null），或在 roles.js 给普通角色加 is_default: true'
      });
    } else {
      issues.push({
        level: 'warn',
        appId,
        message:
          `应用 ${appId} 没有声明默认角色，将回落为最低职级 "${lowest.code}"(rank=${lowest.rank_level})。` +
          '建议在 config.js 显式写 default_role，或在 roles.js 给该角色加 is_default: true'
      });
    }
  }

  // ⑤ config 声明了字符串，但这个命名空间根本没有角色定义（roles.js 缺失或 app_id 写错）
  for (const cfg of configs) {
    const appId = cfg?.permission_app_id || cfg?.app_id;
    if (!appId || rolesByApp.has(appId)) continue;
    if (typeof cfg.default_role !== 'string') continue;

    issues.push({
      level: 'error',
      appId,
      message:
        `应用 ${cfg.app_id} 的 config.js 声明 default_role="${cfg.default_role}"，` +
        '但该命名空间没有任何角色定义 ⇒ 授权时不会有任何角色可授予'
    });
  }

  return issues;
}

export {
  NORMAL_RANK_MAX,
  RANK_LEVEL_MIN,
  RANK_LEVEL_MAX,
  registerDeclaredDefaultRole,
  getDeclaredDefaultRole,
  listDeclaredDefaultRoles,
  resetDeclaredDefaultRolesForTesting,
  defaultRoleCandidates,
  pickLowestRole,
  isNormalRank,
  auditDefaultRoles
};
