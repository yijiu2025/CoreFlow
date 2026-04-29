import axios from 'axios'

// 基础配置
const apiClient = axios.create({
  baseURL: import.meta.env.DEV ? 'http://localhost:3000' : '',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 响应拦截器：统一处理返回结构
apiClient.interceptors.response.use(
  (response) => {
    const res = response.data
    // 如果 code 为 200，说明业务逻辑成功，直接返回 data 载荷
    if (res.code === 200) {
      return res.data
    }
    
    // 否则，封装错误信息抛出
    const error = new Error(res.message || 'API Error')
    error.code = res.code
    return Promise.reject(error)
  },
  (error) => {
    // 处理 HTTP 错误 (429, 403, 500 等)
    const message = error.response?.data?.message || error.message
    console.error('🌐 [API Client Error]', message)
    return Promise.reject(error)
  }
)

/**
 * 防火墙监控与配置 API 模块
 */
export const firewallApi = {
  // 获取摘要数据
  getSummary: () => apiClient.get('/api/firewall/v1/monitor/summary'),
  
  // 获取流量记录
  getRecords: () => apiClient.get('/api/firewall/v1/monitor/records'),
  
  // 清空记录
  clearRecords: () => apiClient.post('/api/firewall/v1/monitor/clear'),
  
  // 更新节点信息 (PATCH 模式)
  updateNode: (data) => apiClient.patch('/api/firewall/v1/monitor/node/update', data),
  
  // 触发自动定位
  refreshNode: () => apiClient.post('/api/firewall/v1/monitor/node/refresh'),
  
  // 获取安全设置
  getSettings: () => apiClient.get('/api/firewall/v1/monitor/settings'),
  
  // 更新安全设置 (PATCH 模式：仅同步修改项)
  updateSettings: (data) => apiClient.patch('/api/firewall/v1/monitor/settings', data),
  
  // 添加黑名单
  addBlacklist: (type, value) => apiClient.post('/api/firewall/v1/monitor/blacklist', { type, value }),
  
  // 移除黑名单
  removeBlacklist: (type, value) => apiClient.delete('/api/firewall/v1/monitor/blacklist', { data: { type, value } }),

  // ==================== 封禁管理 ====================
  getBlocks: () => apiClient.get('/api/firewall/v1/monitor/blocks'),
  addBlock: (data) => apiClient.post('/api/firewall/v1/monitor/blocks', data),
  removeBlock: (ip) => apiClient.delete(`/api/firewall/v1/monitor/blocks/${encodeURIComponent(ip)}`),

  // ==================== 白名单管理 ====================
  getWhitelist: () => apiClient.get('/api/firewall/v1/monitor/whitelist'),
  addWhitelist: (data) => apiClient.post('/api/firewall/v1/monitor/whitelist', data),
  removeWhitelist: (ip) => apiClient.delete(`/api/firewall/v1/monitor/whitelist/${encodeURIComponent(ip)}`),

  // ==================== API 配置与守卫管理 ====================
  
  // 获取三级安全配置列表
  getApiConfigs: () => apiClient.get('/api/firewall/v1/apiconfigs/'),

  // 切换节点启用状态 (System/Group/API)
  toggleGuard: (systemKey, groupKey, apiKey = null) => {
    let url = `/api/firewall/v1/apiconfigs/toggle/${systemKey}/${groupKey}`
    if (apiKey) url += `?apiKey=${apiKey}`
    return apiClient.post(url)
  },

  // 切换系统级启用状态
  toggleSystem: (systemKey) => apiClient.post(`/api/firewall/v1/apiconfigs/toggle-system/${systemKey}`),

  // 更新具体配置信息 (Patch 模式)
  updateConfig: (systemKey, groupKey, apiKey, data) => {
    let url = `/api/firewall/v1/apiconfigs/${systemKey}/${groupKey}`
    if (apiKey) url += `?apiKey=${apiKey}`
    return apiClient.patch(url, data)
  }
}

export default apiClient
