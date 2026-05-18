<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/api/auth'
import { useForm } from 'vee-validate'
import { useRoute, useRouter } from 'vue-router'
import { ref, computed } from 'vue'
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue'
import * as zod from 'zod'
import { toTypedSchema } from '@vee-validate/zod'
import { rsaEncrypt } from '@/utils/crypto'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const isMini = computed(() => route.query.appName || route.path.includes('mini') || route.query.from === 'mini')

// 校验架构
const registerSchema = zod.object({
  username: zod.string({ required_error: '请输入用户名' }).min(2, '用户名至少2位'),
  email: zod.string({ required_error: '请输入邮箱' }).email('请输入有效的邮箱'),
  code: zod.string({ required_error: '请输入验证码' }).min(4, '验证码至少4位'),
  password: zod.string({ required_error: '请输入密码' })
    .min(8, '密码至少8位')
    .max(20, '密码最多20位')
    .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, '密码必须同时包含数字和字母'),
  confirmPassword: zod.string({ required_error: '请确认密码' }).min(1, '请再次输入密码以确认')
}).refine((data) => data.password === data.confirmPassword, {
  message: "两次输入的密码不一致",
  path: ["confirmPassword"]
})

const { values, errors, defineField, handleSubmit } = useForm({
  validationSchema: toTypedSchema(registerSchema),
  initialValues: {
    username: '',
    email: '',
    code: '',
    password: '',
    confirmPassword: ''
  }
})

const [username, usernameProps] = defineField('username')
const [email, emailProps] = defineField('email')
const [code, codeProps] = defineField('code')
const [password, passwordProps] = defineField('password')
const [confirmPassword, confirmPasswordProps] = defineField('confirmPassword')

const agreed = ref(false)
const isCountingDown = ref(false)
const countdown = ref(60)

// // 校验昵称
// const isNicknameDuplicate = ref(false)
// const checkNickname = async () => {
//   if (values.nickname && !errors.value.nickname) {
//     try {
//       const res: any = await authApi.checkNickname(values.nickname)
//       isNicknameDuplicate.value = res.isDuplicate
//     } catch (err) {
//       console.error('Nickname check failed', err)
//       isNicknameDuplicate.value = true // Error occurred, assume unavailable to be safe
//     }
//   }
// }

const isEmailDuplicate = ref(false)
const checkEmail = async () => {
  if (values.email && !errors.value.email) {
    try {
      const res: any = await authApi.checkEmail(values.email)
      isEmailDuplicate.value = res.isDuplicate
    } catch (err) {
      console.error('Email check failed', err)
      isEmailDuplicate.value = true // Error occurred, assume unavailable to be safe
    }
  }
}

const sendCode = async () => {
  if (!values.email || errors.value.email) {
    alert('请先输入有效的邮箱')
    return
  }
  if (isEmailDuplicate.value) {
    alert('该邮箱已被注册')
    return
  }
  showCaptcha.value = true
}

