/**
 * 防火墙监控与配置 API 模块
 *
 * 特性：
 * - 请求拦截：自动注入 Bearer Token
 * - 响应拦截：统一解包 {code, data, message} 结构
 * - 401 无感刷新：多个并发请求只发一次刷新，其余排队等待
 * - createHttp() 工厂：可创建独立实例（刷新 token 时避免递归拦截）
 */
import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios'
import type {
  MonitorSummary, SettingsResponse, ApiConfigs, BlockEntry,
  AddBlockData, AddWhitelistData, ServerNode
} from '@/types'
import { API_BASE_URL } from '@/config/services'

const TOKEN_KEY = 'firewall_token'

// 自定义错误类型
interface ApiError extends Error {
  code?: number
}

// ==================== Token 刷新队列 ====================
let isRefreshing = false
let pendingQueue: Array<(token: string) => void> = []

/** 刷新 Token 并重放排队请求 */
async function handleTokenRefresh(): Promise<string> {
  // 动态导入避免循环依赖
  const { useAuthStore } = await import('@/stores/auth')
  const authStore = useAuthStore()

  const newToken = await authStore.refreshAccessToken()
  // 重放所有排队请求
  pendingQueue.forEach(cb => cb(newToken))
  pendingQueue = []
  return newToken
}

/** 不需要刷新重试的路径（避免死循环） */
const SKIP_REFRESH_PATHS = ['/user/v1/userinfo', '/user/v1/permissions']

/** 触发登录弹窗（通过 auth store） */
function triggerLoginModal() {
  import('@/stores/auth').then(({ useAuthStore }) => {
    useAuthStore().showLoginModal = true
  })
}

/** 401 处理：加入队列或发起刷新 */
async function handle401(config: AxiosRequestConfig): Promise<any> {
  const url = config.url || ''

  // 如果是 userinfo/permissions 等认证检查接口本身 401，直接失败，不重试
  if (SKIP_REFRESH_PATHS.some(p => url.includes(p))) {
    triggerLoginModal()
    return Promise.reject(new Error('未登录或 Token 已过期'))
  }

  if (!isRefreshing) {
    isRefreshing = true
    try {
      const newToken = await handleTokenRefresh()
      if (config.headers) {
        config.headers.Authorization = `Bearer ${newToken}`
      }
      return apiClient(config)
    } catch {
      // 刷新失败，清除状态并触发登录弹窗
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem('firewall_user')
      triggerLoginModal()
      return Promise.reject(new Error('Token 刷新失败'))
    } finally {
      isRefreshing = false
    }
  }

  // 已在刷新中，当前请求加入队列挂起
  return new Promise((resolve) => {
    pendingQueue.push((token: string) => {
      if (config.headers) {
        config.headers.Authorization = `Bearer ${token}`
      }
      resolve(apiClient(config))
    })
  })
}

// ==================== Axios 实例 ====================

/**
 * 创建独立 Axios 实例（工厂模式）
 * 用途：刷新 token 等场景需要独立实例，避免递归触发拦截器
 */
export function createHttp(baseURL?: string): AxiosInstance {
  const instance = axios.create({
    baseURL: baseURL || API_BASE_URL,
    timeout: 10000,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' }
  })

  // 请求拦截：有 token 时带 Bearer header，否则依赖 Session Cookie
  instance.interceptors.request.use((config) => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    // withCredentials: true 确保 Session Cookie 自动携带
    return config
  })

  // 响应拦截
  instance.interceptors.response.use(
    (response: AxiosResponse) => {
      const res = response.data
      if (res.code === 200) return res.data
      const error: ApiError = new Error(res.message || 'API Error')
      error.code = res.code
      return Promise.reject(error)
    },
    (error) => {
      if (error.response?.status === 401) {
        return handle401(error.config)
      }
      const message = error.response?.data?.message || error.message
      console.error('🌐 [API Error]', message)
      return Promise.reject(error)
    }
  )

  return instance
}

// 默认实例
const apiClient = createHttp()

// ==================== 业务 API ====================

