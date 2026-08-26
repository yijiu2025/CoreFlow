<script setup lang="ts">
/**
 * 方式一：验证码重置密码
 * 流程：输入邮箱 → 图形验证码 → 邮箱验证码 → 设置新密码
 */
import { ref } from 'vue';
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

// 密码强度（简单版：长度+字符种类）
const strengthColor = ref('transparent');
function checkStrength() {
  const pwd = newPassword.value;
  if (!pwd) { strengthColor.value = 'transparent'; return; }
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const colors = ['#f43f5e', '#f59e0b', '#eab308', '#10b981'];
  strengthColor.value = colors[Math.min(score - 1, 3)] || '#f43f5e';
}
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
      <input v-model="newPassword" type="password" :placeholder="t('forgot.new_password')" class="input-field pl-11" @input="checkStrength" />
      <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
        <Icons name="lock" :size="16" />
      </div>
    </div>
    <!-- 密码强度条 -->
    <div v-if="newPassword" class="flex gap-1">
      <div class="strength-bar flex-1" :style="{ background: strengthColor }"></div>
    </div>

    <div class="relative">
      <input
        v-model="confirmPassword"
        type="password"
        :placeholder="t('forgot.confirm_password')"
        class="input-field pl-11"
        @keyup.enter="handleReset"
      />
      <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
        <Icons name="lock" :size="16" />
      </div>
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
    type="reset_password"
    @close="showCaptcha = false"
    @success="onCaptchaSuccess"
  />
</template>
