<template>
  <Transition name="modal-fade">
    <div v-if="isOpen" class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" @click="close"></div>

      <!-- Modal Content -->
      <div
        class="relative w-[856px] glass-dark rounded-[2rem] overflow-hidden shadow-2xl border border-white/10 flex flex-col animate-in zoom-in-95 duration-300"
      >
        <!-- Close Button -->
        <button
          @click="close"
          class="absolute top-6 right-6 z-10 p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
        >
          <X class="w-5 h-5" />
        </button>

        <!-- 已登录账号列表区（抖音式免切，有 savedAccounts 时展示） -->
        <div v-if="accountList.length" class="px-8 pt-8 pb-4 border-b border-white/5">
          <div class="text-xs text-slate-400 mb-3 font-medium">选择已登录账号</div>
          <div class="flex gap-3 overflow-x-auto pb-1" style="scrollbar-width: thin">
            <button
              v-for="acct in accountList"
              :key="acct.uid"
              @click="onSwitchAccount(acct)"
              :disabled="switching"
              class="group flex items-center gap-3 pl-2 pr-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-400/40 transition-all whitespace-nowrap disabled:opacity-50"
            >
              <img
                v-if="acct.avatar"
                :src="acct.avatar"
                class="w-8 h-8 rounded-full object-cover"
                :alt="acct.username"
              />
              <div
                v-else
                class="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white"
              >
                {{ acct.username.charAt(0) }}
              </div>
              <span class="text-sm text-slate-200 group-hover:text-white">{{ acct.username }}</span>
              <span
                @click.stop="onRevoke(acct)"
                class="p-0.5 rounded-full text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="忘掉该账号"
              >
                <X class="w-3.5 h-3.5" />
              </span>
            </button>
          </div>
        </div>

        <!-- iframe 登录区（登录新账号 / need_password 输密码） -->
        <div class="w-full relative h-[484px]">
          <iframe :src="loginUrl" class="w-full h-full border-none" allow="payment"></iframe>

          <!-- Loading State Overlay -->
          <div
            v-if="loading"
            class="absolute inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-md"
          >
            <div class="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { X } from 'lucide-vue-next';
import { buildSsoLoginUrl } from '@/config/services';
import { firewallApi } from '@/api/firewall';
import { useAuthStore } from '@/stores/auth';

const props = defineProps({
  isOpen: Boolean
});

const emit = defineEmits(['close', 'login-success', 'max-sessions']);

const authStore = useAuthStore();
const { savedAccounts } = storeToRefs(authStore);

const loading = ref(true);
const switching = ref(false);
const loginUrl = buildSsoLoginUrl();

/** savedAccounts 对象 → 数组（便于 v-for，按最近无序） */
const accountList = computed(() => Object.entries(savedAccounts.value).map(([uid, acct]) => ({ uid, ...acct })));

function close() {
  emit('close');
}

/** 点击账号 chip 免密切换 */
async function onSwitchAccount(acct: { uid: string; refreshToken: string }) {
  switching.value = true;
  try {
    const result = await authStore.switchAccount(acct.refreshToken);
    if (result.ok) {
      emit('login-success', { user: result.user, switched: true });
      close();
    }
    // 失败（refreshToken 失效）：authStore 已删该项，列表自动更新，用户走 iframe 登录
  } finally {
    switching.value = false;
  }
}

/** 点击 x 忘掉该账号 */
async function onRevoke(acct: { uid: string; refreshToken: string }) {
  await authStore.revokeSavedAccount(acct.refreshToken);
}

// Handle message from iframe (e.g., login success)
const handleMessage = async (event: MessageEvent) => {
  if (event.data && event.data.type === 'LOGIN_SUCCESS') {
    const { token, sessionToken, user } = event.data;

    let boundRefreshToken: string | null = null;

    // Session 模式：用临时 token 换取 sid/sid_r Cookie + refreshToken
    if (sessionToken) {
      try {
        const res: any = await firewallApi.bindSession(sessionToken);
        boundRefreshToken = res?.refreshToken || null;
      } catch (err) {
        console.warn('绑定 Session 失败:', err);
      }
    }

    // JWT 模式：用 access_token 换取 Cookie
    if (token) {
      try {
        await firewallApi.bindToken(token);
      } catch (err) {
        console.warn('绑定 Token 失败:', err);
      }
    }

    // 记录到已登录账号清单（refreshToken 存 localStorage 供下次免切）
    if (boundRefreshToken) {
      authStore.addSavedAccount(user, boundRefreshToken);
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
  // Simulate loading finish (or use iframe onload)
  setTimeout(() => {
    loading.value = false;
  }, 1500);
});

onUnmounted(() => {
  window.removeEventListener('message', handleMessage);
});
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
