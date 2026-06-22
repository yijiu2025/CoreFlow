<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-purple-50 dark:from-slate-950 dark:to-slate-900">
    <div class="text-center">
      <div class="w-16 h-16 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-4"></div>
      <h2 class="text-xl font-bold mb-2">正在完成登录...</h2>
      <p class="text-slate-500">{{ statusMessage }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/api/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const statusMessage = ref('验证授权信息...')

onMounted(async () => {
  const code = route.query.code as string
  const state = route.query.state as string

  if (!code) {
    statusMessage.value = '缺少授权码，请重试'
    setTimeout(() => router.push('/login'), 2000)
    return
  }

  try {
    statusMessage.value = '正在换取访问令牌...'

    // 用授权码换取 Token
    const data = await authApi.bindSession(code)

    if (data) {
      statusMessage.value = '登录成功，正在跳转...'

      // 获取用户信息
      const userInfo = await authApi.getUserInfo()
      authStore.setLoggedIn(true, userInfo, data.token || data.access_token)
      await authStore.fetchPermissions()

      setTimeout(() => router.push('/'), 500)
    }
  } catch (err: any) {
    statusMessage.value = `登录失败: ${err.message}`
    setTimeout(() => router.push('/login'), 3000)
  }
})
</script>
