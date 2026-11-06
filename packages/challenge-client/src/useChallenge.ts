/**
 * 挑战页状态机（Vue composable）
 *
 * 一处收敛"签发 → 求解 → 校验 → 成功/失败重试"的全部时序，组件只负责渲染：
 *   idle → solving → verifying → ok | error
 *
 * 三条硬要求（都是被线上坑过的）：
 *   1. **可取消**：用户点「重新验证」或组件卸载时必须中断上一轮计算，否则两轮并发写状态；
 *   2. **失败可自愈但有上限**：挑战载荷是一次性的，失败后必须重新签发；但无限自动重试会
 *      把用户锁在"刷新 → 失败 → 刷新"的循环里，默认封顶 3 次；
 *   3. **返回地址必须校验**：`?return=` 是外部输入，只接受站内相对路径，
 *      否则就是一个开放重定向（把用户送去钓鱼站）。
 *
 * @author yijiu2025
 * @since 2026-11-03
 */

import { getCurrentScope, onScopeDispose, ref } from 'vue';
import { issueChallenge, verifyChallenge, type ChallengeClientOptions } from './api';
import { solvePow } from './pow';

/** 挑战阶段 */
export type ChallengePhase = 'idle' | 'solving' | 'verifying' | 'ok' | 'error';

/** 参数 */
export interface UseChallengeOptions extends ChallengeClientOptions {
  /** 自动开始（默认 true） */
  auto?: boolean;
  /** 失败后自动重试次数上限（默认 3；0 = 不自动重试） */
  maxAutoRetry?: number;
  /** 自动重试间隔（毫秒，默认 3000） */
  retryDelayMs?: number;
  /** 成功后在挑战页驻留多久再跳（毫秒，默认 600）：让用户看到"验证通过"，否则页面一闪而过 */
  successDelayMs?: number;
  /** 验证通过回调（通常是跳回 returnUrl）；返回 Promise 时会被 await */
  onSuccess?: () => void | Promise<void>;
}

/**
 * 校验并归一化 `?return=` 目标
 *
 * 只放行**站内相对路径**：以单个 `/` 开头、不是 `//`（协议相对）、不含控制字符。
 * 其它一律回落 `fallback` —— `?return=https://evil.com` 必须被丢弃。
 *
 * @param raw 原始参数
 * @param fallback 回落地址（默认站点根）
 * @returns 安全的跳转目标
 */
export function resolveReturnPath(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string' || raw === '') return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  // 排除 `/\evil.com`（部分浏览器把反斜杠当斜杠）
  if (raw.startsWith('/\\')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(raw)) return fallback;
  return raw;
}

/**
 * 挑战页状态机
 *
 * @param options 参数
 * @returns 响应式状态 + `start()` / `retry()` / `dispose()`
 */
