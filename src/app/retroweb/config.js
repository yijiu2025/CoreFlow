/**
 * RetroWeb 应用配置
 * 供 loader（10-apps.js）扫描时读取：加载权限常量、角色定义、OAuth 客户端并同步到库。
 *
 * 🔴 声明 `oauth_client` 的原因（**2026-11-09 修正，勿再删**）：
 *    原注释写「走 iframe + bind-session，不是授权码流程，注册 client 只会多一条脏数据」。
 *    这个判断在 `a3827c2e refactor(oauth21): 删除 FIRST_PARTY_APP，client_id 必传 + 查真实 client`
 *    之后**已不成立**：iframe 只是登录界面的承载方式，登录本身仍打
 *    `POST /oauth2.1/login`，而该接口现在强制用 `client_id` 查 `oauth_clients`
 *    （前端把 `?appName=retroweb` 直接当 `client_id` 传，见 `MiniLogin.vue`）。
 *    不声明 → 400「无效的客户端 ID」，且错误在 iframe 内，宿主只看到「postMessage 没来」。
 *    ⇒ 这条 client 不是「没人认的脏数据」，而是登录链路的前提。
 *
 * 🔴 也不声明 `init`：本应用没有需要全局注册的插件，路由由 08-api 扫描
 *    `src/api/retroweb/` 自动加载（与 posecraft 一致）。
 *
 * @since 2026-10-09；2026-11-09 补 oauth_client 声明
 */
const retrowebConfig = {
  app_id: 'retroweb',
  name: 'RetroWeb',
  description: '逆合成工作台：任务云端存储（绑定用户）+ 算法服务中转',

  /**
   * 授权即送的默认角色（主口径）
   *
   * 与 `permission/roles.js` 里 `retroweb_user` 的 `is_default: true` 保持一致；
   * 两处都写是为了"改配置能覆盖代码、看代码能知道意图"。解析优先级与审计规则
   * 见 `framework/security/pbac/default-role.js`。
   */
  default_role: 'retroweb_user',

  /** OAuth 2.1 客户端声明（启动期由 10-apps upsert 到 oauth_clients） */
  oauth_client: {
    client_id: 'retroweb',
    client_name: 'RetroWeb 逆合成工作台',
    client_secret: null,
    // dev 5177（vite strictPort）+ 同源代理兜底；生产域名按部署补
    redirect_uris: ['http://localhost:5177/', 'http://localhost:3000/retroweb/'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'openid profile email',
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    skip_consent: false,
    scope_metadata: {
      profile: { name: '公开资料', desc: '获取你的用户名、昵称、头像，用于逆合成工作台展示' },
      email: { name: '邮箱', desc: '获取你的邮箱，用于任务完成通知与安全告警' }
    }
  }
};

export default retrowebConfig;