export const firewallApi = {
  // 获取摘要数据
  getSummary: (): Promise<MonitorSummary> =>
    apiClient.get('/api/firewall/v1/monitor/summary'),

  // 获取流量记录
  getRecords: (): Promise<any[]> =>
    apiClient.get('/api/firewall/v1/monitor/records'),

  // 清空记录
  clearRecords: (): Promise<void> =>
    apiClient.post('/api/firewall/v1/monitor/clear'),

  // 更新节点信息
  updateNode: (data: Partial<ServerNode>): Promise<any> =>
    apiClient.patch('/api/firewall/v1/monitor/node/update', data),

  // 触发自动定位
  refreshNode: (): Promise<ServerNode> =>
    apiClient.post('/api/firewall/v1/monitor/node/refresh'),

  // 获取安全设置
  getSettings: (): Promise<SettingsResponse> =>
    apiClient.get('/api/firewall/v1/monitor/settings'),

  // 更新安全设置
  updateSettings: (data: Record<string, any>): Promise<any> =>
    apiClient.patch('/api/firewall/v1/monitor/settings', data),

  // 添加黑名单
  addBlacklist: (type: string, value: string): Promise<any> =>
    apiClient.post('/api/firewall/v1/monitor/blacklist', { type, value }),

  // 移除黑名单
  removeBlacklist: (type: string, value: string): Promise<any> =>
    apiClient.delete('/api/firewall/v1/monitor/blacklist', { data: { type, value } }),

  // ==================== 封禁管理 ====================
  getBlocks: (): Promise<BlockEntry[]> =>
    apiClient.get('/api/firewall/v1/monitor/blocks'),

  addBlock: (data: AddBlockData): Promise<any> =>
    apiClient.post('/api/firewall/v1/monitor/blocks', data),

  removeBlock: (ip: string): Promise<any> =>
    apiClient.delete(`/api/firewall/v1/monitor/blocks/${encodeURIComponent(ip)}`),

  // ==================== 指纹封禁管理 ====================
  addBlockFp: (data: AddBlockData): Promise<any> =>
    apiClient.post('/api/firewall/v1/monitor/blocks/fp', data),

  removeBlockFp: (fingerprint: string): Promise<any> =>
    apiClient.delete(`/api/firewall/v1/monitor/blocks/fp/${encodeURIComponent(fingerprint)}`),

  // ==================== 白名单管理 ====================
  getWhitelist: (): Promise<BlockEntry[]> =>
    apiClient.get('/api/firewall/v1/monitor/whitelist'),

  addWhitelist: (data: AddWhitelistData): Promise<any> =>
    apiClient.post('/api/firewall/v1/monitor/whitelist', data),

  removeWhitelist: (ip: string): Promise<any> =>
    apiClient.delete(`/api/firewall/v1/monitor/whitelist/${encodeURIComponent(ip)}`),

  // ==================== 指纹白名单管理 ====================
  addWhitelistFp: (data: AddWhitelistData): Promise<any> =>
    apiClient.post('/api/firewall/v1/monitor/whitelist/fp', data),

  removeWhitelistFp: (fingerprint: string): Promise<any> =>
    apiClient.delete(`/api/firewall/v1/monitor/whitelist/fp/${encodeURIComponent(fingerprint)}`),

  // ==================== API 配置与守卫管理 ====================
  getApiConfigs: (): Promise<ApiConfigs> =>
    apiClient.get('/api/firewall/v1/apiconfigs/'),

  toggleGuard: (systemKey: string, groupKey: string, apiKey: string | null = null): Promise<any> => {
    let url = `/api/firewall/v1/apiconfigs/toggle/${systemKey}/${groupKey}`
    if (apiKey) url += `?apiKey=${apiKey}`
    return apiClient.post(url)
  },

  toggleSystem: (systemKey: string): Promise<any> =>
    apiClient.post(`/api/firewall/v1/apiconfigs/toggle-system/${systemKey}`),

  updateConfig: (systemKey: string, groupKey: string, apiKey?: string | null, data?: Record<string, any>): Promise<any> => {
    let url = `/api/firewall/v1/apiconfigs/${systemKey}/${groupKey}`
    if (apiKey) url += `?apiKey=${apiKey}`
    return apiClient.patch(url, data)
  },

  // 获取 SSO 用户信息
  getUserInfo: (): Promise<any> =>
    apiClient.get('/user/v1/userinfo'),

  // 将 Bearer Token 绑定为 HttpOnly Cookie
  bindToken: (token: string): Promise<any> =>
    apiClient.post('/auth/v1/bind-token', null, {
      headers: { Authorization: `Bearer ${token}` }
    }),

  // 用临时 session_token 换取 sid/sid_r Cookie（iframe 登录场景）
  bindSession: (sessionToken: string): Promise<any> =>
    apiClient.post('/auth/v1/bind-session', { session_token: sessionToken }),

  // 清除认证 Cookie（退出登录）
  clearCookie: (): Promise<any> =>
    apiClient.post('/auth/v1/clear-cookie'),

  // 获取当前用户权限
  getPermissions: (): Promise<{ roles: string[], permissions: { allows: string[], denies: string[] } }> =>
    apiClient.get('/user/v1/permissions')
}

export default apiClient
