/**
 * 管理后台角色定义
 * 使用 defineRoles 注册角色，loader 启动时自动同步到数据库
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { defineRoles } from '../../../framework/security/pbac/index.js';
import { ADMIN_PERMISSIONS } from './index.js';

/**
 * 管理观察者：全站只读
 *
 * 🔴 这份清单 = `ADMIN_PERMISSIONS` 里**每一个 `type: 'read'` 的码**，不多不少。
 *    写与不写只差一件事：菜单是"看得见"，权限码是"进得去"。
 *    侧栏的菜单来自 `sys_role_menu`（运行期数据，管理员可以全量授权给观察者），
 *    但页面进不进得去由这里决定 —— 少一个 read 码，就是侧栏里一个点进去被守卫
 *    踢到 `/no-access` 的死链，而菜单授权看上去完全正常，只有拿观察者账号点一遍
 *    才发现。所以判据不是"感觉他该不该看这一页"，而是"这一页是不是只读的"。
 *
 * 为什么连 `DICT` / `CONFIG` / `SYSTEM.LOG` 这些没有页面消费的读码也列上：
 * 它们是"全站只读"这句话里的例外项。留着不产生任何界面（没有路由、没有菜单），
 * 却能让「观察者的 policy 里只有 read 码」成为一条可机器检查的整齐事实
 * （守卫见 `src/__tests__/permission/viewer-read-coverage.test.js`）。
 *
 * 🔴 这里**不许**出现任何写码（create / update / delete / high_risk / wildcard）：
 *    观察者是"能看不能改"的那一档，混进一个 `USER.ALL` 就等于把只读身份作废。
 */
const VIEWER_READ_ACTIONS = [
  ADMIN_PERMISSIONS.DASHBOARD.READ,
  ADMIN_PERMISSIONS.USER.READ,
  /*
   * 导出用户数据 / 查看授权记录也是 `type: 'read'`（2026-11-14 新增的两个码）。
   * 观察者能看到用户列表与授权关系，导出只是把同一份数据换个形态给出去；
   * 若哪天决定"不给导出"，那是政策变化，得去守卫测试里显式排除并写理由，
   * 而不是在这里悄悄漏掉 —— 漏掉的表现是按钮永远不出现且没人知道为什么。
   */
  ADMIN_PERMISSIONS.USER.EXPORT,
  ADMIN_PERMISSIONS.USER.GRANTS,
  ADMIN_PERMISSIONS.ROLE.READ,
  ADMIN_PERMISSIONS.POLICY.READ,
  ADMIN_PERMISSIONS.MENU.READ,
  ADMIN_PERMISSIONS.DEPT.READ,
  ADMIN_PERMISSIONS.POST.READ,
  ADMIN_PERMISSIONS.DICT.READ,
  ADMIN_PERMISSIONS.CONFIG.READ,
  ADMIN_PERMISSIONS.LOG.READ,
  ADMIN_PERMISSIONS.SYSTEM.LOG,
  // 应用清单（「应用管理」页）也是只读页：漏了它，观察者账号点进去会被踢到 /no-access
  ADMIN_PERMISSIONS.APP.READ,
  ADMIN_PERMISSIONS.FIREWALL.READ
];

defineRoles([
  {
    code: 'admin_viewer',
    app_id: 'admin',
    name: '管理观察者',
    rank_level: 10,
    /**
     * 🔴 **不要**标 `is_default: true`（与其他应用的普通角色不同）
     *
     * 管理后台是封闭应用（`admin/config.js` 有 `access.anyPermission: ['admin:*']`），
     * 观察者虽然是最低职级，但它持有全站读权限 —— 一旦"授权即送"，任何注册用户
     * 点一下同意就能看用户、部门、角色与日志。这类角色只能由管理员手工分配，
     * 所以 `config.default_role` 写的是 `null`，这里也不打默认标记。
     *
     * 后果提醒：`admin_viewer` 因此是审计里"最低职级"的兜底对象，而它的 rank 是 10
     * （普通档），所以即使有人误删了 `default_role: null`，也会**真的**把它发出去。
     * 两者必须同时保持：config 写 null、这里不标 is_default。
     */
    description: '只读权限：可查看工作台、用户、角色、菜单、部门、岗位与日志，不能做任何修改',
    policy: {
      Version: '2026-06-06',
      Statement: [
        {
          Effect: 'Allow',
          Action: VIEWER_READ_ACTIONS
        }
      ]
    }
  },
  {
    code: 'admin_operator',
    app_id: 'admin',
    name: '管理操作员',
    rank_level: 50,
    description: '可管理用户和角色，不可管理系统配置',
    policy: {
      Version: '2026-06-06',
      Statement: [
        {
          Effect: 'Allow',
          Action: [ADMIN_PERMISSIONS.USER.ALL, ADMIN_PERMISSIONS.ROLE.ALL, ADMIN_PERMISSIONS.POLICY.READ]
        }
      ]
    }
  },
  {
    code: 'admin_admin',
    app_id: 'admin',
    name: '管理后台管理员',
    rank_level: 80,
    description: '拥有管理后台全部权限',
    policy: {
      Version: '2026-06-06',
      Statement: [
        {
          Effect: 'Allow',
          Action: [ADMIN_PERMISSIONS.ADMIN.ALL]
        }
      ]
    }
  }
]);
