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
 *
 * @author yijiu2025
 * @since 2026-08-17
 */

import { issueAccessToken, issueIdToken } from '../crypto/jwt.js';
import { generateToken } from '../crypto/tokens.js';
import ApprovalDao from '../dao/approval.dao.js';
import TokenDao from '../dao/token.dao.js';
import config from '../config/config.js';
import { detectDeviceType, getDeviceId } from '../../../framework/auth/device.js';
import { loadUserPermissions } from '../../../framework/auth/permission-loader.js';
import { getStore } from '../../../framework/redis/index.js';
import { setAuthCookies } from './cookies.service.js';
import { resolveFieldSet } from '../config/scope-registry.js';
import { DEFAULT_SCOPE } from '../config/constants.js';

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
 * @param {object} [options]
 * @param {boolean} [options.rememberMe=true] - 是否长期登录（控制 sid/sid_r TTL；来自前端 keepLogin）
 * @returns {object} 令牌结果
 */
export async function issueDirectTokens(user, client, scope, oidcNonce, request, reply, fastify, options = {}) {
  // 默认 false（短期登录）：未显式声明 rememberMe 的入口（扫码/授权确认）均不下发
  // sid_r 长期凭证，降低公共设备残留半年期凭证的风险。登录页通过 keepLogin 显式开启。
  const { rememberMe = false } = options;

  // 获取设备 ID（登录时已经通过 getDeviceIdAndWrapResponse 处理）
  const deviceId = await getDeviceId(request);

  // client 由调用方查好传入（ClientDao.findById），不再内部 authenticateClient。
  // 所有 app（一方/三方）都在 oauth_clients 表注册，有真实 client_id。
  if (!client) {
    throw new Error('invalid_client: 客户端未提供');
  }

  const finalScopes = (scope || client.scope || DEFAULT_SCOPE).split(' ');
  const scopeString = finalScopes.join(' ');

  // 按 scope 裁剪返回给前端的 user 字段（phone 等敏感字段不下发）
  // 字段映射见 scope-registry，请求 email scope 才返回 email，profile 才返回 username/name/avatar
  const fieldSet = new Set(resolveFieldSet(scopeString));
  const userPayload = { id: user.id };
  if (fieldSet.has('username')) userPayload.username = user.username;
  if (fieldSet.has('name')) userPayload.name = user.name || user.username;
  if (fieldSet.has('avatar')) userPayload.avatar = user.avatar;
  if (fieldSet.has('email')) userPayload.email = user.email;
  // phone 等 sensitive 字段 resolveFieldSet 已排除，不下发

  // 保存授权记录
  await ApprovalDao.saveApproval({
    uid: user.id,
    appId: client.client_id,
    scopes: finalScopes
  });

  const result = {
    token_type: 'Bearer',
    scope: scopeString,
    user: userPayload
  };

  // ── 模式 A：JWT 启用 ──
  if (config.jwt.enabled) {
    const { token: accessToken, kid: accessKid } = await issueAccessToken({
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
    result.access_token_kid = accessKid;
    result.refresh_token = refreshToken;
    result.expires_in = config.jwt.accessTokenTTL;

    // 预热权限缓存：签发时查好 roles/permissions 写入 perm store（30s TTL），
    // 验证侧 getUserFromToken 优先读缓存，避免每次请求都查 DB。
    // 不影响 JWT 本体（不嵌入权限），权限变更最多 30s 生效。
    const permStore = getStore('perm', { timeout: 3000 });
    try {
      const { roles, permissions } = await loadUserPermissions(user.id, client.client_id);
      await permStore.set(`${user.id}:${client.client_id}`, { roles, permissions }, 30);
    } catch (err) {
      console.warn('[Auth] 权限缓存预热失败:', err.message);
    }

    // OIDC ID Token：按 scope 裁剪 claims（openid 只给 sub，profile 给 name，email 给 email）
    if (finalScopes.includes('openid')) {
      const idClaims = {};
      if (fieldSet.has('name')) idClaims.name = user.name || user.username;
      if (fieldSet.has('email')) idClaims.email = user.email;
      const { token: idToken, kid: idKid } = await issueIdToken({
        sub: user.id,
        aud: client.client_id,
        nonce: oidcNonce,
        auth_time: Math.floor(Date.now() / 1000),
        ...idClaims
      });
      result.id_token = idToken;
      result.id_token_kid = idKid;
    }

    // 设置 JWT Cookie
    if (reply) {
      await setAuthCookies(reply, { accessToken, refreshToken, user: result.user }, fastify);
    }

    // JWT 模式：access_token/refresh_token cookie 由 setAuthCookies 下发；账号多凭证管理在 JWT 模式不适用（短期）
  } else {
    // ── 模式 B：Session（默认）──
    // appId：用 client.client_id（所有 app 都有真实 client_id）
    const sessionAppId = client.client_id || 'GLOBAL';

    if (reply && fastify) {
      // 所有登录都是跨域 iframe（oauth21 登录页被各 app 嵌入），sid cookie 设在 oauth21 域
      // 父应用（posecraft/firewall）拿不到，必须返回 session_token，由父应用调
      // /auth/v1/bind-session 在自身域换 sid/sid_r cookie。
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
          deviceId: deviceId, // 使用已验证的设备 ID
          deviceType: detectDeviceType(request.headers['user-agent'] || ''),
          userAgent: request.headers['user-agent'] || '',
          rememberMe
        },
        300
      );

      result.session_token = sessionToken;
      _debug(
        '🔍 [token-issuer] ✅ 已生成 session_token=%s...（供父窗口 bindSession 换 sid）',
        sessionToken.slice(0, 12)
      );
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
