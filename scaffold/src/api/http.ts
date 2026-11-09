/**
 * HTTP 客户端（唯一出口）
 *
 * 约定：
 *   • 同源请求（vite 代理 `/admin`、`/auth`、`/user` 到后端），`withCredentials: true`
 *     让 sid/sid_r Cookie 直达，不做 Token 存取；
 *   • 响应统一 `{ code, message, data }`，由 `unwrap()` 解包成 data，业务层拿到的就是数据；
 *   • 401 统一收口（`onUnauthorized` 由路由层注册），业务层不各自跳登录；
 *   • 设备身份由 `setupDeviceSync` 注入 `x-device-id`，**不手写拦截器**。
 *
 * 🔴 拦截器**只做错误归一**、不改写 response 类型：在拦截器里 `return body.data`
 *    会让 Axios 的类型契约与实际返回值分叉（TS 直接报错，且一旦 axios 内部
 *    依赖 response 结构就会炸）。解包放在 `unwrap()`，类型与行为都诚实。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { setupDeviceSync } from 'stable-deviceid';

/** 后端统一响应信封 */
interface Envelope<T> {
  code: number;
  message: string;
  data: T;
  __risk__?: { level: string; reasons: string[]; verifyUrl: string; verifyHeader: string; verifyToken: string };
}

/** 业务错误：带后端 code 与 HTTP 状态，便于调用方分支 */
export class ApiError extends Error {
  code: number;
  status: number;
  risk?: Envelope<unknown>['__risk__'];

  constructor(message: string, code: number, status: number, risk?: Envelope<unknown>['__risk__']) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.risk = risk;
  }
}

/** 401 处理器（路由层注册，避免 http 层依赖 router） */
let unauthorizedHandler: (() => void) | null = null;

/**
 * 注册 401 处理器
 *
 * @param handler 处理函数（通常是跳登录并带 redirect）
 */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

const http: AxiosInstance = axios.create({
  baseURL: '',
  timeout: 15000,
  withCredentials: true,
  headers: { Accept: 'application/json' }
});

// 设备身份：自动注入 x-device-id / 响应头同步 / 跨标签页监听都在库里
setupDeviceSync(http);

http.interceptors.response.use(
  response => response,
  (error: AxiosError<Envelope<unknown>>) => {
    const status = error.response?.status ?? 0;
    const body = error.response?.data;

    if (status === 401) unauthorizedHandler?.();
    if (body && typeof body === 'object' && 'message' in body) {
      throw new ApiError(body.message || '请求失败', body.code ?? status, status, body.__risk__);
    }
    throw new ApiError(error.message || '网络异常', status, status);
  }
);

/**
 * 解包响应信封
 *
 * @param response Axios 响应
 * @returns 业务数据
 * @throws {ApiError} 业务码非 200 时抛出（并触发 401 处理）
 */
function unwrap<T>(response: AxiosResponse<Envelope<T>>): T {
  const body = response.data;
  if (!body || typeof body !== 'object' || !('code' in body)) {
    // 非信封响应（例如某些静态资源）直接原样返回
    return body as unknown as T;
  }
  if (body.code === 200) return body.data;
  if (body.code === 401) unauthorizedHandler?.();
  throw new ApiError(body.message || '请求失败', body.code, response.status, body.__risk__);
}

/**
 * GET 请求
 *
 * @param url 路径（如 `/admin/console/v1/users`）
 * @param params 查询参数
 * @returns 解包后的数据
 */
export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  return unwrap<T>(await http.get<Envelope<T>>(url, { params }));
}

/**
 * POST 请求
 *
 * @param url 路径
 * @param body 请求体
 * @returns 解包后的数据
 */
export async function post<T>(url: string, body?: unknown): Promise<T> {
  return unwrap<T>(await http.post<Envelope<T>>(url, body));
}

/**
 * PUT 请求
 *
 * @param url 路径
 * @param body 请求体
 * @returns 解包后的数据
 */
export async function put<T>(url: string, body?: unknown): Promise<T> {
  return unwrap<T>(await http.put<Envelope<T>>(url, body));
}

/**
 * DELETE 请求（不带 body，避免 Content-Type 空体报错）
 *
 * @param url 路径
 * @returns 解包后的数据
 */
export async function del<T>(url: string): Promise<T> {
  return unwrap<T>(await http.delete<Envelope<T>>(url));
}

/**
 * 下载文件（CSV 导出）
 *
 * @param url 路径
 * @param filename 保存文件名
 * @param params 查询参数
 */
export async function download(url: string, filename: string, params?: Record<string, unknown>): Promise<void> {
  const config: AxiosRequestConfig = { params, responseType: 'blob' };
  const response = await http.get<Blob>(url, config);
  const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default http;
