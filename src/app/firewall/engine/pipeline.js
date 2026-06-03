/**
 * 请求安全处理管道
 * 将 onRequest 钩子中的安全检查逻辑拆分为独立步骤，提高可读性
 */
import { safeRedis } from '../../../redis/safe-redis.js';
import { buildChallengePage } from '../data/challenge-template.js';
import {
  checkRateLimit,
  trackConnection,
  checkGeoReputation,
  checkBotChallenge,
  trackRequestCount,
  resolveGeoInfo,
  checkGlobalBlock
} from './index.js';
import { generateFingerprint } from '../util/fingerprint.js';
import { pushRecord } from '../data/store.js';
import { getSecuritySettings } from '../dao/dao.js';

// ============== 跳过规则 ==============

/** 静态资源和挑战验证接口不经过检测管道 */
const SKIP_PATTERN = /\.(js|css|png|jpg|ico|svg|woff2?)$/i;

/**
 * 判断请求是否应跳过深度检测
 * @param {string} url 请求路径
 * @returns {boolean} true 表示跳过
 */
export function shouldSkipDeepCheck(url) {
  return url === '/api/firewall/v1/challenge/verify' || SKIP_PATTERN.test(url);
}

// ============== 请求上下文构建 ==============

/**
 * 构建防火墙日志上下文
 * 在请求进入时调用，生成 fingerprint 和基础日志字段
 *
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @returns {object} 包含 ip、fingerprint、geoInfo 的上下文
 */
export function buildRequestContext(request) {
  const ip = request.ip;
  const ua = request.headers['user-agent'] || '';
  const fingerprint = generateFingerprint(request);
  request._fingerprint = fingerprint;

  const geoInfo = resolveGeoInfo(ip);
  request._firewallLog = {
    time: new Date().toISOString(),
    ip,
    fingerprint,
    method: request.method,
    url: request.url,
    userAgent: ua,
    blocked: false,
    ...geoInfo
  };

  return { ip, ua, fingerprint, geoInfo };
}

// ============== 第一阶段：全局封禁检查 ==============

/**
 * 全局封禁检查（连接数 + 黑名单）
 * 请求进入时最先执行，被封禁的请求直接拒绝，不进入后续检测
 *
 * @param {object|null} redis Redis 客户端
 * @param {string} ip 客户端 IP
 * @param {string} fingerprint 设备指纹
 * @param {object} firewallLog 日志对象引用
 * @param {import('fastify').FastifyReply} reply 响应对象
 * @returns {Promise<boolean>} true 表示被封禁（已响应），false 表示放行
 */
export async function checkGlobalBlockPhase(
  redis,
  ip,
  fingerprint,
  firewallLog,
  reply
) {
  try {
    trackConnection(ip, 1);
    await checkGlobalBlock(redis, ip, fingerprint);
    return false; // 放行
  } catch (err) {
    firewallLog.blocked = true;
    firewallLog.statusCode = err.statusCode || 429;
    pushRecord({ ...firewallLog });
    reply.code(err.statusCode || 429).send({
      error: 'Security Policy Blocked',
      message: err.message
    });
    return true; // 已封禁
  }
}

// ============== 第二阶段：挑战 Cookie 验证 ==============

/**
 * 检查请求是否携带有效的挑战验证 Cookie
 * 同时检查绑定到指纹和 IP 的 token，任一通过即放行
 *
 * @param {object|null} redis Redis 客户端
 * @param {import('fastify').FastifyRequest} request 请求对象
 * @param {string} ip 客户端 IP
 * @param {string} fingerprint 设备指纹
 * @returns {Promise<boolean>} true 表示已通过挑战验证，false 表示需要继续检测
 */
export async function checkChallengeCookie(redis, request, ip, fingerprint) {
  const clientToken = request.cookies?.fw_verified;
  if (!clientToken) return false;

  const [fpPassed, ipPassed] = await Promise.all([
    safeRedis(redis, (r) =>
      r.exists(`fw:pass:fp:${fingerprint}:${clientToken}`)
    ),
    safeRedis(redis, (r) => r.exists(`fw:pass:${ip}:${clientToken}`))
  ]);

  return !!(fpPassed || ipPassed);
}

// ============== 第三阶段：深度检测管道 ==============

/**
 * 深度检测管道
 * 执行 Bot 检测、地理信誉检查、端点限频等。
 * 触发挑战或封禁时直接响应请求。
 *
 * @param {object|null} redis Redis 客户端
 * @param {string} ip 客户端 IP
 * @param {string} ua User-Agent
 * @param {string} url 请求路径
 * @param {object} firewallLog 日志对象引用
 * @param {string} fingerprint 设备指纹
 * @param {import('fastify').FastifyReply} reply 响应对象
 * @returns {Promise<boolean>} true 表示被拦截（已响应），false 表示放行
 */
export async function runDetectionPipeline(
  redis,
  ip,
  ua,
  url,
  firewallLog,
  fingerprint,
  reply
) {
  try {
    // Bot 检测：基于 UA 模式 + 请求频率
    const requestCount = trackRequestCount(ip);
    const isBot = await checkBotChallenge(redis, ip, ua, requestCount);

    if (isBot) {
      const err = new Error('CHALLENGE');
      err.isChallenge = true;
      throw err;
    }

    // 地理信誉：IDC 限频、境外敏感路径拦截
    await safeRedis(redis, (r) => checkGeoReputation(r, ip, url));

    // 端点级限频（从配置读取规则）
    const settings = getSecuritySettings();
    const endpointRules = settings.defense?.endpointRateLimits || [];

    for (const rule of endpointRules) {
      if (url.includes(rule.path)) {
        await checkRateLimit(redis, `${rule.path}:${ip}`, {
          limit: rule.limit,
          window: rule.window,
          blockTime: rule.blockTime
        });
        break;
      }
    }

    return false; // 放行
  } catch (err) {
    const isChallenge = err.isChallenge || err.message?.includes('CHALLENGE');
    firewallLog.blocked = true;
    firewallLog.statusCode = isChallenge ? 200 : err.statusCode || 429;
    pushRecord({ ...firewallLog });

    // 挑战请求返回 HTML 验证页
    if (isChallenge) {
      reply.type('text/html').send(buildChallengePage(ip, fingerprint));
      return true;
    }

    // 封禁请求返回 JSON 错误
    if (err.headers) reply.headers(err.headers);
    reply.code(err.statusCode || 429).send({
      error: 'Security Policy Blocked',
      message: err.message
    });
    return true; // 已拦截
  }
}

// ============== 日志记录 ==============

/**
 * 记录请求日志到流量统计
 * 在响应发送前调用，将 firewallLog 推入环形缓冲区
 *
 * @param {object} firewallLog 日志对象
 * @param {number} statusCode HTTP 状态码
 * @param {boolean} [alreadyLogged=false] 是否已记录（防止重复）
 */
export function recordLog(firewallLog, statusCode, alreadyLogged = false) {
  if (firewallLog && !alreadyLogged) {
    pushRecord({ ...firewallLog, statusCode });
  }
}
