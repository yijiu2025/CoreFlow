/**
 * 管理后台（admin）应用配置 —— **唯一来源**
 *
 * 2026-11-21 合并：此前这里是"空壳"（只声明 app_id 给角色一个落点），真正的应用
 * 声明在 `src/app/console/config.js`（登录应用 `console`），两者靠
 * `permission_app_id: 'admin'` 相连。结果是同一个后台在注册表里登记了两次：
 * 应用清单出现两行同名"管理后台"、会话 appId 一个叫 console 一个叫 admin，
 * 每写一处权限判断都要先问"这是登录应用还是命名空间"。
 *
 * 现在只有**一个**应用标识 `admin`：
 *   · 会话 `appId`、OAuth 客户端 id、`iam_role.app_id`、`sys_menu.app_id` 全部是 `admin`；
 *   · `permission_app_id` 已删除（它就是自己，留着只会让 `resolvePermissionAppId` 多绕一层）；
 *   · 代码仍分布在 `app/admin/`（IAM 与权限声明）与 `app/console/`（控制台业务实现），
 *     那只是**目录归属**，不再代表两个应用 —— 启动期只有本文件会被扫描成应用。
 *
 * @author yijiu2025
 * @since 2026-08-17（2026-11-21 合并 console → admin）
 */
import { adminAppInit } from './init.js';

const adminConfig = {
  app_id: 'admin',
  name: '管理后台',
  description: '通用后台：用户 / 角色 / 菜单 / 部门 / 岗位 / 日志 / 应用 / 授权与注销',

  /**
   * 应用启动钩子
   *
   * 只做一件事：把「按钮授权」解析器注册给守卫（`api/guard.js`）。守卫是框架层、
   * 被所有应用共用，不能反过来认识 `sys_menu` / `sys_role_menu`，所以走注册位。
   *
   * ⚠️ 这里**不要** addHook —— init 跑在独立封装作用域里，钩子对 08-api 已注册的
   * 业务路由不生效（loader 里写明了这条），需要全局钩子请用 `rootPlugins`。
   */
  init: adminAppInit,

  /**
   * 默认角色：**刻意不自动授予**
   *
   * 管理后台是封闭应用（下方 `access` 要求 `admin:*`），注册用户不该因为"点了授权"
   * 就获得管理能力。授权流程照常记录，但不发角色；登录时 `checkAppAccess` 判定
   * `NO_CAPABILITY`，直接给出 `denyMessage`。
   *
   * 🔴 不要改成 `admin_viewer`：观察者拥有全站读权限（用户列表 / 部门 / 角色 / 日志），
   *    `admin:*` 闸门会被它直接命中 —— 那等于"注册即可看后台"。这类角色只能由管理员
   *    在「用户管理 → 分配角色」里手工授予，GLOBAL 的 `superadmin` 则通过
   *    `permission-loader` 自动继承各应用的 `{appId}_admin`。
   *
   * 判据：启动期审计会对"有 access 闸门 + 非 null 默认角色"报 error，
   * `docs/core/permission.md` 的「封闭应用」一节说明了这个组合为什么禁止。
   */
  default_role: null,

  /**
   * 登录准入（`bind-session` 之前判定，见 `framework/security/auth/permission/app-access.js`）
   *
   * 统一认证面向所有注册用户，管理后台只应对**被授予管理能力**的账号开放。
   * 命中任一条即放行；两条都为空则不限制（其它应用不受影响）。
   *
   * ⚠️ 这是"能不能进后台"的闸门，不是接口鉴权 —— 接口放行仍由各路由的
   *    `requirePermission` 逐条判定，两者不互相替代。
   */
  access: {
    /** 任一权限码命中即可（支持 `*` 通配；`admin:*` 表示"有任何管理能力"） */
    anyPermission: ['admin:*'],
    /** 或任一角色命中即可（历史账号兜底：策略未配但角色在） */
    anyRole: ['superadmin'],
    denyMessage: '该账号没有管理后台的访问权限，请联系管理员分配角色后再试'
  },

  /**
   * 账号注销（删除用户）的缓冲期
   *
   * 「删除」不是立刻抹掉，而是先立一条注销申请并**立即拒登录**，到期后由定时任务
   * 正式清理（见 `app/user/services/deactivation.service.js`）。理由：误删是不可逆的，
   * 而一个人离职 / 交接时，账号往往还被别处引用着。
   *
   * 期间任何管理员都能撤销（`POST /users/:id/deletion/:requestId/cancel`）。
   * 下限 1 天、上限 30 天，由 DAO 归一化；改这里只影响**新发起**的申请。
   */
  user_deletion: {
    grace_days: 7
  },

  /**
   * 多域名部署时用于反查应用的 Host 列表
   *
   * 一般留空：路径前缀（`system.json` 的 `prefix`）已能判定"这个请求属于谁"。
   * 只有"前端与 API 同域、路径不带应用段"的部署才需要声明。
   */
  hosts: [],

  /**
   * OAuth 2.1 客户端声明 —— **本文件是唯一来源**
   *
   * 启动期由 `10-apps` 同步到 `oauth_clients` 表：查不到就 create，查到就 update
   * （`client_secret` 只在 create 时写入，避免覆盖线上改过的密钥）。
   * 请求期**没有任何**「传了 client_id 就自动建一条」的逻辑 —— 见
   * `app/oauth21/services/login.service.js`：`client_id` 缺失或查不到都直接 400。
   *
   * 🔴 客户端 id 与 app_id 一致（都是 `admin`）。此前是 `console`，改名后**存量会话
   *    与已签发 token 全部失效**（JWT 的 aud 是 console）—— 部署后用户需要重新登录
   *    一次。这是刻意付出的代价，换掉"两个名字指同一个后台"的长期成本。
   */
  oauth_client: {
    client_id: 'admin',
    client_name: '管理后台',
    client_secret: null,
    redirect_uris: ['http://localhost:5175/', 'http://localhost:3000/console/'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'openid profile email',
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    /** 一方应用首次登录自动授权，跳过 consent 确认页 */
    skip_consent: false,
    /** scope 描述覆盖（授权页展示用，字段映射走系统 scope-registry） */
    scope_metadata: {
      profile: { name: '公开资料', desc: '获取你的用户名、昵称、头像，用于管理后台展示' },
      email: { name: '邮箱', desc: '获取你的邮箱，用于安全告警与审计通知' }
    }
  }
};

export default adminConfig;
