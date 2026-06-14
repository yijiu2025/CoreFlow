<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useForm } from 'vee-validate'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'
import { toTypedSchema } from '@vee-validate/zod'
import { ref, onMounted, computed, watch } from 'vue'
import { authApi } from '@/api/auth'
import AuthContainer from '@/components/common/AuthContainer.vue'
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue'
import MessageToast from '@/components/common/MessageToast.vue'
import Icons from '@/components/common/Icons.vue'
import { useMessage } from '@/composables/useMessage'

const authStore = useAuthStore()
const route = useRoute()
const { locale, t } = useI18n()
const { error: showError } = useMessage()

// 1. 解析所有标准化参数
const appConfig = computed(() => ({
  appName: (route.query.appName as string) || 'Enterprise SSO',
  lang: (route.query.lang as string) || 'zh_cn',
  styleType: ((route.query.styleType as string) || 'horizontal') as 'horizontal' | 'split' | 'vertical',
  qrCodeFirst: route.query.qrCodeFirst === 'true',
  isMobile: route.query.isMobile === 'true',
  notKeepLogin: route.query.notKeepLogin === 'true'
}))

// 根据参数切换状态
const showQR = ref(false)
const loginType = ref<'email' | 'pwd'>('email')
const isCountingDown = ref(false)
const countdown = ref(60)
const keepLogin = ref(true)

// 二维码状态
const qrKey = ref('')
const qrStatus = ref<'pending' | 'scanned' | 'confirmed' | 'expired'>('pending')
let qrPollTimer: ReturnType<typeof setInterval> | null = null

// 监听语言参数并切换 i18n
watch(() => appConfig.value.lang, (newLang) => {
  if (newLang) locale.value = newLang
}, { immediate: true })

// 校验 Schema
const loginSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('email'),
    email: z.string().email(t('validation.email_invalid')),
    code: z.string().min(4, t('validation.code_min'))
  }),
  z.object({
    type: z.literal('pwd'),
    username: z.string().min(2, t('validation.username_min')),
    password: z.string().min(6, t('validation.password_min'))
  })
])

const { values, handleSubmit, errors, defineField } = useForm({
  validationSchema: toTypedSchema(loginSchema),
  initialValues: { type: 'email', email: '', code: '', username: '', password: '' } as any
})

// 使用 defineField 对接 vee-validate，避免直接修改 readonly values 产生警告
const [type] = defineField('type')
const [email, emailProps] = defineField('email')
const [code, codeProps] = defineField('code')
const [username, usernameProps] = defineField('username')
const [password, passwordProps] = defineField('password')

const captchaKey = ref('')
const showCaptcha = ref(false)
const captchaPurpose = ref<'code' | 'login'>('login')

// 监听 loginType 切换，同步更新校验类型
watch(loginType, (newType) => {
  type.value = newType
})

const onCaptchaSuccess = (data: { captchaKey: string }) => {
  showCaptcha.value = false
  captchaKey.value = data.captchaKey

  if (captchaPurpose.value === 'code') {
    executeSendEmailCode()
  } else {
    executeLogin()
  }
}

const sendEmailCode = () => {
  if (!email.value || (errors.value as any).email) {
    showError(t('login.input_email_first'))
    return
  }
  captchaPurpose.value = 'code'
  showCaptcha.value = true
}

const executeSendEmailCode = () => {
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

const handleLogin = handleSubmit(async () => {
  if (loginType.value === 'pwd') {
    captchaPurpose.value = 'login'
    showCaptcha.value = true
  } else {
    executeLogin()
  }
})

const showConsent = ref(false)
const consentState = ref<any>(null)
const submittingConsent = ref(false)

const denyConsent = () => {
  showConsent.value = false
  consentState.value = null
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'SSO_DENIED', error: 'user_denied', description: t('login.consent_denied') }, '*')
  }
}

/**
 * 通知父窗口登录成功（提取共享逻辑）
 * session_token: 用于主页面换取 sid/sid_r Cookie（iframe 场景）
 */
function notifyParentLoginSuccess(res: any) {
  if (!(window.parent && window.parent !== window)) return
  const token = res.access_token || res.data?.accessToken
  const sessionToken = res.session_token || res.data?.session_token
  const user = res.user || res.data?.user || {}
  window.parent.postMessage({ type: 'SSO_SUCCESS', token, sessionToken, data: res }, '*')
  window.parent.postMessage({
    type: 'LOGIN_SUCCESS',
    token,
    sessionToken,
    user: { id: user.id, username: user.username, name: user.name, email: user.email, avatar: user.avatar },
    data: res
  }, '*')
}

const approveConsent = async () => {
  if (!consentState.value) return
  submittingConsent.value = true
  try {
    const res: any = await authApi.confirmConsent(consentState.value.consentKey)
    showConsent.value = false
    consentState.value = null
    notifyParentLoginSuccess(res)
  } catch (err: any) {
    showError(err.message || t('login.consent_failed'))
  } finally {
    submittingConsent.value = false
  }
}

