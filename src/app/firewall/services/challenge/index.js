/**
 * 人机挑战 · 应用层门面
 *
 * 对外只有两个动作，其余全是内部划分：
 *
 * ```
 * issueChallenge(ctx)  → { provider, ...题目材料 }
 * verifyChallenge(req, reply) → { ok } | { ok: false, reason, statusCode? }
 * ```
 *
 * | 文件 | 职责 |
 * | --- | --- |
 * | `service.js` | 编排：取上下文 → 选 provider 出题 → 记观测 → 判题 → 签 pass |
 * | `providers/` | 「怎么出题、怎么判题」：`pow`（自包含）/ `recaptcha`（turnstile·hcaptcha·google 共用） |
 *
 * 这两层分开是为了让加第四个 provider 时**不必动 service** —— provider 只需长成
 * 同一个 `{ name, issue, verify }` 形状，选路由框架层（`framework/firewall/challenge`）
 * 与配置（`defense.challengeProvider`）决定。
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
export { issueChallenge, verifyChallenge } from './service.js';

export {
  resolveChallengeProvider,
  pickVerifyProvider,
  resetProviderWarnings,
  EXTERNAL_PROVIDERS
} from './providers/index.js';
