/**
 * OAuth 2.1 授权服务
 *
 * 负责授权码流程的请求验证、用户认证、授权同意检查和授权码发放。
 * 实现 OAuth 2.1 授权服务器中 /authorize 端点的核心逻辑。
 *
 * 验证流程：
 * 1. 验证请求参数（response_type、client_id、redirect_uri）
 * 2. 校验客户端身份和 redirect_uri 白名单
 * 3. 强制 PKCE（OAuth 2.1 要求）
 * 4. 用户登录认证
 * 5. 检查用户授权同意
 * 6. 发放一次性授权码
 *
 * @author Claude
 * @since 2026-07-13
 */
import CodeDao from '../dao/code.dao.js';
import UserDao from '../dao/user.dao.js';
import ClientDao from '../dao/client.dao.js';
import ConsentDao from '../dao/consent.dao.js';
import ApprovalDao from '../dao/approval.dao.js';
import { v4 as uuidv4 } from 'uuid';
import { generateAuthorizationCode } from '../crypto/tokens.js';
import config from '../config/config.js';

/**
 * OAuth 授权错误（RFC 6749 标准错误格式）
 */
class OAuthError extends Error {
  /**
   * @param {string} error - 错误码（如 invalid_request、unauthorized_client）
   * @param {string} description - 错误描述
   * @param {number} [statusCode=400] - HTTP 状态码
   */
  constructor(error, description, statusCode = 400) {
    super(description);
    this.name = 'OAuthError';
    this.error = error;
    this.description = description;
    this.statusCode = statusCode;
  }

  /**
   * 序列化为 URL 查询参数（用于重定向错误响应）
   * @returns {string} URL 编码的错误参数字符串
   */
  toRedirectParams() {
    return `error=${encodeURIComponent(this.error)}&error_description=${encodeURIComponent(this.description)}`;
  }

  /**
   * 序列化为 JSON 错误响应
   * @returns {{error: string, error_description: string}}
   */
  toJSON() {
    return { error: this.error, error_description: this.description };
  }
}

class AuthorizationService {
  /**
   * 验证 /authorize 请求参数
   */
  async validateAuthorizeRequest(query) {
    const { response_type, client_id, redirect_uri, scope, code_challenge, code_challenge_method } = query;

    // 1. 必须参数
    if (!client_id) throw new OAuthError('invalid_request', 'client_id is required');
    if (!redirect_uri) throw new OAuthError('invalid_request', 'redirect_uri is required');
    if (response_type !== 'code') {
      throw new OAuthError('unsupported_response_type', 'Only response_type=code is supported');
    }

    // 2. 查找客户端
    const client = await ClientDao.findById(client_id);
    if (!client) throw new OAuthError('invalid_client', 'Unknown client_id');

    // 3. redirect_uri 校验
    if (!client.redirect_uris.includes(redirect_uri)) {
      throw new OAuthError('invalid_request', 'redirect_uri is not registered');
    }

    // 4. grant_type 兼容性
    if (!client.grant_types.includes('authorization_code')) {
      throw new OAuthError('unauthorized_client', 'Client not authorized for authorization_code grant');
    }

    // 5. PKCE（OAuth 2.1 强制）
    if (config.pkce.required) {
      if (!code_challenge) {
        throw new OAuthError('invalid_request', 'code_challenge is required (OAuth 2.1)');
      }
      if (code_challenge_method && !['S256', 'plain'].includes(code_challenge_method)) {
        throw new OAuthError('invalid_request', 'code_challenge_method must be S256 or plain');
      }
    }

    return {
      client,
      scope: scope || client.scope,
      state: query.state,
      nonce: query.nonce,
      code_challenge,
      code_challenge_method: code_challenge_method || 'S256'
    };
  }

  /**
   * 用户认证
   */
  async authenticateUser(username, password) {
    const user = await UserDao.findByUsername(username);
    if (!user) return null;
    const valid = await UserDao.verifyPassword(user, password);
    return valid ? user : null;
  }

  /**
   * 检查已有同意
   */
  async hasConsent(userId, clientId, requestedScopes) {
    const consent = await ConsentDao.find(userId, clientId);
    if (!consent) return false;
    const needed = requestedScopes.split(' ');
    return needed.every(s => consent.scopes.includes(s));
  }

  /**
   * 发放授权码
   */
  async issueAuthorizationCode({ userId, clientId, scope, redirectUri, codeChallenge, codeChallengeMethod, nonce }) {
    const code = generateAuthorizationCode();

    await CodeDao.save(code, {
      sub: userId,
      client_id: clientId,
      scope,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      nonce,
      expiresIn: config.jwt.authorizationCodeTTL
    });

    return code;
  }

