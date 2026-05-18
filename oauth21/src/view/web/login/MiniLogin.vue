<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { useForm } from 'vee-validate'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import * as zod from 'zod'
import { toTypedSchema } from '@vee-validate/zod'
import { ref, reactive, onMounted, computed, watch } from 'vue'
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue'

const authStore = useAuthStore()
const themeStore = useThemeStore()
const route = useRoute()
const { locale } = useI18n()

// 1. 解析所有标准化参数
const appConfig = computed(() => ({
  appName: (route.query.appName as string) || 'Enterprise SSO',
  lang: (route.query.lang as string) || 'zh_cn',
  styleType: (route.query.styleType as string) || 'horizontal', // 默认为 horizontal 以适应 854x484
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
const loginSchema = zod.discriminatedUnion('type', [
  zod.object({
    type: zod.literal('email'),
    email: zod.string().email('请输入有效的邮箱'),
    code: zod.string().min(4, '请输入验证码')
  }),
  zod.object({
    type: zod.literal('pwd'),
    username: zod.string().min(2, '请输入账号/邮箱'),
    password: zod.string().min(6, '密码过短')
  })
])

const { values, handleSubmit, errors } = useForm({
  validationSchema: toTypedSchema(loginSchema),
  initialValues: { type: 'email', email: '', code: '', username: '', password: '' } as any
})

const showCaptcha = ref(false)
const captchaPurpose = ref<'code' | 'login'>('login')

const onCaptchaSuccess = (data: { captchaKey: string }) => {
  showCaptcha.value = false
  values.captchaKey = data.captchaKey
  
  if (captchaPurpose.value === 'code') {
    executeSendEmailCode()
  } else {
    executeLogin()
  }
}

const sendEmailCode = () => {
  if (!values.email || (errors.value as any).email) {
    alert('请先输入有效的邮箱')
    return
  }
  captchaPurpose.value = 'code'
  showCaptcha.value = true
}

const executeSendEmailCode = async () => {
  try {
    await authApi.sendEmailCode(values.email, values.captchaKey)
    isCountingDown.value = true
    countdown.value = 60
    const timer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) {
        clearInterval(timer)
        isCountingDown.value = false
      }
    }, 1000)
  } catch (err: any) {
    alert(err.message || '发送失败')
  }
}

const handleLogin = handleSubmit(async () => {
  if (loginType.value === 'pwd') {
    captchaPurpose.value = 'login'
    showCaptcha.value = true
  } else {
    executeLogin() // Email code login already verified on send code
  }
})

const executeLogin = async () => {
  try {
    const res = await authStore.login(values as any)
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'SSO_SUCCESS', token: res.access_token, data: res }, '*')
    }
  } catch (err: any) {
    console.error('Login Fail:', err.message)
  }
}

onMounted(() => {
  // 根据参数决定初始显示模式
  showQR.value = appConfig.value.qrCodeFirst
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'SSO_READY' }, '*')
  }
})

const registerUrl = computed(() => {
  const params = new URLSearchParams()
  params.append('from', 'mini')
  Object.entries(route.query).forEach(([key, value]) => {
    if (value) params.append(key, value.toString())
  })
  return `/register?${params.toString()}`
})
</script>

