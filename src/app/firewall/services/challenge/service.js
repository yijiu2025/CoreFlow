/**
 * 人机挑战验证服务
 *
 * 从 api/firewall/v1/challenge.js 下沉：签发挑战 + 校验结果 + 签发通过令牌。
 *
 * ── 这一层只做**策略编排** ──
 *
 *   1. 什么时候能要票（只有处于挑战态才签发）
 *   2. 通过后免检多久（匿名 120s / 登录 1800s）
 *   3. 令牌怎么签（HttpOnly Cookie + 访问层三绑定）
 *   4. 观测与信誉（issued / verified / failed，以及递进难度的"顺利通过"计数）
 *
 * 「怎么出题 / 怎么判题」交给 provider（`./providers/`）：
 * `pow` 自包含（服务端存载荷），`turnstile` / `hcaptcha` / `google` 走
 * `framework/verify/recaptcha`（token 交给上游）。加第四个 provider 时这一层不用动。
 *
 * @author yijiu
 * @since 2026-08-17
 * @since 2026-11-06 抽出 provider 层（pow / 第三方同一形状），本文件只剩编排
 */
import crypto from 'crypto';
import { generateFingerprint } from '../../../../framework/firewall/util/fingerprint.js';
import { getConfig } from '../../../../framework/firewall/util/shared.js';
import { grantPass, readAccessState } from '../../../../framework/firewall/util/redis.js';
import { recordChallengeEvent, noteChallengePassed } from '../../../../framework/firewall/challenge/index.js';
import { getClientDeviceId } from '../../../../framework/auth/index.js';
import { createLogger } from '../../../../framework/log/index.js';
import { resolveChallengeProvider, pickVerifyProvider } from './providers/index.js';

const log = createLogger('app.firewall.services.challenge');

/**
 * 通过令牌有效期：**按登录态分档**
 *
 * 为什么必须分档（2026-11-03 需求）：人机挑战是「限频后的二次自证」，不是「买断 30 分钟」。
 * 一个**未登录**的客户端解一次 PoW（几十毫秒）就换 30 分钟免检，等于把挑战降级成
 * 一次性订阅：解一次 → 狂刷半小时 → 再解一次。所以：
 *   · 已登录：30 分钟（管理员/正常用户，有身份可追责，体验优先）
 *   · 匿名  ：2 分钟（只够完成"当前这一次交互"——加载一个页面、提交一次表单；
 *             高频匿名流量 2 分钟后重新进入挑战，攻击成本从"每 30 分钟一次"变成"每 2 分钟一次"）
 *
 * 注意匿名档**不是**"免检"：端点级限频（各路由 config.rateLimit）、全局限频、
 * 连接数上限、封禁/白名单在 pass 命中时**照常执行**，被缩短的只是"免于再次挑战"的窗口。
 */
const PASS_TOKEN_TTL_AUTHED = 1800;
const PASS_TOKEN_TTL_ANON = 120;

/**
 * 该请求是否已登录（决定通过令牌的有效期档位）
 *
 * `request.state.user` 由 04-auth 的 onRequest 钩子填充（早于防火墙与业务路由），
 * 因此挑战接口本身虽然免登录，但**带了有效 sid 的请求仍能被识别为已登录**。
 *
 * @param {object} request Fastify request
 * @returns {boolean} true 表示已登录
 */
function isAuthenticated(request) {
  return Boolean(request?.state?.user?.id || request?.state?.user?.userId);
}

/**
 * 取当前配置的 challenge provider
 *
 * 每次现读配置（不缓存）：面板换 provider 后立刻生效，且**降级规则只在
 * `resolveChallengeProvider` 一处**（未知名字 / 密钥没配齐 → 回落 pow）。
 *
 * @returns {{name: string, issue: Function, verify: Function}} provider
 */
function currentProvider() {
  return resolveChallengeProvider(getConfig().defense?.challengeProvider);
}

/**
 * 记一次验证失败并返回统一形状
 *
 * 观测与返回解耦的用意：**只做统计**，绝不改变状态码/原因。失败原因分布是
 * "链路是否还活着"的关键信号（例如 Expired 占比突然 100% = 载荷根本没写进去，
 * 或前端页把已消费的载荷重放）。
 *
 * @param {string} reason 对外原因
 * @param {string} [provider] 哪个 provider 判的（用于按实现分桶）
 * @param {number} [statusCode] 状态码（默认 403；上游不可达时由 provider 指定 503）
 * @returns {{ok:false, statusCode:number, reason:string}} 统一失败响应
 */
function failWith(reason, provider = 'pow', statusCode = 403) {
  recordChallengeEvent({ type: 'failed', provider, reason });
  return { ok: false, statusCode, reason };
}

/**
 * 为挑战页 / 前端 SPA 签发一份挑战
 *
 * 载荷与判定依据都留在服务端，下发的只有「不透明题号 + 求解参数」（pow）或
 * 「公开的 siteKey」（第三方）—— 客户端即使把整个响应体回传，也拿不到可直接复用的凭据。
 *
 * ⚠️ **只在挑战态签发**：非挑战态请求返回 403 `Not Challenged`。否则免登录的 issue
 * 就成了"预先买票"——先解一次 PoW 换 30 分钟免挑战，把整套挑战降级成可选项。
 *
 * @param {object} request Fastify request（取 ip / headers / cookie）
 * @returns {Promise<{ok:true, provider:string, challengeId?:string, salt?:string, difficulty?:number,
 *   maxAttempts?:number, ttlSec?:number, siteKey?:string, reason?:string}
 *   | {ok:false, statusCode:number, reason:string}>}
 */
