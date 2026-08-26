import { defineStore } from 'pinia';
import { ref } from 'vue';
import { authApi, type LoginPayload } from '@/api/auth';

/**
 * 认证状态管理
 */
export const useAuthStore = defineStore('auth', () => {
  const token = ref('');
  const user = ref(null);
  const loading = ref(false);

  /**
   * 登录动作
   */
  async function login(payload: any) {
    loading.value = true;
    try {
      const data: any = await authApi.login(payload);
      // data 已由 request.ts 解包，兼容 JWT（accessToken）与 Session（无 token，用 session_token）
      const accessToken = data?.accessToken || data?.access_token;
      if (accessToken) {
        token.value = accessToken;
      }
      return data;
    } finally {
      loading.value = false;
    }
  }

  /**
   * 退出登录
   */
  function logout() {
    token.value = '';
    user.value = null;
  }

  return {
    token,
    user,
    loading,
    login,
    logout
  };
});
