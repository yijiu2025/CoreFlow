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
import ApprovalDao from '../dao/approval.dao.js';
import { v4 as uuidv4 } from 'uuid';
import { generateAuthorizationCode } from '../crypto/tokens.js';
import config from '../config/config.js';
import { checkScopeSubset, resolveScopeDetails } from '../config/scope-registry.js';
import { isAccountLocked } from '../../../framework/firewall/engine/detectors/brute-force.js';
import { createLogger } from '../../../framework/log/index.js';

const log = createLogger('app.oauth21.services.authorization');

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

    // 5. scope 边界校验：请求 scope 必须 ⊆ client 注册 scope
    const resolvedScope = scope || client.scope;
    const scopeCheck = checkScopeSubset(resolvedScope, client.scope);
    if (!scopeCheck.valid) {
      throw new OAuthError('invalid_scope', `请求了未授权的 scope: ${scopeCheck.exceeded.join(' ')}`);
    }

    return {
      client,
      scope: resolvedScope,
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
   * 发放授权码
   * @param {string} uid - 用户 UUID（即 JWT/OAuth 语义的 sub，全链路 uid 契约）
   */
  async issueAuthorizationCode({ uid, clientId, scope, redirectUri, codeChallenge, codeChallengeMethod, nonce }) {
    const code = generateAuthorizationCode();

    await CodeDao.save(code, {
      sub: uid,
      client_id: clientId,
      scope,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      nonce,
      expiresIn: config.authorizationCode.ttl
    });

    return code;
  }

  /**
   * 发放授权码并重定向回客户端（内部辅助）
   *
   * 从 session 取授权上下文 → 签发 code → 删 session → 302 重定向到 redirect_uri。
   * @param {object} reply - Fastify reply
   * @param {string} sessionId
   * @param {string} uid - 用户 UUID（session.uid，即 code.sub / JWT sub 的来源）
   * @param {object} sessionStore - getStore('session') 实例
   */
  async issueCodeAndRedirect(reply, sessionId, uid, sessionStore) {
    const session = await sessionStore.get(sessionId);
    if (!session) throw new Error('Session expired');

    const code = await this.issueAuthorizationCode({
      uid,
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
    // 【为什么不捕获错误、也不在这里做重定向】
    // `request.query.redirect_uri` 尚未校验，直接跳转等于开放重定向；
    // deny / approve 分支的跳转只走**已校验 session** 里的 redirect_url（由前端执行）。
    // 因此异常一律向上抛，交给全局错误处理返回错误页 ——
    // 这也正是原先那个只写了 `throw err` 的空 try/catch 被移除的原因。
    const validated = await this.validateAuthorizeRequest(request.query);
    const sessionId = uuidv4();

    // 使用 session 验证用户身份（非 Cookie 直接信任）
    // 🔴 request.state.user.sub = 用户 UUID（uid），两条认证路径（JWT/Session）契约一致；
    // session 里存键名 uid（不是 userId）——本仓 userId 既定语义 = 数字主键，别再混用。
    const user = request.state?.user;
    const uid = user?.sub;

    await sessionStore.set(sessionId, {
      ...validated,
      query: request.query,
      // 🔴 已认证用户身份必须绑定进服务端 session：
      // consent 阶段一律以这里为准，绝不信任请求体里的 user_id（否则任意用户可为他人签发授权码）。
      uid: uid || null,
      createdAt: Date.now()
    });

    if (!uid) {
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

    const userData = await UserDao.findById(uid);
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

    const approval = await ApprovalDao.getEffectiveApproval(uid, validated.client.client_id);
    const hasConsent = approval !== null;

    // 已授权且非强制 consent → 静默跳转
    if (hasConsent && request.query.prompt !== 'consent') {
      return await this.issueCodeAndRedirect(reply, sessionId, uid, sessionStore);
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
        scopeDetails: resolveScopeDetails(validated.scope, validated.client.scope_metadata || {}),
        // 对外字段名 user_id 为前端既有契约，值为 uid（UUID）
        user_id: uid,
        user: {
          username: userData.username,
          name: userData.name || userData.username,
          email: userData.email,
          avatar: userData.avatar
        }
      }
    });
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

    // 🔴 账号锁定判定（2026-11-08 修复）：本端点与 `/login` 消费同一套凭证，
    // 失败也会被防火墙的 `observeLoginOutcome` 计入 `brute:user:*` 并在 5 次后写 `lock:*`，
    // 但**这里从不读那个标记** —— 于是攻击者只要改打 `/authorize/login`，
    // 账号维度锁定就完全失效（这是最省事的爆破入口：不需要图形验证码）。
    if (username && (await isAccountLocked(username))) {
      log.warn(`🚫 [Authorize] 账号锁定中，拒绝登录: user=${username}`);
      return reply.code(423).send({
        code: 423,
        message: '该账号因多次登录失败已被临时锁定，请稍后再试',
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

    // 🔴 禁用账号不得登录（与 login.service 的判定保持一致；`Number()` 归一 '0' 字符串）
    if (Number(user.status) === 0) {
      log.warn(`🚫 [Authorize] 账号已禁用，拒绝登录: uid=${user.uid}`);
      return reply.code(403).send({
        code: 403,
        message: '该账号已被禁用，请联系管理员',
        data: null
      });
    }

    // 登录成功后把已认证身份绑定进服务端 session（uid 键名，语义 = 用户 UUID），consent 阶段以此为唯一身份来源
    await sessionStore.set(sessionId, { ...session, uid: user.uid });

    const approval = await ApprovalDao.getEffectiveApproval(user.uid, session.client.client_id);
    if (approval) {
      return await this.issueCodeAndRedirect(reply, sessionId, user.uid, sessionStore);
    }

    return reply.send({
      code: 200,
      message: '需要授权确认',
      data: {
        action: 'consent',
        sessionId,
        client_name: session.client.client_name,
        scope: session.scope,
        user_id: user.uid
      }
    });
  }

  /**
   * POST /authorize/consent 路由编排
   *
   * 用户 approve/deny → deny 则重定向 access_denied，approve 则存授权记录并签发 code 重定向。
   */
  async handleAuthorizeConsent(request, reply, sessionStore) {
    const { sessionId, action } = request.body;
    const session = await sessionStore.get(sessionId);
    if (!session) {
      return reply.code(400).send({
        code: 400,
        message: '会话无效',
        data: null
      });
    }

    // 🔴 身份只认服务端 session 里绑定的 uid，绝不信任请求体中的 user_id
    //（此前直接信任 body.user_id，任何登录用户可为任意用户签发授权码 = 账号接管）。
    const uid = session.uid;
    if (!uid) {
      return reply.code(401).send({
        code: 401,
        message: '授权会话未绑定用户，请先登录',
        data: { action: 'login', sessionId }
      });
    }

    if (action === 'deny') {
      const sep = session.query.redirect_uri.includes('?') ? '&' : '?';
      const denyUrl = `${session.query.redirect_uri}${sep}error=access_denied&error_description=User denied the request`;
      await sessionStore.delete(sessionId);
      // 前端 XHR 无法跨域跟随 302 到三方 redirect_uri，返回 redirect_url 由前端跳转
      return reply.send({ code: 200, message: '已拒绝授权', data: { redirect_url: denyUrl } });
    }

    await ApprovalDao.saveApproval({
      uid,
      appId: session.client.client_id,
      scopes: session.scope.split(' ')
    });

    // 签发 code，返回 redirect_url（前端 window.location.href 跳转，绕过 XHR 跨域限制）
    const code = await this.issueAuthorizationCode({
      uid,
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
    return reply.send({ code: 200, message: '授权成功', data: { redirect_url: redirectUrl } });
  }
}

export { OAuthError, AuthorizationService };
