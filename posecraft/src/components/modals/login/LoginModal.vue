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

        <!-- 模式 A：账号列表（主题感知，聚焦式布局） -->
        <div
          v-if="mode === 'accounts' && accountList.length"
          class="flex flex-col h-[484px]"
        >
          <!-- 顶部标题区 -->
          <div class="text-center pt-8 pb-2 px-6">
            <h2 class="font-bold text-slate-900 dark:text-white" style="font-size: 20px; line-height: 1.3">
              {{ LOGIN_COPY.title }}
            </h2>
            <p class="text-slate-500 dark:text-slate-400 mt-1.5" style="font-size: 13px">
              {{ LOGIN_COPY.subtitle }}
            </p>
          </div>

          <!-- 账号卡片列表区（上下居中） -->
          <div class="flex-1 flex flex-col items-center justify-center px-6">
            <div class="flex flex-col w-[480px] max-w-full" style="gap: 12px">
              <button
                v-for="acct in accountList"
                :key="acct.accountKey"
                type="button"
                :disabled="switching || isCurrentAccount(acct.accountKey)"
                @click="!isCurrentAccount(acct.accountKey) && onSwitchAccount(acct)"
                class="account-card group relative flex items-center rounded-[8px] border transition-all text-left overflow-hidden disabled:cursor-default"
                :style="{ padding: '14px 16px', minHeight: '72px' }"
                :class="{
                  'border-cyan-400/60 dark:border-cyan-400/50 bg-cyan-50/70 dark:bg-cyan-500/10':
                    isCurrentAccount(acct.accountKey),
                  'border-slate-200 dark:border-slate-700 bg-[#f8f8f8] dark:bg-slate-800/60 hover:border-red-400 dark:hover:border-red-400/60 hover:bg-white dark:hover:bg-slate-800':
                    !isCurrentAccount(acct.accountKey)
                }"
              >
                <!-- 当前账号左侧竖条 -->
                <span
                  v-if="isCurrentAccount(acct.accountKey)"
                  class="absolute left-0 top-0 bottom-0 w-[3px] bg-red-500"
                ></span>

                <!-- 左侧头像 44px -->
                <img
                  v-if="acct.avatar"
                  :src="acct.avatar"
                  class="rounded-full object-cover flex-shrink-0 ring-2 ring-white dark:ring-slate-700"
                  style="width: 44px; height: 44px"
                  :alt="acct.username"
                />
                <div
                  v-else
                  class="rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white flex-shrink-0"
                  style="width: 44px; height: 44px; font-size: 17px"
                >
                  {{ acct.username.charAt(0) }}
                </div>

                <!-- 中间用户名 + 上次登录 -->
                <div class="flex-1 min-w-0" style="margin-left: 14px">
                  <div class="font-semibold text-slate-900 dark:text-white truncate" style="font-size: 15px">
                    {{ acct.username }}
                  </div>
                  <div class="mt-1 flex items-center gap-1.5" style="font-size: 11px">
                    <span v-if="isCurrentAccount(acct.accountKey)" class="text-cyan-600 dark:text-cyan-400 font-medium">
                      ● 当前登录
                    </span>
                    <span v-else class="text-slate-400 dark:text-slate-500">
                      上次登录 {{ formatLastLogin(acct.lastLoginAt) }}
                    </span>
                  </div>
                </div>

                <!-- 右侧操作 -->
                <div class="flex items-center flex-shrink-0" style="gap: 8px">
                  <!-- 非当前：登录按钮（rememberMe=true=一键免切；false=去登录页） -->
                  <span
                    v-if="!isCurrentAccount(acct.accountKey)"
                    class="inline-flex items-center justify-center text-white font-semibold rounded-[6px] transition-colors group-hover:bg-red-600"
                    style="width: 88px; height: 32px; font-size: 12px; background-color: #ff4d4f"
                  >
                    {{ switching ? '切换中…' : acct.rememberMe ? '一键登录' : '去登录' }}
                  </span>
                  <!-- 删除图标 -->
                  <button
                    type="button"
                    @click.stop="onRevoke(acct)"
                    class="flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
                    style="width: 20px; height: 20px"
                    title="忘掉该账号"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </button>
            </div>
          </div>

          <!-- 底部分隔线 + 协议 + 登录其他账号 -->
          <div class="px-6 pb-6 pt-4">
            <div class="border-t border-slate-200 dark:border-slate-700 mb-4"></div>
            <div class="flex flex-col items-center" style="gap: 12px">
              <button
                @click="mode = 'login'"
                class="inline-flex items-center gap-1.5 font-medium transition-colors"
                style="font-size: 14px; color: #1890ff"
              >
                <UserPlus class="w-4 h-4" />
                登录其他账号
              </button>
              <p class="text-slate-400 dark:text-slate-500" style="font-size: 11px">
                登录即同意
                <span
                  class="text-slate-500 dark:text-slate-400 underline-offset-2 hover:underline cursor-pointer"
                  @click.stop.prevent="docType = 'service'"
                >用户协议</span>
                和
                <span
                  class="text-slate-500 dark:text-slate-400 underline-offset-2 hover:underline cursor-pointer"
                  @click.stop.prevent="docType = 'privacy'"
                >隐私政策</span>
              </p>
            </div>
          </div>
        </div>

        <!-- 模式 B：iframe 登录（无账号 / 点了"登录其他账号"） -->
        <div v-else class="w-full relative h-[484px]">
          <iframe
            ref="iframeRef"
            :src="loginUrl"
            class="w-full h-full border-none"
            allow="payment"
            @load="onIframeLoad"
          ></iframe>

          <!-- 有账号时显示"返回账号列表"（实色不透明，避免 iframe 背景上 hover 看不清） -->
          <button
            v-if="accountList.length"
            @click="mode = 'accounts'"
            class="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shadow-sm border transition-all bg-white/90 hover:bg-white text-slate-700 hover:text-slate-900 border-slate-200 dark:bg-slate-800/90 dark:hover:bg-slate-700 dark:text-slate-200 dark:hover:text-white dark:border-slate-600"
          >
            <ArrowLeft class="w-3.5 h-3.5" />
            返回账号列表
          </button>

          <!-- 优雅加载指示器（iframe 加载中显示，加载完淡出；不全遮，主题感知） -->
          <Transition name="fade">
            <div
              v-if="loading"
              class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/85 dark:bg-slate-900/85 backdrop-blur-sm"
            >
              <div class="relative w-10 h-10">
                <div class="absolute inset-0 rounded-full border-2 border-slate-200 dark:border-slate-700"></div>
                <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-red-500 animate-spin"></div>
              </div>
              <span class="text-xs text-slate-500 dark:text-slate-400">正在加载安全登录…</span>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </Transition>

  <!-- 用户协议 / 隐私政策 弹窗（统一组件，正文懒加载） -->
  <AgreementModals v-model:type="docType" />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { X, UserPlus, ArrowLeft, Trash2 } from 'lucide-vue-next';
