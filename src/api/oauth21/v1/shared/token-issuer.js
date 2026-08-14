/**
 * 令牌签发核心逻辑
 *
 * 从 login.js 提取，供多个路由模块复用：
 * - login.js（直接登录）
 * - qr.js（扫码登录）
 * - 未来可扩展到其他登录方式
 *
 * 支持两种认证模式：
 * - JWT_ENABLED=true: 签发 JWT access_token + refresh_token
 * - JWT_ENABLED=false（默认）: 仅创建 Session（sid/sid_r Cookie）
 */

import { issueAccessToken, issueIdToken } from '../../../../app/oauth21/crypto/jwt.js';
import { generateToken } from '../../../../app/oauth21/crypto/tokens.js';
import ApprovalDao from '../../../../app/oauth21/dao/approval.dao.js';
import TokenDao from '../../../../app/oauth21/dao/token.dao.js';
import { TokenService } from '../../../../app/oauth21/services/token.service.js';
import config from '../../../../app/oauth21/config/config.js';
import { createSession } from '../../../../auth/session.js';
import { getDeviceId, detectDeviceType } from '../../../../auth/device.js';
import { getStore } from '../../../../redis/index.js';
import { setAuthCookies } from './cookies.js';
import { FIRST_PARTY_APP, DEFAULT_SCOPE } from './constants.js';

const tokenService = new TokenService();

/** 认证调试开关（与 auth/index.js 一致，DEBUG_AUTH=true 时输出） */
const DEBUG_AUTH = process.env.DEBUG_AUTH === 'true';
function _debug(...args) {
  if (DEBUG_AUTH) console.log('[Auth Debug]', ...args);
}

/**
 * 签发直接令牌
 *
 * @param {object} user - 用户对象 { id, username, name, email, avatar }
 * @param {string|null} client_id - 客户端 ID，null 表示一方应用
 * @param {string} scope - 请求的 scope
 * @param {string} oidcNonce - OIDC nonce
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply（用于设置 Cookie）
 * @param {object} fastify - Fastify 实例（用于 H5 token）
 * @returns {object} 令牌结果
 */
export async function issueDirectTokens(user, client_id, scope, oidcNonce, request, reply, fastify) {
  const client = client_id ? await tokenService.authenticateClient(request) : { ...FIRST_PARTY_APP };

  if (client_id && !client) {
    throw new Error('invalid_client');
  }

  const finalScopes = (scope || client.scope || DEFAULT_SCOPE).split(' ');
  const scopeString = finalScopes.join(' ');

  // 保存授权记录
  await ApprovalDao.saveApproval({
    uid: user.id,
    appId: client.client_id,
    scopes: finalScopes
  });

  const result = {
    token_type: 'Bearer',
    scope: scopeString,
    user: {
      id: user.id,
      username: user.username,
      name: user.name || user.username,
      email: user.email,
      avatar: user.avatar
    }
  };

  // ── 模式 A：JWT 启用 ──
  if (config.jwt.enabled) {
    const accessToken = issueAccessToken({
      sub: user.id,
      aud: client.client_id,
      scope: scopeString
    });
    const refreshToken = generateToken(48);
    await TokenDao.save(refreshToken, {
      sub: user.id,
      client_id: client.client_id,
      scope: scopeString,
      expiresIn: config.jwt.refreshTokenTTL
    });

    result.access_token = accessToken;
    result.refresh_token = refreshToken;
    result.expires_in = config.jwt.accessTokenTTL;

    // OIDC ID Token
    if (finalScopes.includes('openid')) {
      result.id_token = issueIdToken({
        sub: user.id,
        aud: client.client_id,
        nonce: oidcNonce,
        auth_time: Math.floor(Date.now() / 1000),
        email: user.email,
        name: user.name
      });
    }

    // 设置 JWT Cookie
    if (reply) {
      await setAuthCookies(reply, { accessToken, refreshToken, user: result.user }, fastify);
    }
  } else {
    // ── 模式 B：Session（默认）──
    // appId：优先用请求中的 client_id（如 'firewall'），回退到 client.client_id
    const sessionAppId = client_id || client.client_id || 'GLOBAL';

    if (reply && fastify) {
      // 跨应用 SSO 登录检测：
      // 第三方 client（client_id 非空、非第一方）通过 SSO iframe 登录时，sid Cookie 会被设到
      // SSO/API 域，父应用（posecraft/firewall）拿不到，必须改走 session_token 流程——
      // 由父应用调 /auth/v1/bind-session 在自身域上换取 sid/sid_r Cookie。
      // 注意：Sec-Fetch-Dest 没有 'iframe' 值，sec-fetch 无法可靠检测 iframe 嵌入，故改用 client_id 判断。
      const isSsoLogin = !!(client_id && client_id !== FIRST_PARTY_APP.client_id);
      _debug('🔍 [token-issuer] SSO 检测: client_id=%s → isSsoLogin=%s', client_id || '(first-party)', isSsoLogin);

      if (isSsoLogin) {
        // iframe 模式：生成临时 session token 存入 Redis
        const sessionToken = generateToken(32);
        const sessionStore = getStore('session_token');
        await sessionStore.set(
          sessionToken,
          {
            userId: user.numericId || user.id,
            uid: user.uid || user.id,
            username: user.username,
            email: user.email,
            avatar: user.avatar,
            status: user.status || 'active',
            appId: sessionAppId,
            ip: request.ip,
            deviceId: getDeviceId(request),
            deviceType: detectDeviceType(request.headers['user-agent'] || ''),
            userAgent: request.headers['user-agent'] || '',
            rememberMe: true
          },
          300
        );

        result.session_token = sessionToken;
        _debug(
          '🔍 [token-issuer] ✅ SSO 分支：已生成 session_token=%s...（供父窗口 bindSession）',
          sessionToken.slice(0, 12)
        );
      } else {
        // 第一方直接登录：在本应用域直接创建 Session 并设 Cookie
        _debug('🔍 [token-issuer] 第一方登录：直接 createSession 设 sid cookie');
        try {
          await createSession({
            userId: user.numericId || user.id,
            uid: user.uid || user.id,
            username: user.username,
            email: user.email,
            avatar: user.avatar,
            status: user.status || 'active',
            appId: sessionAppId,
            ip: request.ip,
            deviceId: getDeviceId(request),
            deviceType: detectDeviceType(request.headers['user-agent'] || ''),
            userAgent: request.headers['user-agent'] || '',
            rememberMe: true,
            reply
          });
        } catch (err) {
          if (err.code === 'MAX_SESSIONS_EXCEEDED') {
            return {
              code: 409,
              message: '设备数量已达上限',
              data: {
                action: 'max_sessions',
                maxSessions: err.maxSessions,
                sessions: err.sessions
              }
            };
          }
          throw err;
        }
      }
    }
  } // 结束 Session 模式 else

  // 🔍 调试：返回结果概览（session_token 是否存在是 iframe SSO 能否绑定的关键）
  _debug(
    '🔍 [token-issuer] 返回 result: keys=%s, has session_token=%s, has access_token=%s',
    Object.keys(result).join(','),
    !!result.session_token,
    !!result.access_token
  );
  return result;
}
