/**
 * Firewall 应用配置
 * 供 loader 扫描时读取，决定如何加载此应用
 */
import { initFirewall } from './index.js';

export default {
  app_id: 'firewall',
  name: '防火墙防御系统',
  description: '五层拦截管道：连接追踪→封禁→挑战→Bot→地理围栏',
  init: initFirewall,

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
    application_type: 'web'
  }
};