import { buildSsoLoginUrl, SSO_URL, LOGIN_COPY } from '@/config/services';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import AgreementModals from '@/components/common/AgreementModals.vue';

const props = defineProps({
  isOpen: Boolean
});

const emit = defineEmits(['close', 'login-success', 'max-sessions', 'login-error']);

const authStore = useAuthStore();
const themeStore = useThemeStore();
const { savedAccounts } = storeToRefs(authStore);

const loading = ref(true);
const switching = ref(false);
/** iframe src URL：computed 让主题变化时 URL 重新生成（含 theme 参数，oauth21 iframe 首屏就带主题不闪白） */
const loginUrl = computed(() => buildSsoLoginUrl(themeStore.isDark ? 'dark' : 'light'));
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
/** 协议弹窗状态：null 关闭，'service' / 'privacy' 打开对应协议 */
const docType = ref<'service' | 'privacy' | null>(null);

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
    // 锁背景滚动（弹窗打开禁用 body 滚动，关闭恢复）
    document.body.style.overflow = val ? 'hidden' : '';
    if (!val) {
      // 关闭时若 body 无其他锁定则恢复
      document.body.style.overflow = '';
    }
    if (val) {
      mode.value = accountList.value.length ? 'accounts' : 'login';
      // loading 由 iframe @load 事件真实触发关闭（不再用 setTimeout 假装）
      if (mode.value === 'login') {
        loading.value = true;
      }
    }
  }
);

/** iframe 加载完成（真实触发，替代 setTimeout）：同步当前主题给 oauth21 iframe */
function onIframeLoad() {
  loading.value = false;
  // 初始主题同步（iframe 加载后立即把父应用当前主题发给子应用，避免 iframe 首屏主题闪烁）
  themeStore.syncThemeToIframes(themeStore.isDark);
}

function close() {
  emit('close');
}

/** 点击账号卡片：rememberMe=true 走免切；false（临时登录无凭证）直接跳 iframe 登录页 */
async function onSwitchAccount(acct: { accountKey: string; rememberMe?: boolean }) {
  if (!acct.accountKey) return;
  // 非保持登录账号：后端无凭证 cookie，免切必失败，直接跳 iframe 登录页
  if (!acct.rememberMe) {
    mode.value = 'login';
    return;
  }
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
    let { token, sessionToken, user } = event.data;

    let accountKey: string | null = null;
    let rememberMe = false;

    // Session 模式：用临时 session_token 换取 sid/sid_r + 凭证 cookie（记住我才有）
    // accountKey 始终返回 uid（无论是否保持登录），rememberMe 标记是否可免切
    // bind-session 返回的 res.user 含 uid（postMessage 的 user 无 uid），优先用它
    // 失败必须中断登录流程并提示，否则后端没换到 sid cookie，前端却"登录成功"关弹窗 → 假登录
    // bind-session 失败时 HTTP 返回非 2xx，axios 走 catch（不会走 res 分支）
    if (sessionToken) {
      try {
        const res: any = await authApi.bindSession(sessionToken);
        accountKey = res?.accountKey || null;
        rememberMe = !!res?.rememberMe;
        if (res?.user?.uid) user = { ...user, ...res.user };
      } catch (err: any) {
        const msg = err?.response?.data?.message || err?.message || '登录会话绑定失败';
        emit('login-error', new Error(msg));
        close();
        return;
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

    // 记录到已登录账号清单：accountKey 非空即记录（无论 rememberMe，都显示在列表）
    // rememberMe=true=可免切（后端已写凭证 cookie）；false=临时登录，点它跳登录页
    if (accountKey) {
      authStore.addSavedAccount(user, accountKey, rememberMe);
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
  document.body.style.overflow = ''; // 确保卸载时恢复 body 滚动
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

/* 加载指示器淡入淡出 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
