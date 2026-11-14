/**
 * 全局 PBAC 角色 / 权限注册中心
 *
 * 为什么住在 `framework/security/pbac/` 而不是 `utils/`（2026-11-09 迁入）：
 * 它是全仓唯一的**有状态**注册表 —— 各 app 在 import 时把角色与权限元数据压进来，
 * 再由 loader（`framework/lifecycle/loader/registry/10-apps.js`）与
 * `/admin/iam/v1/actions/dictionary` 读出去。`utils/` 里其余模块都是纯函数
 * （可随意 import、可脱离进程单独驱动），而这里的行为依赖**模块加载顺序**，
 * 属于框架能力，不是工具箱。
 *
 * 使用方法:
 * ```js
 * // 1) 定义权限码（同时登记元数据，供管理端渲染复选框）
 * const PERM = createPermissionRegistry('posecraft', 'PoseCraft', {
 *   WORK: { READ: { code: 'posecraft:work:read', label: '查看作品', type: 'read' } }
 * });
 *
 * // 2) 定义角色（policy 里引用上一步的常量；普通角色记得标 is_default）
 * defineRoles([
 *   { code: 'posecraft_user', app_id: 'posecraft', name: '普通用户', rank_level: 10,
 *     is_default: true, policy: { Version: '…', Statement: [ … ] } }
 * ]);
 * ```
 *
 * 硬约束（都只在**注册时**校验，运行期读到的一定是干净的）：
 *   1. 权限码全局唯一 —— 重复码会让 `hasPermission` 的语义取决于哪一份先注册；
 *   2. 业务域唯一 —— 同一个 domain 注册两次会让字典接口返回两份同名域；
 *   3. 角色 code 唯一 —— `10-apps.js` 以 code 为键 upsert，重复会互相覆盖 policy；
 *   4. `app_id` / `name` / `rank_level` / `policy.Statement` 必填 —— 缺了要么串域、要么空库首插失败；
 *   5. 每个应用**最多一个** `is_default`，且它的 `rank_level` 必须落在普通档（<= 20）——
 *      默认角色是"授权即送"的，标错等于给每个新授权的人发管理员。
 *
 * `is_default` 不落库（`iam_role` 没有这一列），只在内存里给
 * `app/oauth21/dao/approval.dao.js` 提供"config 未声明时的次选"。
 *
 * @author yijiu2025
 * @since 2026-07-13
 */
import {
  NORMAL_RANK_MAX,
  RANK_LEVEL_MIN,
  RANK_LEVEL_MAX,
  registerDeclaredDefaultRole,
  getDeclaredDefaultRole,
  listDeclaredDefaultRoles,
  resetDeclaredDefaultRolesForTesting,
  defaultRoleCandidates,
  auditDefaultRoles
} from './default-role.js';

const roleRegistry = [];
const actionMetaRegistry = []; // 暴露给前端渲染复选框用的权限字典元数据

/** 已注册的权限码 / 业务域 / 角色码（只用于注册期查重，运行期不读） */
const registeredCodes = new Set();
const registeredDomains = new Set();
const registeredRoleCodes = new Set();

/** 注册发生在 import 期，报错只有消息没有可用栈 —— 消息里必须带上是哪一条 */
function fail(message) {
  throw new Error(`[PBAC] ${message}`);
}

/**
 * 注册一个或多个角色到全局角色注册中心
 *
 * 校验分两趟：先整批校验（含默认角色冲突），再落表 —— 避免"注册了一半再抛错"
 * 留下半截状态。抛错发生在 import 期，等于启动失败，这是刻意的：这几个字段错了
 * 不会在运行期报错，只会让鉴权/授权悄悄跑偏。
 *
 * @param {object|Array<object>} roles - 单个角色定义对象或角色数组
 * @returns {void}
 * @throws {Error} 缺 `code` / `app_id` / `rank_level` / `policy.Statement`，
 *   code 重复，同一应用声明多个 `is_default`，或默认角色职级超过普通档
 */
