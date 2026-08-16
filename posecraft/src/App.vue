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
      @max-sessions="handleMaxSessions"
    />
  </div>
</template>

<script setup lang="ts">
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import LoginModal from '@/components/modals/login/LoginModal.vue';

const themeStore = useThemeStore();
const authStore = useAuthStore();

/** 全局弹窗登录成功：恢复登录态 + 拉权限（复用 LoginView 逻辑） */
async function handleLoginSuccess(data: { user: any; token?: string }) {
  authStore.setLoggedIn(true, data.user, data.token);
  await authStore.fetchPermissions();
  authStore.closeLoginModal();
}

/** 设备数量超限 */
function handleMaxSessions(data: { sessions: number; maxSessions: number }) {
  alert(`设备数量已达上限 (${data.sessions}/${data.maxSessions})，请先退出其他设备`);
}
</script>
