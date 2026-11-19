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

  /*
   * 🔴 覆盖 `menu` + `btn`，不只是 btn。
   *
   * 只收按钮时，"取消整个页面"只影响侧栏渲染，接口照样按 policy 放行 ——
   * 用户实测：菜单关了侧栏不显示，但直接访问 URL、点查询、看详情全都正常。
   * 页面节点的 permission（`admin:user:read`）同样是"该角色被授权才能用"的码，
   * 必须进同一份闸。
   */
  const rows = await getModel('console.SysMenu').findAll({
    where: { type: ['btn', 'menu'] },
    attributes: ['id', 'permission', 'status', 'visible', 'type'],
    raw: true
  });

  const all = [...new Set(rows.map(row => row.permission).filter(Boolean))];
  const active = rows
    .filter(row => row.permission && Number(row.status) === 1 && Number(row.visible) === 1)
    .map(row => ({ id: Number(row.id), permission: row.permission, type: String(row.type) }));
  const pageCodes = [...new Set(active.filter(item => item.type === 'menu').map(item => item.permission))];

  /*
   * 码 → 所属页面集合（向上溯源到最近的 `type=menu` 节点，含自身）。
   *
   * 这是"页面关了，页面下所有接口一起关"的唯一实现方式 —— 不需要给每个接口
   * 再登记一次"我属于哪个页面"（那会和 `permission` 重复，且必然漂移）。
   *
   * 🔴 一个码可能挂多个页面：`admin:log:remove` 同时属于「操作日志」与「登录日志」。
   *    所以这里存**集合**，判定时用 OR —— 删掉其中一个页面不该把另一个页面的
   *    清理按钮也废掉。用"一对一打包标记"的写法在这里就会误伤。
   */
  const byId = new Map(rows.map(row => [Number(row.id), row]));
  const pagesOfCodeOf = new Map();
  for (const row of rows) {
    if (!row.permission) continue;
    const pages = new Set();
    let cursor = Number(row.id);
    const seen = new Set();
    while (cursor > 0 && !seen.has(cursor)) {
      seen.add(cursor);
      const node = byId.get(cursor);
      if (!node) break;
      if (node.type === 'menu') pages.add(cursor);
      cursor = Number(node.parent_id);
    }
    if (pages.size > 0) pagesOfCodeOf.set(row.permission, pages);
  }

  snapshot = { at: Date.now(), all, active, pageCodes, pagesOfCodeOf };
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
   * 预筛：用户没有任何能与"按钮码命名空间"对上的权限，就不必付后面的授权查询。
   *
   * 🔴 不能只看 `admin:` 前缀 —— 支持多应用后，按钮码可能是 `fw:*` / `posecraft:*`。
   *    前缀集合由快照（60s 缓存，基本是内存读）现算，新应用接入不需要改这里。
   */
  const snap = await loadSnapshot();
  const allows = toPermissionList(user?.permissions);
  const prefixes = new Set(snap.all.map(code => code.split(':')[0]));
  const touches = allows.some(
    code => code === '*' || [...prefixes].some(prefix => code === prefix || code.startsWith(`${prefix}:`))
  );
  if (!touches) return null;

  const rolesKey = (user?.roles || []).join(',');

  const cached = userCache.get(userId);
  if (cached && cached.rolesKey === rolesKey && Date.now() - cached.at < USER_TTL_MS) {
    return {
      buttonCodes: snap.all,
      menuPerms: cached.menuPerms,
      pageCodes: snap.pageCodes,
      pagesOfCode: snap.pagesOfCodeOf,
      pageGrants: new Set(cached.pageGrants),
      hasPageGrant: cached.hasPageGrant
    };
  }

  let menuPerms;
  let hasPageGrant = true; // 超管不看菜单授权，页面闸对它不成立
  let pageGrants = new Set(snap.active.filter(item => item.type === 'menu').map(item => item.id));
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
    pageGrants = new Set(
      snap.active.filter(item => item.type === 'menu' && grantedMenuIds.has(item.id)).map(item => item.id)
    );
    /*
     * 该用户是否配过页面授权（现在只用于诊断/日志，**不再参与判定**）。
     *
     * 历史上它是页面闸的安全网：存量角色只有按钮授权时不让页面码拦。
     * 存量已补齐（`scripts/backfill-role-menus.mjs`），页面闸已是硬闸。
     */
    hasPageGrant = snap.active.some(item => item.type === 'menu' && grantedMenuIds.has(item.id));
  }

  userCache.set(userId, { at: Date.now(), rolesKey, menuPerms, hasPageGrant, pageGrants: [...pageGrants] });
  return {
    buttonCodes: snap.all,
    menuPerms,
    pageCodes: snap.pageCodes,
    pagesOfCode: snap.pagesOfCodeOf,
    pageGrants,
    hasPageGrant
  };
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
  const pageCodes = new Set(gate.pageCodes ?? []);
  const blocked = new Set(
    gate.buttonCodes.filter(code => {
      /*
       * ① 页面闸（祖先溯源）：该码所属的页面**全部**被取消 ⇒ 码作废。
       *
       * 顺序必须在前：页面删了、按钮还勾着是**矛盾状态**（真实现场），
       * 以页面为准 —— 这就是"页面关了，页面下所有接口一起关"。
       * 多页面归属用 OR：`admin:log:remove` 属于两个日志页，剩一个就该继续能用。
       */
      const pages = gate.pagesOfCode?.get(code);
      if (pages && pages.size > 0 && gate.pageGrants && gate.hasPageGrant !== false) {
        const anyGranted = [...pages].some(pageId => gate.pageGrants.has(pageId));
        if (!anyGranted) return true;
      }
      if (granted.has(code)) return false;
      /*
       * ② 页面码未授权 ⇒ 拦。
       *
       * 曾经这里有条安全网（没配过页面的角色不拦），因为 `admin_operator` 只有按钮、
       * 没有页面授权，硬拦会让它连列表都打不开。存量已由
       * `scripts/backfill-role-menus.mjs` 按 policy 补齐（只补"一个页面都没配过"的角色，
       * 不覆盖管理员的显式取消），所以这里收口成硬闸 —— 否则删光页面授权就等于绕过。
       */
      void pageCodes;
      return true;
    })
  );
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
