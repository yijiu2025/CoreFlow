/**
 * HTTP 请求封装
 * 特性：请求/响应拦截、Token 自动注入、401 无感刷新队列、请求取消
 */
import axios, { type AxiosRequestConfig } from 'axios';

const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  timeout: 15_000,
  withCredentials: true // 允许跨域请求携带 Cookie
});

/* ========== 请求拦截 ========== */
import { sha256 } from './sha256';

service.interceptors.request.use(
  async (config) => {
    // 纯 Cookie 鉴权模式，不需要手动往 Headers 注入 Authorization 头部

    // 计算并注入动态签名（后端仅对 requireLogin 路由校验，公开接口自动跳过）
    const cookieMatch = document.cookie.match(/(^| )_m_h5_tk=([^;]*)(;|$)/);
    if (cookieMatch) {
      const m5H5Tk = decodeURIComponent(cookieMatch[2]);
      const [h5TokenMd5] = m5H5Tk.split('_');

      if (h5TokenMd5 && config.headers && config.url) {
        const timestamp = Date.now();
        const nonce = Math.random().toString(36).substring(2, 15);

        const urlPath = config.url.split('?')[0];
        const bodyStr = config.data ? JSON.stringify(config.data) : '';
        const signString = `${h5TokenMd5}&${timestamp}&${nonce}&${urlPath}&${bodyStr}`;

        const clientSign = await sha256(signString);

        config.headers['X-Sign'] = clientSign;
        config.headers['X-Timestamp'] = String(timestamp);
        config.headers['X-Nonce'] = nonce;
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/* ========== 响应拦截 ========== */
let isRefreshing = false;
let pendingQueue: Array<(token: string) => void> = [];

service.interceptors.response.use(
  (res) => {
    // 假设后端返回结构为 { code, message, data }
    const { code, message, data } = res.data;
    // 如果没有 code，则认为直接返回的是数据 (兼容普通 REST)
    if (code === undefined) return res.data;

    if (code !== 0 && code !== 200) {
      if (code === 401) {
        return handle401(res.config);
      }
      // 这里可以集成全局 Message 提示
      console.error(message || '请求失败');
      return Promise.reject(new Error(message || 'Error'));
    }
    return data;
  },
  (error) => {
    if (axios.isCancel(error)) return Promise.reject(error);

    // 优先从后端返回的 JSON 数据中提取 message
    const backendMessage = error.response?.data?.message;
    if (backendMessage) {
      console.error(`[API Error] ${backendMessage}`);
      return Promise.reject(new Error(backendMessage));
    }

    console.error(error.message || '网络异常');
    return Promise.reject(error);
  }
);

/**
 * 401 处理：Token 刷新队列
 */
async function handle401(config: AxiosRequestConfig) {
  if (!isRefreshing) {
    isRefreshing = true;
    try {
      // 这里应该调用 api/auth.ts 中的 refreshToken
      // const newToken = await refreshToken()
      const newToken = ''; // 占位
      pendingQueue.forEach((cb) => cb(newToken));
      pendingQueue = [];
      if (config.headers) config.headers.Authorization = `Bearer ${newToken}`;
      return service(config);
    } catch {
      localStorage.removeItem('token');
      window.location.href = '/login';
    } finally {
      isRefreshing = false;
    }
  }

  return new Promise((resolve) => {
    pendingQueue.push((token) => {
      if (config.headers) config.headers.Authorization = `Bearer ${token}`;
      resolve(service(config));
    });
  });
}

export default service;