const showCaptcha = ref(false)
const onCaptchaSuccess = async (data: { captchaKey: string }) => {
  showCaptcha.value = false
  // 验证成功后，由于后台已同步发送邮件，前端直接开始倒计时
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

const handleRegister = handleSubmit(async () => {
  if (!agreed.value) {
    alert('请阅读并同意协议')
    return
  }
  // if (isNicknameDuplicate.value) {
  //   alert('昵称已被占用')
  //   return
  // }
  if (isEmailDuplicate.value) {
    alert('邮箱已被注册')
    return
  }
  
  executeRegister()
}, (err) => {
  console.log('Validation errors:', err)
})

const executeRegister = async () => {
  try {
    const { confirmPassword, ...submitData } = values
    const encryptedPassword = await rsaEncrypt(submitData.password!)
    await authApi.register({
      ...submitData,
      password: encryptedPassword
    })
    alert('注册成功！现在您可以返回登录了')
    
    if (route.query.from === 'mini') {
      // 注册成功后，直接回到登录界面
      router.push({ path: '/mini-login', query: route.query })
    } else {
      router.push('/')
    }
  } catch (err: any) {
    alert(err.message || '注册失败')
  }
}

// 打开合规文档
const openDoc = (type: 'service' | 'privacy') => {
  const url = `/docs/${type}.html`
  window.open(url, '_blank', 'width=800,height=600')
}
</script>

<template>
  <div class="registration-viewport" :class="{ 'is-mini': isMini }">
    <!-- Animated background elements -->
    <div class="bg-blur absolute -top-40 -left-40 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] animate-pulse"></div>
    <div class="bg-blur absolute -bottom-40 -right-40 w-[400px] h-[400px] bg-indigo-500/20 rounded-full blur-[100px] animate-pulse delay-1000"></div>

    <div class="registration-box relative flex overflow-hidden transition-all duration-500 w-full h-full">
      
      <!-- Left Branding Panel: High-end Gradient & Glass -->
      <div class="w-[320px] relative bg-gradient-to-br from-indigo-600 via-primary to-blue-500 p-10 flex flex-col justify-between overflow-hidden shrink-0">
        <!-- Decoration -->
        <div class="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_50%_-20%,#ffffff,transparent)]"></div>
        <div class="absolute -right-20 top-20 w-64 h-64 bg-white/10 rounded-full blur-2xl"></div>
        
        <div class="relative z-10">
          <div class="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white mb-6 shadow-xl">
             <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" class="animate-bounce-subtle"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </div>
          <h2 class="text-2xl font-bold text-white tracking-tight leading-tight mb-3">开启您的<br/>数字之旅</h2>
          <p class="text-white/70 text-[11px] leading-relaxed max-w-[200px]">加入万千企业的选择，即刻开启安全、高效的云端工作空间。</p>
        </div>

        <div class="relative z-10 space-y-4">
           <div class="flex items-center gap-3">
             <div class="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white border border-white/10">
               <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
             </div>
             <span class="text-[10px] text-white/90 font-medium">企业级数据加密</span>
           </div>
           <div class="flex items-center gap-3">
             <div class="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white border border-white/10">
               <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
             </div>
             <span class="text-[10px] text-white/90 font-medium">全平台无缝同步</span>
           </div>
        </div>

        <div class="relative z-10 pt-6 border-t border-white/10">
           <p class="text-[10px] text-white/50 uppercase tracking-widest font-bold">已有账号?</p>
           <router-link :to="{ path: isMini ? '/mini-login' : '/', query: route.query }" class="text-xs font-bold text-white hover:text-indigo-200 transition-colors mt-1 block">立即回跳登录</router-link>
        </div>
      </div>

      <!-- Right Form Panel -->
      <div class="flex-1 bg-white dark:bg-slate-900 p-12 flex flex-col relative overflow-y-auto">
        <div class="max-w-[420px] mx-auto w-full my-auto">
          <div class="mb-8">
            <h3 class="text-2xl font-bold dark:text-white mb-2">创建新账户</h3>
            <p class="text-slate-400 text-xs">填写以下信息，即刻开启全功能体验</p>
          </div>

          <form @submit.prevent="handleRegister">
            <div class="space-y-4">
              <!-- Row 1: Nickname & Email -->
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1.5">
                  <label class="text-[11px] font-bold text-slate-500 uppercase tracking-wide ml-1">用户名</label>
                  <div class="input-wrapper group">
                    <input v-model="username" v-bind="usernameProps" type="text" placeholder="您的账号名" autocomplete="username" class="modern-input" :class="{ 'error-border': errors.username }" />
                    <div class="input-status">
                      <svg v-if="values.username && !errors.username" viewBox="0 0 24 24" width="14" height="14" class="text-emerald-500"><path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="3"/></svg>
                    </div>
                  </div>
                  <p v-if="errors.username" class="text-[10px] text-rose-500 font-medium ml-1 mt-1">{{ errors.username }}</p>
                </div>
                <div class="space-y-1.5">
                  <label class="text-[11px] font-bold text-slate-500 uppercase tracking-wide ml-1">电子邮箱</label>
                  <div class="input-wrapper group">
                    <input v-model="email" v-bind="emailProps" @blur="checkEmail" type="email" placeholder="example@mail.com" autocomplete="email" class="modern-input" :class="{ 'error-border': errors.email || isEmailDuplicate }" />
                    <div class="input-status">
                      <span v-if="isEmailDuplicate" class="text-[9px] text-rose-500 font-bold">已注册</span>
                      <svg v-else-if="values.email && !errors.email" viewBox="0 0 24 24" width="14" height="14" class="text-emerald-500"><path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="3"/></svg>
                    </div>
                  </div>
                  <p v-if="errors.email" class="text-[10px] text-rose-500 font-medium ml-1 mt-1">{{ errors.email }}</p>
                </div>
              </div>

              <!-- Row 2: Verification Code -->
              <div class="space-y-1.5">
                <label class="text-[11px] font-bold text-slate-500 uppercase tracking-wide ml-1">验证码</label>
                <div class="flex gap-3">
                  <div class="input-wrapper flex-1">
                    <input v-model="code" v-bind="codeProps" type="text" placeholder="6位数字验证码" autocomplete="one-time-code" class="modern-input" :class="{ 'error-border': errors.code }" />
                  </div>
                  <button type="button" @click="sendCode" :disabled="isCountingDown" class="h-11 px-6 rounded-xl bg-slate-50 dark:bg-slate-800 text-primary font-bold text-xs border border-slate-100 dark:border-slate-700 hover:bg-primary hover:text-white transition-all disabled:opacity-50">
                    {{ isCountingDown ? `${countdown}s` : '获取验证码' }}
                  </button>
                </div>
                <p v-if="errors.code" class="text-[10px] text-rose-500 font-medium ml-1 mt-1">{{ errors.code }}</p>
              </div>

              <!-- Row 3: Passwords -->
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1.5">
                  <label class="text-[11px] font-bold text-slate-500 uppercase tracking-wide ml-1">设置密码</label>
                  <div class="input-wrapper">
                    <input v-model="password" v-bind="passwordProps" type="password" placeholder="8-20位数字+字母" autocomplete="new-password" class="modern-input" :class="{ 'error-border': errors.password }" />
                  </div>
                  <p v-if="errors.password" class="text-[10px] text-rose-500 font-medium ml-1 mt-1 leading-tight">{{ errors.password }}</p>
                </div>
                <div class="space-y-1.5">
                  <label class="text-[11px] font-bold text-slate-500 uppercase tracking-wide ml-1">确认密码</label>
                  <div class="input-wrapper">
                    <input v-model="confirmPassword" v-bind="confirmPasswordProps" type="password" placeholder="再次输入" autocomplete="new-password" class="modern-input" :class="{ 'error-border': errors.confirmPassword }" />
                  </div>
                  <p v-if="errors.confirmPassword" class="text-[10px] text-rose-500 font-medium ml-1 mt-1 leading-tight">{{ errors.confirmPassword }}</p>
                </div>
              </div>
            </div>

            <div class="mt-8">
              <button type="submit" class="w-full h-12 bg-primary text-white rounded-xl font-bold shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all text-sm flex items-center justify-center gap-3">
                立即提交注册
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>

              <label class="flex items-center gap-3 mt-6 cursor-pointer group justify-center">
                <input type="checkbox" v-model="agreed" class="hidden" />
                <div class="w-4 h-4 rounded-md border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center transition-all group-hover:border-primary" :class="{ 'bg-primary border-primary': agreed }">
                  <svg v-if="agreed" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="white" stroke-width="4"><path d="M20 6L9 17l-5-5"/></svg>
                </div>
                <span class="text-[11px] text-slate-400 font-medium">
                  我已阅读并同意 
                  <span @click.stop="openDoc('service')" class="text-primary hover:underline cursor-help">《服务协议》</span> 
                  与 
                  <span @click.stop="openDoc('privacy')" class="text-primary hover:underline cursor-help">《隐私政策》</span>
                </span>
              </label>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Captcha Component -->
    <GraphicCaptcha 
      :is-open="showCaptcha" 
      :email="values.email"
      type="register"
      @close="showCaptcha = false" 
      @success="onCaptchaSuccess" 
    />
  </div>
</template>

<style scoped>
.registration-viewport {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: transparent;
  font-family: 'Outfit', 'Inter', sans-serif;
}

.registration-box {
  background: white;
  transition: all 0.4s ease;
}

.dark .registration-box {
  background: #0f172a;
}

.input-wrapper {
  position: relative;
  transition: all 0.3s;
}

.modern-input {
  width: 100%;
  height: 44px;
  padding: 0 16px;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
  outline: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.dark .modern-input {
  background: #1e293b;
  border-color: #334155;
  color: white;
}

.modern-input:focus {
  background: white;
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 4px hsl(var(--primary) / 0.08);
}

.modern-input.error-border {
  border-color: #f43f5e !important;
  background: #fff1f2;
}

.dark .modern-input.error-border {
  background: #450a0a;
}

.dark .modern-input:focus {
  background: #0f172a;
}

.input-status {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
}

.animate-bounce-subtle {
  animation: bounce-subtle 3s infinite ease-in-out;
}

@keyframes bounce-subtle {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

/* Transitions */
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.is-mini .registration-box {
  transform: scale(1);
}

@media (max-height: 520px) {
  .registration-box {
    transform: scale(0.9);
  }
}
</style>


