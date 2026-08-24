/**
 * 登录业务服务
 *
 * 从 api/oauth21/v1/auth/login.js 下沉：统一直接登录 + 授权确认的业务编排。
 * 路由层只调本服务 + reply。
 *
 * 职责：解密/异常检测/用户验证/客户端检查/授权确认/令牌签发/审计。
 *
 * @author yijiu
 * @since 2026-08-16
 */
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { decryptLoginRequest, verifyEmailCode } from './decrypt.service.js';
import { issueDirectTokens } from './token-issuer.service.js';
import { buildTokenResponse } from './cookies.service.js';
import { FIRST_PARTY_APP, DEFAULT_SCOPE } from '../config/constants.js';
import ApprovalDao from '../dao/approval.dao.js';
import UserDao from '../dao/user.dao.js';
import ClientDao from '../dao/client.dao.js';
import { logLogin } from '../../../framework/auth/audit-logger.js';
import { detectLoginAnomaly, DETECT_RESULT } from '../../../framework/auth/anomaly-detector.js';
import { logLoginFailure } from '../../../framework/auth/session.js';
import { getStore } from '../../../framework/redis/index.js';
import captchaService from '../../../framework/verify/captcha/service.js';
import { AuthorizationService } from './authorization.service.js';
import deactivationService from '../../user/services/deactivation.service.js';
import { checkScopeSubset, resolveScopeDetails } from '../config/scope-registry.js';

const authService = new AuthorizationService();

/**
 * 客户端指纹（IP + UA hash，启用设备指纹时合并 canvas/WebGL）
 * consentKey 绑定此指纹：发起授权确认的客户端必须与换令牌的客户端一致，
 * 防 consentKey 泄露后被另一客户端冒用绕过二次确认。
 */
function clientFingerprint(request) {
  const ip = request?.ip || '';
  const ua = request?.headers?.['user-agent'] || '';
  let material = `${ip}|${ua}`;
  // 设备指纹启用时合并（config.device.enabled），抵制代理池换 IP+UA 绕过
  const deviceFp = request?.headers?.['x-device-fp'];
  if (process.env.DEVICE_FINGERPRINT_ENABLED === 'true' && deviceFp) {
    material += `|${deviceFp}`;
  }
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 32);
}

/**
 * 统一直接登录
 *
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 * @param {object} fastify - Fastify 实例（H5 token 等用）
 * @returns {Promise<object>} reply 结果
 */
