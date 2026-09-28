/**
 * 外部边界类型的**唯一入口**（external boundary types）
 *
 * 本文件只做一件事：把「不属于本仓库、形状由第三方或后端决定」的类型集中收口，
 * 让 `any` 只出现在这里，业务代码一律消费这里的**窄接口 / 判别联合**。
 *
 * 三类边界：
 *  1. 浏览器全局注入的验证码 SDK（hCaptcha / Cloudflare Turnstile）
 *     —— `declare global` 窄接口，替代散落各处的 `(window as any).hcaptcha`
 *  2. 后端登录响应（directLogin 的四种 action 分支）
 *     —— zod schema + `z.infer` 派生类型，把「后端字段变了下游零提示」变成编译期/运行期双保险
 *  3. 后端返回的通用未校验对象（二维码生成/轮询等）
 *     —— 各接口自带的 Response 类型
 *
 * 🔴 约定：业务代码（composables / views / stores）**不得**再写 `as any` 读外部字段；
 *    需要新字段时在这里补 schema 或窄接口，并同步补关卡。
 *
 * @author yijiu2025
 * @since 2026-09-28
 */
import { z } from 'zod';

/* ========================================================================
 * 一、验证码 SDK 全局窄接口
 * ====================================================================== */

/**
 * hCaptcha `render()` 的返回值：widgetId（数字或字符串，视 SDK 版本）。
 * 旧版返回 number，新版可能返回 string，统一按 `string | number` 收。
 */
export type HCaptchaWidgetId = string | number;

/**
 * hCaptcha `execute()` 的返回值形态（三种 SDK 形式都可能出现）：
 * - 新 SDK：返回 Promise<HCaptchaExecuteResponse>
 * - 旧 SDK：同步返回 HCaptchaExecuteResponse
 * - 纯 callback：返回 undefined，结果走第三个入参回调
 */
export interface HCaptchaExecuteResponse {
  /** 主字段：验证通过的 token */
  response?: string;
  /** 兼容字段：部分版本回调里叫 token */
  token?: string;
}

/**
 * hCaptcha SDK 暴露在 `window.hcaptcha` 上的窄接口。
 *
 * 只声明本项目**实际调用**的成员（render / execute），不照抄 SDK 全量 API ——
 * 保持窄，才能让「SDK 大版本升级改了签名」在这里暴露。
 */
export interface HCaptchaSdk {
  /**
   * 渲染 widget，返回 widgetId。
   * @param container 挂载容器（invisible 模式也必须给真实 DOM 节点）
   * @param options   渲染配置（invisible 模式必须 `size: 'invisible'`）
   */
  render(
    container: HTMLElement,
    options: { sitekey: string; size: 'invisible' | 'normal' | 'compact' | 'flexible' }
  ): HCaptchaWidgetId;

  /**
   * 触发验证。三种 SDK 形式都可能，故返回类型是三者的并集：
   * @param widgetId widgetId（render 的返回值）
   * @param options  执行配置（action 用于后台分析区分来源）
   * @param callback 旧 SDK 回调形式（`execute(id, opts, cb)`）
   */
  execute(
    widgetId: HCaptchaWidgetId,
    options: { action?: string },
    callback?: (result: HCaptchaExecuteResponse) => void
  ): Promise<HCaptchaExecuteResponse> | HCaptchaExecuteResponse | undefined;
}

/**
 * Cloudflare Turnstile SDK 暴露在 `window.turnstile` 上的窄接口。
 * 同样只声明实际用到的 render / reset / execute。
 */
export interface TurnstileSdk {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      size: 'invisible' | 'normal' | 'compact' | 'flexible';
      action?: string;
      callback?: (token: string) => void;
      'error-callback'?: () => void;
    }
  ): string;

  reset(widgetId: string): void;

  execute(
    widgetId: string,
    options: {
      callback?: (token: string) => void;
      'error-callback'?: () => void;
      action?: string;
    }
  ): void;
}

/**
 * 全局注入声明：两个 SDK 的加载器（`onload` 回调）与实例本体。
 *
 * 都是 `?:` 可选 —— 页面未启用/未加载时确实不存在，调用方必须判空。
 * 这正是把 `(window as any).hcaptcha` 换成 `window.hcaptcha` 后能拿到**类型安全判空**的原因。
 */
declare global {
  interface Window {
    /** hCaptcha SDK 实例（由 js.hcaptcha.com/1/api.js 注入） */
    hcaptcha?: HCaptchaSdk;
    /** hCaptcha 加载完成回调（script src 的 ?onload= 指定） */
    hcaptchaOnLoad?: () => void;

    /** Cloudflare Turnstile SDK 实例 */
    turnstile?: TurnstileSdk;
    /** Turnstile 加载完成回调（?onload=turnstileOnLoad） */
    turnstileOnLoad?: () => void;
    /** Turnstile 旧版全局回调名（兼容 ?onload=onloadTurnstileCallback） */
    onloadTurnstileCallback?: () => void;
  }
}

/* ========================================================================
 * 二、后端登录响应 —— zod schema + 派生类型
 * ====================================================================== */

/**
 * 会话摘要（`max_sessions` 分支里后端下发的活跃会话列表）。
 *
 * 字段对齐后端 `src/framework/auth/session-governance.js` 的 `checkMaxSessions`：
 * sessionId / ip / userAgent / lastActive / deviceType / appId。
 * 前端只把整份列表透传给父窗口，**不消费内部字段** —— 但校验能让
 * 「后端字段微调」在运行期暴露，而不是静默传一份空对象给父应用。
 */
