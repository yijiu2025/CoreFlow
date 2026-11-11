<script setup lang="ts">
/**
 * 二次验证输入区（后台高危操作共用）
 *
 * ── 为什么不是密码框 ──
 * 本仓大量账号是**邮箱验证码登录**的，从来没设置过密码。对这类账号，密码框是死路：
 * 填什么都错，只能放弃操作。所以默认走邮箱验证码，密码只在"设过密码但没绑邮箱"时
 * 才作为后备（`hasPassword`），而不是反过来。
 *
 * ── 为什么凭据要先单独领 ──
 * 服务端要求 `challengeId` 绑定「动作 + 目标」：为了看 A 而通过的验证不能拿去删 B。
 * 所以这里负责领凭据（发码）与收凭据（输入），提交时由父组件把 payload 一起发走 ——
 * 组件自己不发业务请求，避免"验完就执行"这种把两件事糅在一起的写法。
 *
 * ── 三个刻意的细节 ──
 * 1. 60 秒倒计时是**本地**的：后端 emailDao 也有 60 秒冷却，两边都要有 ——
 *    否则用户点一下看到"发送失败（过于频繁）"，比看到灰按钮更让人迷惑。
 * 2. 密码方式不显示「发送验证码」按钮（没东西可发），切换过去时自动领凭据。
 * 3. 两种方式都没有时直接说清"请联系超级管理员"，不要让人对着空白区域反复点。
 *
 * @author yijiu2025
 * @since 2026-11-11
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Loader2, MailCheck } from 'lucide-vue-next';
import { requestStepUpChallenge, stepUpFactors } from '@/api/system';
import type { StepUpChallenge, StepUpFactors, StepUpPayload } from '@/api/types';

/** 与后端 `stepup.service` 的 ACTIONS 一一对应 */
type Action = 'user.delete' | 'user.app-deactivate' | 'user.temp-password';

const props = withDefaults(
  defineProps<{
    action: Action;
    targetId: number | null;
    disabled?: boolean;
  }>(),
  { disabled: false }
);

/** 重发冷却（秒）：与 emailDao 的 rateLimit 对齐 */
const RESEND_SECONDS = 60;

const factors = ref<StepUpFactors | null>(null);
const factorsLoading = ref(false);
const method = ref<'email' | 'password'>('email');
const challenge = ref<StepUpChallenge | null>(null);
const code = ref('');
const password = ref('');
const countdown = ref(0);
const sending = ref(false);
const errorMessage = ref('');
const notice = ref('');

let timer: ReturnType<typeof setInterval> | null = null;

/** 是否可以提交（父组件据此禁用主按钮，少一次无效请求） */
const ready = computed(() => buildPayload() !== null);

/**
 * 倒计时
 *
 * @param seconds 起始秒数
 */
function startCountdown(seconds: number): void {
  countdown.value = seconds;
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    countdown.value = Math.max(countdown.value - 1, 0);
    if (countdown.value === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  }, 1000);
}

/**
 * 领一张凭据
 *
 * @param forMethod 验证方式
 * @returns 是否成功
 */
async function issueChallenge(forMethod: 'email' | 'password'): Promise<boolean> {
  if (props.targetId === null) return false;
  sending.value = true;
  errorMessage.value = '';
  try {
    const res = await requestStepUpChallenge({
      action: props.action,
      targetId: props.targetId,
      method: forMethod
    });
    challenge.value = res;
    method.value = res.method;
    if (res.method === 'email') {
      notice.value = res.maskedTarget ? `验证码已发送至 ${res.maskedTarget}` : '验证码已发送';
      startCountdown(RESEND_SECONDS);
    }
    return true;
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '获取验证码失败';
    return false;
  } finally {
    sending.value = false;
  }
}

/** 发送 / 重新发送验证码 */
async function sendCode(): Promise<void> {
  if (countdown.value > 0 || sending.value || props.disabled) return;
  code.value = '';
  if (await issueChallenge('email')) {
    // 焦点留给输入框：发完码下一步必然是输码，少一次点击
    requestAnimationFrame(() => document.getElementById(`stepup-code-${props.action}`)?.focus());
  }
}

/** 改用登录密码 */
async function usePassword(): Promise<void> {
  challenge.value = null;
  code.value = '';
  notice.value = '';
  errorMessage.value = '';
  method.value = 'password';
  // 密码方式不涉及发信，但凭据仍要领（服务端要求 challengeId）
  await issueChallenge('password');
}

/** 改用邮箱验证码 */
function useEmail(): void {
  challenge.value = null;
  password.value = '';
  notice.value = '';
  errorMessage.value = '';
  method.value = 'email';
}

/**
 * 组装提交载荷
 *
 * @returns 载荷；未完成时 null
 */
