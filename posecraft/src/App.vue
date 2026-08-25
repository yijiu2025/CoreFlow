<template>
  <div :class="{ dark: themeStore.isDark }">
    <div
      class="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50 transition-colors duration-300"
    >
      <router-view />
    </div>

    <!-- 全局登录弹窗（401 刷新失败 / 未登录点击触发，不跳页） -->
    <LoginModal
      :is-open="authStore.showLoginModal"
      @close="authStore.closeLoginModal"
      @login-success="handleLoginSuccess"
      @login-error="handleLoginError"
      @max-sessions="handleMaxSessions"
    />
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import LoginModal from '@/components/modals/login/LoginModal.vue';

const themeStore = useThemeStore();
const authStore = useAuthStore();
const router = useRouter();

/** 全局弹窗登录成功：恢复登录态 + 拉权限 + 资料 + 跳回原意图路由 */
async function handleLoginSuccess(data: { user: any; token?: string }) {
  authStore.setLoggedIn(true, data.user, data.token);
  // 和 checkSession 对齐：拉权限 + 资料（头像来自 profile），失败不影响登录态
  await authStore.fetchPermissions().catch(() => {});
  await authStore.fetchUserProfile().catch(() => {});
  authStore.closeLoginModal();
  // 跳回受保护路由登录前的原意图（如 /mine、/editor）
  const redirect = authStore.consumePendingRedirect();
  if (redirect && redirect !== router.currentRoute.value.fullPath) {
    router.push(redirect);
  }
}

/** 设备数量超限 */
function handleMaxSessions(data: { sessions: number; maxSessions: number }) {
  alert(`设备数量已达上限 (${data.sessions}/${data.maxSessions})，请先退出其他设备`);
}

/** 登录流程失败（如 bind-session 换 cookie 失败） */
function handleLoginError(err: Error) {
  alert(err.message || '登录失败，请重试');
}
</script>
