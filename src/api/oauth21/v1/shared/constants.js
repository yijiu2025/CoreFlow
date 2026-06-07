/**
 * OAuth 2.1 共享常量
 */

/** 一方应用默认配置 */
export const FIRST_PARTY_APP = {
  client_id: 'first-party-app',
  client_name: 'IAM Portal',
  scope: 'openid profile email'
};

/** Cookie 安全选项生产环境判断 */
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/** 默认 scope */
export const DEFAULT_SCOPE = 'openid profile email';
