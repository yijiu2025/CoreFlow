/**
 * JWT Bearer 认证流程
 *
 * Bearer Token（Authorization 头）与 access_token Cookie 的验证与用户装配。
 * 认证优先级：Bearer Token > access_token Cookie > Session Cookie (sid)。
 *
 * 权限语义（单一来源）：签发端（app/oauth21/crypto/jwt.js）不把 roles/permissions
 * 嵌入 JWT（权限变更即时生效），这里永远走带指纹校验的缓存（permission/perm-cache.js）
 * 读实时快照，不读 payload claims。
 *
 * @author yijiu
 * @since 2026-07-13
 * @since 2026-11-01 自 auth/index.js 拆出（index.js 收敛为纯门面）
 */
import { verify } from '../jwt/index.js';
import { findUserByUid } from '../../shared/user-dao.js';
import { getPermissions } from './permission/perm-cache.js';
import { getStore } from '../redis/index.js';
import { createLogger } from '../log/index.js';

const log = createLogger('framework.auth.bearer-auth');

/** JWT 认证开关（从环境变量读取，避免依赖 oauth21 应用层） */
const jwtEnabled = process.env.JWT_ENABLED === 'true';

/**
 * 从 Bearer Token 解析用户信息
 *
 * 缓存通过 getStore 统一管理，自带超时保护、序列化和降级。
 *
 * @param {string} token - JWT access_token
 * @returns {Promise<object|null} 用户信息对象或 null（验证失败时）
 */
async function getUserFromToken(token) {
  try {
    const payload = await verify(token);
    if (!payload?.sub) return null;
    // 仅允许 access_token / client_token 作为 Bearer 认证凭证；
    // id_token / refresh_token 或缺失 token_type 的 token 不得用于 API 认证。
    if (payload.token_type !== 'access_token' && payload.token_type !== 'client_token') {
      log.warn('[Auth] 拒绝非 access/client token 作为 Bearer 凭证: token_type=%s', payload.token_type);
      return null;
    }
    log.debug('🔑 JWT 解析成功: sub=%s, aud=%s, token_type=%s', payload.sub, payload.aud, payload.token_type);

    // client_token：客户端凭证令牌（M2M），无用户上下文，直接返回客户端信息
    if (payload.token_type === 'client_token') {
      return {
        sub: payload.sub,
        userId: null,
        username: payload.sub,
        email: null,
        avatar: null,
        status: 1,
        roles: [],
        permissions: { allows: [], denies: [] },
        tokenType: 'client_token'
      };
    }

    // 1. 优先查用户缓存（30s TTL），避免每次请求打 DB
    //    缓存未命中才查库，兼顾性能与账号实时状态
    const userStore = getStore('user', { timeout: 3000 });
    let userData = null;
    try {
      userData = await userStore.get(String(payload.sub));
    } catch (err) {
      log.warn('[Auth] 用户缓存读取失败，降级到数据库:', err);
    }

    if (!userData) {
      log.debug('📦 用户缓存未命中，查 DB: userId=%s', payload.sub);
      userData = await findUserByUid(payload.sub); // payload.sub 是 uid（JWT 契约）
      if (!userData) return null;
      // 写入缓存（30 秒），账号禁用等状态变更 30s 内生效
      try {
        await userStore.set(String(payload.sub), userData, 30);
      } catch (err) {
        log.warn('[Auth] 用户缓存写入失败:', err);
      }
    } else {
      log.debug('📦 用户缓存命中: userId=%s, username=%s', userData.id, userData.username);
    }

    // 2. 检查账号状态（禁用则拒绝）
    if (userData.status === 0) {
      // warn：禁用账号的登录尝试是安全审计事件，生产环境需要可见
      log.warn('🚫 账号已禁用: userId=%s', userData.id);
      return null;
    }

    // 3. 权限加载：走带指纹校验的缓存（permission/perm-cache.js）
    //
    //    签发端不把权限嵌进 JWT（权限变更即时生效，不等 token 过期），
    //    所以这里永远从缓存/DB 读实时快照，不读 payload claims。
    //    ⚠️ 必须传数字主键（userData.id）：loadUserPermissions 按数字列 user_id
    //    查询，传 uid 字符串会查空 → JWT 用户权限恒为空。
    const { roles, permissions } = await getPermissions(userData.id, payload.aud || 'GLOBAL');

    return {
      sub: userData.uid,
      uid: userData.uid,
      // 与 Session 路径（plugin.js）对齐：userId = 数字主键，uid/sub = 对外 UUID。
      // DAO 形状契约见 user-dao-shape.test.js（id = 数字，uid = UUID）。
      userId: userData.id,
      username: userData.username,
      email: userData.email,
      avatar: userData.avatar,
      status: userData.status,
      roles,
      permissions,
      tokenType: 'bearer'
    };
  } catch (err) {
    // JWT 解析全程异常（verify 失败 / findUserByUid 抛错 / getPermissions 抛错）：
    // 返回 null 让调用方走"认证失败"分支，但记 warn 便于排障（原 catch {} 静默）
    log.warn('[Auth] getUserFromToken 异常:', err);
    return null;
  }
}

/**
 * JWT 认证（Bearer Token + access_token Cookie）
 *
 * @param {object} cookies 解析后的 cookies
 * @param {object} headers 请求头
 * @returns {Promise<object|null>} 认证成功的用户对象，或 null（未走 JWT / 失败）
 */
async function authenticateByJwt(cookies, headers) {
  if (!jwtEnabled) return null;
  log.debug('📋 JWT 模式已启用');

  // 2a. Bearer Token（Header）
  const authHeader = headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    log.debug('🔑 检测到 Bearer Token: %s...', token.slice(0, 20));
    const tokenUser = await getUserFromToken(token);
    if (tokenUser) {
      log.debug('✅ JWT 认证成功: userId=%s, username=%s', tokenUser.userId, tokenUser.username);
      return tokenUser;
    }
    // warn：认证失败是安全审计事件（爆破/伪造 token 探测），生产环境需要可见
    log.warn('❌ JWT 认证失败（Token 无效或用户不存在）');
  }

  // 2b. access_token Cookie
  if (cookies['access_token']) {
    const tokenUser = await getUserFromToken(cookies['access_token']);
    if (tokenUser) return tokenUser;
  }
  return null;
}

export { authenticateByJwt };
