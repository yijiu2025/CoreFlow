/**
 * 共享配置
 *
 * 从 oauth21/config/config.js 中提取常用配置，
 * 供 auth/ 和其他模块使用，避免直接依赖 oauth21。
 */

import config from '../app/oauth21/config/config.js';

/** JWT 是否启用 */
export const JWT_ENABLED = config.jwt.enabled;

/** JWT 配置 */
export const JWT_CONFIG = config.jwt;

/** Session 配置 */
export const SESSION_CONFIG = config.session;

/** 服务器配置 */
export const SERVER_CONFIG = config.server;

/** 默认配置导出 */
export default config;
