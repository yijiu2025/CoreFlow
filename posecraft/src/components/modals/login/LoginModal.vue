<template>
  <Transition name="modal-fade">
    <div v-if="isOpen" class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" @click="close"></div>

      <!-- Modal Content -->
      <div
        class="relative w-[856px] h-[484px] bg-slate-900/80 backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col"
      >
        <!-- Close Button -->
        <button
          @click="close"
          class="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
        >
          <X :size="16" />
        </button>

        <!-- Title -->
        <div class="px-6 pt-4 pb-2">
          <h2 class="text-lg font-bold text-white">登录 PoseCraft</h2>
          <p class="text-sm text-slate-400">使用 CoreFlow 账号授权登录</p>
        </div>

        <!-- iframe -->
        <div class="flex-1 w-full relative">
          <iframe :src="loginUrl" class="w-full h-full border-none" allow="payment"></iframe>

          <!-- Loading State -->
          <div
            v-if="loading"
            class="absolute inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-md"
          >
            <div class="w-12 h-12 border-4 border-primary-500/30 border-t-primary-400 rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { X } from 'lucide-vue-next';
import { buildSsoLoginUrl } from '@/config/services';
import { authApi } from '@/api/auth';

const props = defineProps({
  isOpen: Boolean
});

const emit = defineEmits(['close', 'login-success', 'max-sessions']);

const loading = ref(true);
const loginUrl = buildSsoLoginUrl();

function close() {
  emit('close');
}

/**
 * 处理 iframe 消息
 */
const handleMessage = async (event: MessageEvent) => {
  if (event.data && event.data.type === 'LOGIN_SUCCESS') {
    const { token, sessionToken, user } = event.data;
    // 🔍 调试：父窗口收到 iframe 登录成功消息
    console.log('[posecraft LoginModal] 🔍 收到 LOGIN_SUCCESS ->', {
      token: token ? '✅ 有' : '❌ 无',
      sessionToken: sessionToken ? '✅ 有' : '❌ 无'
    });

    // Session 模式：用临时 token 换取 sid/sid_r Cookie
    if (sessionToken) {
      try {
        const result = await authApi.bindSession(sessionToken);
        console.log('[posecraft LoginModal] ✅ bindSession 成功:', result);
      } catch (err) {
        console.warn('[posecraft LoginModal] ❌ bindSession 失败:', err);
      }
    } else {
      console.warn('[posecraft LoginModal] ⚠️ sessionToken 为空，跳过 bindSession → 后续请求将无 sid cookie → 401');
    }

    // JWT 模式：用 access_token 换取 Cookie
    if (token) {
      try {
        await authApi.bindToken(token);
      } catch (err) {
        console.warn('绑定 Token 失败:', err);
      }
    }

    emit('login-success', { user, token });
    close();
  }

  // 设备数量超限
  if (event.data && event.data.type === 'MAX_SESSIONS') {
    emit('max-sessions', {
      sessions: event.data.sessions,
      maxSessions: event.data.maxSessions
    });
    close();
  }
};

onMounted(() => {
  window.addEventListener('message', handleMessage);
  setTimeout(() => {
    loading.value = false;
  }, 1500);
});

onUnmounted(() => {
  window.removeEventListener('message', handleMessage);
});
</script>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