export const sessionBriefSchema = z.object({
  sessionId: z.string(),
  ip: z.string(),
  userAgent: z.string(),
  lastActive: z.union([z.number(), z.string()]),
  deviceType: z.string().optional(),
  appId: z.string().optional()
});

export type SessionBrief = z.infer<typeof sessionBriefSchema>;

/** 登录用户（各分支共用） */
export const loginUserSchema = z.object({
  id: z.union([z.string(), z.number()]),
  username: z.string(),
  name: z.string().optional(),
  email: z.string().optional(),
  avatar: z.string().nullable().optional()
});

export type LoginUser = z.infer<typeof loginUserSchema>;

/**
 * 登录成功响应（兼容 JWT 与 Session 两种模式）。
 * - JWT 模式：`accessToken`（camelCase）或 `access_token`（snake_case 兜底）
 * - Session 模式：`session_token`（无 accessToken）
 *
 * `user` 允许宽松（后端某些分支不下发完整 user，用 `.catch({})` 兜底为空对象，
 * 下游 `notifyParentLoginSuccess` 会按缺字段填 undefined）。
 */
export const loginSuccessSchema = z.object({
  accessToken: z.string().optional(),
  access_token: z.string().optional(),
  session_token: z.string().optional(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
  user: loginUserSchema.catch({ id: 0, username: '' })
});

export type LoginSuccessResponse = z.infer<typeof loginSuccessSchema>;

/**
 * 登录响应判别联合（按 action 区分四种分支）。
 *
 * 用 zod 的 discriminatedUnion：解析时自动按 `action` 字段分发到对应 schema，
 * **同时**在 TS 层给出判别联合类型 —— 一处定义，运行期校验 + 编译期 narrowing 双得。
 */
export const loginResponseSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('consent'),
    consentKey: z.string(),
    client_name: z.string(),
    scope: z.string(),
    user: loginUserSchema
  }),
  z.object({
    action: z.literal('needs_email_verify'),
    verifyToken: z.string(),
    email: z.string(),
    reason: z.string().optional()
  }),
  z.object({
    action: z.literal('max_sessions'),
    sessions: z.array(sessionBriefSchema),
    maxSessions: z.number()
  })
]);

export type LoginActionResponse = z.infer<typeof loginResponseSchema>;

/**
 * 解析后端登录响应：先按 action 判别联合解析，失败则尝试登录成功形状。
 *
 * 返回值是三态：
 *  - `{ kind: 'action', value }` —— 命中某个带 action 的分支（consent / email / max_sessions）
 *  - `{ kind: 'success', value }` —— 无 action 且含 token 字段（JWT 或 Session）
 *  - `{ kind: 'unknown', raw }`   —— 都不匹配（后端加了新 action 或字段改名）
 *
 * 🔴 这是**唯一**允许接触后端原始响应的地方；调用方只消费 `kind`，不再 `as any`。
 */
export type ParsedLoginResponse =
  | { kind: 'action'; value: LoginActionResponse }
  | { kind: 'success'; value: LoginSuccessResponse }
  | { kind: 'unknown'; raw: unknown };

export function parseLoginResponse(raw: unknown): ParsedLoginResponse {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { kind: 'unknown', raw };
  }

  const actionResult = loginResponseSchema.safeParse(raw);
  if (actionResult.success) {
    return { kind: 'action', value: actionResult.data };
  }

  // 无 action：尝试登录成功形状。要求至少有一个 token 字段，否则视为未识别
  // （避免把任意对象都当成功，掩盖后端改字段）。
  const obj = raw as Record<string, unknown>;
  const hasToken = typeof obj.accessToken === 'string'
    || typeof obj.access_token === 'string'
    || typeof obj.session_token === 'string';
  if (hasToken) {
    const successResult = loginSuccessSchema.safeParse(raw);
    if (successResult.success) {
      return { kind: 'success', value: successResult.data };
    }
  }

  return { kind: 'unknown', raw };
}

/* ========================================================================
 * 三、二维码登录响应
 * ====================================================================== */

/** `POST /oauth2.1/qr/generate` 的响应 */
export const qrGenerateSchema = z.object({
  qrKey: z.string(),
  qrContent: z.string().optional()
});

export type QrGenerateResponse = z.infer<typeof qrGenerateSchema>;

/**
 * `GET /oauth2.1/qr/status` 的响应（PC 端轮询）。
 * confirmed 时后端会带上 token 响应字段，故这里把成功字段一并声明为可选。
 */
export const qrStatusSchema = z.object({
  status: z.string().optional(),
  accessToken: z.string().optional(),
  access_token: z.string().optional(),
  session_token: z.string().optional(),
  user: loginUserSchema.optional()
});

export type QrStatusResponse = z.infer<typeof qrStatusSchema>;

/** 解析二维码状态响应（解析失败返回 null，轮询侧按「未确认」继续） */
export function parseQrStatus(raw: unknown): QrStatusResponse | null {
  const result = qrStatusSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/* ========================================================================
 * 四、授权确认响应（/oauth2.1/authorize/consent）
 * ====================================================================== */

/**
 * 从授权确认响应中取后端校验过的跳转地址。
 *
 * 后端可能把地址放在顶层 `redirect_url`，也可能包在 `data.redirect_url` 里
 * （信封是否被 request 拦截器解包取决于分支），两种都认。
 *
 * 🔴 绝不直接采信 `query.redirect_uri` —— 那会被篡改成开放重定向；
 *    这里只读后端返回值，取不到就让调用方报错。
 */
export function pickRedirectUrl(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.redirect_url === 'string') return obj.redirect_url;
  const nested = obj.data;
  if (nested && typeof nested === 'object') {
    const inner = (nested as Record<string, unknown>).redirect_url;
    if (typeof inner === 'string') return inner;
  }
  return undefined;
}