const executeLogin = async () => {
  try {
    const loginPayload = {
      ...values,
      captchaKey: captchaKey.value,
      client_id: route.query.client_id || route.query.appName
    }
    const res = await authStore.login(loginPayload as any)
    if (res && res.action === 'consent') {
      consentState.value = res
      showConsent.value = true
    } else if (res && res.action === 'max_sessions') {
      // 设备数量超限，通知父窗口处理
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'MAX_SESSIONS',
          sessions: res.sessions,
          maxSessions: res.maxSessions
        }, '*')
      }
    } else {
      notifyParentLoginSuccess(res)
    }
  } catch (err: any) {
    showError(err.message || t('login.login_failed'))
  }
}

/** 生成真实二维码 */
async function generateQR() {
  try {
    const res: any = await authApi.generateQR()
    qrKey.value = res.qrKey
    qrStatus.value = 'pending'
    startQRPolling()
  } catch (err) {
    showError(t('login.qr_generate_failed'))
  }
}

/** 轮询二维码状态 */
function startQRPolling() {
  if (qrPollTimer) clearInterval(qrPollTimer)
  qrPollTimer = setInterval(async () => {
    if (!qrKey.value) return
    try {
      const res: any = await authApi.checkQRStatus(qrKey.value)
      qrStatus.value = res.status?.toLowerCase() || 'pending'
      if (qrStatus.value === 'confirmed' || qrStatus.value === 'expired') {
        clearInterval(qrPollTimer!)
        qrPollTimer = null
        if (qrStatus.value === 'expired') {
          showError(t('login.qr_expired'))
        }
      }
    } catch {
      // 轮询失败静默处理
    }
  }, 2000)
}

onMounted(() => {
  showQR.value = appConfig.value.qrCodeFirst
  keepLogin.value = !appConfig.value.notKeepLogin
  if (showQR.value) generateQR()
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'SSO_READY' }, '*')
  }
})
</script>

