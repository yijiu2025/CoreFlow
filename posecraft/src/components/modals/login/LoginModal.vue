<template>
  <Transition name="modal-fade">
    <div v-if="isOpen" class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <!-- Backdrop（主题感知遮罩） -->
      <div
        class="absolute inset-0 bg-slate-950/60 dark:bg-black/70 backdrop-blur-sm"
        @click="close"
      ></div>

      <!-- Modal Content（主题感知：白天白底，黑夜暗底） -->
      <div
        class="relative w-[856px] max-w-[90vw] rounded-[10px] overflow-hidden shadow-2xl border flex flex-col animate-in zoom-in-95 duration-300 bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700"
      >
        <!-- Close Button（主题感知图标色） -->
        <button
          @click="close"
          class="absolute top-2.5 right-2.5 z-10 w-6 h-6 flex items-center justify-center text-slate-800 dark:text-slate-300 hover:text-slate-600 dark:hover:text-white transition-colors"
        >
          <X class="w-5 h-5" />
        </button>

        <!-- 模式 A：账号列表（抖音式单列卡片，主题感知） -->
        <div
          v-if="mode === 'accounts' && accountList.length"
          class="flex flex-col"
          style="min-height: 400px; padding: 20px 20px 20px"
        >
          <!-- 顶部居中标题 -->
          <h2 class="text-center font-bold text-slate-900 dark:text-white mb-4" style="font-size: 18px">
            登录后免费畅享高清视频
          </h2>

          <!-- 账号卡片列表（单列，间距 15px） -->
          <div class="flex flex-col" style="gap: 15px">
            <div
              v-for="acct in accountList"
              :key="acct.accountKey"
              class="flex items-center rounded-[8px] transition-all"
              :style="{ padding: '10px 15px', minHeight: '60px' }"
              :class="{
                'bg-cyan-50 ring-1 ring-cyan-400 dark:bg-cyan-500/10 dark:ring-cyan-400/50':
                  isCurrentAccount(acct.accountKey),
                'bg-[#f8f8f8] hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750':
                  !isCurrentAccount(acct.accountKey)
              }"
            >
              <!-- 左侧头像 40px -->
              <img
                v-if="acct.avatar"
                :src="acct.avatar"
                class="rounded-full object-cover flex-shrink-0"
                style="width: 40px; height: 40px"
                :alt="acct.username"
              />
              <div
                v-else
                class="rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white flex-shrink-0"
                style="width: 40px; height: 40px; font-size: 16px"
              >
                {{ acct.username.charAt(0) }}
              </div>

              <!-- 中间用户名 + 上次登录 -->
              <div class="flex-1 min-w-0" style="margin-left: 10px">
                <div class="font-medium text-slate-900 dark:text-white truncate" style="font-size: 14px">
                  {{ acct.username }}
                </div>
                <div class="text-red-400" style="font-size: 10px; margin-top: 5px">
                  {{ isCurrentAccount(acct.accountKey) ? '当前账号' : '上次登录 ' + formatLastLogin(acct.lastLoginAt) }}
                </div>
              </div>

              <!-- 右侧一键登录按钮 80×30 + 删除图标 -->
              <button
                v-if="!isCurrentAccount(acct.accountKey)"
                @click="onSwitchAccount(acct)"
                :disabled="switching"
                class="text-white font-bold rounded-[6px] transition-colors disabled:opacity-50 flex-shrink-0"
                style="width: 80px; height: 30px; font-size: 12px; background-color: #ff4d4f"
              >
                {{ switching ? '切换中' : '一键登录' }}
              </button>
              <span
                v-else
                class="font-bold rounded-[6px] text-cyan-500 flex items-center justify-center flex-shrink-0"
                style="width: 80px; height: 30px; font-size: 12px; background-color: rgba(34, 211, 238, 0.15)"
              >
                当前
              </span>

              <button
                @click="onRevoke(acct)"
                class="flex items-center justify-center text-slate-400 hover:text-red-400 transition-colors flex-shrink-0"
                style="width: 16px; height: 16px; margin-left: 5px"
                title="忘掉该账号"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>

          <div class="flex-1"></div>

          <!-- 底部协议 + 登录其他账号 -->
          <div class="text-center" style="margin-top: 20px">
            <p class="text-slate-400 dark:text-slate-500" style="font-size: 10px">
              登录即同意 <span class="text-slate-500 dark:text-slate-400">用户协议</span> 和
              <span class="text-slate-500 dark:text-slate-400">隐私政策</span>
            </p>
            <button
              @click="mode = 'login'"
              class="inline-flex items-center gap-1 transition-colors mt-2.5"
              style="font-size: 12px; color: #1890ff"
            >
              登录其他账号
              <ArrowRight class="w-3.5 h-3.5" />
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
            class="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs transition-all"
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
import { authApi } from '@/api/auth';
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
/** SSO iframe 的 origin（postMessage 接收侧只信任此 origin，防恶意页面伪造登录消息） */
const ssoOrigin = (() => {
  try {
    return new URL(SSO_URL).origin;
  } catch {
    return SSO_URL;
  }
})();
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
    // 失败（凭证失效）：authStore 已删该项；无账号则切到 iframe 登录
    if (!accountList.value.length) mode.value = 'login';
  } finally {
    switching.value = false;
  }
}

/** 点击 x 忘掉该账号 */
async function onRevoke(acct: { accountKey: string }) {
  if (!acct.accountKey) return;
  await authStore.revokeSavedAccount(acct.accountKey);
  if (!accountList.value.length) mode.value = 'login';
}

/**
 * 处理 iframe postMessage：登录成功 → 换 cookie → 通知父级；设备超限 → 冒泡
 *
 * 安全校验：只接受来自 SSO iframe（origin 匹配 + source 匹配）的消息。
 * 否则恶意页面/第三方 iframe 可伪造 { type:'LOGIN_SUCCESS', sessionToken } 注入
 * 攻击者账号的 session_token，让本应用在自身域上绑定攻击者会话。
 */
const handleMessage = async (event: MessageEvent) => {
  // 1. origin 必须是 SSO 登录服务的 origin
  if (event.origin !== ssoOrigin) return;
  // 2. source 必须是当前 SSO iframe 窗口（排除其他 iframe 或父窗口冒泡）
  if (!iframeRef.value || event.source !== iframeRef.value.contentWindow) return;

  if (event.data && event.data.type === 'LOGIN_SUCCESS') {
    const { token, sessionToken, user } = event.data;

    let accountKey: string | null = null;

    // Session 模式：用临时 session_token 换取 sid/sid_r + 凭证 cookie（记住我才有）
    if (sessionToken) {
      try {
        const res: any = await authApi.bindSession(sessionToken);
        accountKey = res?.accountKey || null;
      } catch (err) {
        console.warn('绑定 Session 失败:', err);
      }
    }

    // JWT 模式：用 access_token 换取 Cookie
    if (token) {
      try {
        await authApi.bindToken(token);
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
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
