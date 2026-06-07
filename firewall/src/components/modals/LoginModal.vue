<template>
  <Transition name="modal-fade">
    <div v-if="isOpen" class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" @click="close"></div>
      
      <!-- Modal Content -->
      <div class="relative w-[856px] h-[484px] glass-dark rounded-[2rem] overflow-hidden shadow-2xl border border-white/10 flex flex-col animate-in zoom-in-95 duration-300">
        <!-- Close Button -->
        <button 
          @click="close"
          class="absolute top-6 right-6 z-10 p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
        >
          <X class="w-5 h-5" />
        </button>

        <div class="flex-1 w-full relative">
          <iframe 
            :src="loginUrl" 
            class="w-full h-full border-none"
            allow="payment"
          ></iframe>
          
          <!-- Loading State Overlay (Optional) -->
          <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-md">
            <div class="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'
import { buildSsoLoginUrl } from '@/config/services'
import { firewallApi } from '@/api/firewall'

const props = defineProps({
  isOpen: Boolean
})

const emit = defineEmits(['close', 'login-success'])

const loading = ref(true)
const loginUrl = buildSsoLoginUrl()

function close() {
  emit('close')
}

// Handle message from iframe (e.g., login success)
const handleMessage = async (event: MessageEvent) => {
  if (event.data && event.data.type === 'LOGIN_SUCCESS') {
    const { token, sessionToken, user } = event.data

    // Session 模式：用临时 token 换取 sid/sid_r Cookie
    if (sessionToken) {
      try {
        await firewallApi.bindSession(sessionToken)
      } catch (err) {
        console.warn('绑定 Session 失败:', err)
      }
    }

    // JWT 模式：用 access_token 换取 Cookie
    if (token) {
      try {
        await firewallApi.bindToken(token)
      } catch (err) {
        console.warn('绑定 Token 失败:', err)
      }
    }

    emit('login-success', { user, token })
    close()
  }
}

onMounted(() => {
  window.addEventListener('message', handleMessage)
  // Simulate loading finish (or use iframe onload)
  setTimeout(() => {
    loading.value = false
  }, 1500)
})

onUnmounted(() => {
  window.removeEventListener('message', handleMessage)
})
</script>

<style scoped>
.glass-dark {
  background: rgba(15, 23, 42, 0.8);
  backdrop-filter: blur(20px);
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
