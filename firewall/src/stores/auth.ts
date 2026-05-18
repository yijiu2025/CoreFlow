import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const isLoggedIn = ref(false)
  const user = ref(null)

  function setLoggedIn(status: boolean, userData: any = null) {
    isLoggedIn.value = status
    user.value = userData
  }

  function logout() {
    isLoggedIn.value = false
    user.value = null
  }

  return {
    isLoggedIn,
    user,
    setLoggedIn,
    logout
  }
})
