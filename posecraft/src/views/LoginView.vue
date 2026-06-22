<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-purple-50 dark:from-slate-950 dark:to-slate-900">
    <div class="w-full max-w-md p-8">
      <div class="text-center mb-8">
        <div class="w-16 h-16 bg-gradient-to-br from-primary-500 to-purple-500 rounded-2xl flex items-center justify-center text-white text-3xl mx-auto mb-4">
          📸
        </div>
        <h1 class="text-2xl font-bold">欢迎使用 PoseCraft</h1>
        <p class="text-slate-500 mt-2">AI 姿势分析 + 图片编辑平台</p>
      </div>

      <!-- 登录按钮 -->
      <div class="space-y-4">
        <button
          @click="showLoginModal = true"
          class="w-full py-3 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition flex items-center justify-center gap-2"
        >
          🔐 使用 CoreFlow 账号登录
        </button>

        <p class="text-center text-sm text-slate-500">
          登录即表示您同意 PoseCraft 的服务条款
        </p>
      </div>

      <!-- 底部说明 -->
      <div class="mt-8 text-center text-xs text-slate-400">
        <p>由 CoreFlow 提供身份认证支持</p>
      </div>
    </div>

    <!-- 登录弹窗 -->
    <LoginModal
      :is-open="showLoginModal"
      @close="showLoginModal = false"
      @login-success="handleLoginSuccess"
      @max-sessions="handleMaxSessions"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import LoginModal from '@/components/modals/LoginModal.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const showLoginModal = ref(false)

/**
 * 登录成功回调
 */
async function handleLoginSuccess(data: { user: any; token?: string }) {
  authStore.setLoggedIn(true, data.user, data.token)
  await authStore.fetchPermissions()

  const redirect = (route.query.redirect as string) || '/'
  router.push(redirect)
}

/**
 * 设备数量超限回调
 */
function handleMaxSessions(data: { sessions: number; maxSessions: number }) {
  alert(`设备数量已达上限 (${data.sessions}/${data.maxSessions})，请先退出其他设备`)
}
</script>
