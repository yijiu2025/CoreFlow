/**
 * 挑战 provider：第三方人机验证（Cloudflare Turnstile / hCaptcha / Google reCAPTCHA）
 *
 * 后端**不重复实现**这三个协议：`framework/security/verify/recaptcha` 早就做好了（含超时、
 * hostname/action 校验、未配置密钥时的 fail-closed），这里只是把它接成挑战 provider 的形状。
 *
 * ── 与其他 provider 的差别（这不是 bug，是协议决定的）──
 *
 * | | pow | 第三方 |
 * | --- | --- | --- |
 * | 出题 | 服务端存一份载荷（一次性） | 没有载荷：token 由对方签发并自带有效期 |
 * | 绑定 | ip + 指纹 + 设备 ID，服务端存 | 由对方校验（hostname / action），服务端不存 |
 * | 重放 | 原子 GET+DEL，天然一次性 | 一次性由对方保证（token 只能用一次） |
 *
 * 所以 `issue()` 只回一个 siteKey（前端拿它渲染组件），`verify()` 只把 token 转给上游。
 *
 * ── 失败语义 ──
 *
 * 上游**不可达**（超时/网络）与"token 不对"要分开：
 *   · token 不对 → 403 `Invalid Proof`（用户重试即可）
 *   · 上游挂了   → 503 `Challenge Unavailable`（**不要**挫成 403，否则运维看到的是
 *                  "用户验证全失败"，而真实原因是我们的外网出口挂了）
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
import { recaptchaService } from '../../../../../framework/security/verify/recaptcha/index.js';
import { createLogger } from '../../../../../framework/support/log/index.js';

const log = createLogger('app.firewall.services.challenge.providers.recaptcha');

/**
 * 造一个第三方 provider
 *
 * @param {'turnstile'|'hcaptcha'|'google'} name 服务商（同时也是 `defense.challengeProvider` 的取值）
 * @returns {{name: string, issue: Function, verify: Function}} provider
 */
function createRecaptchaProvider(name) {
  return {
    name,

    /**
     * 出题：只回站点密钥（公开值，不是秘密），载荷由对方签发
     *
     * @returns {Promise<{siteKey: string}>} 前端渲染组件所需材料
     */
    async issue() {
      return { siteKey: recaptchaService.siteKeyFor(name) };
    },

    /**
     * 判题：把 token 交给上游校验
     *
     * @param {object} input 判题输入
     * @param {object} input.request Fastify request（取 ip，作为 remoteip 传给上游）
     * @param {object} input.body 请求体（`token`）
     * @returns {Promise<{ok: true} | {ok: false, reason: string, statusCode?: number}>} 判定结果
     */
    async verify({ request, body }) {
      const token = typeof body?.token === 'string' ? body.token.trim() : '';
      if (!token) {
        return { ok: false, reason: 'Invalid Proof' };
      }

      const result = await recaptchaService.verify(token, request.ip, { provider: name });

      if (result.success) return { ok: true };

      // 上游不可达与服务端 5xx 都归为"我们这边的问题"：给可重试的 503，
      // 不要把基础设施故障伪装成"这个用户是机器人"。
      if (result.error === 'api_error') {
        log.warn(`⚠️ [Firewall] ${name} 校验请求失败（上游不可达），按可重试处理`);
        return { ok: false, reason: 'Challenge Unavailable', statusCode: 503 };
      }

      // 其余（token 过期/重复使用/分数过低/hostname 不符/未配置）一律按验证不通过处理，
      // 但把具体原因记进日志 —— 对客户端只暴露一个笼统原因，避免变成探测通道。
      log.info(`[Firewall] ${name} 校验未通过: ${result.error || 'unknown'}`);
      return { ok: false, reason: 'Invalid Proof' };
    }
  };
}

export { createRecaptchaProvider };
