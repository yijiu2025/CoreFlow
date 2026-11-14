/**
 * 补齐管理后台的「按钮」菜单（`sys_menu.type = 'btn'`）
 *
 * 为什么需要它们：
 * 本仓按钮显隐是**两段判定** —— 角色 policy 里有该权限码，**并且**该码对应的按钮菜单
 * 已授权给角色（见 `api/admin/console/v1/session.js` 的 `buttonCodes` / `menuPerms`
 * 与 `stores/auth.ts` 的 `hasPermission`）。菜单表里一个 btn 节点都没有时
 * `buttonCodes` 为空，前端退化成"只看 policy"：看着能用，但按钮级授权实际是关着的，
 * 权限矩阵里也没法按按钮细化。
 *
 * 幂等：按 `(parent_id, permission)` 查重，重复执行不会重复插入。
 * 新建后调 `menuDao.grantToRolesHaving` 继承父页面已有的授权 —— 否则"加了按钮，
 * 本来能用的角色突然看不到按钮"，看起来像把功能改坏了。
 *
 * 用法：
 *   node scripts/seed-console-buttons.js          # 实际写入
 *   node scripts/seed-console-buttons.js --dry    # 只打印将要做什么
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import 'dotenv/config';
import sequelize, { getModel } from '../src/framework/persistence/db/index.js';
import { scanModels } from '../src/framework/persistence/db/models.js';
import menuDao from '../src/app/console/dao/menu.dao.js';
import { createLogger } from '../src/framework/support/log/index.js';

const log = createLogger('scripts.seed-console-buttons');

/**
 * 要补的按钮
 *
 * 🔴 权限码必须来自 `src/app/admin/permission/index.js` 的 `ADMIN_PERMISSIONS`：
 *    写别的应用的码，或写一个不存在的码，都不会被任何 `requirePermission` 匹配 ——
 *    界面上勾了也没用。
 */
const BUTTONS = [
  // 用户管理
  { page: '/system/user', name: '创建用户', permission: 'admin:user:create', sort: 1 },
  { page: '/system/user', name: '编辑用户', permission: 'admin:user:update', sort: 2 },
  { page: '/system/user', name: '删除账号（缓冲期）', permission: 'admin:user:purge', sort: 3 },
  { page: '/system/user', name: '注销应用账号', permission: 'admin:user:deactivate', sort: 4 },
  { page: '/system/user', name: '签发临时密码', permission: 'admin:user:temp-password', sort: 5 },
  // 导出与授权记录原先只挂 admin:user:read（能进列表就能做），单独拆成按钮权限点
  { page: '/system/user', name: '导出用户数据', permission: 'admin:user:export', sort: 6 },
  { page: '/system/user', name: '查看授权记录', permission: 'admin:user:grants', sort: 7 },
  { page: '/system/user', name: '批量导入用户', permission: 'admin:user:import', sort: 8 },

  // 角色管理
  { page: '/system/role', name: '创建角色', permission: 'admin:role:create', sort: 1 },
  { page: '/system/role', name: '编辑角色', permission: 'admin:role:update', sort: 2 },
  { page: '/system/role', name: '删除角色', permission: 'admin:role:delete', sort: 3 },
  { page: '/system/role', name: '分配角色', permission: 'admin:role:assign', sort: 4 },

  // 菜单管理
  { page: '/system/menu', name: '创建菜单', permission: 'admin:menu:create', sort: 1 },
  { page: '/system/menu', name: '编辑菜单', permission: 'admin:menu:update', sort: 2 },
  { page: '/system/menu', name: '删除菜单', permission: 'admin:menu:delete', sort: 3 },

  // 部门管理
  { page: '/system/dept', name: '创建部门', permission: 'admin:dept:create', sort: 1 },
  { page: '/system/dept', name: '编辑部门', permission: 'admin:dept:update', sort: 2 },
  { page: '/system/dept', name: '删除部门', permission: 'admin:dept:delete', sort: 3 },

  // 岗位管理
  { page: '/system/post', name: '创建岗位', permission: 'admin:post:create', sort: 1 },
  { page: '/system/post', name: '编辑岗位', permission: 'admin:post:update', sort: 2 },
  { page: '/system/post', name: '删除岗位', permission: 'admin:post:delete', sort: 3 },

  // 日志审计：两个页面共用同一个权限码，但按钮菜单各挂一份（授权按页面继承）
  { page: '/monitor/oper-log', name: '清理日志', permission: 'admin:log:remove', sort: 1 },
  { page: '/monitor/login-log', name: '清理日志', permission: 'admin:log:remove', sort: 1 }
];

const dryRun = process.argv.includes('--dry');