export async function directLogin(request, reply, fastify) {
  const { client_id, scope } = request.body;
  const oidcNonce = request.body.oidcNonce;

  // 1. 解密与验证（RSA + 时间戳 + Nonce）
  const decryptResult = await decryptLoginRequest(request);
  if (!decryptResult.success) {
    return reply.code(decryptResult.statusCode || 400).send({
      code: decryptResult.statusCode || 400,
      message: decryptResult.error,
      data: null
    });
  }

  const { username, password, type, email, code, keepLogin } = decryptResult.data;

  // 1.2 图形验证码校验（按 type 分支）
  // - 密码登录：captchaKey 对应图形码必须已 verify，校验通过后删除（一次性，防重放）
  // - 邮箱码登录：图形码已在 verify-captcha 发邮箱码时消费，此处只校验邮箱码（阶段 2）
  // 复用 captchaService.consume（校验 verified + 一次性删除），与 verifyAndSendEmail 发码消费同逻辑
  const { captchaKey } = request.body;
  if (type !== 'email' && captchaKey) {
    const captchaStore = getStore('captcha');
    const consumed = await captchaService.consume(captchaKey, captchaStore);
    if (!consumed) {
      return reply.code(400).send({ code: 400, message: '请先完成图形验证', data: null });
    }
  }

  // 1.5. 异常登录检测（暴力破解锁定）
  const loginEmail = email || username;
  if (loginEmail) {
    const anomaly = await detectLoginAnomaly({
      email: loginEmail,
      ip: request.ip,
      userAgent: request.headers['user-agent'] || '',
      redis: request.server.redis
    });
    if (anomaly.status === DETECT_RESULT.BLOCK) {
      await logLogin(request.server.redis, {
        userId: null,
        ip: request.ip,
        userAgent: request.headers['user-agent'] || '',
        appId: 'oauth21',
        success: false,
        reason: anomaly.reason
      });
      return reply.code(429).send({
        code: 429,
        message: anomaly.reason,
        data: null
      });
    }
  }

  // 2. 验证用户
  let user;

  if (type === 'email') {
    const emailVerify = await verifyEmailCode(email, code, request);
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

  // 3.5 注销申请拦截：用户若提交了注销申请（scope=all 拦截所有 app，scope=app 仅拦截该 app），
  //     不直接登录，返回 deactivation_pending 状态，前端弹"是否撤销"。
  //     用户确认撤销 → 带 confirmRevoke: true 重新提交登录 → 此处先撤销再继续登录流程。
  //     不撤销则前端不重发，登录被拒。撤销也可走 POST /user/v1/deactivation/revoke（已登录态）。
  const pendingDeactivation = await deactivationService.checkLoginBlocked(user.numericId || user.id, client.client_id);
  if (pendingDeactivation) {
    // 用户在登录弹窗点了"撤销"：直接撤销该申请，继续走登录流程
    if (request.body?.confirmRevoke) {
      await deactivationService.forceRevokeForLogin(pendingDeactivation.id, user.numericId || user.id);
      // 撤销后继续向下签发令牌（不 return）
    } else {
      return reply.code(403).send({
        code: 403,
        message:
          pendingDeactivation.scope === 'all'
            ? '您已提交全部数据注销申请，是否撤销？'
            : `您已提交应用 ${client.client_id} 的注销申请，是否撤销？`,
        data: {
          action: 'deactivation_pending',
          deactivationId: pendingDeactivation.id,
          scope: pendingDeactivation.scope,
          app_id: pendingDeactivation.app_id,
          scheduled_at: pendingDeactivation.scheduled_at
        }
      });
    }
  }

  const finalScopes = (scope || client.scope || DEFAULT_SCOPE).split(' ');
  const scopeString = finalScopes.join(' ');

  // scope 边界校验：请求 scope 必须 ⊆ client 注册 scope，防越权请求
  const scopeCheck = checkScopeSubset(scopeString, client.scope);
  if (!scopeCheck.valid) {
    return reply.code(400).send({
      code: 400,
      message: `invalid_scope: 请求了未授权的 scope: ${scopeCheck.exceeded.join(' ')}`,
      data: null
    });
  }

  // scope 详情（带描述，供前端授权页渲染"人话"而非裸字符串）
  const scopeDetails = resolveScopeDetails(scopeString, client.scope_metadata || {});

  // 4. 检查用户是否已授权该应用
  if (client.client_id !== FIRST_PARTY_APP.client_id) {
    const approval = await ApprovalDao.getEffectiveApproval(user.id, client.client_id);
    if (!approval) {
      const consentKey = uuidv4();
      const consentStore = getStore('consent_session');
      // 绑定客户端指纹：confirmDirectConsent 时校验同一客户端，防 consentKey 泄露被冒用
      await consentStore.set(
        consentKey,
        {
          userId: user.id,
          clientId: client.client_id,
          scopes: finalScopes,
          scopeStr: scopeString,
          oidcNonce,
          fingerprint: clientFingerprint(request)
        },
        300
      );

      return reply.send({
        code: 200,
        message: '需要授权确认',
        data: {
          action: 'consent',
          consentKey,
          client_id: client.client_id,
          client_name: client.client_name,
          scope: scopeString,
          scopeDetails,
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
      fastify,
      { rememberMe: keepLogin === true }
    );

    // 审计日志：登录成功
    await logLogin(request.server.redis, {
      userId: user.numericId || user.id,
      ip: request.ip,
      userAgent: request.headers['user-agent'] || '',
      appId: client.client_id,
      success: true
    });

    return buildTokenResponse(result);
  } catch (err) {
    // 审计日志：登录失败
    await logLogin(request.server.redis, {
      userId: user.numericId || user.id,
      ip: request.ip,
      userAgent: request.headers['user-agent'] || '',
      appId: client.client_id,
      success: false,
      reason: err.message
    });

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
 * 快捷登录确认授权（consentKey 换令牌）
 */
export async function confirmDirectConsent(request, reply, fastify) {
  const { consentKey } = request.body;
  if (!consentKey) {
    return reply.code(400).send({
      code: 400,
      message: 'consentKey 不能为空',
      data: null
    });
  }

  const consentStore = getStore('consent_session');
  const session = await consentStore.get(consentKey);
  if (!session) {
    return reply.code(400).send({
      code: 400,
      message: '授权会话已过期，请重新登录',
      data: null
    });
  }

  // 客户端指纹一致性校验：发起授权确认的客户端必须与换令牌的客户端一致
  // 防 consentKey 泄露后被另一客户端冒用绕过二次确认
  if (session.fingerprint && session.fingerprint !== clientFingerprint(request)) {
    // 指纹不符：疑似冒用，静默拒绝（不暴露具体原因）
    await consentStore.delete(consentKey);
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
