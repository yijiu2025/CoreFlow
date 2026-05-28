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

const authStore = useAuthStore()
const route = useRoute()
const { locale } = useI18n()

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

// 监听语言参数并切换 i18n
watch(() => appConfig.value.lang, (newLang) => {
  if (newLang) locale.value = newLang
}, { immediate: true })

// 校验 Schema
const loginSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('email'),
    email: z.string().email('请输入有效的邮箱'),
    code: z.string().min(4, '请输入验证码')
  }),
  z.object({
    type: z.literal('pwd'),
    username: z.string().min(2, '请输入账号/邮箱'),
    password: z.string().min(6, '密码过短')
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
    alert('请先输入有效的邮箱')
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
    executeLogin() // Email code login already verified on send code
  }
})

const showConsent = ref(false)
const consentState = ref<any>(null)
const submittingConsent = ref(false)

const denyConsent = () => {
  showConsent.value = false
  consentState.value = null
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'SSO_DENIED', error: 'user_denied', description: '用户拒绝了授权申请' }, '*')
  }
}

const approveConsent = async () => {
  if (!consentState.value) return
  submittingConsent.value = true
  try {
    const res: any = await authApi.confirmConsent(consentState.value.consentKey)
    showConsent.value = false
    consentState.value = null
    const token = res.access_token || res.data?.accessToken
    if (token) {
      let userInfo: any = null
      try {
        userInfo = await authApi.getUserInfo()
      } catch (err) {
        console.error('获取用户信息失败:', err)
      }
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'SSO_SUCCESS', token, data: res }, '*')
        window.parent.postMessage({
          type: 'LOGIN_SUCCESS',
          token,
          user: {
            id: userInfo?.sub || res.user?.id,
            username: userInfo?.preferred_username || userInfo?.name || res.user?.username,
            name: userInfo?.name || res.user?.name,
            email: userInfo?.email || res.user?.email,
            avatar: userInfo?.avatar || res.user?.avatar
          },
          data: res
        }, '*')
      }
    }
  } catch (err: any) {
    alert(err.message || '确认授权失败')
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
    } else {
      const token = res.access_token || res.data?.accessToken
      if (token) {
        let userInfo: any = null
        try {
          userInfo = await authApi.getUserInfo()
        } catch (err) {
          console.error('获取用户信息失败:', err)
        }
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'SSO_SUCCESS', token, data: res }, '*')
          window.parent.postMessage({
            type: 'LOGIN_SUCCESS',
            token,
            user: {
              id: userInfo?.sub || res.user?.id,
              username: userInfo?.preferred_username || userInfo?.name || res.user?.username,
              name: userInfo?.name || res.user?.name,
              email: userInfo?.email || res.user?.email,
              avatar: userInfo?.avatar || res.user?.avatar
            },
            data: res
          }, '*')
        }
      }
    }
  } catch (err: any) {
    console.error('Login Fail:', err.message)
    alert(err.message || '登录失败')
  }
}