function defineRoles(roles) {
  const list = Array.isArray(roles) ? roles : [roles];

  // 先整体校验再落表：避免"注册了一半再抛错"留下半截状态
  const pendingDefaults = new Map(); // app_id → code（同一批内先自查，不能等落表）

  for (const role of list) {
    if (!role || typeof role !== 'object') fail('角色定义必须是对象');

    const code = role.code;
    if (typeof code !== 'string' || !code.trim()) fail('角色定义缺少非空的 code');
    if (registeredRoleCodes.has(code)) fail(`角色 code 重复注册: "${code}"`);

    /*
     * app_id 必填：loader 按 `(app_id, code)` upsert，模型对 app_id 有默认值
     * `'GLOBAL'` —— 漏写不会报错，而是把业务角色塞进 GLOBAL 域，随后被
     * `loadUserPermissions` 当成"所有应用都有的角色"，权限范围凭空放大。
     */
    if (typeof role.app_id !== 'string' || !role.app_id.trim()) {
      fail(`角色 "${code}" 缺少非空的 app_id（必填：loader 按 (app_id, code) 落库，缺省会串进 GLOBAL 域）`);
    }

    /*
     * name 也是模型的 NOT NULL 列。本地库已有该角色时永远走"只更新 policy"分支，
     * 缺 name 一直没事；换空库首插就抛 NOT NULL 约束，应用起不来（与 rank 100 同类）。
     */
    if (typeof role.name !== 'string' || !role.name.trim()) {
      fail(`角色 "${code}" 缺少非空的 name（管理端展示名，且是 NOT NULL 列）`);
    }

    /*
     * rank_level 必填：模型的默认值是 1，而 1 在历史定义里是"小黑屋"档
     * （`user_banned`）。不写就是让这个角色默默变成最低职级，进而在
     * "取最低职级当默认角色"的旧逻辑里被当成赠品发出去。
     */
    if (!Number.isInteger(role.rank_level)) {
      fail(`角色 "${code}" 的 rank_level 必须是整数（收到 ${JSON.stringify(role.rank_level)}）`);
    }
    if (role.rank_level < RANK_LEVEL_MIN || role.rank_level > RANK_LEVEL_MAX) {
      fail(
        `角色 "${code}" 的 rank_level=${role.rank_level} 越界（允许 ${RANK_LEVEL_MIN}~${RANK_LEVEL_MAX}）` +
          ' —— 空库首次插入会抛 SequelizeValidationError，应用起不来'
      );
    }

    if (role.is_default !== undefined && typeof role.is_default !== 'boolean') {
      fail(`角色 "${code}" 的 is_default 必须是布尔值（收到 ${JSON.stringify(role.is_default)}）`);
    }

    // policy 缺 Statement 等于"授了角色但没有任何权限"，是静默失效的经典形态
    if (!role.policy || typeof role.policy !== 'object' || Array.isArray(role.policy)) {
      fail(`角色 "${code}" 缺少 policy 对象（PBAC 策略文档，必填）`);
    }
    if (!Array.isArray(role.policy.Statement)) {
      fail(`角色 "${code}" 的 policy.Statement 必须是数组`);
    }

    if (role.is_default === true) {
      const previous = pendingDefaults.get(role.app_id) ?? getDeclaredDefaultRole(role.app_id);
      if (previous && previous !== code) {
        fail(
          `应用 "${role.app_id}" 声明了多个默认角色: "${previous}" 与 "${code}" ` +
            ' —— 一个应用只能有一个"授权即送"的角色'
        );
      }
      if (Number(role.rank_level) > NORMAL_RANK_MAX) {
        fail(
          `角色 "${code}" 标记了 is_default，但 rank_level=${role.rank_level} 超过普通档上限 ` +
            `${NORMAL_RANK_MAX} —— 默认角色会发给每一个授权者，不能是管理档`
        );
      }
      pendingDefaults.set(role.app_id, code);
    }
  }

  for (const role of list) {
    registeredRoleCodes.add(role.code);
    roleRegistry.push(role);
    if (role.is_default === true) registerDeclaredDefaultRole(role.app_id, role.code);
  }
}

