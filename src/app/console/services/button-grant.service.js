/**
 * 按钮授权（菜单授权里 `type=btn` 的节点）→ 接口鉴权的第二道闸
 *
 * 语义：**角色级开关**。矩阵里取消勾选某个按钮 → 持有该角色的用户既不显示这个按钮，
 * 调对应接口也一律 403；重新勾上 → 立刻恢复。不靠改 policy 码来实现。
 *
 * 为什么需要它：`sys_role_menu` 此前只影响前端（`session.js` 算出 `menuPerms` 交给
 * `hasPermission`），后端 `checkPermission` 只看 policy —— 于是"取消勾选"只是让按钮
 * 消失，拿 token 直接打接口照样能改。这个服务把同一份口径提供给守卫（见
 * `framework/security/auth/permission/button-grant.js` 的注册位）。
 *
 * 🔴 口径必须与 `/session/me` 完全一致（同一个函数出数据）：
 *   • `buttonCodes` = **全站**按钮码，含停用/下架 —— 用来回答"这个码是不是按钮码"；
 *     若只收启用项，停用按钮会让该码从集合里消失，判定退化成"只看 policy"= 停用即放行。
 *   • `menuPerms`   = 该用户**被授权、且按钮启用且未下架**的码。
 *   • 超管（`admin:*` / `*` / superadmin）不看菜单授权，取全部启用按钮 ——
 *     与 `session.js` 的 isSuperViewer 保持一致，否则管理员会被自己的授权挡在门外。
 *
 * 缓存：按钮码 60s（菜单表很小，且只在菜单变更时变），用户授权 15s + 写入口显式失效。
 * 有 TTL 兜底是刻意的 —— 漏掉一个失效点最多多放行 15 秒，不会永久错下去。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { getModel } from '../../../framework/persistence/db/index.js';
import { actionMetaRegistry } from '../../../framework/security/pbac/index.js';
import { isWildcardMatch } from '../../../framework/security/auth/permission/wildcard-match.js';
import { hasPermissionLike, toPermissionList } from '../utils/permissions.js';
import menuDao from '../dao/menu.dao.js';

/** 管理后台的权限命名空间（与 app/console/config.js 的 permission_app_id 对应） */
const ADMIN_NAMESPACE = 'admin';

/** 全站按钮码快照的 TTL */
const CODES_TTL_MS = 60_000;

/** 单个用户按钮授权的 TTL */
const USER_TTL_MS = 15_000;

/** 按钮码快照：`all` 含停用/下架；`active` 只含启用且未下架（带 id 供与授权求交） */
let snapshot = { at: 0, all: [], active: [] };

/** userId → { at, rolesKey, menuPerms } */
const userCache = new Map();

/**
 * 读按钮码快照（带缓存）
 *
 * @returns {Promise<{all: string[], active: Array<{id: number, permission: string}>}>} 快照
 */
async function loadSnapshot() {
  if (snapshot.at && Date.now() - snapshot.at < CODES_TTL_MS) return snapshot;

  const rows = await getModel('console.SysMenu').findAll({
    where: { type: 'btn' },
    attributes: ['id', 'permission', 'status', 'visible'],
    raw: true
  });

  const all = [...new Set(rows.map(row => row.permission).filter(Boolean))];
  const active = rows
    .filter(row => row.permission && Number(row.status) === 1 && Number(row.visible) === 1)
    .map(row => ({ id: Number(row.id), permission: row.permission }));

  snapshot = { at: Date.now(), all, active };
  return snapshot;
}

/**
 * 是否为「不看菜单授权」的账号（与 session.js 的 isSuperViewer 同一判据）
 *
 * @param {object} user request.state.user
 * @returns {boolean} 是否全量
 */
function isSuperViewer(user) {
  return (
    hasPermissionLike(user?.permissions, 'admin:*') ||
    hasPermissionLike(user?.permissions, '*') ||
    (user?.roles || []).includes('superadmin')
  );
}

/**
 * 解析某个用户的按钮授权（供守卫在判定前调用）
 *
 * @param {object} user request.state.user（需要 userId / roles / permissions）
 * @returns {Promise<{buttonCodes: string[], menuPerms: string[]}|null>} null = 这次与按钮无关
 */
