/**
 * 管理后台权限常量
 * 使用 createPermissionRegistry 工厂函数定义权限
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { actionMetaRegistry, createPermissionRegistry } from '../../../framework/security/pbac/index.js';

/**
 * 管理后台权限定义
 * 三段式格式: admin:资源:动作
 */
const ADMIN_PERMISSIONS = createPermissionRegistry('admin', '管理后台', {
  // 用户管理
  USER: {
    READ: { code: 'admin:user:read', label: '查看用户', type: 'read' },
    CREATE: { code: 'admin:user:create', label: '创建用户', type: 'write' },
    UPDATE: { code: 'admin:user:update', label: '编辑用户', type: 'write' },
    DELETE: { code: 'admin:user:delete', label: '删除用户', type: 'high_risk' },
    // 删除账号走缓冲期（发起注销申请），到期才清数据 —— 与单纯的 DELETE 区分开：
    // 前者可撤销、可审计，后者在本仓不存在（立刻抹数据只留运维口子）
    PURGE: { code: 'admin:user:purge', label: '删除账号（缓冲期）', type: 'high_risk' },
    /** 注销某用户在某应用里的账号（不动主账号）；比全量删除轻，但仍需二次验证 */
    DEACTIVATE: { code: 'admin:user:deactivate', label: '注销应用账号', type: 'high_risk' },
    /** 签发临时密码：等于把别人账号的临时钥匙交出去 */
    TEMP_PASSWORD: { code: 'admin:user:temp-password', label: '签发临时密码', type: 'high_risk' },
    /*
     * 导出与"看授权记录"都**不能**只靠 read：
     * - 导出会把整份用户名单（含邮箱、部门、角色）带走，是数据外带；
     * - 授权记录回答"谁给谁授了什么"，是越权排查的入口。
     * 两者原先都只挂在 `admin:user:read` 上，任何能进列表页的人都能做。
     */
    EXPORT: { code: 'admin:user:export', label: '导出用户数据', type: 'read' },
    GRANTS: { code: 'admin:user:grants', label: '查看授权记录', type: 'read' },
    /** 批量导入 = 一次性造出一批账号，比单条创建的影响面大得多 */
    IMPORT: { code: 'admin:user:import', label: '批量导入用户', type: 'write' },
    ALL: { code: 'admin:user:*', label: '用户管理通配', type: 'wildcard' }
  },

  // 角色管理
  ROLE: {
    READ: { code: 'admin:role:read', label: '查看角色', type: 'read' },
    CREATE: { code: 'admin:role:create', label: '创建角色', type: 'write' },
    UPDATE: { code: 'admin:role:update', label: '编辑角色', type: 'write' },
    DELETE: { code: 'admin:role:delete', label: '删除角色', type: 'high_risk' },
    ASSIGN: { code: 'admin:role:assign', label: '分配角色', type: 'high_risk' },
    ALL: { code: 'admin:role:*', label: '角色管理通配', type: 'wildcard' }
  },

  // 策略管理
  POLICY: {
    READ: { code: 'admin:policy:read', label: '查看策略', type: 'read' },
    CREATE: { code: 'admin:policy:create', label: '创建策略', type: 'write' },
    UPDATE: { code: 'admin:policy:update', label: '编辑策略', type: 'write' },
    DELETE: { code: 'admin:policy:delete', label: '删除策略', type: 'high_risk' },
    ALL: { code: 'admin:policy:*', label: '策略管理通配', type: 'wildcard' }
  },

  // 系统管理
  SYSTEM: {
    CONFIG: { code: 'admin:system:config', label: '系统配置', type: 'write' },
    LOG: { code: 'admin:system:log', label: '查看日志', type: 'read' },
    ALL: { code: 'admin:system:*', label: '系统管理通配', type: 'wildcard' }
  },

  // 管理后台工作台
  DASHBOARD: {
    READ: { code: 'admin:dashboard:read', label: '查看工作台', type: 'read' }
  },

  // 菜单管理（决定侧栏可见性，不承载接口放行）
  MENU: {
    READ: { code: 'admin:menu:read', label: '查看菜单', type: 'read' },
    CREATE: { code: 'admin:menu:create', label: '创建菜单', type: 'write' },
    UPDATE: { code: 'admin:menu:update', label: '编辑菜单', type: 'write' },
    DELETE: { code: 'admin:menu:delete', label: '删除菜单', type: 'high_risk' },
    ALL: { code: 'admin:menu:*', label: '菜单管理通配', type: 'wildcard' }
  },

  // 部门管理
  DEPT: {
    READ: { code: 'admin:dept:read', label: '查看部门', type: 'read' },
    CREATE: { code: 'admin:dept:create', label: '创建部门', type: 'write' },
    UPDATE: { code: 'admin:dept:update', label: '编辑部门', type: 'write' },
    DELETE: { code: 'admin:dept:delete', label: '删除部门', type: 'high_risk' },
    ALL: { code: 'admin:dept:*', label: '部门管理通配', type: 'wildcard' }
  },

  // 岗位管理
  POST: {
    READ: { code: 'admin:post:read', label: '查看岗位', type: 'read' },
    CREATE: { code: 'admin:post:create', label: '创建岗位', type: 'write' },
    UPDATE: { code: 'admin:post:update', label: '编辑岗位', type: 'write' },
    DELETE: { code: 'admin:post:delete', label: '删除岗位', type: 'high_risk' },
    ALL: { code: 'admin:post:*', label: '岗位管理通配', type: 'wildcard' }
  },

  // 字典管理
  DICT: {
    READ: { code: 'admin:dict:read', label: '查看字典', type: 'read' },
    CREATE: { code: 'admin:dict:create', label: '创建字典', type: 'write' },
    UPDATE: { code: 'admin:dict:update', label: '编辑字典', type: 'write' },
    DELETE: { code: 'admin:dict:delete', label: '删除字典', type: 'high_risk' },
    ALL: { code: 'admin:dict:*', label: '字典管理通配', type: 'wildcard' }
  },

  // 参数管理
  CONFIG: {
    READ: { code: 'admin:config:read', label: '查看参数', type: 'read' },
    CREATE: { code: 'admin:config:create', label: '创建参数', type: 'write' },
    UPDATE: { code: 'admin:config:update', label: '编辑参数', type: 'write' },
    DELETE: { code: 'admin:config:delete', label: '删除参数', type: 'high_risk' },
    ALL: { code: 'admin:config:*', label: '参数管理通配', type: 'wildcard' }
  },

  // 日志审计（操作日志 / 登录日志共用）
  LOG: {
    READ: { code: 'admin:log:read', label: '查看日志', type: 'read' },
    REMOVE: { code: 'admin:log:remove', label: '清理日志', type: 'high_risk' },
    ALL: { code: 'admin:log:*', label: '日志审计通配', type: 'wildcard' }
  },

  // 防火墙只读监控
  FIREWALL: {
    READ: { code: 'admin:firewall:read', label: '查看防火墙', type: 'read' }
  },

  // 「代码生成」权限码已下线（2026-11-11）：对应页面与菜单都删了，没有接口可保护。
  // 已授权过的老库角色仍会带着 admin:gen:* 字符串，它匹配不到任何路由，属无害残留。

  // 管理员通配符
  ADMIN: {
    ALL: { code: 'admin:*', label: '管理后台全量通配符', type: 'wildcard' }
  }
});

