import { defineStore } from 'pinia'
import { ref } from 'vue'
import { firewallApi } from '@/api/firewall'

export const useAuthStore = defineStore('auth', () => {
  const isLoggedIn = ref(false)
  const user = ref(null)

  function setLoggedIn(status: boolean, userData: any = null) {
    isLoggedIn.value = status
    user.value = userData
  }

  async function checkSession() {
    try {
      const userInfo: any = await firewallApi.getUserInfo()
      if (userInfo && userInfo.sub) {
        setLoggedIn(true, {
          id: userInfo.sub,
          username: userInfo.preferred_username || userInfo.name,
          name: userInfo.name,
          email: userInfo.email,
          avatar: userInfo.avatar
        })
        return true
      }
    } catch (err) {
      // 捕获可能已清空的 Cookie 或无效会话
      console.log('🔒 用户未登录')
    }
    setLoggedIn(false, null)
    return false
  }

  function logout() {
    isLoggedIn.value = false
    user.value = null
  }

  return {
    isLoggedIn,
    user,
    setLoggedIn,
    checkSession,
    logout
  }
})
