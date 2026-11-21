/**
 * 应用总览（应用管理页的数据装配）
 *
 * === 为什么先要有这张页面 ===
 * 应用是**代码声明**的（`src/app/<app>/config.js` + `src/api/<system>/system.json`），
 * 启动期由 loader 收进注册表。也就是说"系统里有哪些应用"这件事，此前只有读代码和日志
 * 才知道：`[Guard] 自动注册系统: …` 那几行。运维要回答"posecraft 有几个角色、菜单配了
 * 没有、OAuth 客户端注册了吗"，只能分别去三个页面翻。
 *
 * 本服务把**声明**（注册表）与**授权数据**（角色/菜单/客户端）拼成一张表。
 *
 * 🔴 只读：应用不能在这里增删改。
 *    · 加一个应用 = 加目录 + 声明 `app_id` + 写 `system.json`（缺一个都起不来），
 *      不是填表单能表达的事；
 *    · `default_role` / `access` 是**准入策略**，改错等于把后台对人敞开或全关，
 *      应当走代码评审而不是点一下保存。
 *    所以这页只做"看得见"，动手改仍走代码。要么以后接 `data/*.json` 覆盖层再谈编辑。
 *
 * @author yijiu2025
 * @since 2026-11-21
 */
import { listAppConfigs, resolvePermissionAppId } from '../../../framework/config/app-registry.js';
import { actionMetaRegistry } from '../../../framework/security/pbac/index.js';
import appOverviewDao from '../dao/app-overview.dao.js';

/**
 * 每个权限命名空间下的权限码数量
 *
 * 取 `actionMetaRegistry`（各应用 `createPermissionRegistry` 时自动登记的元数据），
 * 而不是自己解析 `permission/index.js` —— 后者拿不到通配码与中文标签，且会与权限树脱钩。
 *
 * @returns {Map<string, number>} `domain → 权限码数`
 */
function permissionCodeCounts() {
  const map = new Map();
  for (const meta of actionMetaRegistry) {
    const actions = Array.isArray(meta.actions) ? meta.actions : [];
    if (!meta.domain) continue;
    map.set(meta.domain, (map.get(meta.domain) || 0) + actions.length);
  }
  return map;
}

/**
 * 访问策略的对外形状
 *
 * 三个字段都可能没声明（未声明 = 不限制）。原样透传会让前端出现 `undefined` 分支，
 * 这里统一收敛成"要么全空，要么三项俱在"。
 *
 * @param {object|undefined} access 应用配置里的 `access`
 * @returns {{anyPermission: string[], anyRole: string[], denyMessage: string}|null} 策略
 */
function normalizeAccess(access) {
  if (!access || typeof access !== 'object') return null;
  const anyPermission = Array.isArray(access.anyPermission) ? access.anyPermission : [];
  const anyRole = Array.isArray(access.anyRole) ? access.anyRole : [];
  const denyMessage = typeof access.denyMessage === 'string' ? access.denyMessage : '';
  if (anyPermission.length === 0 && anyRole.length === 0) return null;
  return { anyPermission, anyRole, denyMessage };
}

/**
 * 找出「只作为权限命名空间存在」的应用配置
 *
 * `src/app/admin/config.js` 不是一个可登录的应用，它只是给 `iam_role.app_id` 一个落点：
 * 登录应用是 `console`（OAuth 客户端 id），而角色/菜单/权限码住在历史命名空间 `admin`。
 * 两者都登记在注册表里，于是清单会冒出两行同名"管理后台"，统计数字还一模一样 ——
 * 读者只会得出"这页算错了"的结论。
 *
 * 判据：某个 app_id 被**别的**应用当作 `permission_app_id` 引用，且自己也有配置
 * ⇒ 它是命名空间，不单独成行（它的数据已经算在引用它的那行里了）。
 *
 * @param {object[]} configs 全部应用配置
 * @returns {Set<string>} 只作为命名空间的应用标识
 */
function namespaceOnlyAppIds(configs) {
  const ids = new Set(configs.map(config => String(config.app_id)));
  const referenced = new Set();
  for (const config of configs) {
    const namespace = resolvePermissionAppId(String(config.app_id));
    if (namespace && namespace !== String(config.app_id)) referenced.add(namespace);
  }
  /* 只有"自己也登记了配置"的命名空间才会被单独列出，否则它本来就不在清单里 */
  return new Set([...referenced].filter(id => ids.has(id)));
}

/**
 * 列出全部应用及其授权数据规模
 *
 * @returns {Promise<object[]>} 应用清单（按 app_id 升序，保证刷新时顺序稳定）
 */
async function listAppsOverview() {
  const [roleCounts, menuCounts, clientIds] = await Promise.all([
    appOverviewDao.roleCounts(),
    appOverviewDao.menuCounts(),
    appOverviewDao.oauthClientIds()
  ]);
  const codeCounts = permissionCodeCounts();
  const configs = listAppConfigs();
  const hidden = namespaceOnlyAppIds(configs);

  return configs
    .filter(config => !hidden.has(String(config.app_id)))
    .map(config => {
      const appId = String(config.app_id);
      /*
       * console 的角色/菜单/权限码都住在 `admin` 命名空间（`permission_app_id`）。
       * 统计必须用命名空间而不是 app_id，否则控制台会显示"0 个角色"——
       * 那是"看着像 bug 的 0"，比不显示更糟。
       */
      const namespace = String(resolvePermissionAppId(appId));
      return {
        appId,
        name: config.name || appId,
        description: config.description || '',
        /** 权限命名空间（与 appId 不同时才值得在界面上单独标出来） */
        permissionAppId: namespace,
        defaultRole: config.default_role || '',
        access: normalizeAccess(config.access),
        /** 应用自己声明的 Host（多域名部署时用） */
        hosts: Array.isArray(config.hosts) ? config.hosts : [],
        counts: {
          roles: roleCounts.get(namespace) || 0,
          menus: menuCounts.get(namespace) || 0,
          permissionCodes: codeCounts.get(namespace) || 0,
          oauthClients: clientIds.has(appId) ? 1 : 0
        }
      };
    })
    .sort((a, b) => a.appId.localeCompare(b.appId));
}

export { listAppsOverview, normalizeAccess, permissionCodeCounts, namespaceOnlyAppIds };
