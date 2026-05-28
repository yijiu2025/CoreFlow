/**
 * 防火墙监控与配置 API 模块
 */
import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import type {
  MonitorSummary, SettingsResponse, ApiConfigs, BlockEntry,
  AddBlockData, AddWhitelistData, ServerNode
} from '@/types'

// 自定义错误类型
interface ApiError extends Error {
  code?: number
}

// 基础配置
const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.DEV ? 'http://localhost:3000' : '',
  timeout: 10000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 响应拦截器：统一处理返回结构
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    const res = response.data
    if (res.code === 200) {
      return res.data
    }
    const error: ApiError = new Error(res.message || 'API Error')
    error.code = res.code
    return Promise.reject(error)
  },
  (error) => {
    const message = error.response?.data?.message || error.message
    console.error('🌐 [API Client Error]', message)
    return Promise.reject(error)
  }
)

/**
 * 防火墙监控与配置 API
 */
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
    apiClient.get('/user/v1/userinfo')
}

export default apiClient