  /**
   * 发放授权码并重定向回客户端（内部辅助）
   *
   * 从 session 取授权上下文 → 签发 code → 删 session → 302 重定向到 redirect_uri。
   * @param {object} reply - Fastify reply
   * @param {string} sessionId
   * @param {string|number} userId
   * @param {object} sessionStore - getStore('session') 实例
   */
  async issueCodeAndRedirect(reply, sessionId, userId, sessionStore) {
    const session = await sessionStore.get(sessionId);
    if (!session) throw new Error('Session expired');

    const code = await this.issueAuthorizationCode({
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

  /**
   * GET /authorize 路由编排
   *
   * 校验授权请求 → 建 session → 已登录且已授权则静默签发 code 重定向，
   * 否则返回 login / consent 提示。
   * @param {object} request - Fastify request
   * @param {object} reply - Fastify reply
   * @param {object} sessionStore - getStore('session') 实例
   */
  async handleAuthorize(request, reply, sessionStore) {
    try {
      const validated = await this.validateAuthorizeRequest(request.query);
      const sessionId = uuidv4();
      await sessionStore.set(sessionId, {
        ...validated,
        query: request.query,
        createdAt: Date.now()
      });

      // 使用 session 验证用户身份（非 Cookie 直接信任）
      const user = request.state?.user;
      const userId = user?.sub;

      if (!userId) {
        return reply.send({
          code: 200,
          message: '需要登录',
          data: {
            action: 'login',
            sessionId,
            client_name: validated.client.client_name,
            scope: validated.scope
          }
        });
      }

      const userData = await UserDao.findById(userId);
      if (!userData) {
        return reply.send({
          code: 200,
          message: '用户不存在，需要重新登录',
          data: {
            action: 'login',
            sessionId,
            client_name: validated.client.client_name,
            scope: validated.scope
          }
        });
      }

      const approval = await ApprovalDao.getEffectiveApproval(userId, validated.client.client_id);
      const hasConsent = approval !== null;

      // 已授权且非强制 consent → 静默跳转
      if (hasConsent && request.query.prompt !== 'consent') {
        return await this.issueCodeAndRedirect(reply, sessionId, userId, sessionStore);
      }

      // 返回 consent 界面
      return reply.send({
        code: 200,
        message: '需要授权确认',
        data: {
          action: 'consent',
          sessionId,
          client_name: validated.client.client_name,
          scope: validated.scope,
          user_id: userId,
          user: {
            username: userData.username,
            name: userData.name || userData.username,
            email: userData.email,
            avatar: userData.avatar
          }
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

  /**
   * POST /authorize/login 路由编排
   *
   * session 内验证用户密码 → 已授权则签发 code 重定向，否则返回 consent 提示。
   */
  async handleAuthorizeLogin(request, reply, sessionStore) {
    const { sessionId, username, password } = request.body;
    const session = await sessionStore.get(sessionId);
    if (!session) {
      return reply.code(400).send({
        code: 400,
        message: '会话无效',
        data: null
      });
    }

    const user = await this.authenticateUser(username, password);
    if (!user) {
      return reply.code(401).send({
        code: 401,
        message: '用户名或密码错误',
        data: {
          action: 'login',
          sessionId,
          client_name: session.client.client_name,
          scope: session.scope
        }
      });
    }

    const approval = await ApprovalDao.getEffectiveApproval(user.id, session.client.client_id);
    if (approval) {
      return await this.issueCodeAndRedirect(reply, sessionId, user.id, sessionStore);
    }

    return reply.send({
      code: 200,
      message: '需要授权确认',
      data: {
        action: 'consent',
        sessionId,
        client_name: session.client.client_name,
        scope: session.scope,
        user_id: user.id
      }
    });
  }

  /**
   * POST /authorize/consent 路由编排
   *
   * 用户 approve/deny → deny 则重定向 access_denied，approve 则存授权记录并签发 code 重定向。
   */
  async handleAuthorizeConsent(request, reply, sessionStore) {
    const { sessionId, user_id, action } = request.body;
    const session = await sessionStore.get(sessionId);
    if (!session) {
      return reply.code(400).send({
        code: 400,
        message: '会话无效',
        data: null
      });
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
    return await this.issueCodeAndRedirect(reply, sessionId, user_id, sessionStore);
  }
}

export { OAuthError, AuthorizationService };
