/**
 * OAuth 2.1 共享常量
 *
 * 所有常量集中管理，避免硬编码散落各处。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */

/** Cookie 安全选项生产环境判断 */
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/** 默认 scope */
const DEFAULT_SCOPE = 'openid profile email';

/** 最大并发会话数（每应用） */
const MAX_SESSIONS_PER_APP = parseInt(process.env.MAX_SESSIONS_PER_APP) || 5;

/** Refresh Token 最大数量（每用户） */
const MAX_REFRESH_TOKENS = parseInt(process.env.MAX_REFRESH_TOKENS) || 10;

/** Session TTL 常量（秒） */
const SESSION_TTL = {
  SHORT: 1800, // 30 分钟
  LONG: 2592000, // 30 天
  REFRESH: 2592000 // 30 天
};

export { IS_PRODUCTION, DEFAULT_SCOPE, MAX_SESSIONS_PER_APP, MAX_REFRESH_TOKENS, SESSION_TTL };
