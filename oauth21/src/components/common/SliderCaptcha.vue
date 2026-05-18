<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'

const props = defineProps({
  isOpen: Boolean,
  title: {
    type: String,
    default: '安全验证'
  }
})

const emit = defineEmits(['close', 'success'])

const isMoving = ref(false)
const startX = ref(0)
const moveX = ref(0)
const isSuccess = ref(false)
const trackRef = ref<HTMLElement | null>(null)

const maxMove = computed(() => {
  if (!trackRef.value) return 0
  return trackRef.value.offsetWidth - 40 // 40 is the slider width
})

const onStart = (e: MouseEvent | TouchEvent) => {
  if (isSuccess.value) return
  isMoving.value = true
  startX.value = 'touches' in e ? e.touches[0].clientX : e.clientX
}

const onMove = (e: MouseEvent | TouchEvent) => {
  if (!isMoving.value) return
  const currentX = 'touches' in e ? e.touches[0].clientX : e.clientX
  let x = currentX - startX.value
  
  if (x < 0) x = 0
  if (x > maxMove.value) x = maxMove.value
  
  moveX.value = x
  
  if (x >= maxMove.value) {
    onSuccess()
  }
}

const onEnd = () => {
  if (isSuccess.value) return
  isMoving.value = false
  if (!isSuccess.value) {
    moveX.value = 0
  }
}

const onSuccess = () => {
  isMoving.value = false
  isSuccess.value = true
  setTimeout(() => {
    emit('success')
    reset()
  }, 500)
}

const reset = () => {
  isMoving.value = false
  isSuccess.value = false
  moveX.value = 0
}

onMounted(() => {
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onEnd)
  window.addEventListener('touchmove', onMove)
  window.addEventListener('touchend', onEnd)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseup', onEnd)
  window.removeEventListener('touchmove', onMove)
  window.removeEventListener('touchend', onEnd)
})
</script>

<template>
  <Transition name="minimal-fade">
    <div v-if="isOpen" class="fixed inset-0 z-[200] flex items-center justify-center p-6">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md" @click="emit('close')"></div>
      
      <!-- Captcha Card -->
      <div class="relative w-full max-w-[340px] bg-white dark:bg-slate-900 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 dark:border-slate-800 animate-minimal-in">
        
        <div class="p-8">
          <div class="flex items-center justify-between mb-8">
            <h4 class="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">{{ title }}</h4>
            <button @click="emit('close')" class="text-slate-400 hover:text-slate-600 transition-colors">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <div class="space-y-6">
            <!-- Track Area -->
            <div ref="trackRef" class="relative h-10 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-800 overflow-hidden">
              <!-- Success/Progress Overlay -->
              <div 
                class="absolute inset-y-0 left-0 bg-slate-900 dark:bg-white transition-all duration-300"
                :style="{ width: `${moveX + 20}px` }"
                :class="{ 'opacity-100': isSuccess, 'opacity-5': !isSuccess }"
              ></div>
              
              <!-- Text Hint -->
              <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span class="text-[11px] font-medium tracking-tight transition-all duration-300" :class="isSuccess ? 'text-white dark:text-slate-900' : 'text-slate-400'">
                  {{ isSuccess ? '验证成功' : '向右滑动' }}
                </span>
              </div>

              <!-- Slider Button -->
              <div 
                class="absolute left-0 top-0 bottom-0 w-10 flex items-center justify-center cursor-grab active:cursor-grabbing transition-shadow z-10"
                :class="[
                  isSuccess ? 'bg-transparent text-white' : 'bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white'
                ]"
                :style="{ transform: `translateX(${moveX}px)` }"
                @mousedown="onStart"
                @touchstart="onStart"
              >
                <svg v-if="!isSuccess" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>
                <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" :class="isSuccess ? 'text-white dark:text-slate-900' : ''"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
            </div>

            <p class="text-center text-[10px] text-slate-400 font-medium tracking-wide">
              为了您的账户安全，请完成上方验证
            </p>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Animations */
@keyframes minimal-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-minimal-in {
  animation: minimal-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.minimal-fade-enter-active, .minimal-fade-leave-active {
  transition: opacity 0.3s ease;
}
.minimal-fade-enter-from, .minimal-fade-leave-to {
  opacity: 0;
}
</style>

