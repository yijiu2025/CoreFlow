/**
 * HTTP 请求封装
 * 接入 CoreFlow 认证
 */
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';

const TOKEN_KEY = 'posecraft_token';

// 401 刷新队列
let isRefreshing = false;
let pendingQueue: Array<(token: string) => void> = [];

/**
 * 刷新会话专用实例
 *
 * 不经响应拦截器的 401 递归处理——否则未登录/无 sid_r 时 refreshToken 自身 401
 * 会进 pendingQueue 死锁（isRefreshing 未释放 + 队列永不 resolve），导致 checkSession
 * 永挂、路由跳转卡死、弹窗不弹。此处 401 直接抛，由 handle401 的 catch 兜底弹窗。
 */
const refreshClient = axios.create({
  baseURL: '',
  timeout: 15000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});
refreshClient.interceptors.response.use(
  res => res.data,
  error => Promise.reject(error)
);

async function handle401(config: AxiosRequestConfig): Promise<any> {
  if (!isRefreshing) {
    isRefreshing = true;
    try {
      // 用独立实例刷新，避免 refreshToken 自身 401 触发递归 handle401 死锁
      const newToken: any = await refreshClient.post('/auth/v1/refresh-session');

      const { useAuthStore } = await import('@/stores/auth');
      const authStore = useAuthStore();
      authStore.setLoggedIn(true, authStore.user, newToken);
      pendingQueue.forEach(cb => cb(newToken));
      pendingQueue = [];

      if (config.headers) config.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(config);
    } catch {
      // 刷新失败：内联弹窗重新登录（不跳页，保留当前页面上下文）
      const { useAuthStore } = await import('@/stores/auth');
      const authStore = useAuthStore();
      authStore.logout();
      authStore.openLoginModal();
      // 通知排队请求放弃（否则它们永远 pending）
      pendingQueue.forEach(cb => cb(''));
      pendingQueue = [];
      return Promise.reject(new Error('登录已过期，请重新登录'));
    } finally {
      isRefreshing = false;
    }
  }

  return new Promise(resolve => {
    pendingQueue.push(token => {
      if (config.headers) config.headers.Authorization = `Bearer ${token}`;
      resolve(apiClient(config));
    });
  });
}

/** 创建 Axios 实例 */
export function createHttp(baseURL?: string): AxiosInstance {
  const instance = axios.create({
    baseURL: baseURL || '',
    timeout: 15000,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' }
  });

  // 请求拦截
  instance.interceptors.request.use(config => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  // 响应拦截
  instance.interceptors.response.use(
    response => {
      const res = response.data;
      if (res.code === 200) {
        if (res.pagination) {
          return {
            list: res.data,
            total: res.pagination.total,
            page: res.pagination.page,
            pageSize: res.pagination.pageSize,
            totalPages: res.pagination.totalPages
          };
        }
        return res.data;
      }
      const error = new Error(res.message || 'API Error');
      (error as any).code = res.code;
      return Promise.reject(error);
    },
    error => {
      if (error.response?.status === 401) return handle401(error.config);
      return Promise.reject(error);
    }
  );

  return instance;
}

const apiClient = createHttp();
export default apiClient;
