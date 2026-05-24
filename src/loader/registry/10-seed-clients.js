import { sequelize } from '../../db/index.js';

/**
 * 自动配置/同步 OAuth 2.1 客户端 (如 firewall)
 */
export default async (app) => {
  const { OauthClient } = sequelize.models;
  if (!OauthClient) return;

  const clients = [
    {
      client_id: 'firewall',
      client_name: 'Antigravity Firewall',
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
  ];

  for (const item of clients) {
    const exist = await OauthClient.findByPk(item.client_id);
    if (!exist) {
      await OauthClient.create(item);
      console.log(`🌱 [Seed:OAuth] 初始化客户端: ${item.client_id}`);
    } else {
      await exist.update({
        client_name: item.client_name,
        redirect_uris: item.redirect_uris,
        grant_types: item.grant_types,
        response_types: item.response_types,
        scope: item.scope,
        token_endpoint_auth_method: item.token_endpoint_auth_method,
        application_type: item.application_type
      });
      console.log(`🌱 [Seed:OAuth] 同步更新客户端: ${item.client_id}`);
    }
  }
};
