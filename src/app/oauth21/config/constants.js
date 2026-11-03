/**
 * OAuth 2.1 共享常量
 *
 * 所有常量集中管理，避免硬编码散落各处。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */

/** Cookie 安全选项生产环境判断 */
import { OAUTH21_CONFIG } from '../../../config/oauth21_config.js';
import { AUTH_CONFIG } from '../../../config/auth_config.js';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/** 默认 scope */
const DEFAULT_SCOPE = 'openid profile email';

/**
 * 最大并发会话数（每应用）。来源 src/config/oauth21_config.js
 * （src/data/oauth21_config.json 可热改；本导出为启动快照，用到处请读 config 对象）
 */
const MAX_SESSIONS_PER_APP = Math.max(1, Number(OAUTH21_CONFIG.session?.maxSessionsPerApp) || 5);

/**
 * Refresh Token 最大数量（每用户）。与框架会话层同一旋钮
 * （src/config/auth_config.js 的 session.maxRefreshTokens），此处为启动快照
 */
const MAX_REFRESH_TOKENS = Math.max(1, Number(AUTH_CONFIG.session?.maxRefreshTokens) || 10);

/** Session TTL 常量（秒） */
const SESSION_TTL = {
  SHORT: 1800, // 30 分钟
  LONG: 2592000, // 30 天
  REFRESH: 2592000 // 30 天
};

export { IS_PRODUCTION, DEFAULT_SCOPE, MAX_SESSIONS_PER_APP, MAX_REFRESH_TOKENS, SESSION_TTL };