async function resolveButtonGate(user) {
  const userId = Number(user?.userId);
  if (!userId) return null;

  /*
   * 预筛：没有任何管理后台的码，就不必付这次查询。
   * 其它应用（posecraft / retroweb …）的请求走这里直接 null，行为与改造前一致。
   */
  const allows = toPermissionList(user?.permissions);
  const touchesAdmin = allows.some(
    code => code === '*' || code === ADMIN_NAMESPACE || code.startsWith(`${ADMIN_NAMESPACE}:`)
  );
  if (!touchesAdmin) return null;

  const snap = await loadSnapshot();
  const rolesKey = (user?.roles || []).join(',');

  const cached = userCache.get(userId);
  if (cached && cached.rolesKey === rolesKey && Date.now() - cached.at < USER_TTL_MS) {
    return { buttonCodes: snap.all, menuPerms: cached.menuPerms };
  }

  let menuPerms;
  if (isSuperViewer(user)) {
    menuPerms = [...new Set(snap.active.map(item => item.permission))];
  } else {
    const Role = getModel('Role');
    const roleRows = await Role.findAll({
      where: { code: rolesKey ? rolesKey.split(',') : ['__none__'] },
      attributes: ['id']
    });
    const grantedMenuIds = new Set();
    for (const role of roleRows) {
      for (const menuId of await menuDao.getRoleMenuIds(role.id)) grantedMenuIds.add(Number(menuId));
    }
    menuPerms = [...new Set(snap.active.filter(item => grantedMenuIds.has(item.id)).map(item => item.permission))];
  }

  userCache.set(userId, { at: Date.now(), rolesKey, menuPerms });
  return { buttonCodes: snap.all, menuPerms };
}

/**
 * 把"角色有码、但按钮没被授权（或已停用/下架）"的码从清单里摘掉
 *
 * 纯函数（码表由调用方给），所以可以脱离数据库单测 —— 这段是"下发给前端的权限码"
 * 的全部语义，值得单独钉住。
 *
 * @param {string[]} allows 原始允许码（可能含通配）
 * @param {{buttonCodes: string[], menuPerms: string[]}} gate 按钮码全集与已授权集合
 * @param {string[]} allCodes 全量注册码（展开通配用）
 * @returns {string[]} 生效码（未发生摘除时原样返回，保留通配）
 */
function stripBlockedButtons(allows, gate, allCodes) {
  const granted = new Set(gate.menuPerms);
  const blocked = new Set(gate.buttonCodes.filter(code => !granted.has(code)));
  if (blocked.size === 0) return allows;

  const out = [];
  for (const pattern of allows) {
    const covered = allCodes.filter(code => isWildcardMatch(pattern, code));
    // 这条 allow 没扫到任何"不可用的按钮"→ 原样保留（含通配）
    if (!covered.some(code => blocked.has(code)) && !blocked.has(pattern)) {
      out.push(pattern);
      continue;
    }
    for (const code of covered) {
      if (!blocked.has(code)) out.push(code);
    }
  }
  return [...new Set(out)];
}

/**
 * 该用户**最终生效**的权限码（下发给前端的那一份）
 *
 * 前端不该拿着 policy + 两个集合自己拼结论：一旦两边算法有偏差，就会出现
 * "按钮看得见、点了 403"（更糟的是反过来：看着没权限，其实调得动）。
 * 所以在**下发前**就把减法做干净。
 *
 * 🔴 只有真的出现"未授权按钮"时才展开通配。`admin:*` 原样透传时前端还能用它匹配到
 *    将来新增的码；一旦要摘掉其中一个，就必须展开成具体码 —— 通配模式表达不了
 *    "除了 X"。展开依赖权限注册表（每 app import 期登记），因此结果只含已注册的码：
 *    注册表就是本仓所有权限码的唯一来源，这个代价可以接受。
 *
 * @param {object} user request.state.user
 * @returns {Promise<string[]>} 生效权限码
 */
async function effectiveCodes(user) {
  const allows = toPermissionList(user?.permissions);
  const gate = await resolveButtonGate(user);
  if (!gate) return allows;
  const allCodes = actionMetaRegistry.flatMap(meta => (meta.actions || []).map(action => action.code));
  return stripBlockedButtons(allows, gate, allCodes);
}

/**
 * 失效按钮授权缓存
 *
 * 在菜单 / 角色菜单授权的写入口调用。`snapshot` 也要清：改的是菜单表本身
 * （停用、下架、改 permission），不是某个用户的授权。
 *
 * @param {number} [userId] 只清某个用户；不传则全清
 * @returns {void}
 */
function invalidateButtonGrants(userId) {
  if (userId) {
    userCache.delete(Number(userId));
    return;
  }
  userCache.clear();
  snapshot = { at: 0, all: [], active: [] };
}

/**
 * 清空缓存（**仅供测试**）
 *
 * @returns {void}
 */
function resetButtonGrantCacheForTesting() {
  invalidateButtonGrants();
}

const buttonGrantService = { resolveButtonGate, effectiveCodes };

export {
  resolveButtonGate,
  effectiveCodes,
  stripBlockedButtons,
  invalidateButtonGrants,
  resetButtonGrantCacheForTesting,
  isSuperViewer
};
export default buttonGrantService;
