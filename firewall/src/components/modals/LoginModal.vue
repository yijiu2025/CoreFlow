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

        <!-- 模式 A：账号列表（抖音式单列卡片） -->
        <div v-if="mode === 'accounts' && accountList.length" class="p-8 flex flex-col" style="min-height: 484px">
          <!-- 顶部标题 -->
          <div class="text-center mb-6">
            <h2 class="text-lg font-semibold text-white">登录后免费畅享高清视频</h2>
          </div>

          <!-- 账号卡片列表（单列） -->
          <div class="flex flex-col gap-3 mb-auto">
            <div
              v-for="acct in accountList"
              :key="acct.accountKey"
              class="account-card group flex items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 transition-all"
              :class="{
                'ring-1 ring-cyan-400/50 bg-cyan-500/5': isCurrentAccount(acct.accountKey),
                'hover:bg-white/10': !isCurrentAccount(acct.accountKey)
              }"
            >
              <!-- 左侧头像 -->
              <img
                v-if="acct.avatar"
                :src="acct.avatar"
                class="w-12 h-12 rounded-full object-cover flex-shrink-0"
                :alt="acct.username"
              />
              <div
                v-else
                class="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-base font-bold text-white flex-shrink-0"
              >
                {{ acct.username.charAt(0) }}
              </div>

              <!-- 中间用户名 + 上次登录 -->
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-white truncate">{{ acct.username }}</div>
                <div class="text-xs text-red-400 mt-0.5">
                  {{ isCurrentAccount(acct.accountKey) ? '当前账号' : '上次登录 ' + formatLastLogin(acct.lastLoginAt) }}
                </div>
              </div>

              <!-- 右侧一键登录 + 删除 -->
              <button
                v-if="!isCurrentAccount(acct.accountKey)"
                @click="onSwitchAccount(acct)"
                :disabled="switching"
                class="px-4 py-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {{ switching ? '切换中' : '一键登录' }}
              </button>
              <span
                v-else
                class="px-3 py-1.5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-medium flex-shrink-0"
              >
                当前
              </span>

              <button
                @click="onRevoke(acct)"
                class="p-1.5 rounded-full text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                title="忘掉该账号"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- 底部协议 + 登录其他账号 -->
          <div class="mt-6 text-center">
            <p class="text-xs text-slate-500 mb-3">登录即同意 <span class="text-slate-400">用户协议</span> 和 <span class="text-slate-400">隐私政策</span></p>
            <button
              @click="mode = 'login'"
              class="inline-flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              登录其他账号
              <ArrowRight class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- 模式 B：iframe 登录（无账号 / 点了"登录其他账号"） -->
        <div v-else class="w-full relative h-[484px]">
          <iframe ref="iframeRef" :src="loginUrl" class="w-full h-full border-none" allow="payment"></iframe>

          <!-- 有账号时显示"返回账号列表" -->
          <button
            v-if="accountList.length"
            @click="mode = 'accounts'"
            class="absolute top-6 left-6 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs transition-all"
          >
            <ArrowLeft class="w-3.5 h-3.5" />
            返回账号列表
          </button>

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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { X, UserPlus, ArrowLeft, ArrowRight, Trash2 } from 'lucide-vue-next';
import { buildSsoLoginUrl, SSO_URL } from '@/config/services';
import { firewallApi } from '@/api/firewall';
import { useAuthStore } from '@/stores/auth';

/** 只接受 oauth21 SSO 域的 postMessage（防恶意页面伪造 LOGIN_SUCCESS） */
const SSO_ORIGIN = (() => {
  try {
    return new URL(SSO_URL).origin;
  } catch {
    return '';
  }
})();

const props = defineProps({
  isOpen: Boolean
});

const emit = defineEmits(['close', 'login-success', 'max-sessions']);

const authStore = useAuthStore();
const { savedAccounts } = storeToRefs(authStore);

const loading = ref(true);
const switching = ref(false);
const loginUrl = buildSsoLoginUrl();
/** SSO iframe 引用（用于校验 message 来源窗口） */
const iframeRef = ref<HTMLIFrameElement | null>(null);
/** 'accounts'（账号列表）/ 'login'（iframe 登录），二选一 */
const mode = ref<'accounts' | 'login'>('accounts');

/** savedAccounts 对象 → 数组（便于 v-for） */
const accountList = computed(() =>
  Object.entries(savedAccounts.value).map(([accountKey, acct]) => ({ accountKey, ...acct }))
);

/** 判断某账号是否当前登录账号（用 uid 匹配 accountKey） */
function isCurrentAccount(accountKey: string): boolean {
  return !!authStore.user?.uid && authStore.user.uid === accountKey;
}

/** 格式化上次登录时间：刚刚 / N分钟前 / N小时前 / N天前 */
function formatLastLogin(ts?: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${Math.floor(diff / 86400000)}天前`;
}

/** 弹窗打开时：有账号默认显示列表，无账号直接 iframe 登录 */
watch(
  () => props.isOpen,
  val => {
    if (val) {
      mode.value = accountList.value.length ? 'accounts' : 'login';
      loading.value = true;
      setTimeout(() => {
        loading.value = false;
      }, 1500);
    }
  }
);

function close() {
  emit('close');
}

/** 点击账号卡片免密切换 */
async function onSwitchAccount(acct: { accountKey: string }) {
  if (!acct.accountKey) return;
  switching.value = true;
  try {
    const result = await authStore.switchAccount(acct.accountKey);
    if (result.ok) {
      emit('login-success', { user: result.user, switched: true });
      close();
    }
    // 失败（凭证失效）：authStore 已删该项，列表自动更新；无账号则切到 iframe 登录
    if (!accountList.value.length) mode.value = 'login';
  } finally {
    switching.value = false;
  }
}

/** 点击 x 忘掉该账号 */
async function onRevoke(acct: { accountKey: string }) {
  if (!acct.accountKey) return;
  await authStore.revokeSavedAccount(acct.accountKey);
  // 删完无账号则切到 iframe 登录
  if (!accountList.value.length) mode.value = 'login';
}

// Handle message from iframe (e.g., login success)
//
// 安全校验：只接受来自 SSO iframe（origin 匹配 + source 匹配）的消息。
// 否则恶意页面/第三方 iframe 可伪造 { type:'LOGIN_SUCCESS', sessionToken } 注入
// 攻击者账号的 session_token，让本应用在自身域上绑定攻击者会话。
const handleMessage = async (event: MessageEvent) => {
  // 1. origin 必须是 SSO 登录服务的 origin
  if (event.origin !== SSO_ORIGIN) return;
  // 2. source 必须是当前 SSO iframe 窗口（排除其他 iframe 或父窗口冒泡）
  if (!iframeRef.value || event.source !== iframeRef.value.contentWindow) return;

  if (event.data && event.data.type === 'LOGIN_SUCCESS') {
    const { token, sessionToken, user } = event.data;

    let accountKey: string | null = null;

    // Session 模式：用临时 session_token 换取 sid/sid_r + 凭证 cookie（记住我才有）
    if (sessionToken) {
      try {
        const res: any = await firewallApi.bindSession(sessionToken);
        accountKey = res?.accountKey || null;
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

    // 记录到已登录账号清单（accountKey=uid 存 localStorage 作 key；临时登录 accountKey=null 不记录）
    // oauth21 是否勾选"保持登录" → accountKey 非空即保持（后端 rememberMe=true 才写凭证 cookie + 返回 accountKey）
    if (accountKey) {
      authStore.addSavedAccount(user, accountKey, true);
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
