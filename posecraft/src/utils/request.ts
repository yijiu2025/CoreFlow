/**
 * HTTP 请求封装
 * 接入 CoreFlow 认证
 */
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'

const TOKEN_KEY = 'posecraft_token'

// 401 刷新队列
let isRefreshing = false
let pendingQueue: Array<(token: string) => void> = []

async function handle401(config: AxiosRequestConfig): Promise<any> {
  if (!isRefreshing) {
    isRefreshing = true
    try {
      const { useAuthStore } = await import('@/stores/auth')
      const authStore = useAuthStore()

      // 尝试刷新 token
      const { authApi } = await import('@/api/auth')
      const newToken = (await authApi.refreshToken()) as any

      authStore.setLoggedIn(true, authStore.user, newToken)
      pendingQueue.forEach(cb => cb(newToken))
      pendingQueue = []

      if (config.headers) config.headers.Authorization = `Bearer ${newToken}`
      return apiClient(config)
    } catch {
      const { useAuthStore } = await import('@/stores/auth')
      useAuthStore().logout()
      window.location.href = '/posecraft/login'
    } finally {
      isRefreshing = false
    }
  }

  return new Promise((resolve) => {
    pendingQueue.push((token) => {
      if (config.headers) config.headers.Authorization = `Bearer ${token}`
      resolve(apiClient(config))
    })
  })
}

/** 创建 Axios 实例 */
export function createHttp(baseURL?: string): AxiosInstance {
  const instance = axios.create({
    baseURL: baseURL || '',
    timeout: 15000,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' }
  })

  // 请求拦截
  instance.interceptors.request.use((config) => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  })

  // 响应拦截
  instance.interceptors.response.use(
    (response) => {
      const res = response.data
      if (res.code === 200) return res.data
      const error = new Error(res.message || 'API Error')
      ;(error as any).code = res.code
      return Promise.reject(error)
    },
    (error) => {
      if (error.response?.status === 401) return handle401(error.config)
      return Promise.reject(error)
    }
  )

  return instance
}

const apiClient = createHttp()
export default apiClient
