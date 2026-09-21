<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any -- 后端 OAuth 响应字段动态，any 合理 */
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { authApi } from '@/api/auth';
import { isMobileViewport } from '@/utils/device';
import { useDeviceDetect } from '@/composables/useDeviceDetect';
import MessageToast from '@/components/common/MessageToast.vue';
import { useMessage } from '@/composables/useMessage';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { error: showError } = useMessage();

const loading = ref(true);
const errorMsg = ref('');
/** 缺少必要 OAuth 参数：不属于"出错"，而是访问方式不对，给友好引导 */
const paramsMissing = ref(false);
const appInfo = ref({
  name: '',
  icon: '',
  description: ''
});

// 响应式设备形态：窄屏/真机下压缩间距、列表可滚动
const { isMobileDevice } = useDeviceDetect();

// scope 详情由后端返回（resolveScopeDetails 合并系统 registry + client scope_metadata 覆盖）
// 前端不维护 scope→描述映射，避免与后端口径不一致
const scopes = ref<Array<{ id: string; name: string; desc: string; required: boolean; sensitive?: boolean }>>([]);
const sessionId = ref('');
const userId = ref('');
/** 提交中：防双击导致重复签发 code */
const submitting = ref(false);

/** OAuth 标准参数是否齐全（缺 client_id / redirect_uri 无法开展授权） */
const hasOAuthParams = () =>
  typeof route.query.client_id === 'string' && !!route.query.client_id;

/** 从响应里取后端校验过的跳转地址（不直接用 query.redirect_uri，防开放重定向） */
function pickRedirectUrl(res: any): string | undefined {
  return res?.redirect_url || res?.data?.redirect_url;
}

// 确认授权：调后端 /oauth2.1/authorize/consent，后端签发 code 并 302 到 redirect_uri
const handleApprove = async () => {
  if (submitting.value) return;
  submitting.value = true;
  try {
    // request.ts 拦截器已解包 AxiosResponse.data，类型断言拿 redirect_url
    const res = (await authApi.authorizeConsent({
      sessionId: sessionId.value,
      user_id: userId.value,
      action: 'approve'
    })) as unknown as { redirect_url?: string; data?: { redirect_url?: string } };
    const redirectUrl = pickRedirectUrl(res);
    if (redirectUrl) {
      window.location.href = redirectUrl;
    } else {
      errorMsg.value = t('auth.redirect_missing');
      showError(t('auth.redirect_missing'));
    }
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : t('auth.approve_failed');
  } finally {
    submitting.value = false;
  }
};

// 拒绝授权：调后端记录拒绝，跳回 redirect_uri 带 error=access_denied
const handleDeny = async () => {
  if (submitting.value) return;
  submitting.value = true;
  try {
    // 从服务端响应取校验过的 redirect_url（不直接用 route.query.redirect_uri，防开放重定向）
    const res = (await authApi.authorizeConsent({
      sessionId: sessionId.value,
      user_id: userId.value,
      action: 'deny'
    })) as unknown as { redirect_url?: string; data?: { redirect_url?: string } };
    const redirectUrl = pickRedirectUrl(res);
    if (redirectUrl) {
      window.location.href = redirectUrl;
    } else {
      router.back();
    }
  } catch {
    router.back();
  } finally {
    submitting.value = false;
  }
};

/** 未登录 → 去登录页，带回参。按设备选移动端全屏页或桌面标准页 */
function goLogin() {
  const query = new URLSearchParams(
    Object.entries(route.query).map(([k, v]) => [k, String(v ?? '')])
  );
  query.set('from', 'authorize');
  // 登录后回跳目标：当前授权页完整地址（登录页读 ?redirect= 完成回跳）
  const current = route.fullPath;
  query.set('redirect', current);
  const loginPath = isMobileViewport() ? '/m/login' : '/login';
  router.replace(`${loginPath}?${query.toString()}`);
}

