/**
 * 登录模块
 *
 * POST /login              — 标准直接登录
 * POST /mini-login         — 快捷登录（允许 iframe 嵌入）
 * POST /login/consent/confirm — 快捷登录确认授权
 */

import { v4 as uuidv4 } from 'uuid';
import { registerSecureRoute } from '../../../guard.js';
import { decryptLoginRequest, verifyEmailCode } from '../shared/decrypt.js';
import { issueDirectTokens } from '../shared/token-issuer.js';
import { buildTokenResponse } from '../shared/cookies.js';
import { FIRST_PARTY_APP, DEFAULT_SCOPE } from '../shared/constants.js';
import ApprovalDao from '../../../../app/oauth21/dao/approval.dao.js';
import UserDao from '../../../../app/oauth21/dao/user.dao.js';
import ClientDao from '../../../../app/oauth21/dao/client.dao.js';
import { getSessionStore } from '../../../../redis/session-store.js';
import { logLoginFailure } from '../../../../auth/session.js';
import { AuthorizationService } from '../../../../app/oauth21/services/authorization.service.js';

const authService = new AuthorizationService();

/**
 * 统一直接登录处理逻辑
 */
async function handleDirectLogin(request, reply, fastify) {
  const { client_id, scope } = request.body;
  const oidcNonce = request.body.oidcNonce;

  // 1. 解密与验证（RSA + 时间戳 + Nonce + 验证码）
  const decryptResult = await decryptLoginRequest(request, fastify);
  if (!decryptResult.success) {
    return reply.code(decryptResult.statusCode || 400).send({
      code: decryptResult.statusCode || 400,
      message: decryptResult.error,
      data: null
    });
  }

  const { username, password, type, email, code } = decryptResult.data;

  // 2. 验证用户
  let user;

  if (type === 'email') {
    const emailVerify = await verifyEmailCode(email, code, fastify);
    if (!emailVerify.success) {
      return reply.code(400).send({
        code: 400,
        message: emailVerify.error,
        data: null
      });
    }

    user = await UserDao.findByEmail(email);
    if (!user) {
      await logLoginFailure({
        email,
        appId: 'oauth21',
        ip: request.ip,
        userAgent: request.headers['user-agent'] || '',
        reason: '邮箱未注册'
      });
      return reply.code(404).send({
        code: 404,
        message: '该邮箱尚未注册账户',
        data: null
      });
    }
  } else {
    if (!username || !password) {
      return reply.code(400).send({
        code: 400,
        message: '用户名和密码不能为空',
        data: null
      });
    }

    user = await authService.authenticateUser(username, password);
    if (!user) {
      await logLoginFailure({
        email: username,
        appId: 'oauth21',
        ip: request.ip,
        userAgent: request.headers['user-agent'] || '',
        reason: '密码错误'
      });
      return reply.code(401).send({
        code: 401,
        message: '账号或密码错误',
        data: null
      });
    }
  }

  // 3. 检查客户端与授权状态
  const finalClientId = client_id || FIRST_PARTY_APP.client_id;
  let client;
  if (finalClientId === FIRST_PARTY_APP.client_id) {
    client = { ...FIRST_PARTY_APP };
  } else {
    client = await ClientDao.findById(finalClientId);
    if (!client) {
      return reply.code(400).send({
        code: 400,
        message: '无效的客户端 ID',
        data: null
      });
    }
  }

  const finalScopes = (scope || client.scope || DEFAULT_SCOPE).split(' ');
  const scopeString = finalScopes.join(' ');

  // 4. 检查用户是否已授权该应用
  if (client.client_id !== FIRST_PARTY_APP.client_id) {
    const approval = await ApprovalDao.getEffectiveApproval(user.id, client.client_id);
    if (!approval) {
      const consentKey = uuidv4();
      const consentStore = getSessionStore(fastify, 'consent_session');
      await consentStore.set(consentKey, {
        userId: user.id,
        clientId: client.client_id,
        scopes: finalScopes,
        scopeStr: scopeString,
        oidcNonce
      }, 300);

      return reply.send({
        code: 200,
        message: '需要授权确认',
        data: {
          action: 'consent',
          consentKey,
          client_id: client.client_id,
          client_name: client.client_name,
          scope: scopeString,
          user: {
            username: user.username,
            name: user.name || user.username,
            email: user.email
          }
        }
      });
    }
  }

  // 5. 签发令牌
  try {
    const result = await issueDirectTokens(
      user,
      client.client_id === FIRST_PARTY_APP.client_id ? null : client.client_id,
      scopeString,
      oidcNonce,
      request,
      reply,
      fastify
    );
    return buildTokenResponse(result);
  } catch (err) {
    if (err.message === 'invalid_client') {
      return reply.code(401).send({
        code: 401,
        message: '客户端认证失败',
        data: null
      });
    }
    throw err;
  }
}

/**
 * 注册登录路由
 */
export default function registerLoginRoutes(fastify) {
  // POST /login — 标准直接登录
  registerSecureRoute(fastify, {
    name: 'login',
    alias: '标准登录',
    method: 'POST',
    url: '/login',
    handler: (request, reply) => handleDirectLogin(request, reply, fastify)
  });

  // POST /mini-login — 快捷登录 (允许 iframe 嵌入)
  registerSecureRoute(fastify, {
    name: 'miniLogin',
    alias: '快捷登录',
    method: 'POST',
    url: '/mini-login',
    handler: (request, reply) => handleDirectLogin(request, reply, fastify)
  });

  // POST /login/consent/confirm — 快捷登录确认授权
  registerSecureRoute(fastify, {
    name: 'confirmDirectConsent',
    alias: '统一直接登录确认授权',
    method: 'POST',
    url: '/login/consent/confirm',
    handler: async (request, reply) => {
      const { consentKey } = request.body;
      if (!consentKey) {
        return reply.code(400).send({
          code: 400,
          message: 'consentKey 不能为空',
          data: null
        });
      }

      const consentStore = getSessionStore(fastify, 'consent_session');
      const session = await consentStore.get(consentKey);
      if (!session) {
        return reply.code(400).send({
          code: 400,
          message: '授权会话已过期，请重新登录',
          data: null
        });
      }

      const user = await UserDao.findById(session.userId);
      if (!user) {
        return reply.code(404).send({
          code: 404,
          message: '用户不存在',
          data: null
        });
      }

      await ApprovalDao.saveApproval({
        uid: user.id,
        appId: session.clientId,
        scopes: session.scopes
      });

      await consentStore.delete(consentKey);

      try {
        request.body.client_id = session.clientId;
        const result = await issueDirectTokens(
          user,
          session.clientId,
          session.scopeStr,
          session.oidcNonce,
          request,
          reply,
          fastify
        );
        return buildTokenResponse(result, '授权确认成功');
      } catch (err) {
        if (err.message === 'invalid_client') {
          return reply.code(401).send({
            code: 401,
            message: '客户端认证失败',
            data: null
          });
        }
        throw err;
      }
    }
  });
}
