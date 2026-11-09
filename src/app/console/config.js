/**
 * Console 管理后台应用配置
 *
 * 供 loader（`framework/lifecycle/loader/registry/10-apps.js`）扫描 `src/app/` 时读取；
 * `app_id` 与前端 `?appName=console` 对应。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
const consoleConfig = {
  app_id: 'console',
  name: '管理后台',
  description: '通用后台脚手架：用户 / 角色 / 菜单 / 部门 / 岗位 / 字典 / 参数 / 日志 / 代码生成',

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
