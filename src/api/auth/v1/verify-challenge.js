/**
 * 风险验证 API
 *
 * POST /auth/v1/verify-challenge — 完成人机验证，确认 verify token
 *   header: x-verify-token: <风险响应里返回的 verifyToken>
 *   body:   { captchaKey?: string }  可选叠加图形验证码（更严格场景）
 *
 * 验证通过后写 Redis 已验证标记（30 分钟免验），前端可重发原被拦请求。
 *
 * @author yijiu2025
 * @since 2026-08-23
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { confirmVerifyToken } from '../../../framework/auth/anomaly-detector.js';
import { updateSessionBaseline } from '../../../framework/auth/session.js';
import { getDeviceId, computeDeviceFingerprint } from '../../../framework/auth/device.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'authVerify',
    alias: '风险验证',
    description: '设备指纹变更后的人机验证',
    prefix: '/v1',
    enabled: true,
    requireLogin: false // 验证端点不强制登录（但需 verify token）
  });

  registerSecureRoute(fastify, {
    name: 'verifyChallenge',
    alias: '完成风险验证',
    method: 'POST',
    url: '/verify-challenge',
    requireLogin: true, // 需登录态（verify token 绑定 userId）
    config: {
      rateLimit: { max: 10, timeWindow: '1 minute' }
    },
    handler: async (request, reply) => {
      const verifyToken = request.headers['x-verify-token'];
      if (!verifyToken) {
        return reply.result.fail('缺少 x-verify-token 头', null, 400);
      }

      const ok = await confirmVerifyToken(String(verifyToken));
      if (!ok) {
        return reply.result.fail('验证令牌无效或已过期，请重新触发验证', null, 400);
      }

      // 验证通过后：把当前请求的新环境（device_id/IP/UA/指纹）更新成基准
      // 这样后续请求不再报"指纹变了"，Redis session + DB session_tokens 同步更新
      const user = request.state?.user;
      const sessionId = user?.sessionId;
      if (sessionId) {
        try {
          const deviceId = await getDeviceId(request);
          const fingerprint = computeDeviceFingerprint({
            deviceId,
            userAgent: request.headers['user-agent'] || '',
            uid: user.uid
          });
          await updateSessionBaseline(sessionId, {
            deviceId,
            deviceFingerprint: fingerprint,
            ip: request.ip,
            userAgent: request.headers['user-agent'] || ''
          });
        } catch (err) {
          // 基准更新失败不影响验证通过本身（已写免验标记 30 分钟）
          console.warn('[verify-challenge] 更新基准失败:', err.message);
        }
      }

      return reply.result.success('验证通过，30 分钟内免验', { verified: true });
    }
  });
}