onMounted(() => {
  // 根据参数决定初始显示模式
  showQR.value = appConfig.value.qrCodeFirst
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
          {{ showConsent ? '授权确认' : (showQR ? '扫码登录' : '欢迎回来') }}
        </h2>
        <p class="text-xs text-slate-400 mt-1">
          {{ showConsent ? `应用 ${consentState?.client_name || '三方系统'} 申请获取您的账号信息` : (showQR ? '使用移动端 App 扫码' : '请填写您的登录凭据') }}
        </p>
      </template>

      <!-- QR 插槽定制 -->
      <template #qr v-if="!showConsent">
        <div class="qr-container flex flex-col items-center justify-center flex-1 py-4">
          <div class="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 relative group overflow-hidden">
            <div class="absolute top-0 left-0 w-full h-[2px] bg-primary/60 blur-[2px] animate-scan z-10"></div>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=mini-login" class="w-40 h-40 opacity-90 group-hover:opacity-100 transition-opacity" />
          </div>
          <p class="mt-6 text-xs text-slate-500 text-center">
            打开 <span class="font-medium text-slate-700 dark:text-slate-300">{{ appConfig.appName }}</span> 扫一扫
          </p>
        </div>
      </template>

      <!-- 授权确认面板 -->
      <div v-if="showConsent" class="flex-1 flex flex-col justify-center py-2 space-y-5 w-full">
        <div class="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
              {{ (consentState?.client_name || 'App')[0].toUpperCase() }}
            </div>
            <div>
              <h3 class="text-sm font-bold dark:text-white">{{ consentState?.client_name || '第三方应用' }}</h3>
              <p class="text-xs text-slate-400">正在申请第三方登录授权</p>
            </div>
          </div>
          <hr class="border-slate-100 dark:border-slate-800" />
          <div class="space-y-2">
            <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">申请获取以下权限：</p>
            <ul class="space-y-1.5">
              <li class="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                <svg class="w-4 h-4 text-green-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>获取您的公开个人信息 (昵称、头像等)</span>
              </li>
              <li class="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                <svg class="w-4 h-4 text-green-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>获取您的电子邮箱地址 ({{ consentState?.user?.email || '保密' }})</span>
              </li>
            </ul>
          </div>
        </div>

        <div class="flex gap-3">
          <button type="button" @click="denyConsent" class="flex-1 h-11 border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            拒绝
          </button>
          <button type="button" @click="approveConsent" :disabled="submittingConsent" class="flex-1 h-11 bg-primary text-white rounded-xl font-bold text-xs shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
            <span v-if="submittingConsent" class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            同意授权
          </button>
        </div>
      </div>

      <!-- 默认插槽：登录表单 -->
      <form v-else @submit.prevent="handleLogin" class="form-container flex-1 flex flex-col justify-center">
        <div class="flex bg-slate-50 dark:bg-slate-800/50 p-1 rounded-xl mb-6 border border-slate-100 dark:border-slate-800">
          <button type="button" @click="loginType = 'email'" :class="loginType === 'email' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500'" class="flex-1 py-2 text-xs font-bold rounded-lg transition-all">邮箱登录</button>
          <button type="button" @click="loginType = 'pwd'" :class="loginType === 'pwd' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500'" class="flex-1 py-2 text-xs font-bold rounded-lg transition-all">密码登录</button>
        </div>

        <div class="space-y-4">
          <div class="relative">
            <input v-if="loginType === 'email'" v-model="email" v-bind="emailProps" type="email" placeholder="邮箱地址" autocomplete="username" class="input-field pl-11" />
            <input v-else v-model="username" v-bind="usernameProps" type="text" placeholder="账号 / 邮箱" autocomplete="username" class="input-field pl-11" />
            <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <svg v-if="loginType === 'email'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </div>
          </div>
          
          <div class="flex gap-2 relative">
            <input v-if="loginType === 'email'" v-model="code" v-bind="codeProps" type="text" placeholder="验证码" autocomplete="one-time-code" class="input-field pl-11 flex-1" />
            <input v-else v-model="password" v-bind="passwordProps" type="password" placeholder="密码" autocomplete="current-password" class="input-field pl-11 flex-1" />
            <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            </div>
            <button type="button"
                    v-if="loginType === 'email'" 
                    @click="sendEmailCode" 
                    :disabled="isCountingDown"
                    class="px-4 text-xs font-bold text-primary hover:bg-primary/5 rounded-xl transition-colors disabled:opacity-50">
              {{ isCountingDown ? `${countdown}s` : '获取验证码' }}
            </button>
          </div>

          <button type="submit" :disabled="authStore.loading" class="w-full h-12 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 active:scale-[0.98] transition-all mt-4 flex items-center justify-center gap-2">
            <span v-if="authStore.loading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            {{ authStore.loading ? '正在登录' : '立即登录' }}
          </button>
        </div>
      </form>

      <!-- Footer 插槽定制 -->
      <template #footer v-if="!showConsent">
        <div class="flex items-center justify-between">
          <label class="flex items-center gap-2 cursor-pointer group">
            <input type="checkbox" :checked="!appConfig.notKeepLogin" class="w-3.5 h-3.5 rounded border-slate-300 text-primary focus:ring-primary transition-all" />
            <span class="text-[11px] text-slate-400 group-hover:text-slate-500">保持登录</span>
          </label>
          <div class="flex items-center gap-4">
            <a href="#" class="text-[11px] text-slate-400 hover:text-primary transition-colors">忘记密码?</a>
            <router-link :to="{ path: '/register', query: { ...$route.query, from: 'mini' } }" 
               class="text-[11px] text-primary font-bold hover:underline underline-offset-4">
               立即注册
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
  </div>
</template>

<style scoped>
.input-field { 
  width: 100%; 
  height: 48px; 
  padding-left: 44px;
  padding-right: 16px; 
  background: #f8fafc; 
  border: 1px solid #f1f5f9; 
  border-radius: 12px; 
  font-size: 14px; 
  outline: none; 
  transition: all 0.2s; 
}

.dark .input-field { 
  background: #1e293b; 
  border-color: #334155; 
  color: white; 
}

.input-field:focus { 
  border-color: hsl(var(--primary));
  background: white; 
  box-shadow: 0 0 0 4px hsl(var(--primary) / 0.05);
}

.dark .input-field:focus { 
  background: #0f172a; 
  border-color: hsl(var(--primary));
}
</style>
