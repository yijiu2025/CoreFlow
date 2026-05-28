import { defineStore } from 'pinia'
import { ref } from 'vue'
import { authApi, type LoginPayload } from '@/api/auth'

/**
 * 认证状态管理
 */
export const useAuthStore = defineStore('auth', () => {
  const token = ref('')
  const user = ref(null)
  const loading = ref(false)

  /**
   * 登录动作
   */
  async function login(payload: any) {
    loading.value = true
    try {
      const data: any = await authApi.login(payload)
      const accessToken = data.access_token || data.data?.accessToken
      if (accessToken) {
        token.value = accessToken
      }
      return data
    } finally {
      loading.value = false
    }
  }

  /**
   * 退出登录
   */
  function logout() {
    token.value = ''
    user.value = null
  }

  return {
    token,
    user,
    loading,
    login,
    logout
  }
})
