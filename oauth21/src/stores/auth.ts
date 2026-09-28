import { defineStore } from 'pinia';
import { ref } from 'vue';
import { authApi } from '@/api/auth';
import type { LoginUser } from '@/types/external';

/**
 * 认证状态管理
 */
export const useAuthStore = defineStore('auth', () => {
  const token = ref('');
  const user = ref<LoginUser | null>(null);
  const loading = ref(false);

  /**
   * 登录动作
   *
   * payload 由调用方（useLoginFlow）组装，形状随版式表单变化，故按
   * `Record<string, unknown>` 接收（与 authApi.login 同口径）。
   * 返回原始响应（`unknown`）：识别为哪种分支交给 `parseLoginResponse`，
   * store 只负责保存 token 这个副作用。
   */
  async function login(payload: Record<string, unknown>): Promise<unknown> {
    loading.value = true;
    try {
      const data: unknown = await authApi.login(payload);
      // data 已由 request.ts 解包，兼容 JWT（accessToken）与 Session（session_token）
      if (data && typeof data === 'object') {
        const obj = data as Record<string, unknown>;
        const accessToken = typeof obj.accessToken === 'string'
          ? obj.accessToken
          : typeof obj.access_token === 'string' ? obj.access_token : '';
        if (accessToken) {
          token.value = accessToken;
        }
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
