/**
 * HTTP 请求封装
 * 特性：请求/响应拦截、Token 自动注入、401 无感刷新队列、请求取消
 */
import axios from 'axios';

const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  timeout: 15_000,
  withCredentials: true // 允许跨域请求携带 Cookie
});

/* ========== 请求拦截 ========== */
import { sha256 } from './sha256';
import { getDeviceFingerprint, isDeviceFingerprintEnabled } from './device-fingerprint';
import { getStableDeviceId } from './device-id';
import { generateNonce } from './crypto';

service.interceptors.request.use(
  async config => {
    // 纯 Cookie 鉴权模式，不需要手动往 Headers 注入 Authorization 头部

    // 稳定设备标识注入（跨域 iframe cookie 不可靠，改用 x-device-id 头主动发送）
    // 后端 getDeviceId 优先读此头，跨账号复用同设备码（localStorage 持久）
    if (config.headers) {
      config.headers['x-device-id'] = getStableDeviceId();
    }

    // 设备指纹注入（仅 DEVICE_FINGERPRINT_ENABLED=true 时，配合后端验证码/consent 指纹增强）
    if (isDeviceFingerprintEnabled() && config.headers) {
      try {
        const deviceFp = await getDeviceFingerprint();
        if (deviceFp) {
          config.headers['X-Device-Fp'] = deviceFp;
        }
      } catch {
        // 采集失败不影响主流程（后端未启用时此头被忽略）
      }
    }

    // 计算并注入动态签名（头 + query 双带，兼容大厂 URL 签名方式）
    // 后端 verifySignature 从头或 query 任一读取，两边都算同一签名值
    const cookieMatch = document.cookie.match(/(^| )_m_h5_tk=([^;]*)(;|$)/);
    if (cookieMatch) {
      const m5H5Tk = decodeURIComponent(cookieMatch[2]);
      const [h5TokenMd5] = m5H5Tk.split('_');

      if (h5TokenMd5 && config.headers && config.url) {
        const timestamp = Date.now();
        // nonce 用密码学安全随机（防重放，比 Math.random 强）
        const nonce = generateNonce();
        // x-device-id 与签名一并注入 query（大厂风格：参数随 URL 走）
        const deviceId = getStableDeviceId();

        const urlPath = config.url.split('?')[0];
        const bodyStr = config.data ? JSON.stringify(config.data) : '';
        // params 按 key 排序序列化纳入签名，防 query 篡改
        // （axios config.params 在适配器阶段才拼 URL，拦截器签名时必须手动纳入）
        const paramsStr = serializeParamsForSign(config.params);
        const signString = `${h5TokenMd5}&${timestamp}&${nonce}&${urlPath}&${paramsStr}&${bodyStr}`;

        const clientSign = await sha256(signString);

        // 注入请求头
        config.headers['X-Sign'] = clientSign;
        config.headers['X-Timestamp'] = String(timestamp);
        config.headers['X-Nonce'] = nonce;

        // 同步注入 query 参数（像抖音 x-signature 那样拼 URL 后面）
        const sep = config.url.includes('?') ? '&' : '?';
        config.url = `${config.url}${sep}x-sign=${clientSign}&x-timestamp=${timestamp}&x-nonce=${nonce}&x-device-id=${encodeURIComponent(deviceId)}`;
      }
    }

    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

/* ========== 响应拦截 ========== */

service.interceptors.response.use(
  res => {
    // 假设后端返回结构为 { code, message, data }
    const { code, message, data } = res.data;
    // 如果没有 code，则认为直接返回的是数据 (兼容普通 REST)
    if (code === undefined) return res.data;

    // 风险拦截：403 + __risk__.warn → 弹人机验证弹窗
    if (code === 403 && res.data?.__risk__) {
      return handleRiskBlock(res);
    }

    if (code !== 0 && code !== 200) {
      // 401：Session 模式无 token 刷新（sid 过期靠后端 sid_r 自动刷新在 onRequest 处理），
      // 前端收到 401 说明 sid_r 也过期或未登录 → 跳登录页重新认证。
      // 不重发（避免空 token 死循环），清残留凭证后跳转。
      if (code === 401) {
        redirectToLogin();
        return Promise.reject(new Error(message || '登录已过期，请重新登录'));
      }
      console.error(message || '请求失败');
      return Promise.reject(new Error(message || 'Error'));
    }
    return data;
  },
  error => {
    if (axios.isCancel(error)) return Promise.reject(error);

    // 风险拦截（HTTP 403 响应走 error 分支，因为拦截器抛非 2xx）
    if (error.response?.status === 403 && error.response?.data?.__risk__) {
      return handleRiskBlock({ data: error.response.data, config: error.config });
    }

    // 401（HTTP 状态码分支）：同上，跳登录页
    if (error.response?.status === 401) {
      redirectToLogin();
      return Promise.reject(new Error('登录已过期，请重新登录'));
    }

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
 * 跳转登录页（避免 401 死循环：Session 模式无 token 可刷新）
 * 保留当前 URL 作 redirect 参数，登录后可回跳
 */
interface RedirectFn {
  (): void;
  _locked: boolean;
}
const redirectToLogin: RedirectFn = () => {
  // 防抖：并发多个 401 时只跳一次
  if (redirectToLogin._locked) return;
  redirectToLogin._locked = true;
  // 清残留凭证（sid/sid_r 由后端清，这里清前端侧 localStorage 等）
  // 注意：不要清 device_id cookie（跨账号复用，设备标识需保留）
  try {
    const current = window.location.pathname + window.location.search;
    const loginUrl = `/mini-login?from=mini&redirect=${encodeURIComponent(current)}`;
    window.location.href = loginUrl;
  } catch {
    window.location.href = '/mini-login';
  }
};
redirectToLogin._locked = false;
async function handleRiskBlock(res: any): Promise<any> {
  const risk = res.data?.__risk__ || res.data?.data?.__risk__;
  if (!risk || risk.level !== 'warn' || !risk.verifyToken) {
    return Promise.reject(new Error(res.data?.message || '请求被拦截'));
  }
  // 动态导入 + 挂载弹窗（避免 request.ts 强依赖组件）
  const { createApp } = await import('vue');
  const SliderCaptcha = (await import('@/components/common/SliderCaptcha.vue')).default;

  return new Promise((resolve, reject) => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    // SliderCaptcha 内部自管开关，关闭靠 onClose 回调，无需外部 ref 绑定
    const app = createApp(SliderCaptcha, {
      isOpen: true,
      verifyToken: risk.verifyToken,
      reasons: risk.reasons || [],
      onClose: () => {
        cleanup();
        reject(new Error('用户取消人机验证'));
      },
      onSuccess: () => {
        cleanup();
        // 验证通过，重发原请求（基准已更新，不再拦截）
        resolve(service(res.config));
      }
    });
    app.mount(container);

    function cleanup() {
      app.unmount();
      if (container.parentNode) container.parentNode.removeChild(container);
    }
  });
}

/**
 * 序列化 params 用于签名（按 key 字典序排序，key=value，value encodeURIComponent，& 连接）
 * 与后端 signature.js serializeQueryForSign 必须完全一致。
 * 只支持扁平 key-value（当前所有调用都是扁平 params）；数组/嵌套对象不保证一致。
 */
function serializeParamsForSign(params: any): string {
  if (!params) return '';
  // URLSearchParams：keys() 迭代器转数组后排序
  if (params instanceof URLSearchParams) {
    const pairs: [string, string][] = [];
    params.forEach((v, k) => pairs.push([k, v]));
    if (pairs.length === 0) return '';
    pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  }
  if (typeof params !== 'object') return '';
  const keys = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== null);
  if (keys.length === 0) return '';
  keys.sort();
  return keys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`).join('&');
}

export default service;
