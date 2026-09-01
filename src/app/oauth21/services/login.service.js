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
import { DEFAULT_SCOPE } from '../config/constants.js';
import ApprovalDao from '../dao/approval.dao.js';
import UserDao from '../dao/user.dao.js';
import ClientDao from '../dao/client.dao.js';
import { logLogin } from '../../../framework/auth/audit-logger.js';
import { detectLoginAnomaly, DETECT_RESULT } from '../../../framework/auth/anomaly-detector.js';
import { logLoginFailure } from '../../../framework/auth/session.js';
import { getStore } from '../../../framework/redis/index.js';
import captchaService from '../../../framework/verify/captcha/service.js';
import { clientContext } from '../../../framework/verify/context.js';
import { emailDao } from '../../../framework/verify/email/index.js';
import { AuthorizationService } from './authorization.service.js';
import deactivationService from '../../user/services/deactivation.service.js';
import { checkScopeSubset, resolveScopeDetails } from '../config/scope-registry.js';
import { detectLoginEnvironmentAnomaly } from '../../../framework/auth/anomaly-detector.js';
import { detectPlatform, computeDeviceFingerprint, getDeviceIdAndWrapResponse } from '../../../framework/auth/device.js';

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
 * 邮箱打码：2270105975@qq.com → 227*****75@qq.com
 * 本地/短名打码失败时返回星号占位
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') return '***';
  const atIndex = email.indexOf('@');
  if (atIndex < 3) return '***' + email.slice(atIndex);
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  if (local.length <= 2) return '*'.repeat(local.length) + domain;
  // 保留前 3 + 后 2，中间用 5 个星
  const head = local.slice(0, 3);
  const tail = local.slice(-2);
  return `${head}*****${tail}${domain}`;
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
  // - 密码登录：必须传 captchaKey 且对应图形码已 verify，校验通过后删除（一次性，防重放）
  //   未传 captchaKey 直接拒绝（防绕过图形验证暴力登录）
  // - 邮箱码登录：图形码已在 verify-captcha 发邮箱码时消费，此处只校验邮箱码（阶段 2）
  // 复用 captchaService.consume（校验 verified + 一次性删除），与 verifyAndSendEmail 发码消费同逻辑
  const { captchaKey } = request.body;
  if (type !== 'email') {
    if (!captchaKey) {
      return reply.code(400).send({ code: 400, message: '请先完成图形验证', data: null });
    }
    const captchaStore = getStore('captcha');
    // consume 时校验指纹：必须与 generate 时同一客户端（防 tag 盗用绕过）
    const consumed = await captchaService.consume(captchaKey, captchaStore, clientContext(request));
    if (!consumed) {
      return reply.code(400).send({ code: 400, message: '图形验证码错误或已过期，请重新验证', data: null });
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

  // 2.5 密码登录环境异常检测（密码验证通过后、签发令牌前）
  // 比对本次 device_id/IP/UA 与用户最近 session_token 基准：
  // - warn（指纹变，换设备/UA）→ 返回 needs_email_verify，前端弹邮箱码二次验证
  // - info（IP 变梯子 / 无基准）→ 不拦，继续登录
  // - safe → 继续
  // 仅密码登录做（邮箱码登录已验证邮箱所有权，无需二次验证）
  console.log(
    '[directLogin] 环境检测入口: type=%s, numericId=%s, FORCE=%s',
    type,
    user.numericId,
    process.env.LOGIN_EMAIL_VERIFY_FORCE
  );
  if (type !== 'email' && user.numericId) {
    try {
      const deviceId = await getDeviceIdAndWrapResponse(request, reply);
      const platformHint = detectPlatform(request);
      const userAgent = request.headers['user-agent'] || '';
      const envCheck = await detectLoginEnvironmentAnomaly({
        userId: user.numericId,
        uid: user.uid,
        deviceId,
        userAgent,
        ip: request.ip,
        platformHint
      });
      console.log('[directLogin] 环境检测结果: %s, reason=%s', envCheck.status, envCheck.reason);

      if (envCheck.status === 'warn') {
        // 签发临时二次验证令牌存 Redis（5 分钟），前端带它调 /login/verify-email
        const verifyToken = uuidv4();
        const verifyStore = getStore('login_email_verify');
        await verifyStore.set(
          verifyToken,
          {
            userId: user.numericId,
            uid: user.uid,
            email: user.email,
            clientId: client_id,
            scope: scope || '',
            oidcNonce: oidcNonce || null,
            keepLogin: keepLogin === true,
            // 记录本次环境，二次验证通过后用此环境作为新基准
            deviceId,
            userAgent,
            ip: request.ip,
            platformHint,
            fingerprint: computeDeviceFingerprint({ deviceId, userAgent, uid: user.uid, platformHint })
          },
          300
        );

        // 直接发一次邮箱码（二次验证不需图形码，用户已过登录图形码）
        try {
          const emailCodeStore = getStore('email_code');
          await emailDao.sendCode(user.email, verifyToken, emailCodeStore, {
            ip: request.ip,
            ua: request.headers['user-agent'] || ''
          });
          console.log('[directLogin] 二次验证邮箱码已发送:', user.email);
        } catch (sendErr) {
          console.error('[directLogin] 二次验证邮箱码发送失败:', sendErr.message);
          // 发码失败不阻断，前端可点重发
        }

        return reply.send({
          code: 200,
          message: '检测到登录环境变更，需邮箱二次验证',
          data: {
            action: 'needs_email_verify',
            verifyToken,
            email: maskEmail(user.email),
            reason: envCheck.reason
          }
        });
      }
    } catch (err) {
      console.error('[directLogin] 环境检测异常:', err.message, err.stack);
      // 检测异常不阻断登录，继续走签发流程（降级放行）
    }
  }

  // 3. 检查客户端与授权状态
  // client_id 必传：所有 app（一方/三方）都在 oauth_clients 表注册，有真实 client_id
  if (!client_id) {
    return reply.code(400).send({
      code: 400,
      message: 'client_id 不能为空',
      data: null
    });
  }
  const client = await ClientDao.findById(client_id);
  if (!client) {
    return reply.code(400).send({
      code: 400,
      message: '无效的客户端 ID',
      data: null
    });
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
  // 一方应用（client_secret=null，公共客户端）跳过 consent 直签发；
  // 三方应用（有 client_secret）首次需 consent 确认
  if (client.client_secret) {
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
    const result = await issueDirectTokens(user, client, scopeString, oidcNonce, request, reply, fastify, {
      rememberMe: keepLogin === true
    });

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

/**
 * 邮箱二次验证登录（环境异常后二次确认）
 *
 * 流程：directLogin 环境异常 → 返回 verifyToken（Redis 存用户信息+本次环境）
 * → 前端发邮箱码 → 用户输码 + verifyToken → 本接口校验邮箱码 → 签发令牌
 * 验证通过后用本次环境作为新基准（createSession 会写 session_tokens）
 *
 * @param {object} request
 * @param {object} reply
 * @param {object} fastify
 */
export async function verifyEmailLogin(request, reply, fastify) {
  const { verifyToken, code } = request.body;

  if (!verifyToken || !code) {
    return reply.code(400).send({ code: 400, message: 'verifyToken 和验证码不能为空', data: null });
  }

  const verifyStore = getStore('login_email_verify');
  const data = await verifyStore.get(verifyToken);
  if (!data) {
    return reply.code(400).send({ code: 400, message: '验证令牌已过期，请重新登录', data: null });
  }

  // 校验邮箱码（绑客户端指纹一致性，复用 verifyEmailCode）
  const emailVerify = await verifyEmailCode(data.email, code, request);
  if (!emailVerify.success) {
    return reply.code(400).send({ code: 400, message: emailVerify.error, data: null });
  }

  // 验证通过，删除临时令牌（一次性）
  await verifyStore.delete(verifyToken);

  // 查回用户
  const user = await UserDao.findByEmail(data.email);
  if (!user) {
    return reply.code(404).send({ code: 404, message: '用户不存在', data: null });
  }

  // 注销中拦截复用（二次验证也可能在注销期，保持一致）
  const blocked = await deactivationService.checkLoginBlocked(user.numericId, data.clientId);
  if (blocked) {
    return reply.code(403).send({
      code: 403,
      message: '账号正在注销中，请先撤销注销申请',
      data: { action: 'deactivation_pending', ...blocked }
    });
  }

  // 签发令牌（环境已验证通过，createSession 会用本次 device/fingerprint 写新基准）
  // 查真实 client 传入（所有 app 都在 oauth_clients 表注册）
  const resolvedClient = await ClientDao.findById(data.clientId);
  if (!resolvedClient) {
    return reply.code(400).send({ code: 400, message: '客户端不存在', data: null });
  }
  const result = await issueDirectTokens(user, resolvedClient, data.scope, data.oidcNonce, request, reply, fastify, {
    rememberMe: data.keepLogin === true
  });

  return reply.send({ code: 200, message: '登录成功', data: result });
}
