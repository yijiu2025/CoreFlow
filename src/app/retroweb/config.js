/**
 * RetroWeb 应用配置
 * 供 loader（10-apps.js）扫描时读取：加载权限常量、角色定义并同步到库。
 *
 * 🔴 刻意**不声明 `oauth_client`**：retroweb 走 oauth21 的 iframe + bind-session
 *    （`/mini-login` → `/auth/v1/bind-session`），不是 OAuth 授权码流程，
 *    注册一个用不到的 client 只会让 oauth_clients 表多一条没人认的脏数据。
 *    将来若要做"第三方应用授权 retroweb 数据"再补。
 *
 * 🔴 也不声明 `init`：本应用没有需要全局注册的插件，路由由 08-api 扫描
 *    `src/api/retroweb/` 自动加载（与 posecraft 一致）。
 *
 * @since 2026-10-09
 */
const retrowebConfig = {
  app_id: 'retroweb',
  name: 'RetroWeb',
  description: '逆合成工作台：任务云端存储（绑定用户）+ 算法服务中转'
};

export default retrowebConfig;
