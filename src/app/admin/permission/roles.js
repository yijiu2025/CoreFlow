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
  ADMIN_PERMISSIONS.FIREWALL.READ
];

defineRoles([
  {
    code: 'admin_viewer',
    app_id: 'admin',
    name: '管理观察者',
    rank_level: 10,
    /**
     * 授权即送的默认角色
     *
     * console 的登录应用是 `console`，但角色住在命名空间 `admin`
     * （`config.permission_app_id`）—— 授权解析按命名空间查，这里标了才有意义。
     */
    is_default: true,
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
