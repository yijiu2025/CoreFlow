<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { useForm } from 'vee-validate'
import * as zod from 'zod'
import { toTypedSchema } from '@vee-validate/zod'

const authStore = useAuthStore()
const themeStore = useThemeStore()

// 登录模式
const loginType = ref<'sms' | 'pwd'>('sms')

// 表单校验架构 (Zod)
const loginSchema = zod.discriminatedUnion('type', [
  zod.object({
    type: zod.literal('sms'),
    phone: zod.string().regex(/^1[3-9]\d{9}$/, '请输入正确的手机号'),
    code: zod.string().min(4, '验证码至少4位')
  }),
  zod.object({
    type: zod.literal('pwd'),
    username: zod.string().min(2, '账号至少2位'),
    password: zod.string().min(6, '密码至少6位')
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

const [phone, phoneProps] = defineField('phone')
const [code, codeProps] = defineField('code')
const [username, usernameProps] = defineField('username')
const [password, passwordProps] = defineField('password')

const agreed = ref(false)
const isCountingDown = ref(false)
const countdown = ref(60)
let timer: any = null

const startCountdown = () => {
  if (!values.phone || errors.value.phone) {
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

const handleLogin = handleSubmit(async (data) => {
  if (!agreed.value) {
    alert('请先阅读并勾选同意相关协议')
    return
  }

  try {
    const res = await authStore.login(data as any)
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'SSO_SUCCESS', data: res }, '*')
    } else {
      alert('登录成功！')
    }
  } catch (err: any) {
    alert(err.message || '登录失败')
  }
})
</script>

<template>
  <div class="flex flex-col min-h-screen w-full bg-white dark:bg-slate-950 font-sans pb-safe">
    <!-- Header Decor -->
    <div class="relative h-64 bg-gradient-to-br from-primary to-fuchsia-600 rounded-b-[40px] overflow-hidden flex flex-col items-center justify-center px-8">
      <div class="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
      
      <!-- Back Button -->
      <button class="absolute top-12 left-6 p-2 text-white/80 hover:text-white transition-colors">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </button>

      <div class="relative z-10 w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white mb-4 border border-white/30 shadow-xl">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      </div>
      <h1 class="relative z-10 text-2xl font-bold text-white tracking-wide font-outfit">欢迎登录</h1>
      <p class="relative z-10 text-white/70 text-sm mt-1">Enterprise SSO Identity</p>
    </div>

    <!-- Form Content -->
    <div class="flex-1 px-8 -mt-10 relative z-20">
      <div class="bg-white dark:bg-slate-900 rounded-[32px] p-8 shadow-2xl shadow-primary/5 border border-slate-100 dark:border-slate-800">
        <!-- Mode Switcher -->
        <div class="flex gap-8 mb-8 border-b border-slate-100 dark:border-slate-800">
          <button 
            @click="loginType = 'sms'; values.type = 'sms'"
            class="pb-3 text-sm font-bold relative transition-colors"
            :class="loginType === 'sms' ? 'text-primary' : 'text-slate-400'"
          >
            短信登录
            <div v-if="loginType === 'sms'" class="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full"></div>
          </button>
          <button 
            @click="loginType = 'pwd'; values.type = 'pwd'"
            class="pb-3 text-sm font-bold relative transition-colors"
            :class="loginType === 'pwd' ? 'text-primary' : 'text-slate-400'"
          >
            密码登录
            <div v-if="loginType === 'pwd'" class="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full"></div>
          </button>
        </div>

        <!-- Inputs -->
        <div class="space-y-6">
          <transition name="mobile-fade" mode="out-in">
            <div v-if="loginType === 'sms'" key="sms" class="space-y-6">
              <div class="relative">
                <div class="flex items-center h-14 bg-slate-50 dark:bg-slate-800/50 rounded-2xl px-5 border border-transparent focus-within:border-primary/30 focus-within:bg-white dark:focus-within:bg-slate-800 transition-all">
                  <span class="text-sm font-bold mr-4 text-slate-900 dark:text-white">+86</span>
                  <input 
                    v-model="phone"
                    v-bind="phoneProps"
                    type="tel" 
                    placeholder="请输入手机号"
                    class="flex-1 bg-transparent border-none outline-none text-sm font-medium"
                  />
                </div>
                <span v-if="errors.phone" class="absolute -bottom-5 left-2 text-[10px] text-destructive">{{ errors.phone }}</span>
              </div>

              <div class="relative">
                <div class="flex items-center h-14 bg-slate-50 dark:bg-slate-800/50 rounded-2xl px-5 border border-transparent focus-within:border-primary/30 focus-within:bg-white dark:focus-within:bg-slate-800 transition-all">
                  <input 
                    v-model="code"
                    v-bind="codeProps"
                    type="text" 
                    placeholder="请输入验证码"
                    class="flex-1 bg-transparent border-none outline-none text-sm font-medium"
                  />
                  <button 
                    @click="startCountdown"
                    :disabled="isCountingDown"
                    class="text-xs font-bold text-primary disabled:text-slate-400"
                  >
                    {{ isCountingDown ? `${countdown}s` : '获取验证码' }}
                  </button>
                </div>
                <span v-if="errors.code" class="absolute -bottom-5 left-2 text-[10px] text-destructive">{{ errors.code }}</span>
              </div>
            </div>

            <div v-else key="pwd" class="space-y-6">
              <div class="relative">
                <div class="flex items-center h-14 bg-slate-50 dark:bg-slate-800/50 rounded-2xl px-5 border border-transparent focus-within:border-primary/30 focus-within:bg-white dark:focus-within:bg-slate-800 transition-all">
                  <input 
                    v-model="username"
                    v-bind="usernameProps"
                    type="text" 
                    placeholder="账号 / 邮箱 / 手机号"
                    class="flex-1 bg-transparent border-none outline-none text-sm font-medium"
                  />
                </div>
                <span v-if="errors.username" class="absolute -bottom-5 left-2 text-[10px] text-destructive">{{ errors.username }}</span>
              </div>

              <div class="relative">
                <div class="flex items-center h-14 bg-slate-50 dark:bg-slate-800/50 rounded-2xl px-5 border border-transparent focus-within:border-primary/30 focus-within:bg-white dark:focus-within:bg-slate-800 transition-all">
                  <input 
                    v-model="password"
                    v-bind="passwordProps"
                    type="password" 
                    placeholder="请输入密码"
                    class="flex-1 bg-transparent border-none outline-none text-sm font-medium"
                  />
                </div>
                <span v-if="errors.password" class="absolute -bottom-5 left-2 text-[10px] text-destructive">{{ errors.password }}</span>
              </div>
            </div>
          </transition>
        </div>

        <!-- Submit -->
        <button 
          @click="handleLogin"
          :disabled="authStore.loading"
          class="w-full h-14 bg-gradient-to-r from-primary to-fuchsia-600 text-white rounded-2xl font-bold shadow-xl shadow-primary/20 active:scale-[0.97] transition-all mt-10 flex items-center justify-center gap-3"
        >
          <span v-if="authStore.loading" class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          立即登录
        </button>

        <!-- Terms -->
        <div class="mt-8">
          <label class="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" v-model="agreed" class="hidden" />
            <div 
              class="mt-1 w-4 h-4 rounded-full border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center transition-all"
              :class="{ 'bg-primary border-primary': agreed }"
            >
              <svg v-if="agreed" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="white" stroke-width="4"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <span class="text-xs text-slate-400 leading-normal">
              我已阅读并同意 <a href="#" class="text-primary font-medium">《服务协议》</a> 和 <a href="#" class="text-primary font-medium">《隐私政策》</a>
            </span>
          </label>
        </div>
      </div>
    </div>

    <!-- Other Options -->
    <div class="p-12 flex flex-col items-center">
      <div class="flex items-center gap-4 w-full mb-8">
        <div class="flex-1 h-[1px] bg-slate-100 dark:bg-slate-800"></div>
        <span class="text-[10px] text-slate-400 font-bold tracking-widest uppercase">第三方登录</span>
        <div class="flex-1 h-[1px] bg-slate-100 dark:bg-slate-800"></div>
      </div>
      
      <div class="flex gap-8">
        <button class="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shadow-sm border border-slate-100 dark:border-slate-700 active:scale-90 transition-transform">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.341-3.369-1.341-.454-1.152-1.11-1.459-1.11-1.459-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z"/></svg>
        </button>
        <button class="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shadow-sm border border-slate-100 dark:border-slate-700 active:scale-90 transition-transform">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.908 3.152-1.628 3.872-1.012 1.012-2.6 2.12-5.64 2.12-4.824 0-8.54-3.896-8.54-8.72s3.716-8.72 8.54-8.72c2.608 0 4.504 1.024 5.904 2.344l2.304-2.304C19.144 2.616 16.272 1.04 12.48 1.04 5.688 1.04.08 6.648.08 13.44s5.608 12.4 12.4 12.4c3.672 0 6.448-1.216 8.64-3.496 2.264-2.264 2.984-5.424 2.984-7.976 0-.768-.064-1.496-.184-2.184h-11.44z"/></svg>
        </button>
      </div>

      <div class="mt-12 text-sm">
        <span class="text-slate-400">还没有账号？</span>
        <button class="text-primary font-bold ml-2">立即注册</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}

.mobile-fade-enter-active, .mobile-fade-leave-active {
  transition: all 0.25s ease-out;
}
.mobile-fade-enter-from {
  opacity: 0;
  transform: scale(0.98) translateY(5px);
}
.mobile-fade-leave-to {
  opacity: 0;
  transform: scale(1.02) translateY(-5px);
}
</style>
