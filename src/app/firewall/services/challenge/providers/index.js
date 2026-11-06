/**
 * 挑战 provider 注册表
 *
 * 「人机验证」的实现方式不止一种，它们在**协议形状**上差别很大（PoW 要服务端存载荷、
 * 第三方只要一个 token），但对调用方必须长成同一个东西：
 *
 * ```js
 * {
 *   name,                       // 同时是 defense.challengeProvider 的取值
 *   issue(ctx)  → 题目材料      // 下发给客户端的东西
 *   verify(input) → { ok } | { ok: false, reason, statusCode? }
 * }
 * ```
 *
 * 这样 `challenge/service` 只剩三段：出题 → 记观测 → 等客户端回来；判题 → 签 pass → 记观测。
 * 加第四个 provider 时**不需要**动 service。
 *
 * ── 降级规则（写死在这里，避免"每个调用点各有一套"）──
 *
 *   · 名字不认识（拼错、老配置）→ 回落 pow + warn（pow 永远可用，比"谁也不验证"安全）
 *   · 名字认识但**密钥没配齐** → 回落 pow + warn（切过去只会让用户卡在一张渲不出来的页上）
 *
 * 两者都**不抛错**：挑战链路是热路径，配置错不该让所有人的请求 500。
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
import { getConfig } from '../../../../../framework/firewall/util/shared.js';
import { recaptchaService } from '../../../../../framework/verify/recaptcha/index.js';
import { createLogger } from '../../../../../framework/log/index.js';
import { powProvider } from './pow.js';
import { createRecaptchaProvider } from './recaptcha.js';

const log = createLogger('app.firewall.services.challenge.providers');

/**
 * 支持的第三方服务商
 *
 * ⚠️ 这份清单必须与 `framework/firewall/config/schema.js` 的
 * `CHALLENGE_PROVIDERS`（spec enum 的来源）**完全一致** —— 有测试钉住。
 * 配置schema 在 framework 层，注册表在 app 层，后者不能反向被 import，
 * 所以两边各写一份 + 契约测试是这里唯一可行的做法。
 */
const EXTERNAL_PROVIDERS = ['turnstile', 'hcaptcha', 'google'];

/** name → provider（构造一次，复用） */
const PROVIDERS = new Map([
  ['pow', powProvider],
  ...EXTERNAL_PROVIDERS.map(name => [name, createRecaptchaProvider(name)])
]);

/** 已经告警过的 key（配置写错时会每个请求都进这里，不能次次打日志） */
const warned = new Set();

/**
 * 同一类告警只打一次
 *
 * @param {string} key 去重键
 * @param {string} message 文案
 * @returns {void}
 */
function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  log.warn(message);
}

/** 仅供测试重置"已告警"状态 */
function resetProviderWarnings() {
  warned.clear();
}

/**
 * 按配置解析出本次要用的 provider
 *
 * @param {string} [name] `defense.challengeProvider` 的值
 * @returns {{name: string, issue: Function, verify: Function}} provider（永不返回 undefined）
 */
function resolveChallengeProvider(name) {
  const wanted = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (!wanted || wanted === 'pow') return powProvider;

  const provider = PROVIDERS.get(wanted);
  if (!provider) {
    warnOnce(
      `unknown:${wanted}`,
      `⚠️ [Firewall] defense.challengeProvider = "${wanted}" 不是支持的取值，已回落 pow（可用值：${[...PROVIDERS.keys()].join(' / ')}）`
    );
    return powProvider;
  }

  if (!recaptchaService.isConfigured(wanted)) {
    warnOnce(
      `nokey:${wanted}`,
      `⚠️ [Firewall] challengeProvider = "${wanted}" 但密钥未配齐（需要 *_SECRET_KEY 与 *_SITE_KEY），已回落 pow`
    );
    return powProvider;
  }

  // 内嵌页只支持 pow（第三方组件要前端页渲染）。配了第三方却没配挑战页地址时，
  // 内嵌页仍会发出 pow 题 —— 那不是漏洞，但会让第三方 provider 的意义打折，故提示一次。
  if (!getConfig().defense?.challengePageUrl) {
    warnOnce(
      `nopage:${wanted}`,
      `⚠️ [Firewall] challengeProvider = "${wanted}" 但 defense.challengePageUrl 为空：` +
        '直连 API 的浏览器仍会拿到内置 pow 挑战页（内置页接不了第三方组件）。' +
        '要让第三方生效，请把 defense.challengePageUrl 指向前端挑战页。'
    );
  }

  return provider;
}

/**
 * 判题时用哪个 provider
 *
 * **按客户端提交的载荷形状决定，而不是按配置**，这是刻意的：
 *   · 配置可能在下发与提交之间被热改（面板上换 provider），按配置路由会让
 *     "已经拿到 pow 题的用户"永远验不过 —— 他们手里只有 challengeId/answer；
 *   · 内嵌挑战页始终发 pow 题（第三方组件进不了那张零外链的页面），
 *     它回来的必然也是 pow 形状。
 *
 * 安全性不因此变松：pow 分支要求 `challengeId` 能在服务端查到载荷（原子取走），
 * 而载荷只由 pow 出题时写入 —— 没出过题就没有可用的载荷。
 *
 * @param {{name: string, issue: Function, verify: Function}} configured 配置解析出的 provider
 * @param {object} body 请求体
 * @returns {{name: string, issue: Function, verify: Function}} 实际用于判题的 provider
 */
function pickVerifyProvider(configured, body) {
  const hasToken = typeof body?.token === 'string' && body.token.trim() !== '';
  if (hasToken) {
    // 有 token 却配的是 pow：说明前端按旧契约提交（或配置刚被切走），按 pow 处理会让
    // 客户端拿到一个莫名其妙的 Invalid Proof，不如明确告知"provider 不匹配"。
    if (configured.name === 'pow') {
      warnOnce('token-with-pow', '⚠️ [Firewall] 收到 token 但 challengeProvider=pow：请检查前端与后端配置是否一致');
    }
    return configured;
  }
  return powProvider;
}

export { resolveChallengeProvider, pickVerifyProvider, resetProviderWarnings, EXTERNAL_PROVIDERS };
