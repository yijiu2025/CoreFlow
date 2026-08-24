<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authApi } from '@/api/auth';

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const errorMsg = ref('');
const appInfo = ref({
  name: '',
  icon: '',
  description: '该应用申请访问您的基础资料及权限。'
});

// scope 详情由后端返回（resolveScopeDetails 合并系统 registry + 客户端 scope_metadata 覆盖）
// 前端不维护 scope→描述映射，避免与后端口径不一致
const scopes = ref<Array<{ id: string; name: string; desc: string; required: boolean; sensitive?: boolean }>>([]);
const sessionId = ref('');
const userId = ref('');

// 确认授权：调后端 /oauth2.1/authorize/consent，后端签发 code 并 302 到 redirect_uri
const handleApprove = async () => {
  try {
    const res: any = await authApi.authorizeConsent({
      sessionId: sessionId.value,
      user_id: userId.value,
      action: 'approve'
    });
    // 后端可能返回 302 重定向 URL（前端无法直接跟随），或返回 {redirect_url}
    const redirectUrl = res?.redirect_url || res?.data?.redirect_url;
    if (redirectUrl) {
      window.location.href = redirectUrl;
    } else {
      errorMsg.value = '授权成功但未返回跳转地址';
    }
  } catch (err: any) {
    errorMsg.value = err.message || '授权失败';
  }
};

// 拒绝授权：调后端记录拒绝，跳回 redirect_uri 带 error=access_denied
const handleDeny = async () => {
  try {
    await authApi.authorizeConsent({
      sessionId: sessionId.value,
      user_id: userId.value,
      action: 'deny'
    });
  } catch {
    // 忽略错误，仍跳回
  }
  const redirectUri = route.query.redirect_uri as string;
  if (redirectUri) {
    const sep = redirectUri.includes('?') ? '&' : '?';
    window.location.href = `${redirectUri}${sep}error=access_denied`;
  } else {
    router.back();
  }
};

onMounted(async () => {
  try {
    // 调后端 /oauth2.1/authorize 获取授权信息（应用名 + scope + 用户）
    const res: any = await authApi.checkAuthorize({
      client_id: route.query.client_id,
      redirect_uri: route.query.redirect_uri,
      response_type: route.query.response_type || 'code',
      scope: route.query.scope,
      state: route.query.state,
      code_challenge: route.query.code_challenge,
      code_challenge_method: route.query.code_challenge_method,
      nonce: route.query.nonce
    });

    const data = res?.data || res;
    if (data.action === 'login') {
      // 未登录 → 跳登录页（带回参）
      const loginQuery = new URLSearchParams(
        Object.entries(route.query).map(([k, v]) => [k, String(v || '')])
      ).toString();
      router.replace(`/mini-login?${loginQuery}&from=authorize`);
      return;
    }

    appInfo.value.name = data.client_name || '外部应用';
    // 优先用后端返回的 scopeDetails（带人话描述）；无则空数组
    scopes.value = Array.isArray(data.scopeDetails) ? data.scopeDetails : [];
    sessionId.value = data.sessionId;
    userId.value = data.user_id;
  } catch (err: any) {
    errorMsg.value = err.message || '获取授权信息失败';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="authorize-viewport">
    <div class="authorize-card glass-effect animate-slide-up">
      <div v-if="loading" class="flex flex-col items-center justify-center h-[400px]">
        <div class="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        <p class="mt-4 text-sm text-slate-400">正在获取授权信息...</p>
      </div>

      <div v-else-if="errorMsg" class="flex flex-col items-center justify-center h-[400px]">
        <div class="text-red-500 text-lg font-semibold mb-2">授权失败</div>
        <p class="text-slate-400 text-sm">{{ errorMsg }}</p>
      </div>

      <div v-else class="p-10">
        <!-- 应用 Header -->
        <div class="flex flex-col items-center text-center mb-10">
          <div
            class="w-20 h-20 rounded-2xl bg-gradient-to-tr from-primary to-indigo-600 p-[2px] shadow-xl shadow-primary/20 mb-6"
          >
            <div
              class="w-full h-full bg-white dark:bg-slate-900 rounded-[14px] flex items-center justify-center text-3xl"
            >
              {{ appInfo.name.charAt(0).toUpperCase() }}
            </div>
          </div>
          <h2 class="text-2xl font-bold dark:text-white mb-2">{{ appInfo.name }} 申请授权</h2>
          <p class="text-slate-400 text-xs px-10">{{ appInfo.description }}</p>
        </div>

        <!-- 权限列表 -->
        <div
          class="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 mb-10 border border-slate-100 dark:border-slate-800"
        >
          <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">该应用将获得以下权限</p>
          <div class="space-y-5">
            <div v-for="scope in scopes" :key="scope.id" class="flex items-start gap-4">
              <div
                class="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mt-0.5 shrink-0"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="4">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-bold dark:text-slate-200">{{ scope.name }}</p>
                <p class="text-[11px] text-slate-400 leading-tight mt-1">{{ scope.desc }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex flex-col gap-3">
          <button @click="handleApprove" class="auth-btn">允许授权并继续</button>
          <button @click="handleDeny" class="auth-btn-ghost">取消</button>
        </div>

        <p class="mt-8 text-center text-[10px] text-slate-400">
          授权后即代表您同意该应用访问您的部分公开数据。您可以随时在安全中心撤销授权。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.authorize-viewport {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
  font-family: 'Outfit', sans-serif;
}

.dark .authorize-viewport {
  background: #0f172a;
}

.authorize-card {
  width: 100%;
  max-width: 440px;
  background: white;
  border-radius: 32px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.08);
}

.dark .authorize-card {
  background: #1e293b;
  border: 1px solid #334155;
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
</style>
