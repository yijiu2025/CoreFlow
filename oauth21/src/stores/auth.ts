import { defineStore } from 'pinia'
import { ref } from 'vue'
import { authApi, type LoginPayload } from '@/api/auth'

/**
 * 认证状态管理
 */
export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const user = ref(null)
  const loading = ref(false)

  /**
   * 登录动作
   */
  async function login(payload: LoginPayload) {
    loading.value = true
    try {
      const data: any = await authApi.login(payload)
      token.value = data.access_token
      localStorage.setItem('token', data.access_token)
      // 处理其他返回数据...
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
    localStorage.removeItem('token')
  }

  return {
    token,
    user,
    loading,
    login,
    logout
  }
})
