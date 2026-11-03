/**
 * 人机挑战页共享库（admin / firewall 两个 SPA 共用）
 *
 * 为什么单独成包：挑战页在两个前端里是**同一件事** —— PoW 求解、issue/verify 调用、
 * 状态机、卡片 UI。复制两份必然漂移（一份改了失败重试、另一份没改），而这段逻辑又
 * 直接决定"被拦截的用户能不能自解"。
 *
 * ⚠️ 引入方式：**纯源码共享**，两个 app 通过 `vite.resolve.alias` + tsconfig `paths`
 * 指向 `packages/challenge-client/src`。刻意不登记进 npm workspace：一旦成为 workspace
 * 包，根 `package-lock.json` 必须同步（`npm ci` 会校验），本次改动没必要动锁文件。
 *
 * @author yijiu2025
 * @since 2026-11-03
 */

export { sha256Hex, solvePow } from './pow';
export type { SolveOptions, SolveResult } from './pow';

export { issueChallenge, verifyChallenge, ISSUE_PATH, VERIFY_PATH } from './api';
export type { ChallengeIssue, ChallengeClientOptions, ChallengeError, VerifyResult } from './api';

export { useChallenge, resolveReturnPath } from './useChallenge';
export type { ChallengePhase, UseChallengeOptions } from './useChallenge';

export { default as ChallengeCard } from './ChallengeCard.vue';
