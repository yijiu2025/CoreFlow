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
 *     （`challenge.html`），验证通过后原地返回，不当作业务错误弹给用户；
 *   • 403 + `__risk__` = 会话风险（设备/指纹变更）：**原地弹滑块验证**，通过后
 *     自动重发原请求。它与 428 是两套机制，不能混：428 是"你还没过边界"，连会话
 *     都还没建立，只能整页跳；403 是"你已经登录但换了环境"，会话是好的，跳走反而
 *     要重新登录。
 *
 * 🔴 拦截器**只做错误归一**、不改写 response 类型：在拦截器里 `return body.data`
 *    会让 Axios 的类型契约与实际返回值分叉（TS 直接报错，且一旦 axios 内部
 *    依赖 response 结构就会炸）。解包放在 `unwrap()`，类型与行为都诚实。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig
} from 'axios';
import { handleDeviceSyncInResponse, setupDeviceSync } from 'stable-deviceid';

/**
 * 会话风险载荷（后端 `__risk__`）
 *
 * 后端只在 `level === 'warn'` 时给 `verify*` 三件套；info 级（仅 IP 变）不带验证信息，
 * 也就无从弹窗 —— 前端遇到没有 `verifyToken` 的载荷直接当普通错误处理。
 */
export interface RiskPayload {
  level: string;
  reasons?: string[];
  /** 验证端点（后端按实际前缀下发，不要在前端硬编码） */
  verifyUrl?: string;
  /** 携带验证令牌的请求头名（默认 `x-verify-token`） */
  verifyHeader?: string;
  verifyToken?: string;
}

/** 后端统一响应信封 */
interface Envelope<T> {
  code: number;
  message: string;
  data: T;
  __risk__?: RiskPayload;
}

