/**
 * 授权模块
 *
 * GET  /authorize         — 授权请求入口
 * POST /authorize/login   — 用户登录验证
 * POST /authorize/consent — 用户授权确认
 */

import { v4 as uuidv4 } from 'uuid';
import { registerSecureRoute } from '../../../guard.js';
import {
  AuthorizationService,
  OAuthError
} from '../../../../app/oauth21/services/authorization.service.js';
import ApprovalDao from '../../../../app/oauth21/dao/approval.dao.js';
import UserDao from '../../../../app/oauth21/dao/user.dao.js';

const authService = new AuthorizationService();

/**
 * 发放授权码并重定向
 */
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

/**
 * 注册授权路由
 */
export default function registerAuthorizeRoutes(fastify, sessionStore) {
  // GET /authorize — 授权请求入口
  registerSecureRoute(fastify, {
    name: 'authorize',
    alias: '授权请求入口',
    method: 'GET',
    url: '/authorize',
    handler: async (request, reply) => {
      try {
        const validated = await authService.validateAuthorizeRequest(request.query);
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
          return await issueCodeAndRedirect(reply, sessionId, userId, sessionStore);
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
          return reply.redirect(
            `${request.query.redirect_uri}${sep}${err.toRedirectParams()}`
          );
        }
        throw err;
      }
    }
  });

  // POST /authorize/login — 用户登录验证
  registerSecureRoute(fastify, {
    name: 'authorizeLogin',
    alias: '授权登录验证',
    method: 'POST',
    url: '/authorize/login',
    handler: async (request, reply) => {
      const { sessionId, username, password } = request.body;
      const session = await sessionStore.get(sessionId);
      if (!session) {
        return reply.code(400).send({
          code: 400,
          message: '会话无效',
          data: null
        });
      }

      const user = await authService.authenticateUser(username, password);
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
        return await issueCodeAndRedirect(reply, sessionId, user.id, sessionStore);
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
  });

  // POST /authorize/consent — 用户授权确认
  registerSecureRoute(fastify, {
    name: 'authorizeConsent',
    alias: '授权确认',
    method: 'POST',
    url: '/authorize/consent',
    handler: async (request, reply) => {
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
      return await issueCodeAndRedirect(reply, sessionId, user_id, sessionStore);
    }
  });
}
