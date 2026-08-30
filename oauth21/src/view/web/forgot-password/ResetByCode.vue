<script setup lang="ts">
/**
 * 方式一：验证码重置密码
 * 流程：输入邮箱 → 图形验证码 → 邮箱验证码 → 设置新密码
 */
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { authApi } from '@/api/auth';
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import Icons from '@/components/common/Icons.vue';
import { useMessage } from '@/composables/useMessage';
import { useCountdown } from '@/composables/useCountdown';
import { rsaEncrypt, getCachedKid } from '@/utils/crypto';

const { t } = useI18n();
const { error: showError, success: showSuccess } = useMessage();

const email = ref('');
const code = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
// 密码可见切换（同时控制两个密码字段的 type 切换）
const showPassword = ref(false);
const step = ref<'email' | 'code' | 'done'>('email');
const isSubmitting = ref(false);
const { active: isCountingDown, remaining: countdown, start: startCountdown } = useCountdown(60);

const showCaptcha = ref(false);
const captchaKey = ref('');

function sendCode() {
  if (!email.value || !email.value.includes('@')) {
    showError(t('validation.email_invalid'));
    return;
  }
  showCaptcha.value = true;
}

async function onCaptchaSuccess(data: { captchaKey: string }) {
  // GraphicCaptcha 的 verify-captcha 已同步发送邮箱码（传了 email + type）
  showCaptcha.value = false;
  captchaKey.value = data.captchaKey;
  showSuccess(t('forgot.code_sent'));
  step.value = 'code';
  startCountdown(60);
}

async function handleReset() {
  if (!code.value || code.value.length < 4) {
    showError(t('forgot.code_required'));
    return;
  }
  if (!newPassword.value || newPassword.value.length < 6) {
    showError(t('forgot.password_min'));
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    showError(t('forgot.password_mismatch'));
    return;
  }

  isSubmitting.value = true;
  try {
    const encryptedPassword = await rsaEncrypt(newPassword.value);
    await authApi.resetPassword(email.value, code.value, encryptedPassword, captchaKey.value, getCachedKid());
    step.value = 'done';
    showSuccess(t('forgot.reset_success'));
  } catch (err: any) {
    showError(err.message || t('forgot.reset_failed'));
  } finally {
    isSubmitting.value = false;
  }
}

// 密码强度规则（4 条，每条对应 score +1 触发，4 档颜色：红/橙/黄/绿）
const STRENGTH_RULES = [
  { label: '至少 8 位字符', test: (p: string) => p.length >= 8 },
  { label: '包含大写字母 (A-Z)', test: (p: string) => /[A-Z]/.test(p) },
  { label: '包含数字 (0-9)', test: (p: string) => /[0-9]/.test(p) },
  { label: '包含特殊字符 (!@#$ 等)', test: (p: string) => /[^A-Za-z0-9]/.test(p) }
] as const;

/** 满足的规则数（0-4） */
const strengthScore = computed(() => STRENGTH_RULES.filter(r => r.test(newPassword.value)).length);

/** 强度文字 + 颜色（0=弱, 1/2=中, 3=强, 4=很强） */
const STRENGTH_LEVELS = [
  { label: '弱', color: '#f43f5e' },     // score=0
  { label: '弱', color: '#f43f5e' },     // score=1
  { label: '中', color: '#f59e0b' },     // score=2
  { label: '强', color: '#eab308' },     // score=3
  { label: '很强', color: '#10b981' }    // score=4
] as const;
const strengthColor = computed(() => STRENGTH_LEVELS[strengthScore.value].color);
const strengthLabel = computed(() => STRENGTH_LEVELS[strengthScore.value].label);

/** 悬浮窗显示状态（focus 或有内容时显示，blur 且内容空时隐藏） */
const showStrengthTip = ref(false);
</script>

