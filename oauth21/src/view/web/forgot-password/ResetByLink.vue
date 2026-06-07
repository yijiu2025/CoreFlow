<script setup lang="ts">
/**
 * 方式二：邮件链接重置密码
 * 流程：输入邮箱 → 图形验证码 → 邮箱验证码 → 发送重置链接 → 邮箱点击链接 → 设置新密码
 */
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { authApi } from '@/api/auth'
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue'
import Icons from '@/components/common/Icons.vue'
import { useMessage } from '@/composables/useMessage'

const { t } = useI18n()
const route = useRoute()
const { error: showError, success: showSuccess } = useMessage()

// 步骤：verify(验证身份) → sent(已发送) → reset(重置密码) → done(完成)
const step = ref<'verify' | 'sent' | 'reset' | 'done'>('verify')
const email = ref('')
const code = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const resetToken = ref('')
const isSubmitting = ref(false)
const isCountingDown = ref(false)
const countdown = ref(60)

const showCaptcha = ref(false)
const captchaKey = ref('')
const captchaPurpose = ref<'send' | 'verify'>('send')

// 检查 URL 是否携带 token（从邮箱链接跳转过来）
onMounted(() => {
  const token = route.query.token as string
  if (token) {
    resetToken.value = token
    step.value = 'reset'
  }
})

/** 发送重置链接 */
function sendResetLink() {
  if (!email.value || !email.value.includes('@')) {
    showError(t('validation.email_invalid'))
    return
  }
  captchaPurpose.value = 'send'
  showCaptcha.value = true
}

/** 验证图形验证码后发送邮件 */
async function onCaptchaSuccess(data: { captchaKey: string }) {
  showCaptcha.value = false
  captchaKey.value = data.captchaKey

  if (captchaPurpose.value === 'send') {
    try {
      await authApi.sendResetLink(email.value, captchaKey.value)
      showSuccess(t('forgot.link_sent'))
      step.value = 'sent'
      startCountdown()
    } catch (err: any) {
      showError(err.message || t('forgot.send_failed'))
    }
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

/** 通过链接重置密码 */
async function handleReset() {
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
    await authApi.resetPasswordByLink(resetToken.value, newPassword.value)
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
  <!-- 步骤 1：验证身份 -->
  <div v-if="step === 'verify'" class="flex-1 flex flex-col justify-center space-y-4">
    <p class="text-xs text-slate-500 dark:text-slate-400 mb-2">
      {{ t('forgot.link_desc') }}
    </p>
    <div class="relative">
      <input
        v-model="email"
        type="email"
        :placeholder="t('login.email_placeholder')"
        class="input-field pl-11"
        @keyup.enter="sendResetLink"
      />
      <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
        <Icons name="mail" :size="16" />
      </div>
    </div>
    <button
      @click="sendResetLink"
      class="w-full h-12 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 active:scale-[0.98] transition-all"
    >
      {{ t('forgot.send_link') }}
    </button>
  </div>

  <!-- 步骤 2：已发送 -->
  <div v-else-if="step === 'sent'" class="flex-1 flex flex-col items-center justify-center space-y-6">
    <div class="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center">
      <Icons name="mail" :size="32" class="text-blue-500" />
    </div>
    <div class="text-center space-y-2">
      <p class="text-sm font-semibold dark:text-white">{{ t('forgot.link_sent_to') }}</p>
      <p class="text-sm text-primary font-bold">{{ email }}</p>
      <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">
        {{ t('forgot.link_hint') }}
      </p>
    </div>
    <button
      @click="sendResetLink"
      :disabled="isCountingDown"
      class="text-xs font-bold text-primary hover:underline disabled:opacity-50 disabled:no-underline"
    >
      {{ isCountingDown ? `${t('forgot.resend')} (${countdown}s)` : t('forgot.resend') }}
    </button>
  </div>

  <!-- 步骤 3：重置密码（从邮箱链接跳转） -->
  <div v-else-if="step === 'reset'" class="flex-1 flex flex-col justify-center space-y-4">
    <p class="text-xs text-slate-500 dark:text-slate-400 mb-2">
      {{ t('forgot.reset_desc') }}
    </p>
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

  <!-- 步骤 4：成功 -->
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
