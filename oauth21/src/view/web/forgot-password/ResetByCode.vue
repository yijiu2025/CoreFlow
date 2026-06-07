<script setup lang="ts">
/**
 * 方式一：验证码重置密码
 * 流程：输入邮箱 → 图形验证码 → 邮箱验证码 → 设置新密码
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { authApi } from '@/api/auth'
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue'
import Icons from '@/components/common/Icons.vue'
import { useMessage } from '@/composables/useMessage'

const { t } = useI18n()
const { error: showError, success: showSuccess } = useMessage()

const email = ref('')
const code = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const step = ref<'email' | 'code' | 'done'>('email')
const isSubmitting = ref(false)
const isCountingDown = ref(false)
const countdown = ref(60)

const showCaptcha = ref(false)
const captchaKey = ref('')

function sendCode() {
  if (!email.value || !email.value.includes('@')) {
    showError(t('validation.email_invalid'))
    return
  }
  showCaptcha.value = true
}

async function onCaptchaSuccess(data: { captchaKey: string }) {
  showCaptcha.value = false
  captchaKey.value = data.captchaKey

  try {
    await authApi.sendEmailCode(email.value, captchaKey.value)
    showSuccess(t('forgot.code_sent'))
    step.value = 'code'
    startCountdown()
  } catch (err: any) {
    showError(err.message || t('forgot.send_failed'))
  }
}

function startCountdown() {
  isCountingDown.value = true
  countdown.value = 60
  const timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(timer)
      isCountingDown.value = false
    }
  }, 1000)
}

async function handleReset() {
  if (!code.value || code.value.length < 4) {
    showError(t('forgot.code_required'))
    return
  }
  if (!newPassword.value || newPassword.value.length < 6) {
    showError(t('forgot.password_min'))
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    showError(t('forgot.password_mismatch'))
    return
  }

  isSubmitting.value = true
  try {
    await authApi.resetPassword(email.value, code.value, newPassword.value)
    step.value = 'done'
    showSuccess(t('forgot.reset_success'))
  } catch (err: any) {
    showError(err.message || t('forgot.reset_failed'))
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
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
    <button
      @click="sendCode"
      class="w-full h-12 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 active:scale-[0.98] transition-all"
    >
      {{ t('forgot.send_code') }}
    </button>
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
      <input v-model="newPassword" type="password" :placeholder="t('forgot.new_password')" class="input-field pl-11" />
      <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
        <Icons name="lock" :size="16" />
      </div>
    </div>

    <div class="relative">
      <input v-model="confirmPassword" type="password" :placeholder="t('forgot.confirm_password')" class="input-field pl-11" @keyup.enter="handleReset" />
      <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
        <Icons name="lock" :size="16" />
      </div>
    </div>

    <button
      @click="handleReset"
      :disabled="isSubmitting"
      class="w-full h-12 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
    >
      <span v-if="isSubmitting" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
      {{ t('forgot.reset_password') }}
    </button>
  </div>

  <!-- 步骤 3：成功 -->
  <div v-else class="flex-1 flex flex-col items-center justify-center space-y-6">
    <div class="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
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