<template>
  <div class="mini-login-root w-full h-full">
    <AuthContainer
      v-model:showQR="showQR"
      :appName="appConfig.appName"
      :styleType="appConfig.styleType"
      :isMobile="appConfig.isMobile"
      :showQrSwitcher="!showConsent"
    >
      <!-- Header 插槽定制 -->
      <template #header>
        <h2 class="text-xl font-bold dark:text-white">
          {{ showConsent ? t('login.consent_title') : (showQR ? t('login.qr_title') : t('login.welcome')) }}
        </h2>
        <p class="text-xs text-slate-400 mt-1">
          {{ showConsent ? t('login.consent_desc', { app: consentState?.client_name || t('login.third_party') }) : (showQR ? t('login.qr_desc') : t('login.fill_credentials')) }}
        </p>
      </template>

      <!-- QR 插槽定制 -->
      <template #qr v-if="!showConsent">
        <div class="qr-container flex flex-col items-center justify-center flex-1 py-4">
          <div class="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 relative group overflow-hidden">
            <div class="absolute top-0 left-0 w-full h-[2px] bg-primary/60 blur-[2px] animate-scan z-10"></div>
            <img v-if="qrKey" :src="`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${qrKey}`" class="w-40 h-40 opacity-90 group-hover:opacity-100 transition-opacity" />
            <div v-else class="w-40 h-40 flex items-center justify-center">
              <div class="w-8 h-8 border-2 border-slate-200 border-t-primary rounded-full animate-spin"></div>
            </div>
          </div>
          <p class="mt-6 text-xs text-slate-500 text-center">
            {{ t('login.qr_scan_hint', { app: appConfig.appName }) }}
          </p>
          <p v-if="qrStatus === 'expired'" class="mt-2 text-xs text-rose-500 cursor-pointer" @click="generateQR">
            {{ t('login.qr_click_refresh') }}
          </p>
        </div>
      </template>

      <!-- 授权确认面板 -->
      <div v-if="showConsent" class="flex-1 flex flex-col justify-center py-2 space-y-5 w-full">
        <div class="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
              {{ (consentState?.client_name || 'A')[0].toUpperCase() }}
            </div>
            <div>
              <h3 class="text-sm font-bold dark:text-white">{{ consentState?.client_name || t('login.third_party') }}</h3>
              <p class="text-xs text-slate-400">{{ t('login.requesting_auth') }}</p>
            </div>
          </div>
          <hr class="border-slate-100 dark:border-slate-800" />
          <div class="space-y-2">
            <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">{{ t('login.requesting_permissions') }}</p>
            <ul class="space-y-1.5">
              <li class="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                <Icons name="check" :size="16" class="text-green-500 shrink-0 mt-0.5" />
                <span>{{ t('login.perm_profile') }}</span>
              </li>
              <li class="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                <Icons name="check" :size="16" class="text-green-500 shrink-0 mt-0.5" />
                <span>{{ t('login.perm_email', { email: consentState?.user?.email || t('login.confidential') }) }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div class="flex gap-3">
          <button type="button" @click="denyConsent" class="flex-1 h-11 border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            {{ t('login.deny') }}
          </button>
          <button type="button" @click="approveConsent" :disabled="submittingConsent" class="flex-1 h-11 bg-primary text-white rounded-xl font-bold text-xs shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
            <span v-if="submittingConsent" class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            {{ t('login.approve') }}
          </button>
        </div>
      </div>

      <!-- 默认插槽：登录表单 -->
      <form v-else @submit.prevent="handleLogin" class="form-container flex-1 flex flex-col justify-center">
        <div class="flex bg-slate-50 dark:bg-slate-800/50 p-1 rounded-xl mb-6 border border-slate-100 dark:border-slate-800">
          <button type="button" @click="loginType = 'email'" :class="loginType === 'email' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500'" class="flex-1 py-2 text-xs font-bold rounded-lg transition-all">{{ t('login.email_login') }}</button>
          <button type="button" @click="loginType = 'pwd'" :class="loginType === 'pwd' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500'" class="flex-1 py-2 text-xs font-bold rounded-lg transition-all">{{ t('login.password_login') }}</button>
        </div>

        <div class="space-y-4">
          <div class="relative">
            <input v-if="loginType === 'email'" v-model="email" v-bind="emailProps" type="email" :placeholder="t('login.email_placeholder')" autocomplete="username" class="input-field pl-11" />
            <input v-else v-model="username" v-bind="usernameProps" type="text" :placeholder="t('login.username_placeholder')" autocomplete="username" class="input-field pl-11" />
            <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <Icons v-if="loginType === 'email'" name="mail" :size="16" />
              <Icons v-else name="user" :size="16" />
            </div>
          </div>

          <div class="flex gap-2 relative">
            <input v-if="loginType === 'email'" v-model="code" v-bind="codeProps" type="text" :placeholder="t('login.code_placeholder')" autocomplete="one-time-code" class="input-field pl-11 flex-1" />
            <input v-else v-model="password" v-bind="passwordProps" type="password" :placeholder="t('login.password_placeholder')" autocomplete="current-password" class="input-field pl-11 flex-1" />
            <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <Icons name="lock" :size="16" />
            </div>
            <button type="button"
                    v-if="loginType === 'email'"
                    @click="sendEmailCode"
                    :disabled="isCountingDown"
                    class="px-4 text-xs font-bold text-primary hover:bg-primary/5 rounded-xl transition-colors disabled:opacity-50">
              {{ isCountingDown ? `${countdown}s` : t('login.get_code') }}
            </button>
          </div>

          <button type="submit" :disabled="authStore.loading" class="w-full h-12 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 active:scale-[0.98] transition-all mt-4 flex items-center justify-center gap-2">
            <span v-if="authStore.loading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            {{ authStore.loading ? t('login.logging_in') : t('login.submit') }}
          </button>
        </div>
      </form>

      <!-- Footer 插槽定制 -->
      <template #footer v-if="!showConsent">
        <div class="flex items-center justify-between">
          <label class="flex items-center gap-2 cursor-pointer group" @click.prevent="keepLogin = !keepLogin">
            <input type="checkbox" v-model="keepLogin" class="w-3.5 h-3.5 rounded border-slate-300 text-primary focus:ring-primary transition-all" />
            <span class="text-[11px] text-slate-400 group-hover:text-slate-500">{{ t('login.keep_login') }}</span>
          </label>
          <div class="flex items-center gap-4">
            <router-link :to="{ path: '/forgot-password', query: { ...$route.query } }" class="text-[11px] text-slate-400 hover:text-primary transition-colors">
              {{ t('login.forgot_password') }}
            </router-link>
            <router-link :to="{ path: '/register', query: { ...$route.query, from: 'mini' } }"
               class="text-[11px] text-primary font-bold hover:underline underline-offset-4">
              {{ t('login.register_now') }}
            </router-link>
          </div>
        </div>
      </template>
    </AuthContainer>

    <!-- Captcha Component -->
    <GraphicCaptcha
      :is-open="showCaptcha"
      :email="email"
      type="login"
      @close="showCaptcha = false"
      @success="onCaptchaSuccess"
    />

    <!-- Toast 消息 -->
    <MessageToast />
  </div>
</template>

<style scoped>
.input-field {
  width: 100%;
  height: 48px;
  padding-left: 44px;
  padding-right: 16px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--input));
  border-radius: 12px;
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
  color: hsl(var(--foreground));
}

.input-field:focus {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 3px hsl(var(--ring) / 0.1);
}
</style>