/**
 * 注册权限元数据（供前端渲染复选框使用）
 *
 * @param {object} metaObj - 权限元数据对象，包含 domain/name/actions
 * @returns {void}
 * @throws {Error} 缺少 domain / 同名域重复注册
 */
function definePermissionMeta(metaObj) {
  const domain = metaObj?.domain;
  if (typeof domain !== 'string' || !domain.trim()) fail('权限元数据缺少非空的 domain');
  if (registeredDomains.has(domain)) fail(`权限域重复注册: "${domain}"（每个 app 只应有一份 permission/index.js）`);
  if (!Array.isArray(metaObj.actions)) fail(`权限域 "${domain}" 的 actions 必须是数组`);

  registeredDomains.add(domain);
  actionMetaRegistry.push(metaObj);
}

/**
 * 权限字典生成工厂（DRY 优化方案）
 * 通过一次性声明，同时生成给后端使用的常量对象和给前端使用的元数据
 *
 * 返回的对象被冻结：调用方只能读（全仓用法都是 `PERM.WORK.READ` 取值）。
 * 一旦有人写入，`hasPermission` 与实际注册表就会分叉，而且不会有任何报错。
 *
 * @param {string} domain - 业务域名称，如 'posecraft'
 * @param {string} name - 业务域中文/英文全称
 * @param {object} rawDefinition - 按分组嵌套的权限原始定义
 * @returns {Readonly<object>} 扁平化的权限常量对象
 * @throws {Error} 权限码缺失 / 全局重复
 */
function createPermissionRegistry(domain, name, rawDefinition) {
  const constants = {};
  const actions = [];

  // 先校验整份定义，再落注册表：import 期抛错的代价是启动失败，半截状态更难查
  for (const [groupKey, group] of Object.entries(rawDefinition)) {
    for (const [actionKey, meta] of Object.entries(group)) {
      const code = meta?.code;
      if (typeof code !== 'string' || !code.trim()) {
        fail(`权限定义 ${domain}.${groupKey}.${actionKey} 缺少非空的 code`);
      }
      if (registeredCodes.has(code)) {
        fail(`权限码重复注册: "${code}"（${domain}.${groupKey}.${actionKey}）`);
      }
    }
  }

  for (const [groupKey, group] of Object.entries(rawDefinition)) {
    constants[groupKey] = {};
    for (const [actionKey, meta] of Object.entries(group)) {
      constants[groupKey][actionKey] = meta.code;
      registeredCodes.add(meta.code);
      actions.push(meta);
    }
    Object.freeze(constants[groupKey]);
  }

  // 自动打入全局内存
  definePermissionMeta({ domain, name, actions });

  return Object.freeze(constants);
}

/**
 * 清空注册表（**仅供测试**）
 *
 * 注册表是模块级单例，同一 worker 里先后加载多份定义会互相污染（例如测试里反复
 * import 不同 app 的 permission）。生产代码不应调用。
 * @returns {void}
 */
function resetPbacRegistryForTesting() {
  roleRegistry.length = 0;
  actionMetaRegistry.length = 0;
  registeredCodes.clear();
  registeredDomains.clear();
  registeredRoleCodes.clear();
  resetDeclaredDefaultRolesForTesting();
}

export {
  roleRegistry,
  actionMetaRegistry,
  defineRoles,
  definePermissionMeta,
  createPermissionRegistry,
  resetPbacRegistryForTesting,
  // 默认角色（见 ./default-role.js）：解析候选 + 启动期审计
  NORMAL_RANK_MAX,
  RANK_LEVEL_MIN,
  RANK_LEVEL_MAX,
  getDeclaredDefaultRole,
  listDeclaredDefaultRoles,
  defaultRoleCandidates,
  auditDefaultRoles
};