function buildPayload(): StepUpPayload | null {
  if (!challenge.value) return null;
  if (method.value === 'password') {
    return password.value ? { challengeId: challenge.value.challengeId, password: password.value } : null;
  }
  const trimmed = code.value.trim();
  return trimmed ? { challengeId: challenge.value.challengeId, code: trimmed } : null;
}

/**
 * 未完成时的说明（父组件用它给出**具体**原因，而不是笼统的"请完成验证"）
 *
 * @returns 提示文案
 */
function hint(): string {
  if (!factors.value?.recommended) return '你的账号未绑定邮箱也未设置密码，无法完成二次验证';
  if (!challenge.value) return method.value === 'email' ? '请先点击「发送验证码」' : '请输入你的登录密码';
  if (method.value === 'password') return '请输入你的登录密码';
  return '请输入邮箱收到的验证码';
}

/** 清空（关弹窗 / 换目标时） */
function reset(): void {
  challenge.value = null;
  code.value = '';
  password.value = '';
  errorMessage.value = '';
  notice.value = '';
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  countdown.value = 0;
}

/** 重新确认可用的验证方式 */
async function loadFactors(): Promise<void> {
  factorsLoading.value = true;
  try {
    factors.value = await stepUpFactors();
    method.value = factors.value.recommended ?? 'email';
    // 只有密码可用时直接领凭据：否则用户要对着一个"发送验证码"按钮发呆
    if (method.value === 'password' && factors.value.hasPassword) {
      await issueChallenge('password');
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '无法确认验证方式';
  } finally {
    factorsLoading.value = false;
  }
}

watch(
  () => [props.action, props.targetId] as const,
  async ([action, targetId], previous) => {
    // 动作或目标变了，旧凭据一律作废（服务端也会拒，但前端没必要留着）
    reset();
    if (targetId === null) return;
    if (!previous || previous[0] !== action) await loadFactors();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

defineExpose({ buildPayload, hint, reset, ready, reloadFactors: loadFactors });
</script>

<template>
  <div class="stepup">
    <div class="stepup__head">
      <span class="field__label">二次验证</span>
      <button
        v-if="method === 'password' && factors?.email"
        class="stepup__switch"
        type="button"
        :disabled="disabled || sending"
        @click="useEmail"
      >
        <MailCheck :size="12" /> 改用邮箱验证码
      </button>
      <button
        v-else-if="method === 'email' && factors?.hasPassword"
        class="stepup__switch"
        type="button"
        :disabled="disabled || sending"
        @click="usePassword"
      >
        改用登录密码
      </button>
    </div>

    <p v-if="factorsLoading" class="stepup__hint">正在确认可用的验证方式…</p>

    <p v-else-if="!factors?.recommended" class="stepup__warn">
      你的账号既未绑定邮箱也未设置密码，无法完成二次验证。请联系超级管理员处理。
    </p>

    <template v-else-if="method === 'email'">
      <div class="stepup__row">
        <input
          :id="`stepup-code-${action}`"
          v-model="code"
          class="input stepup__code"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          placeholder="邮箱收到的 6 位验证码"
          :disabled="disabled || !challenge"
        />
        <button
          class="btn btn--sm"
          type="button"
          :disabled="disabled || sending || countdown > 0 || !factors.email"
          @click="sendCode"
        >
          <Loader2 v-if="sending" class="spin" :size="13" />
          {{ countdown > 0 ? `${countdown}s 后可重发` : challenge ? '重新发送' : '发送验证码' }}
        </button>
      </div>
      <p class="stepup__hint">
        <template v-if="notice">{{ notice }}</template>
        <template v-else-if="factors.email">验证码将发送至 {{ factors.email }}，10 分钟内有效。</template>
        <template v-else>该账号未绑定邮箱。</template>
      </p>
    </template>

    <template v-else>
      <input
        v-model="password"
        class="input"
        type="password"
        autocomplete="current-password"
        placeholder="你的登录密码"
        :disabled="disabled"
      />
      <p class="stepup__hint">你设置过密码；若已忘记，可改用邮箱验证码。</p>
    </template>

    <p v-if="errorMessage" class="stepup__error">{{ errorMessage }}</p>
  </div>
</template>

<style scoped>
.stepup {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface-2);
}

.stepup__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

/* 切换方式是个辅助动作：不该抢主按钮的视觉重量 */
.stepup__switch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: none;
  color: var(--mauth-primary);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.stepup__switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.stepup__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stepup__code {
  flex: 1;
  min-width: 0;
  letter-spacing: 0.18em;
  font-variant-numeric: tabular-nums;
}

.stepup__hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.stepup__warn {
  margin: 0;
  font-size: 12px;
  color: #92400e;
}

.stepup__error {
  margin: 0;
  font-size: 11.5px;
  color: #b91c1c;
}
</style>