/** 带"已验证重发"标记的请求配置（防验证不生效时无限重发） */
type RiskAwareConfig = InternalAxiosRequestConfig & { _riskRetried?: boolean };

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

  /**
   * 是否「被会话风险拦下且没通过验证」
   *
   * 与 `challenge` 的区别：`challenge` 是边界防护（428，整页跳验证页）；
   * 本标记是风险拦截（403，原地弹窗）。用户取消验证、或验证后仍被拦时置 true，
   * 调用方据此决定是提示"已取消"还是把后端的业务话术原样显示。
   */
  riskBlocked: boolean;

  constructor(
    message: string,
    code: number,
    status: number,
    risk?: Envelope<unknown>['__risk__'],
    challenge = false,
    challengeCapped = false,
    riskBlocked = false
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.risk = risk;
    this.challenge = challenge;
    this.challengeCapped = challengeCapped;
    this.riskBlocked = riskBlocked;
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
 * 整页跳到挑战页（带连跳上限）
 *
 * 抽成独立导出是给 **iframe** 用的：登录表单跑在 oauth21 的 iframe 里，那边没有
 * 验证页、也发不出验证请求（`challengeUrl` 只是被拦请求自己的路径）。它被拦时只能
 * postMessage 过来，由宿主执行与自身 428 完全相同的跳转 —— 一套跳转、一套上限，
 * 不给"两个入口各写一遍"的机会。
 *
 * 为什么是**整页跳转**而不是路由跳转：挑战页是独立构建入口，不挂 router / pinia ——
 * 主应用一启动就请求 `session/me`，而它此刻正被 428 挡着，做成路由会"一进页面就
 * 自我打死"（挑战页自己也发不出请求）。
 *
 * @returns `redirected` 已跳转 / `capped` 跳太多次已停止跳转
 */
export function gotoChallengePage(): 'redirected' | 'capped' {
  // 已在挑战页还继续跳 = 自己打自己，直接按"已跳转"返回（防循环）
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

/**
 * 被人机验证拦下时整页跳转到挑战页
 *
 * 判定：428，或响应头带 `X-Firewall-Challenge`（后端在 428 上同时给两者，取其一即可）。
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
  return gotoChallengePage();
}

const http: AxiosInstance = axios.create({
  baseURL: '',
  timeout: 15000,
  withCredentials: true,
  headers: { Accept: 'application/json' }
});

// 设备身份：自动注入 x-device-id / 响应头同步 / 跨标签页监听都在库里
setupDeviceSync(http);

/* ── 会话风险：403 + __risk__ → 原地验证 → 重发原请求 ───────────────────── */

/**
 * 同一时刻只允许一个验证弹窗
 *
 * 一次页面加载里 403 往往是**并发成串**的（列表 + 菜单 + 轮询），每个都弹窗
 * 会叠出一摞遮罩，用户点哪个都不知道。共享同一个 Promise，验证通过后所有
 * 被拦请求一起重发。
 */
let riskGate: Promise<boolean> | null = null;

/**
 * 「自动弹窗」冷却期
 *
 * 读接口（GET）在 warn 级风险下仍会正常返回，但响应体会带 `__risk__`（后端刻意
 * 不阻断读）。这时弹窗只是"顺手提醒"；用户关掉之后如果下一个 GET 又弹，
 * 就变成骚扰。所以**自动**弹窗被取消后静默 60 秒。
 *
 * 🔴 写操作触发的 403 **不受冷却影响**：那是用户刚点的按钮，必须每次都给出路，
 *    否则会出现"点了保存，什么也没发生"——比弹窗烦人得多。
 */
const AUTO_SUPPRESS_MS = 60_000;
let autoSuppressedUntil = 0;

/**
 * 调验证接口
 *
 * 端点与头名都取后端下发的 `verifyUrl` / `verifyHeader`，不硬编码：系统前缀一变，
 * 硬编码地址就会 404 —— 而那正是用户卡在验证里出不来的时刻。
 *
 * @param payload 风险载荷
 */
export async function verifyRisk(payload: RiskPayload): Promise<void> {
  if (!payload.verifyToken) throw new Error('验证令牌缺失，请刷新页面重试');
  const headers: Record<string, string> = {};
  headers[payload.verifyHeader || 'x-verify-token'] = payload.verifyToken;
  // 复用同一实例：设备头注入、Cookie、错误归一都不再手搓一份
  await http.post(payload.verifyUrl || '/auth/v1/verify-challenge', {}, { headers });
}

/**
 * 卸载验证弹窗
 *
 * @param app 动态创建的根应用
 * @param container 挂载容器
 */
function disposeRiskDialog(app: { unmount: () => void }, container: HTMLElement): void {
  try {
    app.unmount();
  } catch {
    /* 已卸载 */
  }
  container.remove();
}

/**
 * 弹人机验证（并发去重）
 *
 * 为什么动态挂载而不是在 App.vue 里放一个全局组件：本函数在 **axios 拦截器**里
 * 被调用，而拦截器是模块级单例 —— 它拿不到组件树，也就没法通过 store/props 驱动
 * 弹窗。动态挂载让"请求被拦 → 弹窗 → 重发"完全闭环在网络层，任何调用点
 * （包括以后新增的页面）都不需要写一行验证逻辑。
 *
 * @param payload 风险载荷
 * @param auto 是否读操作触发的"顺手提醒"（true 时受冷却期约束）
 * @returns 是否验证通过
 */
export function requireRiskVerify(payload: RiskPayload, auto = false): Promise<boolean> {
  if (!payload.verifyToken) return Promise.resolve(false);
  if (riskGate) return riskGate;
  if (auto && Date.now() < autoSuppressedUntil) return Promise.resolve(false);

  const gate = (async () => {
    const { createApp } = await import('vue');
    const { default: RiskVerifyDialog } = await import('@/components/business/RiskVerifyDialog.vue');
    const container = document.createElement('div');
    document.body.appendChild(container);

    return new Promise<boolean>(resolve => {
      const app = createApp(RiskVerifyDialog, {
        payload,
        onSuccess: () => {
          disposeRiskDialog(app, container);
          resolve(true);
        },
        onClose: () => {
          if (auto) autoSuppressedUntil = Date.now() + AUTO_SUPPRESS_MS;
          disposeRiskDialog(app, container);
          resolve(false);
        }
      });
      app.mount(container);
    });
  })().finally(() => {
    riskGate = null;
  });

  riskGate = gate;
  return gate;
}

/**
 * 从失败响应里读出信封
 *
 * `download()` 用 `responseType: 'blob'`，它的 403 响应体是 Blob —— 直接读
 * `data.__risk__` 永远是 undefined，验证弹窗也就永远不会出现。这类"导出被拦"
 * 恰好是最常见的写操作之一，必须单独解一次。
 *
 * @param error Axios 错误
 * @returns 信封（无法解析时 undefined）
 */
async function readErrorBody(error: AxiosError<unknown>): Promise<Envelope<unknown> | undefined> {
  const data = error.response?.data;
  if (!data) return undefined;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      return JSON.parse(await data.text()) as Envelope<unknown>;
    } catch {
      return undefined;
    }
  }
  if (typeof data === 'object') return data as Envelope<unknown>;
  return undefined;
}