<template>
  <div class="login-viewport" :class="{ 'dark': themeStore.isDark, 'is-mobile': appConfig.isMobile }">
    <div 
      class="mini-box bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden flex"
      :class="[appConfig.styleType]"
    >
      <!-- Left Side: Branding / Visual (Only for horizontal style) -->
      <div v-if="appConfig.styleType === 'horizontal' && !appConfig.isMobile" 
           class="w-[400px] bg-slate-50 dark:bg-slate-800/50 border-r border-slate-100 dark:border-slate-800 flex flex-col justify-center p-12 relative overflow-hidden">
        <div class="relative z-10">
          <div class="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white mb-8 shadow-lg shadow-primary/20">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="3">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h1 class="text-3xl font-bold dark:text-white mb-4 tracking-tight">{{ appConfig.appName }}</h1>
          <p class="text-slate-500 dark:text-slate-400 text-sm leading-relaxed max-w-[240px]">
            安全、快速、统一的身份认证中心。
            为您的企业应用提供坚实的防护屏障。
          </p>
        </div>
        
        <!-- Decoration -->
        <div class="absolute -bottom-20 -left-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl"></div>
        <div class="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl"></div>
        
        <div class="absolute bottom-8 left-12 flex gap-4">
          <div class="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700"></div>
          <div class="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700"></div>
          <div class="w-1.5 h-1.5 rounded-full bg-primary/40"></div>
        </div>
      </div>

      <!-- Right Side: Form Content -->
      <div class="flex-1 flex flex-col p-10 pr-16 relative">
        <!-- Top Switcher -->
        <div class="flex items-center justify-between mb-8">
          <div>
            <h2 class="text-xl font-bold dark:text-white">{{ showQR ? '扫码登录' : '欢迎回来' }}</h2>
            <p class="text-xs text-slate-400 mt-1">{{ showQR ? '使用移动端 App 扫码' : '请填写您的登录凭据' }}</p>
          </div>
          
          <button @click="showQR = !showQR" class="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-primary transition-all border border-slate-100 dark:border-slate-700">
            <svg v-if="!showQR" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </button>
        </div>

        <transition name="fade" mode="out-in">
          <!-- 扫码模式 -->
          <div v-if="showQR" class="qr-container flex flex-col items-center justify-center flex-1 py-4">
            <div class="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 relative group">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=mini-login" class="w-40 h-40 opacity-90 group-hover:opacity-100 transition-opacity" />
              <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                   <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                </div>
              </div>
            </div>
            <p class="mt-6 text-xs text-slate-500 text-center">
              打开 <span class="font-medium text-slate-700 dark:text-slate-300">{{ appConfig.appName }}</span> 扫一扫
            </p>
          </div>

          <!-- 表单模式 -->
          <div v-else class="form-container flex-1 flex flex-col justify-center">
            <div class="flex bg-slate-50 dark:bg-slate-800/50 p-1 rounded-xl mb-6 border border-slate-100 dark:border-slate-800">
              <button @click="loginType = 'email'" :class="loginType === 'email' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500'" class="flex-1 py-2 text-xs font-bold rounded-lg transition-all">邮箱登录</button>
              <button @click="loginType = 'pwd'" :class="loginType === 'pwd' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500'" class="flex-1 py-2 text-xs font-bold rounded-lg transition-all">密码登录</button>
            </div>

            <div class="space-y-4">
              <div class="relative">
                <input v-if="loginType === 'email'" v-model="values.email" type="email" placeholder="邮箱地址" class="input-field pl-11" />
                <input v-else v-model="values.username" type="text" placeholder="账号 / 邮箱" class="input-field pl-11" />
                <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg v-if="loginType === 'email'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                  <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                </div>
              </div>
              
              <div class="flex gap-2 relative">
                <input v-if="loginType === 'email'" v-model="values.code" type="text" placeholder="验证码" class="input-field pl-11 flex-1" />
                <input v-else v-model="values.password" type="password" placeholder="密码" class="input-field pl-11 flex-1" />
                <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                </div>
                <button v-if="loginType === 'email'" 
                        @click="sendEmailCode" 
                        :disabled="isCountingDown"
                        class="px-4 text-xs font-bold text-primary hover:bg-primary/5 rounded-xl transition-colors disabled:opacity-50">
                  {{ isCountingDown ? `${countdown}s` : '获取验证码' }}
                </button>
              </div>

              <button @click="handleLogin" :disabled="authStore.loading" class="w-full h-12 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 active:scale-[0.98] transition-all mt-4 flex items-center justify-center gap-2">
                <span v-if="authStore.loading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                {{ authStore.loading ? '正在登录' : '立即登录' }}
              </button>
            </div>
          </div>
        </transition>

        <div class="mt-8 flex items-center justify-between">
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
      </div>
    </div>

    <!-- Captcha Component -->
    <GraphicCaptcha 
      :is-open="showCaptcha" 
      @close="showCaptcha = false" 
      @success="onCaptchaSuccess" 
    />
  </div>
</template>

<style scoped>
.login-viewport {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: transparent;
}

.mini-box { 
  width: 854px; 
  height: 484px; 
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;
}

/* 垂直模式适配 (如果参数依然指定 vertical) */
.mini-box.vertical {
  width: 380px;
  height: auto;
  min-height: 480px;
}

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

/* 扫码/表单切换动画 */
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(10px); }

/* 移动端适配样式 */
.is-mobile .mini-box { 
  width: 100vw !important; 
  height: 100vh !important; 
  border-radius: 0; 
  border: none; 
}
</style>

