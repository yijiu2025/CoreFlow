/**
 * Console 管理后台应用配置
 *
 * 供 loader（`framework/lifecycle/loader/registry/10-apps.js`）扫描 `src/app/` 时读取；
 * `app_id` 与前端 `?appName=console` 对应。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { consoleAppInit } from './init.js';

const consoleConfig = {
  app_id: 'console',
  name: '管理后台',
  description: '通用后台脚手架：用户 / 角色 / 菜单 / 部门 / 岗位 / 日志 / 授权与注销',

  /**
   * 应用启动钩子
   *
   * 目前只做一件事：把「按钮授权」解析器注册给守卫（`api/guard.js`）。守卫是框架层、
   * 被所有应用共用，不能反过来认识 `sys_menu` / `sys_role_menu`，所以走注册位
   * （见 `framework/security/auth/permission/button-grant.js`）。
   * ⚠️ 这里**不要** addHook —— init 跑在独立封装作用域里，钩子对 08-api 已注册的业务
   * 路由不生效（loader 里写明了这条），需要全局钩子请用 `rootPlugins`。
   */
  init: consoleAppInit,

  /**
   * 权限命名空间（`iam_role.app_id` 的取值）
   *
   * 本应用的 OAuth 客户端 id 是 `console`（登录会话里 `appId = 'console'`），但
   * 角色与权限码都住在历史命名空间 `admin` 下（`admin_viewer` / `admin_operator` /
   * `admin_admin`，权限码 `admin:*`）—— 那时后台 API 的前缀就叫 `/admin`。
   *
   * 🔴 不声明这一行的后果是**静默失效**：`loadUserPermissions(userId, 'console')`
   *    按 `app_id IN ('console','GLOBAL')` 过滤，`admin_*` 角色一条也取不到 ⇒ 除了
   *    GLOBAL 的 superadmin（自动获得 `console_admin`）之外，**所有管理角色都等于没授**：
   *    后台里授了角色、库里也确实存了，但该账号登录后每个接口 403。
   *    实测：`admin_viewer` 用户在 console 会话下的权限集是 `[]`。
   */
  permission_app_id: 'admin',

  /**
   * 授权即送的默认角色（主口径）
   *
   * 🔴 这个 code 住在命名空间 `admin` 下（上一行的 `permission_app_id`），
   *    不是 `console`。`resolveDefaultRole` 会用命名空间去查 `iam_role.app_id`，
   *    所以这里写 `admin_viewer` 能被查到；写成不存在的 `console_*` 会在启动期
   *    审计里报 error，并在授权时静默回落到最低职级。
   *
   * 权限：只读观察者。新授权的账号能进后台看，改数据要管理员另授。
   */
  default_role: 'admin_viewer',

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
   * OAuth 2.1 客户端声明 —— **本文件是唯一来源**
   *
   * 启动期由 `10-apps` 同步到 `oauth_clients` 表：查不到就 create，查到就 update
   * （`client_secret` 只在 create 时写入，避免覆盖线上改过的密钥）。
   * 请求期**没有任何**「传了 client_id 就自动建一条」的逻辑 —— 见
   * `app/oauth21/services/login.service.js`：`client_id` 缺失或查不到都直接 400。
   * 所以这里的声明不是"方便"，而是这条链路能不能起来的前提。
   *
   * 🔴 为什么走 iframe（`/mini-login` + `/auth/v1/bind-session`）也必须声明：
   *    iframe 只是**登录界面**的承载方式，登录本身仍然打 `POST /oauth2.1/login`，
   *    该接口第一件事就是按 `client_id` 查 `oauth_clients`（前端把 `?appName=` 直接
   *    当 `client_id` 传）。漏声明 = 400「无效的客户端 ID」，而且错误发生在 iframe
   *    内部，宿主只看到「postMessage 没来」，极易误判成 CORS / 代理 / 网络问题。
   *
   * ⚠️ 同步是**单向 upsert，不回收**：删掉本段不会自动删除表里的记录（loader 不做
   *    声明与表记录的差集清理），只会让下次部署不再同步它。要下线一个客户端得显式删表。
   */
  oauth_client: {
    client_id: 'console',
    client_name: '管理后台（Console）',
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

export default consoleConfig;
