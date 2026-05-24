<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/api/auth'
import { useForm } from 'vee-validate'
import { z } from 'zod'
import { toTypedSchema } from '@vee-validate/zod'
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue'

const authStore = useAuthStore()
const router = useRouter()

const registerSchema = z.object({
  nickname: z.string().min(2, '昵称至少2位'),
  email: z.string().email('邮箱格式不正确'),
  code: z.string().min(4, '验证码至少4位'),
  password: z.string().min(6, '密码至少6位'),
  confirmPassword: z.string().min(6, '请确认密码')
}).refine((data) => data.password === data.confirmPassword, {
  message: "两次输入密码不一致",
  path: ["confirmPassword"]
})

const { values, errors, defineField, handleSubmit } = useForm({
  validationSchema: toTypedSchema(registerSchema)
})

const [nickname, nicknameProps] = defineField('nickname')
const [email, emailProps] = defineField('email')
const [code, codeProps] = defineField('code')
const [password, passwordProps] = defineField('password')
const [confirmPassword, confirmPasswordProps] = defineField('confirmPassword')

const agreed = ref(false)
const isCountingDown = ref(false)
const countdown = ref(60)
const showCaptcha = ref(false)

const sendCode = () => {
  if (!values.email || errors.value.email) {
    alert('请先输入有效的邮箱')
    return
  }
  showCaptcha.value = true
}

const onCaptchaSuccess = async (data: { captchaKey: string }) => {
  showCaptcha.value = false
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

const handleRegister = handleSubmit(async (data) => {
  if (!agreed.value) {
    alert('请同意协议')
    return
  }
  try {
    await authApi.register(data)
    alert('注册成功！')
    router.push('/m/login')
  } catch (err: any) {
    alert(err.message)
  }
})
</script>

<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans pb-safe">
    <!-- Header -->
    <div class="px-8 pt-16 pb-12">
      <router-link to="/m/login" class="inline-flex items-center text-slate-400 mb-8">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
        <span class="text-sm font-medium ml-1">返回登录</span>
      </router-link>
      <h1 class="text-3xl font-bold text-slate-900 dark:text-white font-outfit">创建新账户</h1>
      <p class="text-slate-400 text-sm mt-2">开启您的企业级协作之旅</p>
    </div>

    <!-- Form -->
    <form @submit.prevent="handleRegister" class="flex-1 px-8 space-y-6">
      <div class="space-y-1 relative">
        <input v-model="nickname" v-bind="nicknameProps" type="text" placeholder="设置用户昵称" autocomplete="nickname" class="w-full h-14 bg-white dark:bg-slate-900 rounded-2xl px-6 border border-transparent focus:border-primary/30 outline-none shadow-sm transition-all" />
        <span v-if="errors.nickname" class="absolute -bottom-5 left-2 text-[10px] text-destructive">{{ errors.nickname }}</span>
      </div>

      <div class="space-y-1 relative">
        <input v-model="email" v-bind="emailProps" type="email" placeholder="输入邮箱地址" autocomplete="email" class="w-full h-14 bg-white dark:bg-slate-900 rounded-2xl px-6 border border-transparent focus:border-primary/30 outline-none shadow-sm transition-all" />
        <span v-if="errors.email" class="absolute -bottom-5 left-2 text-[10px] text-destructive">{{ errors.email }}</span>
      </div>

      <div class="flex gap-4 items-start relative">
        <div class="flex-1">
          <input v-model="code" v-bind="codeProps" type="text" placeholder="邮箱验证码" autocomplete="one-time-code" class="w-full h-14 bg-white dark:bg-slate-900 rounded-2xl px-6 border border-transparent focus:border-primary/30 outline-none shadow-sm transition-all" />
        </div>
        <button type="button" @click="sendCode" :disabled="isCountingDown" class="h-14 px-6 bg-white dark:bg-slate-900 rounded-2xl font-bold text-sm text-primary shadow-sm active:scale-95 transition-all disabled:text-slate-400">
          {{ isCountingDown ? `${countdown}s` : '获取' }}
        </button>
        <span v-if="errors.code" class="absolute -bottom-5 left-2 text-[10px] text-destructive">{{ errors.code }}</span>
      </div>

      <div class="space-y-1 relative">
        <input v-model="password" v-bind="passwordProps" type="password" placeholder="设置登录密码 (6位以上)" autocomplete="new-password" class="w-full h-14 bg-white dark:bg-slate-900 rounded-2xl px-6 border border-transparent focus:border-primary/30 outline-none shadow-sm transition-all" />
      </div>

      <div class="space-y-1 relative">
        <input v-model="confirmPassword" v-bind="confirmPasswordProps" type="password" placeholder="再次确认您的密码" autocomplete="new-password" class="w-full h-14 bg-white dark:bg-slate-900 rounded-2xl px-6 border border-transparent focus:border-primary/30 outline-none shadow-sm transition-all" />
        <span v-if="errors.confirmPassword" class="absolute -bottom-5 left-2 text-[10px] text-destructive">{{ errors.confirmPassword }}</span>
      </div>

      <div class="pt-4">
        <button type="submit" class="w-full h-14 bg-gradient-to-r from-primary to-fuchsia-600 text-white rounded-2xl font-bold shadow-xl shadow-primary/20 active:scale-95 transition-all">
          立即注册
        </button>
      </div>

      <label class="flex items-start gap-3 cursor-pointer py-4">
        <input type="checkbox" v-model="agreed" class="hidden" />
        <div class="mt-0.5 w-4 h-4 rounded border-2 border-slate-300 flex items-center justify-center transition-all" :class="{ 'bg-primary border-primary': agreed }">
          <svg v-if="agreed" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="white" stroke-width="4"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <span class="text-[11px] text-slate-400 leading-tight">同意并接受《用户协议》、《隐私权保护声明》及相关配套条款</span>
      </label>
    </form>

    <GraphicCaptcha 
      :is-open="showCaptcha" 
      :email="values.email"
      type="register"
      @close="showCaptcha = false" 
      @success="onCaptchaSuccess" 
    />
  </div>
</template>
