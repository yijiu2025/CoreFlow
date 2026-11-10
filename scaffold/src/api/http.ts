/**
 * HTTP 客户端（唯一出口）
 *
 * 约定：
 *   • 同源请求（vite 代理 `/admin`、`/auth`、`/user` 到后端），`withCredentials: true`
 *     让 sid/sid_r Cookie 直达，不做 Token 存取；
 *   • 响应统一 `{ code, message, data }`，由 `unwrap()` 解包成 data，业务层拿到的就是数据；
 *   • 401 统一收口（`onUnauthorized` 由路由层注册），业务层不各自跳登录；
 *   • 设备身份由 `setupDeviceSync` 注入 `x-device-id`，**不手写拦截器**；
 *   • 428 / `X-Firewall-Challenge` = 边界防护要求人机验证：整页跳到独立挑战页
 *     （`challenge.html`），验证通过后原地返回，不当作业务错误弹给用户。
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
  /**
   * 是否由「人机验证拦截」引起
   *
   * 这类错误已经在拦截器里跳转挑战页，调用方不该再弹业务提示 —— 页面正在卸载，
   * 弹出来只会闪一下。需要静默的调用点判断这个标记即可。
   */
  challenge: boolean;

  /**
   * 是否「验证反复不生效」而被停止跳转
   *
   * 与 `challenge` 的区别：那个是"已跳去挑战页"，这个是"跳太多次了，停在原地"。
   * 调用方据此决定是静默（页面即将卸载）还是把提示显示出来。
   */
  challengeCapped: boolean;

  constructor(
    message: string,
    code: number,
    status: number,
    risk?: Envelope<unknown>['__risk__'],
    challenge = false,
    challengeCapped = false
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.risk = risk;
    this.challenge = challenge;
    this.challengeCapped = challengeCapped;
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

/** 独立挑战页（构建入口见 vite.config.ts 的 rollupOptions.input） */
const CHALLENGE_PAGE = 'challenge.html';

/**
 * 连续跳转计数（防「挑战页 ⇄ 业务页」乒乓）
 *
 * 正常情况下验证通过会写 `fw_verified`，回来就不会再被拦。但若这个凭证没生效
 * （cookie 路径/端口不对、服务端未下发、时钟漂移…），两边就会无限互踢 ——
 * 页面每秒刷新一次，用户什么也做不了，比直接报错更糟。
 *
 * 🔴 计数必须放 **sessionStorage**：每次跳转都是一次完整的文档加载，模块级变量
 *    会随之清零，那样等于没有上限（实测就是无限乒乓）。
 */
const HOP_KEY = 'fw_challenge_hops';
const MAX_CHALLENGE_HOPS = 3;
const HOP_WINDOW_MS = 8000;

/**
 * 读跳转计数
 *
 * @returns 窗口内的连跳次数与上次时间
 */
function readHops(): { count: number; at: number } {
  try {
    const raw = sessionStorage.getItem(HOP_KEY);
    const parsed = raw ? (JSON.parse(raw) as { count?: number; at?: number }) : null;
    return { count: Number(parsed?.count) || 0, at: Number(parsed?.at) || 0 };
  } catch {
    return { count: 0, at: 0 };
  }
}

/**
 * 写跳转计数（存储不可用时静默：隐私模式下最多退化成"没有上限"）
 *
 * @param count 次数
 * @param at 时间戳
 */
function writeHops(count: number, at: number): void {
  try {
    sessionStorage.setItem(HOP_KEY, JSON.stringify({ count, at }));
  } catch {
    /* 忽略 */
  }
}

/**
 * 被人机验证拦下时整页跳转到挑战页
 *
 * 为什么是**整页跳转**而不是路由跳转：挑战页是独立构建入口，不挂 router / pinia ——
 * 主应用一启动就请求 `session/me`，而它此刻正被 428 挡着，做成路由会"一进页面就
 * 自我打死"（挑战页自己也发不出请求）。
 *
 * 判定：428，或响应头带 `X-Firewall-Challenge`（后端在 428 上同时给两者，取其一即可）。
 * 已在挑战页时直接返回 true（防循环）。
 *
 * @param status HTTP 状态
 * @param headers 响应头
 * @returns `none` 不是挑战 / `redirected` 已跳转 / `capped` 跳太多次已停止跳转
 */
function handleChallengeRedirect(
  status: number,
  headers?: Record<string, unknown>
): 'none' | 'redirected' | 'capped' {
  const hint = headers?.['x-firewall-challenge'];
  if (status !== 428 && !hint) return 'none';
  if (window.location.pathname.endsWith(`/${CHALLENGE_PAGE}`)) return 'redirected';

  const now = Date.now();
  const prev = readHops();
  const hops = now - prev.at < HOP_WINDOW_MS ? prev.count + 1 : 1;
  writeHops(hops, now);
  if (hops > MAX_CHALLENGE_HOPS) {
    // 停在原地报错，交给页面提示刷新 —— 继续跳只会让用户看着页面不停闪
    return 'capped';
  }

  const target = new URL(`${import.meta.env.BASE_URL}${CHALLENGE_PAGE}`, window.location.origin);
  // 只带路径 + 查询 + hash：挑战页回来时用 `window.location.replace`，不能是外站地址
  target.searchParams.set('return', window.location.pathname + window.location.search + window.location.hash);
  window.location.replace(target.toString());
  return 'redirected';
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
  response => {
    // 回到正常业务流即视为跳转链结束（下次再被拦重新计数）
    try {
      sessionStorage.removeItem(HOP_KEY);
    } catch {
      /* 忽略 */
    }
    return response;
  },
  (error: AxiosError<Envelope<unknown>>) => {
    const status = error.response?.status ?? 0;
    const body = error.response?.data;

    // 人机验证拦截：整页跳挑战页，按"已处理"抛出（调用方据此静默）
    const challenge = handleChallengeRedirect(status, error.response?.headers as Record<string, unknown> | undefined);
    if (challenge !== 'none') {
      // 两种情况都标 challenge=true：会话没坏，调用方不该弹业务错、守卫也不该踢去登录
      const capped = challenge === 'capped';
      throw new ApiError(
        capped ? '人机验证未生效，请刷新页面重试' : '需要完成人机验证，正在跳转验证页…',
        428,
        428,
        undefined,
        true,
        capped
      );
    }

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
