<script setup lang="ts">
import { authApi } from '@/api/auth'
import { ref, watch, onMounted, nextTick } from 'vue'

const props = defineProps({
  isOpen: Boolean,
  email: String,
  type: String, // 业务类型：register/login/reset_password
  title: {
    type: String,
    default: '安全验证'
  }
})

const emit = defineEmits(['close', 'success'])

const captchaImage = ref('')
const captchaKey = ref('')
const userInput = ref('')
const error = ref('')
const isVerifying = ref(false)
const sessionId = ref('')

const generateCaptcha = async () => {
  try {
    const res: any = await authApi.getCaptcha()
    captchaImage.value = res.captchaImage
    captchaKey.value = res.captchaKey
    userInput.value = ''
  } catch (err) {
    console.error('Failed to get captcha', err)
  }
}

const handleVerify = async () => {
  if (isVerifying.value) return
  if (userInput.value.length < 4) {
    error.value = '请输入4位验证码'
    return
  }
  
  isVerifying.value = true
  error.value = ''
  
  try {
    await authApi.verifyCaptcha(captchaKey.value, userInput.value, props.email, props.type)
    emit('success', { captchaKey: captchaKey.value })
  } catch (err: any) {
    const msg = err.message || '验证失败'
    error.value = msg
    
    // 验证失败自动清空并刷新
    userInput.value = ''
    generateCaptcha() 
  } finally {
    isVerifying.value = false
  }
}

/** 只允许输入数字和字母，中文等立即过滤 */
const onInput = (e: Event) => {
  const target = e.target as HTMLInputElement
  userInput.value = target.value.replace(/[^a-zA-Z0-9]/g, '')
  error.value = ''
}

// 自动检测：输入够4位自动提交
watch(userInput, (val) => {
  if (val.length === 4) {
    handleVerify()
  }
})


const inputRef = ref<HTMLInputElement | null>(null)

watch(() => props.isOpen, (val) => {
  if (val) {
    userInput.value = ''
    error.value = ''
    generateCaptcha()
    nextTick(() => {
      try {
        if (window.self === window.top) {
          inputRef.value?.focus()
        }
      } catch (e) {}
    })
  }
})

onMounted(() => {
  sessionId.value = crypto.randomUUID()
})
</script>

<template>
  <Transition name="minimal-fade">
    <div v-if="isOpen" class="fixed inset-0 z-[200] flex items-center justify-center p-6">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl" @click="emit('close')"></div>
      
      <!-- Captcha Card -->
      <div class="relative w-full max-w-[360px] bg-white dark:bg-slate-900 rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-800 animate-minimal-in">
        
        <div class="p-10">
          <div class="flex items-center justify-between mb-10">
            <h4 class="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{{ title }}</h4>
            <button @click="emit('close')" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-all">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <div class="space-y-8">
            <!-- Large Image Area -->
            <div class="relative group">
              <div 
                @click="generateCaptcha"
                class="h-24 bg-slate-50 dark:bg-slate-950 rounded-2xl flex items-center justify-center cursor-pointer overflow-hidden border border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all active:scale-[0.98]"
              >
                <img v-if="captchaImage" :src="captchaImage" class="h-14 object-contain mix-blend-multiply dark:mix-blend-normal transform scale-110 group-hover:scale-125 transition-transform duration-500" />
                <div v-else class="w-6 h-6 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin"></div>
                
                <!-- Large Refresh Overlay -->
                <div class="absolute inset-0 flex items-center justify-center bg-white/40 dark:bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity">
                   <div class="bg-white dark:bg-slate-800 p-3 rounded-full shadow-xl">
                     <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" class="text-slate-900 dark:text-white"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                   </div>
                </div>
              </div>
              <p class="text-[10px] text-center text-slate-400 mt-2 font-medium tracking-wide">看不清？点击图片更换</p>
            </div>

            <!-- Large Input Area -->
            <div class="space-y-6">
              <div class="relative">
                <input
                  ref="inputRef"
                  :value="userInput"
                  @input="onInput"
                  @keyup.enter="handleVerify"
                  type="text"
                  maxlength="4"
                  placeholder="验证码"
                  class="minimal-input-large"
                  :class="{ 'has-error': error }"
                />
                <Transition name="fade">
                  <p v-if="error" class="text-center text-[11px] text-rose-500 font-bold mt-3 tracking-wide uppercase">{{ error }}</p>
                </Transition>
              </div>

              <button 
                @click="handleVerify" 
                :disabled="isVerifying"
                class="w-full h-14 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-bold text-sm tracking-[0.1em] transition-all hover:translate-y-[-2px] active:translate-y-[1px] disabled:opacity-50 flex items-center justify-center gap-3"
              >
                <span v-if="isVerifying" class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                {{ isVerifying ? '正在验证' : '完成验证' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.minimal-input-large {
  width: 100%;
  height: 70px;
  background: transparent;
  border: 2px solid #f1f5f9;
  border-radius: 20px;
  text-align: center;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 0.5em;
  padding-left: 0.5em;
  color: #0f172a;
  outline: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.dark .minimal-input-large {
  border-color: #1e293b;
  color: white;
}

.minimal-input-large:focus {
  border-color: #0f172a;
  background: #f8fafc;
  transform: translateY(-2px);
}

.dark .minimal-input-large:focus {
  border-color: white;
  background: #0f172a;
}

.minimal-input-large.has-error {
  border-color: #f43f5e !important;
  background: #fff1f2 !important;
}

.dark .minimal-input-large.has-error {
  background: #450a0a !important;
}

/* Animations */
@keyframes minimal-in {
  from { opacity: 0; transform: scale(0.95) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.animate-minimal-in {
  animation: minimal-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.minimal-fade-enter-active, .minimal-fade-leave-active {
  transition: opacity 0.4s ease;
}
.minimal-fade-enter-from, .minimal-fade-leave-to {
  opacity: 0;
}
</style>