/**
 * 解析角色 policy 里的 Action 列表
 *
 * @param {unknown} policy 角色 policy（JSON 字符串或对象）
 * @returns {string[]} Action 数组
 */
function policyActions(policy) {
  try {
    const doc = typeof policy === 'string' ? JSON.parse(policy) : policy;
    const statements = Array.isArray(doc?.Statement) ? doc.Statement : [];
    return statements.flatMap(stmt => (Array.isArray(stmt?.Action) ? stmt.Action : []));
  } catch {
    return [];
  }
}

/**
 * 角色的 policy 是否覆盖某个权限码
 *
 * 支持 `*`、`admin:*` 这类前缀通配 —— 与 `hasPermissionLike` 同语义。
 *
 * @param {unknown} policy 角色 policy
 * @param {string} code 权限码
 * @returns {boolean} 是否覆盖
 */
function policyCovers(policy, code) {
  return policyActions(policy).some(action => {
    if (action === '*' || action === code) return true;
    return typeof action === 'string' && action.endsWith(':*') && code.startsWith(action.slice(0, -1));
  });
}

/**
 * 给「policy 覆盖该权限码」的角色补菜单授权
 *
 * 🔴 不能只靠 `grantToRolesHaving`（继承父页面授权）：父页面的授权可能只给了观察者角色，
 *    而真正持有写权限的角色（例如 `admin_operator` 的 `admin:user:*`）如果没被授权这条
 *    按钮菜单，前端 `hasPermission` 会因「buttonCodes 命中、menuPerms 没命中」把按钮判为
 *    不可见 —— 加按钮反而让有权限的人丢按钮。
 *
 * @param {number} menuId 按钮菜单 ID
 * @param {string} permission 权限码
 * @returns {Promise<number>} 新增授权的角色数
 */
async function ensureGrants(menuId, permission) {
  const Role = getModel('Role');
  const SysRoleMenu = getModel('console.SysRoleMenu');
  const roles = await Role.findAll({ attributes: ['id', 'policy'], raw: true });
  let granted = 0;
  for (const role of roles) {
    if (!policyCovers(role.policy, permission)) continue;
    const [, created] = await SysRoleMenu.findOrCreate({
      where: { role_id: role.id, menu_id: menuId },
      defaults: { role_id: role.id, menu_id: menuId }
    });
    if (created) granted += 1;
  }
  return granted;
}

/**
 * 主流程
 *
 * @returns {Promise<void>}
 */
async function main() {
  await scanModels();
  const SysMenu = getModel('console.SysMenu');

  let created = 0;
  let skipped = 0;
  let missing = 0;

  for (const item of BUTTONS) {
    const parent = await SysMenu.findOne({
      where: { path: item.page, type: 'menu' },
      attributes: ['id', 'name'],
      raw: true
    });
    if (!parent) {
      missing += 1;
      log.warn(`跳过「${item.name}」：找不到页面 ${item.page}`);
      continue;
    }

    const exists = await SysMenu.findOne({
      where: { parent_id: parent.id, type: 'btn', permission: item.permission },
      attributes: ['id'],
      raw: true
    });
    if (exists) {
      skipped += 1;
      // 已存在也要补授权：上一次可能是"只建了菜单、没给持权角色授权"，那样按钮会被判不可见
      if (!dryRun) {
        const extra = await ensureGrants(exists.id, item.permission);
        if (extra > 0) log.info(`~ 「${item.name}」已存在，补授权 ${extra} 个持权角色`);
      }
      continue;
    }

    if (dryRun) {
      created += 1;
      log.info(`[dry] 将在「${parent.name}」下新增按钮「${item.name}」 ${item.permission}`);
      continue;
    }

    const menu = await menuDao.create({
      parent_id: parent.id,
      name: item.name,
      type: 'btn',
      permission: item.permission,
      sort: item.sort,
      visible: 1,
      status: 1
    });
    // 继承父页面已有的角色授权：不能让"加了按钮"变成"按钮消失"
    const granted = await menuDao.grantToRolesHaving(menu.id, parent.id);
    // 再补上"policy 里有这个码、但没被父页面授权覆盖"的角色（如 admin_operator）
    const extra = await ensureGrants(menu.id, item.permission);
    created += 1;
    log.info(
      `+ 「${parent.name}」/「${item.name}」 ${item.permission}（继承授权 ${granted} 个角色，另补 ${extra} 个持权角色）`
    );
  }

  log.info(
    `${dryRun ? '[dry] ' : ''}完成：新增 ${created}，已存在 ${skipped}，缺页面 ${missing}（共 ${BUTTONS.length} 条定义）`
  );
}

main()
  .catch(err => {
    log.error('执行失败:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
