/**
 * Axios 实例配置
 *
 * @author <作者>
 * @since 2026-07-20
 */
import axios from 'axios'

const api = axios.create({
  baseURL: '/stick/v1',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    // 可以在这里添加 token
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    console.error('API 请求错误:', error)
    return Promise.reject(error)
  }
)

export default api