http.interceptors.response.use(
  response => {
    // 回到正常业务流即视为跳转链结束（下次再被拦重新计数）
    try {
      sessionStorage.removeItem(HOP_KEY);
    } catch {
      /* 忽略 */
    }

    /*
     * 读操作被标记风险：后端不阻断 GET，但会在 200 响应体里塞 `__risk__`。
     *
     * 必须在这里接住，否则用户"看着页面正常、一点保存就 403"，而那时才第一次
     * 见到验证框，会以为是自己操作错了。这里**不阻塞**本次响应（数据已经拿到，
     * 拦着不显示只会让页面空着），只是把验证提前做掉。
     */
    const body = response.data as Envelope<unknown> | undefined;
    const risk = body && typeof body === 'object' ? body.__risk__ : undefined;
    if (risk?.verifyToken) void requireRiskVerify(risk, true);

    return response;
  },
  async (error: AxiosError<Envelope<unknown>>) => {
    const status = error.response?.status ?? 0;

    /*
     * 🔴 设备身份回写必须在这里补一次。
     *
     * `setupDeviceSync` 只给**成功**响应挂了同步钩子；而服务端判定"设备 ID 丢失/
     * 变更"时，是把 `X-Device-Id` + `Set-Cookie` 和 403 放在**同一次响应**里回写的。
     * 只在成功分支同步 ⇒ 服务端刚下发的新身份永远到不了 localStorage ⇒ 下一次请求
     * 继续被判"设备变更" ⇒ 验证通过也没用，会无限弹窗（Set-Cookie 由浏览器自己
     * 落地，不受此影响；死的只有 header 这条通道）。
     */
    if (error.response) handleDeviceSyncInResponse(error.response);

    const body = await readErrorBody(error);

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

    /*
     * 会话风险（403 + `__risk__`）：原地验证，通过后**自动重发原请求**。
     *
     * 与 428 的区别是会话状态：428 时连会话都没建立，只能整页跳验证页；
     * 这里的会话是完好且已登录的，仅仅"环境变了"，跳走反而要重新登录一轮。
     *
     * `_riskRetried` 是防死循环的最后一道闸：验证接口本身若因基准更新失败而
     * 没落下免验标记，下一次请求仍会 403 —— 不设标记就会"弹窗 → 重发 → 403 →
     * 弹窗"无限循环，用户永远点不完。
     */
    const risk = body?.__risk__;
    if (status === 403 && risk?.verifyToken) {
      const config = error.config as RiskAwareConfig | undefined;
      if (config && !config._riskRetried) {
        const passed = await requireRiskVerify(risk);
        if (passed) {
          config._riskRetried = true;
          return http.request(config);
        }
        throw new ApiError('已取消人机验证，操作未执行', 403, 403, risk, false, false, true);
      }
      throw new ApiError(body?.message || '需要完成人机验证后再操作', 403, 403, risk, false, false, true);
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
