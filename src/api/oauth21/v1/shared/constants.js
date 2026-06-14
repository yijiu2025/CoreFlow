/**
 * OAuth 2.1 共享常量
 *
 * 所有常量集中管理，避免硬编码散落各处。
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

/** 最大并发会话数（每应用） */
export const MAX_SESSIONS_PER_APP = parseInt(process.env.MAX_SESSIONS_PER_APP) || 5;

/** Refresh Token 最大数量（每用户） */
export const MAX_REFRESH_TOKENS = parseInt(process.env.MAX_REFRESH_TOKENS) || 10;

/** Session TTL 常量（秒） */
export const SESSION_TTL = {
  SHORT: 1800,       // 30 分钟
  LONG: 2592000,     // 30 天
  REFRESH: 2592000   // 30 天
};
