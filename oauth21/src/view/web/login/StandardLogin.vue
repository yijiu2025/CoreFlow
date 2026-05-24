<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { useForm } from 'vee-validate'
import { z } from 'zod'
import { toTypedSchema } from '@vee-validate/zod'
import { ref, onMounted, computed } from 'vue'
import { authApi } from '@/api/auth'

const authStore = useAuthStore()
const themeStore = useThemeStore()

const authorizeState = ref<any>(null)
const isInvalidAccess = ref(false)
const consentActionUrl = ref(((import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3000') + '/authorize/consent')

onMounted(async () => {
  const searchParams = new URLSearchParams(window.location.search)
  const query = Object.fromEntries(searchParams.entries())
  
  // 核心风控：如果不是合法的应用跳转（缺失必要的特征字符），直接拒绝提供服务
  if (!query.appName || !query.appEntrance) {
    isInvalidAccess.value = true
    return
  }

  // 根据 appName 自动适配 client_id (如果后端仍需 client_id 校验)
  // 如果后端已经改造为接收 appName，这里直接传 query 即可
  const authQuery = {
    ...query,
    client_id: query.client_id || query.appName // 兼容处理
  }
  
  try {
      const res: any = await authApi.checkAuthorize(authQuery)
      if (res && res.action) {
        authorizeState.value = res
      }
    } catch (e) {
      console.warn('OAuth check failed', e)
    }
})

// 登录模式
const loginType = ref<'sms' | 'pwd'>('sms')

// 表单校验架构 (Zod)
const loginSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('sms'),
    phone: z.string().regex(/^1[3-9]\d{9}$/, '请输入正确的手机号'),
    code: z.string().min(4, '验证码至少4位')
  }),
  z.object({
    type: z.literal('pwd'),
    username: z.string().min(2, '账号至少2位'),
    password: z.string().min(6, '密码至少6位')
  })
])

const { values, errors, defineField, handleSubmit } = useForm({
  validationSchema: toTypedSchema(loginSchema),
  initialValues: {
    type: 'sms' as const,
    phone: '',
    code: '',
    username: '',
    password: ''
  }
})

// 使用 defineField 进行双向绑定与校验
const [phone, phoneProps] = defineField('phone')
const [code, codeProps] = defineField('code')
const [username, usernameProps] = defineField('username')
const [password, passwordProps] = defineField('password')

const agreed = ref(false)

// 倒计时逻辑
const isCountingDown = ref(false)
const countdown = ref(60)
let timer: any = null

const startCountdown = () => {
  if (!values.phone || errors.value.phone) {
    // 实际项目中应使用 Toast 组件
    alert(errors.value.phone || '请先输入有效的手机号')
    return
  }
  isCountingDown.value = true
  countdown.value = 60
  timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(timer)
      isCountingDown.value = false
    }
  }, 1000)
}

// 提交处理
const handleLogin = handleSubmit(async (data) => {
  if (!agreed.value) {
    alert('请先阅读并勾选同意相关协议')
    return
  }

  try {
    const res: any = await authStore.login(data as any)
    console.log('Login success:', res)
    
    const token = res.access_token || res.data?.accessToken
    // SSO 消息推送
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ 
        type: 'SSO_SUCCESS', 
        token: token,
        id_token: res.id_token,
        data: res 
      }, '*')
    } else {
      alert('登录成功！')
    }
  } catch (err: any) {
    alert(err.message || '登录失败')
  }
})

const closeModal = () => {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'SSO_CLOSE' }, '*')
  }
}

const isEmbedded = computed(() => {
  try {
    return window.self !== window.top
  } catch (e) {
    return true
  }
})
</script>