onMounted(async () => {
  // 全屏直接访问但没带 OAuth 参数：给友好引导而不是把后端 raw error 抛给用户
  if (!hasOAuthParams()) {
    paramsMissing.value = true;
    loading.value = false;
    return;
  }

  try {
    // request.ts 拦截器已解包 AxiosResponse.data，类型断言拿后端字段
    const res = (await authApi.checkAuthorize({
      client_id: route.query.client_id,
      redirect_uri: route.query.redirect_uri,
      response_type: route.query.response_type || 'code',
      scope: route.query.scope,
      state: route.query.state,
      code_challenge: route.query.code_challenge,
      code_challenge_method: route.query.code_challenge_method,
      nonce: route.query.nonce
    })) as unknown as {
      action?: 'login' | 'consent' | string;
      client_name?: string;
      scope?: string;
      scopeDetails?: Array<{ name?: string; desc?: string; required?: boolean }>;
      sessionId?: string;
      user_id?: string;
      data?: { action?: string; client_name?: string; scope?: string };
    };

    const data = res?.data || res;
    if (data.action === 'login') {
      goLogin();
      return;
    }

    appInfo.value.name = data.client_name || t('login.third_party');
    appInfo.value.description = t('auth.app_desc', { app: appInfo.value.name });
    // 优先用后端返回的 scopeDetails（带人话描述）；无则空数组
    scopes.value = Array.isArray(data.scopeDetails) ? data.scopeDetails : [];
    sessionId.value = data.sessionId;
    userId.value = data.user_id;
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : t('auth.load_failed');
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="authorize-viewport" :class="{ 'is-mobile': isMobileDevice }">
    <div class="authorize-card animate-slide-up">
      <!-- 加载中 -->
      <div v-if="loading" class="auth-state">
        <div class="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        <p class="mt-4 text-sm text-slate-400">{{ t('auth.loading') }}</p>
      </div>

      <!-- 缺参数（全屏直接打开 /authorize 的常见情况） -->
      <div v-else-if="paramsMissing" class="auth-state">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-4">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#f59e0b" stroke-width="2">
            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </div>
        <h2 class="text-lg font-bold dark:text-white mb-2">{{ t('auth.params_missing_title') }}</h2>
        <p class="text-slate-400 text-xs leading-relaxed">{{ t('auth.params_missing_desc') }}</p>
      </div>

      <!-- 出错 -->
      <div v-else-if="errorMsg" class="auth-state">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mb-4">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#f43f5e" stroke-width="2">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <h2 class="text-lg font-bold dark:text-white mb-2">{{ t('auth.failed_title') }}</h2>
        <p class="text-slate-400 text-xs leading-relaxed break-words">{{ errorMsg }}</p>
      </div>

      <!-- 授权确认 -->
      <div v-else class="auth-body">
        <!-- 应用 Header -->
        <div class="flex flex-col items-center text-center mb-6 sm:mb-10">
          <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-primary to-indigo-600 p-[2px] shadow-xl shadow-primary/20 mb-4 sm:mb-6">
            <div class="w-full h-full bg-white dark:bg-slate-900 rounded-[14px] flex items-center justify-center text-2xl sm:text-3xl">
              {{ appInfo.name.charAt(0).toUpperCase() }}
            </div>
          </div>
          <h2 class="text-xl sm:text-2xl font-bold dark:text-white mb-2">{{ appInfo.name }} {{ t('auth.requests_auth') }}</h2>
          <p class="text-slate-400 text-xs px-2 sm:px-10">{{ appInfo.description }}</p>
        </div>

        <!-- 权限列表 -->
        <div class="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 sm:p-6 mb-6 sm:mb-10 border border-slate-100 dark:border-slate-800">
          <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">{{ t('auth.permissions_title') }}</p>
          <div class="space-y-4 sm:space-y-5">
            <div v-for="scope in scopes" :key="scope.id" class="flex items-start gap-3 sm:gap-4">
              <div class="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mt-0.5 shrink-0">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="4">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <div class="min-w-0">
                <p class="text-sm font-bold dark:text-slate-200">
                  {{ scope.name }}
                  <span v-if="scope.required" class="ml-1 text-[10px] font-medium text-rose-500">{{ t('auth.required') }}</span>
                </p>
                <p class="text-[11px] text-slate-400 leading-tight mt-1 break-words">{{ scope.desc }}</p>
              </div>
            </div>
            <p v-if="!scopes.length" class="text-xs text-slate-400">{{ t('auth.no_scopes') }}</p>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex flex-col gap-3">
          <button @click="handleApprove" :disabled="submitting" class="auth-btn">
            <span v-if="submitting" class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2 align-[-2px]"></span>
            {{ submitting ? t('auth.processing') : t('auth.allow_continue') }}
          </button>
          <button @click="handleDeny" :disabled="submitting" class="auth-btn-ghost">{{ t('auth.cancel') }}</button>
        </div>

        <p class="mt-6 sm:mt-8 text-center text-[10px] text-slate-400 leading-relaxed">
          {{ t('auth.footer_hint') }}
        </p>
      </div>
    </div>

    <MessageToast />
  </div>
</template>

<style scoped>
.authorize-viewport {
  /* dvh：移动端浏览器地址栏收放时不会把内容顶出屏幕；100vh 作为老浏览器兜底 */
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
  font-family: 'Outfit', sans-serif;
  /* 全屏直接访问时允许滚动（长权限列表 / 小屏），并按安全区留白 */
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.dark .authorize-viewport {
  background: #0f172a;
}

.authorize-card {
  width: 100%;
  max-width: 440px;
  background: white;
  border-radius: 24px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.08);
  margin: auto;
}

.dark .authorize-card {
  background: #1e293b;
  border: 1px solid #334155;
}

/* 桌面宽屏恢复大圆角，移动端用紧凑圆角 */
@media (min-width: 640px) {
  .authorize-card {
    border-radius: 32px;
  }
}

/* 内容区：移动端紧凑内边距，避免 375px 屏幕被 40px padding 挤扁 */
.auth-body {
  padding: 24px 20px;
}

@media (min-width: 640px) {
  .auth-body {
    padding: 40px;
  }
}

/* 加载 / 缺参 / 出错 状态块：不定高，内容自适应（原来固定 h-400px 在小屏会溢出） */
.auth-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 56px 24px;
}

.auth-btn {
  height: 48px;
  width: 100%;
  border: none;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
  cursor: pointer;
  transition: all 0.2s ease;
}

.auth-btn:hover:not(:disabled) {
  opacity: 0.95;
  transform: translateY(-1px);
}

.auth-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.auth-btn-ghost {
  height: 44px;
  width: 100%;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  background: transparent;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  transition: all 0.2s;
}

.dark .auth-btn-ghost {
  color: #94a3b8;
  border-color: #334155;
}

.auth-btn-ghost:hover:not(:disabled) {
  background: #f8fafc;
}

.dark .auth-btn-ghost:hover:not(:disabled) {
  background: #0f172a;
}

.animate-slide-up {
  animation: slide-up 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 尊重系统"减弱动效"设置 */
@media (prefers-reduced-motion: reduce) {
  .animate-slide-up {
    animation: none;
  }
}
</style>