export function useChallenge(options: UseChallengeOptions = {}) {
  const maxAutoRetry = Math.max(0, options.maxAutoRetry ?? 3);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 3000);
  const successDelayMs = Math.max(0, options.successDelayMs ?? 600);

  const phase = ref<ChallengePhase>('idle');
  const progress = ref(0);
  const reason = ref('');
  const retries = ref(0);
  const difficulty = ref(0);
  /** 本次通过的免挑战时长（秒，服务端按登录态给：登录 1800 / 匿名 120） */
  const passTtlSec = ref(0);

  /** 当前这轮计算的取消手柄 */
  let controller: AbortController | null = null;
  /** 自动重试定时器 */
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  /**
   * 中断当前这一轮（计算 / 等待重试）
   *
   * @returns void
   */
  function cancelRound(): void {
    controller?.abort();
    controller = null;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  /**
   * 跑完一轮：签发 → 求解 → 校验
   *
   * @returns 成功返回 true；失败返回 false（失败原因写在 `reason`）
   */
  async function runRound(): Promise<boolean> {
    cancelRound();
    if (disposed) return false;

    const round = new AbortController();
    controller = round;

    try {
      phase.value = 'solving';
      progress.value = 0;
      reason.value = '';

      const issued = await issueChallenge(options);
      if (round.signal.aborted || disposed) return false;

      difficulty.value = issued.difficulty;
      // 只测**求解本身**的耗时（不含签发/校验的网络时间）—— 这才是"用户卡了多久"的分子
      const solveStartedAt = Date.now();
      const solved = await solvePow({
        challengeId: issued.challengeId,
        salt: issued.salt,
        difficulty: issued.difficulty,
        maxAttempts: issued.maxAttempts,
        signal: round.signal,
        onProgress: ratio => {
          if (!round.signal.aborted) progress.value = Math.min(0.9, ratio * 0.9);
        }
      });

      if (round.signal.aborted || disposed) return false;
      if (solved.answer === null) {
        reason.value = 'Challenge Unsolvable';
        phase.value = 'error';
        return false;
      }

      const solveMs = Date.now() - solveStartedAt;
      phase.value = 'verifying';
      progress.value = 0.95;

      // solveMs 只进服务端统计（成功率之外的第二块拼图），不参与判定
      const verified = await verifyChallenge(issued.challengeId, solved.answer, options, solveMs);
      if (round.signal.aborted || disposed) return false;

      if (!verified.ok) {
        reason.value = verified.reason || 'Verification Failed';
        phase.value = 'error';
        return false;
      }

      progress.value = 1;
      phase.value = 'ok';
      retries.value = 0;
      passTtlSec.value = verified.passTtlSec ?? 0;

      // 驻留一拍再跳：不给反馈就跳转，用户会觉得"刚才那页闪了一下"
      if (successDelayMs > 0) await new Promise<void>(resolve => setTimeout(resolve, successDelayMs));
      if (round.signal.aborted || disposed) return true;
      await options.onSuccess?.();
      return true;
    } catch (err) {
      if (round.signal.aborted || disposed) return false;

      // `Not Challenged`：服务端认为当前上下文**没有被要求验证**（挑战态已过期、或用户
      // 本来就没被拦）。这不是失败 —— 直接当作通过回原页面，避免让用户对着一个
      // "验证失败"的红字页面反复重试。
      const code = (err as { code?: string }).code;
      if (code === 'Not Challenged') {
        phase.value = 'ok';
        progress.value = 1;
        await options.onSuccess?.();
        return true;
      }

      reason.value = err instanceof Error ? err.message : 'Challenge Unavailable';
      phase.value = 'error';
      return false;
    }
  }

  /**
   * 开始验证（用户点「重新验证」也走这里：重置计数后重跑）
   *
   * @returns 本轮是否成功
   */
  async function start(): Promise<boolean> {
    retries.value = 0;
    const ok = await runRound();
    if (!ok) scheduleAutoRetry();
    return ok;
  }

  /**
   * 立即重试一次（重置自动重试计数，让用户手动的动作不受封顶影响）
   *
   * @returns 本轮是否成功
   */
  async function retry(): Promise<boolean> {
    retries.value = 0;
    const ok = await runRound();
    if (!ok) scheduleAutoRetry();
    return ok;
  }

  /**
   * 排下一次自动重试（封顶后停止，只保留手动按钮）
   *
   * @returns void
   */
  function scheduleAutoRetry(): void {
    if (disposed || retries.value >= maxAutoRetry) return;
    retries.value += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void runRound().then(ok => {
        if (!ok) scheduleAutoRetry();
      });
    }, retryDelayMs);
  }

  /**
   * 释放：中断计算与定时器（组件卸载时调用；在 setup 作用域内也会自动挂载）
   *
   * @returns void
   */
  function dispose(): void {
    disposed = true;
    cancelRound();
  }

  if (getCurrentScope()) onScopeDispose(dispose);
  if (options.auto !== false) void start();

  return { phase, progress, reason, retries, maxAutoRetry, difficulty, passTtlSec, start, retry, dispose };
}