<template>
  <div v-if="isInvalidAccess" class="flex flex-col items-center justify-center text-center p-8 mt-20">
    <div class="w-20 h-20 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-[24px] flex items-center justify-center mb-6 shadow-sm">
      <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
    </div>
    <h2 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">非法请求</h2>
    <p class="text-sm text-slate-500 dark:text-slate-400">缺少必要的应用特征参数，拒绝提供授权服务。</p>
  </div>

  <div v-else class="relative group">
    <!-- Decorative Blobs (Animated) -->
    <div class="absolute -top-24 -left-24 w-72 h-72 bg-primary/30 rounded-full blur-3xl animate-pulse"></div>
    <div class="absolute -bottom-24 -right-24 w-64 h-64 bg-fuchsia-500/20 rounded-full blur-3xl animate-pulse delay-700"></div>

    <div class="relative w-[856px] h-[480px] glass-effect rounded-[32px] overflow-hidden flex shadow-2xl shadow-primary/10 border-white/40 dark:border-slate-700/40">

      <!-- Left Panel: Form -->
      <div class="flex-1 p-12 flex flex-col relative">

        <!-- Account Selection (If already logged in via Cookie) -->
        <template v-if="authorizeState?.action === 'consent'">
          <div class="flex-1 flex flex-col items-center justify-center text-center">
            <div class="w-24 h-24 bg-gradient-to-tr from-primary to-fuchsia-500 rounded-full flex items-center justify-center text-white text-4xl font-bold shadow-lg shadow-primary/20 mb-6 overflow-hidden">
              <img v-if="authorizeState.user?.avatar" :src="authorizeState.user.avatar" class="w-full h-full object-cover" />
              <span v-else>{{ authorizeState.user?.name?.charAt(0).toUpperCase() }}</span>
            </div>
            
            <h2 class="text-2xl font-bold text-slate-900 dark:text-white mb-1">{{ authorizeState.user?.name }}</h2>
            <p class="text-sm text-slate-500 dark:text-slate-400 mb-10">{{ authorizeState.user?.email || '已在其他应用登录' }}</p>

            <form method="POST" :action="consentActionUrl" target="_top" class="w-full">
              <input type="hidden" name="sessionId" :value="authorizeState.sessionId" />
              <input type="hidden" name="user_id" :value="authorizeState.user_id" />
              <input type="hidden" name="action" value="approve" />
              <button 
                type="submit"
                class="w-full h-12 bg-gradient-to-r from-primary to-fuchsia-600 hover:from-primary/90 hover:to-fuchsia-600/90 text-white rounded-xl font-bold shadow-lg shadow-primary/25 active:scale-[0.98] transition-all"
              >
                继续作为 {{ authorizeState.user?.name }} 登录
              </button>
            </form>
            
            <button @click="authorizeState.action = 'login'" class="mt-6 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-primary transition-colors">
              使用其他账号登录
            </button>
          </div>
        </template>

        <!-- Normal Login Form -->
        <template v-else>
          <!-- Brand -->
          <div class="flex items-center gap-4 mb-10">
            <div class="w-11 h-11 rounded-xl bg-gradient-to-tr from-primary to-fuchsia-500 flex items-center justify-center text-white shadow-lg shadow-primary/20">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            </div>
            <div>
              <h2 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-outfit">欢迎登录</h2>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Enterprise Identity System</p>
            </div>
          </div>

        <!-- Tab Switcher -->
        <div class="relative flex p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl mb-8">
          <div 
            class="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white dark:bg-slate-700 rounded-lg shadow-sm transition-transform duration-300 ease-out"
            :style="{ transform: loginType === 'sms' ? 'translateX(0)' : 'translateX(100%)' }"
          ></div>
          <button 
            @click="loginType = 'sms'; values.type = 'sms'"
            class="flex-1 relative z-10 py-2 text-sm font-semibold transition-colors duration-300"
            :class="loginType === 'sms' ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'"
          >
            短信登录
          </button>
          <button 
            @click="loginType = 'pwd'; values.type = 'pwd'"
            class="flex-1 relative z-10 py-2 text-sm font-semibold transition-colors duration-300"
            :class="loginType === 'pwd' ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'"
          >
            密码登录
          </button>
        </div>

        <!-- Form Fields -->
        <form @submit.prevent="handleLogin" class="flex flex-col flex-1">
          <div class="flex-1 space-y-5">
            <transition name="fade-slide" mode="out-in">
              <!-- SMS Login -->
              <div v-if="loginType === 'sms'" key="sms" class="space-y-4">
                <div class="group relative">
                  <div class="flex h-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 items-center gap-3 transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary">
                    <span class="text-sm font-bold text-slate-900 dark:text-slate-200">+86</span>
                    <div class="w-[1px] h-4 bg-slate-200 dark:bg-slate-700"></div>
                    <input 
                      v-model="phone"
                      v-bind="phoneProps"
                      type="tel" 
                      placeholder="请输入手机号"
                      autocomplete="username tel"
                      class="flex-1 bg-transparent border-none outline-none text-sm"
                    />
                  </div>
                  <span v-if="errors.phone" class="absolute -bottom-5 left-1 text-[10px] text-destructive">{{ errors.phone }}</span>
                </div>

                <div class="group relative">
                  <div class="flex h-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 items-center gap-3 transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary">
                    <input 
                      v-model="code"
                      v-bind="codeProps"
                      type="text" 
                      placeholder="请输入验证码"
                      autocomplete="one-time-code"
                      class="flex-1 bg-transparent border-none outline-none text-sm"
                    />
                    <button 
                      type="button"
                      @click="startCountdown"
                      :disabled="isCountingDown"
                      class="text-xs font-bold text-primary hover:text-primary/80 disabled:text-slate-400 transition-colors pl-4 border-l border-slate-200 dark:border-slate-800"
                    >
                      {{ isCountingDown ? `${countdown}s` : '获取验证码' }}
                    </button>
                  </div>
                  <span v-if="errors.code" class="absolute -bottom-5 left-1 text-[10px] text-destructive">{{ errors.code }}</span>
                </div>
              </div>

              <!-- Password Login -->
              <div v-else key="pwd" class="space-y-4">
                <div class="group relative">
                  <div class="flex h-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 items-center gap-3 transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary">
                    <input 
                      v-model="username"
                      v-bind="usernameProps"
                      type="text" 
                      placeholder="账号 / 邮箱 / 手机号"
                      autocomplete="username"
                      class="flex-1 bg-transparent border-none outline-none text-sm"
                    />
                  </div>
                  <span v-if="errors.username" class="absolute -bottom-5 left-1 text-[10px] text-destructive">{{ errors.username }}</span>
                </div>

                <div class="group relative">
                  <div class="flex h-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 items-center gap-3 transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary">
                    <input 
                      v-model="password"
                      v-bind="passwordProps"
                      type="password" 
                      placeholder="请输入密码"
                      autocomplete="current-password"
                      class="flex-1 bg-transparent border-none outline-none text-sm"
                    />
                  </div>
                  <span v-if="errors.password" class="absolute -bottom-5 left-1 text-[10px] text-destructive">{{ errors.password }}</span>
                </div>
              </div>
            </transition>
          </div>

          <!-- Action Button -->
          <button 
            type="submit"
            :disabled="authStore.loading"
            class="w-full h-12 bg-gradient-to-r from-primary to-fuchsia-600 hover:from-primary/90 hover:to-fuchsia-600/90 text-white rounded-xl font-bold shadow-lg shadow-primary/25 active:scale-[0.98] transition-all disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2 mt-8 mb-6"
          >
            <span v-if="authStore.loading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            安全登录
          </button>
        </form>

        <!-- Terms -->
        <label class="flex items-start gap-2.5 cursor-pointer group/terms">
          <input type="checkbox" v-model="agreed" class="hidden" />
          <div 
            class="mt-0.5 w-4 h-4 rounded border-2 border-slate-300 dark:border-slate-600 flex items-center justify-center transition-all group-hover/terms:border-primary"
            :class="{ 'bg-primary border-primary': agreed }"
          >
            <svg v-if="agreed" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="white" stroke-width="4"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <span class="text-[12px] text-slate-500 dark:text-slate-400 leading-tight">
            我已阅读并同意 <a href="#" class="text-primary hover:underline font-medium">《服务协议》</a> 与 <a href="#" class="text-primary hover:underline font-medium">《隐私政策》</a>
          </span>
        </label>
        </template>
      </div>

      <!-- Right Panel: QR Code (Standard Enterprise Look) -->
      <div class="w-[340px] bg-slate-50/50 dark:bg-slate-800/30 border-l border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-12">
        <div class="text-center mb-8">
          <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-1">扫码快捷登录</h3>
          <p class="text-xs text-slate-500">更安全 · 更便捷</p>
        </div>

        <div class="relative p-3 bg-white dark:bg-white rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-black/20 group/qr overflow-hidden">
          <div class="absolute top-0 left-0 w-full h-[2px] bg-primary/60 blur-[2px] animate-scan z-10"></div>
          <img 
            src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=https://example.com/sso&color=0f172a&bgcolor=ffffff" 
            alt="QR" 
            class="w-40 h-40"
          >
          <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-slate-900 rounded-lg border-[3px] border-white flex items-center justify-center text-white shadow-lg">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </div>
        </div>

        <div class="mt-8 flex items-center gap-2 px-4 py-2 bg-white/80 dark:bg-slate-700/50 rounded-full shadow-sm text-[12px] font-medium text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-600">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
          <span>打开手机客户端 扫一扫</span>
        </div>
      </div>

    </div>

    <!-- Theme Toggle -->
    <button 
      v-if="!isEmbedded"
      @click="themeStore.toggleTheme"
      class="absolute -bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 text-sm font-medium hover:scale-105 transition-all active:scale-95"
    >
      <span v-if="themeStore.isDark">🌙 Dark Mode</span>
      <span v-else>☀️ Light Mode</span>
    </button>
  </div>
</template>

<style scoped>
.fade-slide-enter-active, .fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(10px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

@keyframes scan {
  0% { top: 0; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}

.animate-scan {
  animation: scan 2.5s linear infinite;
}
</style>
