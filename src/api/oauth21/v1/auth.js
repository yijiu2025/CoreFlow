/**
 * OAuth 2.1 授权端点
 *
 * GET  /authorize          — 授权请求入口（展示登录/授权页面）
 * POST /authorize/login    — 用户登录验证
 * POST /authorize/consent  — 用户授权确认
 * POST /login              — 直接登录（密码 RSA 加密传输 + nonce 防重放）
 * POST /user/logout  — 退出
 */
import { v4 as uuidv4 } from 'uuid';
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { AuthorizationService, OAuthError } from '../../../oauth21/services/authorization.service.js';
import { TokenService } from '../../../oauth21/services/token.service.js';
import { decrypt, validateTimestamp } from '../../../oauth21/crypto/encryption.js';
import { issueAccessToken, issueIdToken } from '../../../oauth21/crypto/jwt.js';
import { generateToken } from '../../../oauth21/crypto/tokens.js';
import ApprovalDao from '../../../oauth21/dao/approval.dao.js';
import TokenDao from '../../../oauth21/dao/token.dao.js';
import UserDao from '../../../oauth21/dao/user.dao.js';
import captchaService from '../../../verify/captcha.js';
import { getSessionStore } from '../../../redis/session-store.js';
import config from '../../../oauth21/config/config.js';

const authService = new AuthorizationService();
const tokenService = new TokenService();

/** 已使用的 nonce 缓存（防重放，60 秒过期） */
const usedNonces = new Map();
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [nonce, ts] of usedNonces) {
    if (ts < cutoff) usedNonces.delete(nonce);
  }
}, 60_000);

/** 辅助：发放授权码并重定向 */
async function issueCodeAndRedirect(reply, sessionId, userId, sessionStore) {
  const session = await sessionStore.get(sessionId);
  if (!session) throw new Error('Session expired');

  const code = await authService.issueAuthorizationCode({
    userId,
    clientId: session.client.client_id,
    scope: session.scope,
    redirectUri: session.query.redirect_uri,
    codeChallenge: session.code_challenge,
    codeChallengeMethod: session.code_challenge_method,
    nonce: session.query.nonce
  });

  await sessionStore.delete(sessionId);

  const sep = session.query.redirect_uri.includes('?') ? '&' : '?';
  let redirectUrl = `${session.query.redirect_uri}${sep}code=${code}`;
  if (session.query.state) {
    redirectUrl += `&state=${encodeURIComponent(session.query.state)}`;
  }

  return reply.redirect(redirectUrl);
}