<template>
  <!-- 步骤指示器 -->
  <div class="step-indicator">
    <div class="step-dot" :class="{ active: step === 'email', done: step !== 'email' }"></div>
    <div class="step-dot" :class="{ active: step === 'code', done: step === 'done' }"></div>
    <div class="step-dot" :class="{ active: step === 'done', done: step === 'done' }"></div>
  </div>

  <!-- 步骤 1：输入邮箱 -->
  <div v-if="step === 'email'" class="flex-1 flex flex-col justify-center space-y-4">
    <div class="relative">
      <input
        v-model="email"
        type="email"
        :placeholder="t('login.email_placeholder')"
        class="input-field pl-11"
        @keyup.enter="sendCode"
      />
      <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
        <Icons name="mail" :size="16" />
      </div>
    </div>
    <button @click="sendCode" class="auth-btn">{{ t('forgot.send_code') }}</button>
  </div>

  <!-- 步骤 2：输入验证码和新密码 -->
  <div v-else-if="step === 'code'" class="flex-1 flex flex-col justify-center space-y-4">
    <div class="relative">
      <input
        v-model="code"
        type="text"
        :placeholder="t('login.code_placeholder')"
        maxlength="6"
        class="input-field pl-11"
      />
      <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
        <Icons name="lock" :size="16" />
      </div>
      <button
        type="button"
        @click="sendCode"
        :disabled="isCountingDown"
        class="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1 text-xs font-bold text-primary hover:bg-primary/5 rounded-lg transition-colors disabled:opacity-50"
      >
        {{ isCountingDown ? `${countdown}s` : t('forgot.resend') }}
      </button>
    </div>

    <div class="relative">
      <input
        v-model="newPassword"
        :type="showPassword ? 'text' : 'password'"
        :placeholder="t('forgot.new_password')"
        class="input-field pl-11 pr-11"
      />
      <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
        <Icons name="lock" :size="16" />
      </div>
      <button
        type="button"
        @click="showPassword = !showPassword"
        :title="showPassword ? '隐藏密码' : '显示密码'"
        class="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
      >
        <svg v-if="showPassword" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
        <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      </button>
    </div>
    <!-- 密码强度条：4 段分段 + 文字标签 + 悬浮窗（? 提示） -->
    <div v-if="newPassword" class="space-y-1.5">
      <div class="flex gap-1">
        <div
          v-for="i in 4"
          :key="i"
          class="strength-bar flex-1 transition-colors"
          :class="i <= strengthScore ? 'active' : ''"
          :style="i <= strengthScore ? { background: strengthColor } : {}"
        ></div>
      </div>
      <div class="flex items-center justify-between text-xs">
        <span :style="{ color: strengthColor }" class="font-semibold">强度：{{ strengthLabel }}</span>
        <div class="relative">
          <button
            type="button"
            @mouseenter="showStrengthTip = true"
            @mouseleave="showStrengthTip = false"
            @focus="showStrengthTip = true"
            @blur="showStrengthTip = false"
            @click="showStrengthTip = !showStrengthTip"
            class="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[10px] font-bold flex items-center justify-center hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
            title="查看强度要求"
          >?</button>
          <!-- 悬浮窗：列出每条规则，✓ 已满足（绿）/ ✗ 未满足（灰） -->
          <div
            v-if="showStrengthTip"
            class="absolute right-0 top-6 z-10 w-64 p-3 rounded-lg bg-slate-800 dark:bg-slate-700 text-white text-xs shadow-xl"
          >
            <div class="font-semibold mb-2 text-slate-100">密码强度要求</div>
            <ul class="space-y-1.5">
              <li
                v-for="rule in STRENGTH_RULES"
                :key="rule.label"
                class="flex items-start gap-2"
                :class="rule.test(newPassword) ? 'text-emerald-400' : 'text-slate-400'"
              >
                <span class="inline-block w-3.5 flex-shrink-0 font-bold">
                  {{ rule.test(newPassword) ? '✓' : '✗' }}
                </span>
                <span>{{ rule.label }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <div class="relative">
      <input
        v-model="confirmPassword"
        :type="showPassword ? 'text' : 'password'"
        :placeholder="t('forgot.confirm_password')"
        class="input-field pl-11 pr-11"
        @keyup.enter="handleReset"
      />
      <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
        <Icons name="lock" :size="16" />
      </div>
      <button
        type="button"
        @click="showPassword = !showPassword"
        :title="showPassword ? '隐藏密码' : '显示密码'"
        class="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
      >
        <svg v-if="showPassword" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
        <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      </button>
    </div>

    <button @click="handleReset" :disabled="isSubmitting" class="auth-btn">
      <span v-if="isSubmitting" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
      {{ t('forgot.reset_password') }}
    </button>
  </div>

  <!-- 步骤 3：成功 -->
  <div v-else class="flex-1 flex flex-col items-center justify-center space-y-6">
    <div class="success-icon">
      <Icons name="check" :size="32" class="text-emerald-500" />
    </div>
    <p class="text-sm text-slate-500 dark:text-slate-400 text-center">
      {{ t('forgot.success_desc') }}
    </p>
  </div>

  <GraphicCaptcha
    :is-open="showCaptcha"
    :email="email"
    :send-email="true"
    type="reset_password"
    @close="showCaptcha = false"
    @success="onCaptchaSuccess"
  />
</template>