/**
 * 本应用（admin）全部权限码
 *
 * 用来回答一个具体问题：**这个码是不是本应用的**。
 *
 * 🔴 为什么需要：`sys_menu` 是本应用自己的菜单树，但它的 `permission` 只是自由文本。
 *    写进别的应用的码（如 `posecraft:work:read`）以后：
 *      • 这条菜单/按钮永远匹配不到任何一个 `requirePermission` —— 看起来配了权限，
 *        实际谁都点不开；
 *      • 角色授权页会把它算成"该角色拥有别的应用的能力"，审计上完全误导；
 *      • 排障时会去查那个应用的路由，而问题根本不在那里。
 *    所以写入即拒，见 `api/admin/console/v1/menus.js` 的 `assertOwnPermission`。
 */
const ADMIN_PERMISSION_CODES = new Set(Object.values(ADMIN_PERMISSIONS).flatMap(group => Object.values(group)));

/**
 * 本应用权限码目录（给菜单编辑下拉用）
 *
 * 取 `actionMetaRegistry` 里 `domain === 'admin'` 的条目，而不是合并后的全量目录 ——
 * `/permissions/catalog` 返回的是 8 个应用的总和，直接拿去当菜单的候选，
 * 等于把"能用别的应用的码"这件事摆到界面上。
 *
 * @returns {Array<{code: string, label: string, type: string}>} 权限码选项
 */
function adminPermissionOptions() {
  return actionMetaRegistry
    .filter(meta => meta.domain === 'admin')
    .flatMap(meta =>
      (meta.actions || []).map(action => ({ code: action.code, label: action.label, type: action.type }))
    );
}

export { ADMIN_PERMISSIONS, ADMIN_PERMISSION_CODES, adminPermissionOptions };
export default ADMIN_PERMISSIONS;