export default async function (fastify) {
  const sessionStore = getSessionStore(fastify, 'session');
  const qrStore = getSessionStore(fastify, 'qr');
  // 🔐 安全头处理：允许特定页面被 iframe 嵌入 (SSO 核心需求)
  fastify.addHook('onSend', (request, reply, payload, done) => {
    const isMini = request.url.includes('mini-login') || request.url.includes('mini-register');
    if (isMini) {
      reply.header('X-Frame-Options', 'ALLOWALL');
      reply.header('Content-Security-Policy', "frame-ancestors 'self' *");
    }
    done();
  });
  registerGroupMetadata({
    name: 'auth',
    description: 'OAuth 2.1 授权流程',
    enabled: true,
    requireLogin: false
  });


  /**
   * GET /authorize — 授权请求入口
   *
   * OAuth 2.1 标准授权码流程起点。
   * 验证客户端参数后，根据用户登录态和已有授权决定：
   * - 未登录 → 返回登录页面信息
   * - 已登录且已授权 → 直接发放授权码重定向
   * - 已登录未授权 → 返回授权确认信息
   */
  registerSecureRoute(fastify, {
    name: 'authorize',
    alias: '授权请求入口',
    method: 'GET',
    url: '/authorize',
    handler: async (request, reply) => {
      try {
        const validated = await authService.validateAuthorizeRequest(request.query);

        const sessionId = uuidv4();
        await sessionStore.set(sessionId, { ...validated, query: request.query, createdAt: Date.now() });

        const userId = request.cookies?.user_id;

        if (!userId) {
          return reply.send({
            action: 'login',
            sessionId,
            client_name: validated.client.client_name,
            scope: validated.scope
          });
        }

        const user = await UserDao.findById(userId);
        if (!user) {
          reply.clearCookie('user_id', { path: '/' });
          return reply.send({
            action: 'login',
            sessionId,
            client_name: validated.client.client_name,
            scope: validated.scope
          });
        }

        const approval = await ApprovalDao.getEffectiveApproval(userId, validated.client.client_id);
        const hasConsent = approval !== null;

        // 如果已经授权过，执行静默跳转 (SSO 核心体验)
        // 除非客户端明确要求 prompt=consent，但目前根据需求，如果有 Cookie 则走授权界面
        if (hasConsent && request.query.prompt !== 'consent') {
          return await issueCodeAndRedirect(reply, sessionId, userId, sessionStore);
        }

        // 返回 consent 动作以及完整的用户上下文信息，供前端展示“账号选择/点击授权”界面
        return reply.send({
          action: 'consent',
          sessionId,
          client_name: validated.client.client_name,
          scope: validated.scope,
          user_id: userId,
          user: {
            username: user.username,
            name: user.name || user.username,
            email: user.email,
            avatar: user.avatar // 如果未来有头像字段
          }
        });
      } catch (err) {
        if (err instanceof OAuthError && request.query.redirect_uri) {
          const sep = request.query.redirect_uri.includes('?') ? '&' : '?';
          return reply.redirect(`${request.query.redirect_uri}${sep}${err.toRedirectParams()}`);
        }
        throw err;
      }
    }
  });

  /**
   * POST /authorize/login — 用户登录验证
   */
  registerSecureRoute(fastify, {
    name: 'authorizeLogin',
    alias: '授权登录验证',
    method: 'POST',
    url: '/authorize/login',
    handler: async (request, reply) => {
      const { sessionId, username, password } = request.body;
      const session = await sessionStore.get(sessionId);
      if (!session) {
        return reply.code(400).send({ error: 'invalid_session', error_description: 'Invalid session' });
      }

      const user = await authService.authenticateUser(username, password);
      if (!user) {
        return reply.code(401).send({
          action: 'login',
          sessionId,
          client_name: session.client.client_name,
          scope: session.scope,
          error: 'Invalid username or password'
        });
      }

      reply.setCookie('user_id', user.id, { httpOnly: true, maxAge: 3_600_000, path: '/' });

      const approval = await ApprovalDao.getEffectiveApproval(user.id, session.client.client_id);
      if (approval) {
        return await issueCodeAndRedirect(reply, sessionId, user.id, sessionStore);
      }

      return reply.send({
        action: 'consent',
        sessionId,
        client_name: session.client.client_name,
        scope: session.scope,
        user_id: user.id
      });
    }
  });

  /**
   * POST /authorize/consent — 用户授权确认
   */
  registerSecureRoute(fastify, {
    name: 'authorizeConsent',
    alias: '授权确认',
    method: 'POST',
    url: '/authorize/consent',
    handler: async (request, reply) => {
      const { sessionId, user_id, action } = request.body;
      const session = await sessionStore.get(sessionId);
      if (!session) {
        return reply.code(400).send({ error: 'invalid_session', error_description: 'Invalid session' });
      }

      if (action === 'deny') {
        const sep = session.query.redirect_uri.includes('?') ? '&' : '?';
        return reply.redirect(
          `${session.query.redirect_uri}${sep}error=access_denied&error_description=User denied the request`
        );
      }

      await ApprovalDao.saveApproval({
        uid: user_id,
        appId: session.client.client_id,
        scopes: session.scope.split(' ')
      });
      return await issueCodeAndRedirect(reply, sessionId, user_id, sessionStore);
    }
  });

  /**
   * ─── 统一直接令牌发放核心逻辑 ───
   */
  async function issueDirectTokens(user, client_id, scope, oidcNonce, request) {
    const client = client_id ? (await tokenService.authenticateClient(request)) : {
      client_id: 'first-party-app',
      scope: 'openid profile email'
    };

    if (client_id && !client) {
      throw new Error('invalid_client');
    }

    const finalScopes = (scope || client.scope || 'openid profile email').split(' ');
    const scopeString = finalScopes.join(' ');
    
    await ApprovalDao.saveApproval({
      uid: user.id,
      appId: client.client_id,
      scopes: finalScopes
    });

    const accessToken = issueAccessToken({ sub: user.id, client_id: client.client_id, scope: scopeString });
    const refreshToken = generateToken(48);
    await TokenDao.save(refreshToken, { sub: user.id, client_id: client.client_id, scope: scopeString, expiresIn: config.jwt.refreshTokenTTL });

    const result = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: config.jwt.accessTokenTTL,
      refresh_token: refreshToken,
      scope: scopeString
    };

    if (finalScopes.includes('openid')) {
      result.id_token = issueIdToken({
        sub: user.id,
        client_id: client.client_id,
        nonce: oidcNonce,
        auth_time: Math.floor(Date.now() / 1000),
        email: user.email,
        name: user.name
      });
    }

    return result;
  }

  /**
   * ─── 统一直接登录处理逻辑 (支持 RSA 解密与验证码校验) ───
   */
  async function handleDirectLogin(request, reply) {
    const {
      encrypted,
      timestamp,
      nonce,
      username: plainUsername,
      password: plainPassword,
      client_id,
      scope,
      nonce: oidcNonce,
      captchaKey
    } = request.body;

    // 1. 验证码校验 (检查是否已通过 verify-captcha 预验证)
    if (captchaKey) {
      const captchaStore = getSessionStore(fastify, 'captcha');
      const isVerified = await captchaService.consume(captchaKey, captchaStore);
      if (!isVerified) {
        return reply.code(400).send({ error: 'invalid_captcha', error_description: '请先完成图形验证' });
      }
    }

    let username, password;

    // 2. 解密逻辑 (RSA-OAEP)
    if (encrypted) {
      if (!validateTimestamp(timestamp)) {
        return reply.code(400).send({ error: 'invalid_request', error_description: '请求时间戳异常' });
      }
      if (!nonce || usedNonces.has(nonce)) {
        return reply.code(400).send({ error: 'invalid_request', error_description: '重放攻击检测：nonce 无效' });
      }
      usedNonces.set(nonce, Date.now());

      try {
        const decrypted = decrypt(encrypted);
        const payload = JSON.parse(decrypted);
        username = payload.username;
        password = payload.password;
      } catch {
        return reply.code(400).send({ error: 'invalid_request', error_description: '解密失败或格式错误' });
      }
    } else {
      username = plainUsername;
      password = plainPassword;
    }

    if (!username || !password) {
      return reply.code(400).send({ error: 'invalid_request', error_description: '用户名和密码不能为空' });
    }

    // 3. 验证用户
    const user = await authService.authenticateUser(username, password);
    if (!user) {
      return reply.code(401).send({ error: 'invalid_grant', error_description: '账号或密码错误' });
    }

    // 4. 签发令牌
    try {
      const result = await issueDirectTokens(user, client_id, scope, oidcNonce, request);
      return result;
    } catch (err) {
      if (err.message === 'invalid_client') {
        return reply.code(401).send({ error: 'invalid_client', error_description: '客户端认证失败' });
      }
      throw err;
    }
  }

  /**
   * POST /login — 标准直接登录
   */
  registerSecureRoute(fastify, {
    name: 'login',
    alias: '标准登录',
    method: 'POST',
    url: '/login',
    handler: handleDirectLogin
  });

  /**
   * POST /mini-login — 快捷登录 (允许 iframe 嵌入)
   */
  registerSecureRoute(fastify, {
    name: 'miniLogin',
    alias: '快捷登录',
    method: 'POST',
    url: '/mini-login',
    handler: handleDirectLogin
  });

  /**
   * POST /mini-register — 快捷注册 (与 SSO 注册逻辑保持一致)
   */
  registerSecureRoute(fastify, {
    name: 'miniRegister',
    alias: '快捷注册',
    method: 'POST',
    url: '/mini-register',
    handler: async (request, reply) => {
      // 转发至 SSO 注册逻辑 (这里简单复用，实际生产中可调用独立的注册 Service)
      const { username, password, email } = request.body;
      // 注意：此处应同样包含验证码校验逻辑，为简洁起见此处略去或调用统一校验函数
      return reply.code(201).send({ message: '快捷注册功能暂由 SSO 注册接口统一处理' });
    }
  });

  /**
   * ─── 扫码登录预留逻辑 (QR Code Login) ───
   */

  /**
   * GET /qr/generate — 生成登录二维码
   */
  registerSecureRoute(fastify, {
    name: 'qrGenerate',
    alias: '生成登录二维码',
    method: 'GET',
    url: '/qr/generate',
    handler: async (request, reply) => {
      const qrKey = uuidv4();
      const qrData = { status: 'PENDING', userId: null, expiredAt: Date.now() + 120_000 };
      await qrStore.set(qrKey, qrData, 120);
      
      return { qrKey, expires_in: 120 };
    }
  });

  /**
   * POST /qr/scan — 移动端标记二维码为已扫码
   */
  registerSecureRoute(fastify, {
    name: 'qrScan',
    alias: '扫描登录二维码',
    method: 'POST',
    url: '/qr/scan',
    handler: async (request, reply) => {
      const { qrKey } = request.body;
      const data = await qrStore.get(qrKey);
      
      if (!data || data.status === 'CONFIRMED') {
        return reply.code(400).send({ error: 'invalid_qr', error_description: '二维码不存在、已确认或已过期' });
      }

      data.status = 'SCANNED';
      await qrStore.set(qrKey, data, 120);
      
      return { success: true };
    }
  });

  /**
   * POST /qr/confirm — 移动端确认登录
   * 需要 requireLogin (或者通过 Header 传递移动端 Token 来校验用户)
   */
  registerSecureRoute(fastify, {
    name: 'qrConfirm',
    alias: '确认扫码登录',
    method: 'POST',
    url: '/qr/confirm',
    // 生产环境中，移动端发送此请求应携带自己的认证信息
    // requireLogin: true, 
    handler: async (request, reply) => {
      const { qrKey } = request.body;
      const redisKey = `qr:${qrKey}`;
      
      // 此处简化，假设移动端通过 Cookie/State 传递了当前登录用户的 ID
      // 实际应使用 request.state.user.id
      const userId = request.cookies?.user_id || (request.state && request.state.user ? request.state.user.id : null);
      if (!userId) {
        return reply.code(401).send({ error: 'unauthorized', error_description: '移动端未登录' });
      }

      const data = await qrStore.get(qrKey);
      
      if (!data) return reply.code(400).send({ error: 'invalid_qr', error_description: '二维码无效或已过期' });

      data.status = 'CONFIRMED';
      data.userId = userId;
      await qrStore.set(qrKey, data, 120);
      
      return { success: true };
    }
  });

  /**
   * GET /qr/status — 轮询二维码状态 (PC端调用)
   */
  registerSecureRoute(fastify, {
    name: 'qrStatus',
    alias: '检测二维码状态',
    method: 'GET',
    url: '/qr/status',
    handler: async (request, reply) => {
      const { qrKey, client_id, scope, nonce: oidcNonce } = request.query;
      const data = await qrStore.get(qrKey);
      
      if (!data) return { status: 'EXPIRED' };
      
      // 如果已确认，执行令牌签发
      if (data.status === 'CONFIRMED') {
        const user = await UserDao.findById(data.userId);
        if (!user) {
           return { status: 'ERROR', error: 'User not found' };
        }

        try {
          const result = await issueDirectTokens(user, client_id, scope, oidcNonce, request);
          
          // 签发成功后销毁二维码
          await qrStore.delete(qrKey);

          // 结合返回状态和 Token
          return { status: 'CONFIRMED', ...result };
        } catch (err) {
          if (err.message === 'invalid_client') {
            return { status: 'ERROR', error: 'invalid_client' };
          }
          throw err;
        }
      }
      
      return { status: data.status };
    }
  });
}