async function issueChallenge(request) {
  try {
    const fingerprint = generateFingerprint(request);
    const deviceId = await getClientDeviceId(request);

    // ── 闸门：只有**当前确实处于挑战态**才签发 ──
    //
    // 为什么要这道闸（2026-11-03 补）：issue 是免登录接口，若无条件签发，任何人先打开
    // 挑战页解一次 PoW（约 4k 次哈希，几十毫秒）就能拿到 30 分钟有效的 fw_verified，
    // 之后狂刷时 `checkChallengeCookie` 直接放行 —— 等于把"限频后必须过验证"降级成
    // "每 30 分钟自证一次即可"。而内置 HTML 模板天然没有这个口子：它只在挑战态渲染。
    // 一道只读 Redis 的判定，把这个不对称补齐。**与 provider 无关**：换第三方也一样要。
    const state = await readAccessState({ ip: request.ip, fingerprint, deviceId });
    const inChallenge = [state.ipBlock, state.fpBlock, state.devBlock].some(b => b?.status === 'CHALLENGE');
    if (!inChallenge) {
      // 观测：非挑战态却来要票 —— 正常用户不会走到这里，突增说明有脚本在刷 issue
      recordChallengeEvent({ type: 'issueRejected', reason: 'Not Challenged' });
      return { ok: false, statusCode: 403, reason: 'Not Challenged' };
    }

    const provider = currentProvider();
    const issued = await provider.issue({
      ip: request.ip,
      fingerprint,
      deviceId,
      // 登录用户难度降一档（递进难度开着时才有效果；第三方 provider 忽略这个字段）
      loggedIn: isAuthenticated(request)
    });

    recordChallengeEvent({ type: 'issued', provider: provider.name, difficulty: issued.difficulty });
    // provider 字段必须下发：前端要据此决定"解 PoW"还是"渲染第三方组件"
    return { ok: true, provider: provider.name, ...issued };
  } catch (err) {
    // 签发失败（Redis 写不进等）：对外只给可编程原因，内部细节进日志
    log.warn('⚠️ [Firewall] 挑战签发失败', err);
    recordChallengeEvent({ type: 'issueRejected', reason: 'Challenge Unavailable' });
    return { ok: false, statusCode: 503, reason: 'Challenge Unavailable' };
  }
}

/**
 * 验证客户端提交的挑战结果，通过则签发 fw_verified 令牌（Cookie + Redis）
 *
 * 判题交给 provider；本函数只负责：判定 → 签发令牌 → 记观测。
 *
 * @param {object} request - Fastify request（取 body / ip / 指纹 / 设备 ID）
 * @param {object} reply - Fastify reply（设 Cookie）
 * @returns {Promise<{ok:true, passTtlSec:number, scope:string} | {ok:false, statusCode:number, reason:string}>}
 */
async function verifyChallenge(request, reply) {
  const body = request.body && typeof request.body === 'object' ? request.body : {};

  // 按**载荷形状**选 provider（不是按配置）：配置可能在出题与提交之间被热改，
  // 而客户端手里只有当时那种形状的答案。详见 providers/index.js。
  const provider = pickVerifyProvider(currentProvider(), body);

  const fingerprint = generateFingerprint(request);
  const deviceId = await getClientDeviceId(request);

  const result = await provider.verify({
    request,
    context: { ip: request.ip, fingerprint, deviceId },
    body
  });

  if (!result.ok) {
    return failWith(result.reason, provider.name, result.statusCode);
  }

  // 签发验证令牌（绑定设备 / 指纹 / IP 三个维度）
  // 有效期按登录态分档：匿名只换 2 分钟窗口，登录才免 30 分钟（见 PASS_TOKEN_TTL_* 注释）
  const authed = isAuthenticated(request);
  const ttlSec = authed ? PASS_TOKEN_TTL_AUTHED : PASS_TOKEN_TTL_ANON;
  const token = crypto.randomBytes(32).toString('hex');
  await grantPass({ ip: request.ip, fingerprint, deviceId, token, ttlSec });

  // 设置 HttpOnly Cookie（maxAge 与 Redis TTL 必须一致：否则 cookie 还在、服务端已失效，
  // 每个请求都白跑一次 hasPass 查询）
  reply.setCookie('fw_verified', token, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: ttlSec,
    sameSite: 'Strict'
  });

  // 观测：通过 + 客户端上报的求解耗时（分桶统计；**不参与任何判定**，可伪造）
  recordChallengeEvent({ type: 'verified', provider: provider.name, solveMs: body.solveMs });
  // 信誉：顺利通过一次（递进难度关闭时是空操作）
  await noteChallengePassed(request.ip);

  return { ok: true, passTtlSec: ttlSec, scope: authed ? 'account' : 'anonymous' };
}

export { issueChallenge, verifyChallenge };
