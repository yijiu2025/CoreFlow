/**
 * PoseCraft 应用配置
 * 供 loader 扫描时读取
 */
export default {
  app_id: 'posecraft',
  name: 'PoseCraft',
  description: 'AI 姿势分析 + 图片编辑平台',

  /**
   * OAuth 2.1 客户端配置
   * loader 扫描时自动同步到 oauth_clients 表
   */
  oauth_client: {
    client_id: 'posecraft',
    client_name: 'PoseCraft',
    client_secret: null, // null = 公共客户端（SPA）
    redirect_uris: ['http://localhost:5176/posecraft/callback', 'https://posecraft.example.com/callback'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'openid profile email',
    token_endpoint_auth_method: 'none', // 公共客户端不认证
    application_type: 'web'
  }
};
