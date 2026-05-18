/**
 * HTTP 请求封装 (Admin Panel)
 * 包含自动 Token 注入和 401 队列无感刷新
 */
import axios, { type AxiosRequestConfig } from 'axios'

const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/admin/v1',
  timeout: 15000,
})

/* ========== 请求拦截 ========== */
service.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/* ========== 响应拦截 ========== */
let isRefreshing = false
let pendingQueue: Array<(token: string) => void> = []

service.interceptors.response.use(
  (res) => {
    // 假设后端返回 { code: 0, data: {...}, message: "ok" }
    const { code, message, data } = res.data
    
    // 如果返回的不是标准结构，直接返回
    if (code === undefined) return res.data

    if (code !== 0) {
      if (code === 401) {
        return handle401(res.config)
      }
      // 触发全局提示 (需要实现具体的 UI 组件)
      console.error('[API Error]', message)
      return Promise.reject(new Error(message))
    }
    return data
  },
  (error) => {
    if (axios.isCancel(error)) return Promise.reject(error)
    
    if (error.response?.status === 401) {
      return handle401(error.config)
    }

    console.error('[Network Error]', error.message)
    return Promise.reject(error)
  }
)

/**
 * 401 刷新逻辑
 */
async function handle401(config: AxiosRequestConfig) {
  if (!isRefreshing) {
    isRefreshing = true
    try {
      // TODO: 请求刷新 Token 的接口
      // const newToken = await refreshToken() 
      const newToken = "TODO_NEW_TOKEN"
      
      pendingQueue.forEach(cb => cb(newToken))
      pendingQueue = []
      if (config.headers) config.headers.Authorization = `Bearer ${newToken}`
      return service(config)
    } catch {
      localStorage.removeItem('token')
      window.location.href = '/login'
    } finally {
      isRefreshing = false
    }
  }

  return new Promise((resolve) => {
    pendingQueue.push((token) => {
      if (config.headers) config.headers.Authorization = `Bearer ${token}`
      resolve(service(config))
    })
  })
}

export default service
