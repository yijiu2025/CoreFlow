/**
 * Firewall 应用配置
 * 供 loader 扫描时读取，决定如何加载此应用
 *
 * 分工（2026-11-02 收口）：
 *   - **防护核心**（限流插件 + 五阶段管道）不在这里注册 —— 它必须早于 08-api
 *     （@fastify/rate-limit 的 onRoute 只对之后注册的路由生效），由
 *     `framework/loader/registry/05-firewall.js` 直接注册；
 *   - **本应用的 `init`** 只做 app 侧的事（配置持久化 initDao、邮件通道、名单同步、
 *     遥测落盘），由 `10-apps` 按应用约定加载。
 * ⚠️ `init` 只能指向 `firewallAppInit`，**不得指向 `initFirewall`**：后者会把防护核心
 * 再注册一次（08-api 之后），导致 onRoute 钩子对已注册路由不触发 + 管道执行两次。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { firewallAppInit } from './index.js';

const firewallConfig = {
  app_id: 'firewall',
  name: '防火墙防御系统',

  // 10-apps 加载入口：app 侧初始化 + 收尾插件（防护核心不在这里）
  init: firewallAppInit,
  description: '五层拦截管道：连接追踪→封禁→挑战→Bot→地理围栏',

  // OAuth 2.1 客户端配置（用于自动注册到 oauth_clients 表）
  oauth_client: {
    client_id: 'firewall',
    client_name: 'CoreFlow Firewall',
    client_secret: null,
    redirect_uris: [
      'http://localhost:5173/firewall/',
      'http://localhost:3000/firewall/',
      'http://localhost:5174/firewall/'
    ],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'openid profile email',
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    /** 一方应用首次登录自动授权，跳过 consent 确认页 */
    skip_consent: false,
    /** scope 描述覆盖（授权页展示用，字段映射走系统 scope-registry） */
    scope_metadata: {
      profile: { name: '公开资料', desc: '获取你的用户名、昵称、头像，用于防火墙控制台展示' },
      email: { name: '邮箱', desc: '获取你的邮箱，用于安全告警与审计通知' }
    }
  }
};

export default firewallConfig;
