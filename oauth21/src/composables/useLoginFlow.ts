/**
 * 登录流程 composable
 *
 * 统一封装 directLogin 响应的四种分支处理，替代 StandardLogin/MiniLogin/app/login
 * 三处约 200 行逐行重复的逻辑：
 * - action=consent → 弹授权确认页
 * - action=needs_email_verify → 弹邮箱二次验证 + 发码 + 60s 倒计时
 * - action=max_sessions → 通知父窗口设备数超限
 * - 默认 → notifyParentLoginSuccess 递 token 给父应用
 *
 * 兼容 JWT（accessToken）与 Session（session_token）两种模式。
 *
 * 🔴 后端响应**不在这里 `as any` 读字段**：全部经 `@/types/external` 的
 *    `parseLoginResponse` 做 zod 判别联合校验后，按 `kind` 分支消费。
 *    后端改字段 → 这里落到 `kind: 'unknown'` → 明确报错，而不是静默传空值给父窗口。
 *
 * @author yijiu2025
 * @since 2026-08-26
 */
import { ref } from 'vue';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { postToParent } from '@/utils/parent';
import { sanitizeLocalRedirect } from '@/utils/redirect';
import { getStableDeviceId } from 'stable-deviceid';
import { useCountdown } from './useCountdown';
import { parseLoginResponse } from '@/types/external';
import type {
  LoginUser,
  LoginSuccessResponse,
  LoginActionResponse,
  SessionBrief
} from '@/types/external';

// 类型从 @/types/external 统一导出，这里 re-export 保持既有 import 路径可用
export type { LoginUser, LoginSuccessResponse, SessionBrief };
export type { ParsedLoginResponse } from '@/types/external';

/** 授权确认期状态（consent 分支的 action 响应） */
type ConsentState = Extract<LoginActionResponse, { action: 'consent' }>;

export interface EmailVerifyState {
  verifyToken: string;
  email: string;
  reason: string;
}

export interface UseLoginFlowOptions {
  /** 是否保持登录（控制 sid_r 长登录） */
  keepLogin: () => boolean;
  /** 表单值（username/password/email/code/type） */
  values: () => Record<string, unknown>;
  /** 图形验证码 key */
  captchaKey: () => string;
  /** 客户端 ID */
  clientId: () => string | undefined;
  /** 错误提示函数 */
  showError: (msg: string) => void;
  /**
   * 全屏直连场景：登录成功后的回跳目标，通常是路由守卫带上的 ?redirect=
   * （例如未登录直接访问 /authorize，登录后应回到授权页继续授权）
   *
   * - 仅在最顶层窗口生效；iframe 内由父窗口接管，不做跳转（避免打断父应用流程）
   * - 内部走 sanitizeLocalRedirect 白名单，非站内相对路径一律忽略（防开放重定向）
   */
  redirectTo?: () => string | null | undefined;
}

export function useLoginFlow(opts: UseLoginFlowOptions) {
  const { keepLogin, values, captchaKey, clientId, showError, redirectTo } = opts;
  const authStore = useAuthStore();

  // 授权确认状态
  const showConsent = ref(false);
  const consentState = ref<ConsentState | null>(null);
  const submittingConsent = ref(false);

  // 邮箱二次验证状态
  const showEmailVerify = ref(false);
  const emailVerifyState = ref<EmailVerifyState | null>(null);
  const emailVerifyCode = ref('');
  const emailVerifyCountdown = useCountdown(60);

  /** 通知父窗口登录成功（兼容 JWT/Session） */
  function notifyParentLoginSuccess(res: LoginSuccessResponse | unknown) {
    if (!(window.parent && window.parent !== window)) return;
    // 非成功形状直接返回（父窗口不接收无 token 的消息，避免下游误判）
    if (!res || typeof res !== 'object') return;
    const data = res as LoginSuccessResponse;
    const token = data.accessToken || data.access_token;
    const sessionToken = data.session_token;
    const user: LoginUser = data.user;
    postToParent({
      type: 'LOGIN_SUCCESS',
      token,
      sessionToken,
      user: { id: user.id, username: user.username, name: user.name, email: user.email, avatar: user.avatar },
      // 权威设备 ID：父窗口采纳后同一物理设备跨 origin 归一为同一身份
      // （父窗口在 bindSession 之前采纳，登录基准指纹与后续请求一致）。
      // 仅发往白名单父 origin（postToParent 内校验），device_id 非机密可安全披露
      deviceId: getStableDeviceId(),
      data: res
    });
  }

  /**
   * 登录成功统一收尾：通知父窗口（iframe 场景）+ 全屏直连回跳
   *
   * 三条成功路径（登录成功 / 同意授权 / 邮箱二次验证通过）共用，
   * 避免只在其中一条上漏掉回跳 —— 历史上就没有任何一条处理 redirect，
   * 导致"守卫把未登录访问者送去 /login?redirect=/authorize，登录后再没人送回来"。
   */
  function finishLogin(res: LoginSuccessResponse | unknown) {
    notifyParentLoginSuccess(res);

    // iframe 内：父窗口按 LOGIN_SUCCESS 消息自行处理，这里不跳转
    if (window.parent && window.parent !== window) return;

    const target = sanitizeLocalRedirect(redirectTo?.());
    if (target) {
      // replace 而非 assign：登录页不留历史，返回键不会退回登录页
      window.location.replace(target);
    }
  }

  /** 执行登录（提交后端 + 处理四种响应分支） */
  async function executeLogin() {
    try {
      // values() 由各版式表单提供（含 type/username/password/code 等），
      // 形状是 Record<string, unknown>；authApi.login 同口径接收后按需解构 + 加密。
      const loginPayload: Record<string, unknown> = {
        ...values(),
        keepLogin: keepLogin(),
        captchaKey: captchaKey(),
        client_id: clientId()
      };
      // 响应类型未知（后端可能微调字段）→ zod 判别联合解析，按 kind 分支消费
      const raw: unknown = await authStore.login(loginPayload);
      const parsed = parseLoginResponse(raw);

      if (parsed.kind === 'action') {
        handleActionResponse(parsed.value);
      } else if (parsed.kind === 'success') {
        finishLogin(parsed.value);
      } else {
        // 后端返回了未识别的响应（新 action 或字段改名）→ 明确报错
        showError('登录响应格式异常，请重试');
      }
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : '登录失败');
    }
  }

  /** 处理带 action 的三个分支（consent / needs_email_verify / max_sessions） */
  function handleActionResponse(res: LoginActionResponse) {
    if (res.action === 'consent') {
      consentState.value = res;
      showConsent.value = true;
    } else if (res.action === 'needs_email_verify') {
      emailVerifyState.value = {
        verifyToken: res.verifyToken,
        email: res.email,
        reason: res.reason || '登录环境变更'
      };
      emailVerifyCode.value = '';
      showEmailVerify.value = true;
      emailVerifyCountdown.start(60);
    } else {
      // max_sessions：仅在 iframe 内通知父窗口
      if (window.parent && window.parent !== window) {
        postToParent({
          type: 'MAX_SESSIONS',
          sessions: res.sessions,
          maxSessions: res.maxSessions
        });
      }
    }
  }

  /** 拒绝授权 */
  function denyConsent() {
    showConsent.value = false;
    consentState.value = null;
    if (window.parent && window.parent !== window) {
      postToParent({ type: 'SSO_DENIED', error: 'user_denied', description: '用户拒绝了授权申请' });
    }
  }

  /** 同意授权 */
  async function approveConsent() {
    if (!consentState.value) return;
    submittingConsent.value = true;
    try {
      const raw: unknown = await authApi.confirmConsent(consentState.value.consentKey);
      showConsent.value = false;
      consentState.value = null;
      const parsed = parseLoginResponse(raw);
      finishLogin(parsed.kind === 'success' ? parsed.value : raw);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : '授权确认失败');
    } finally {
      submittingConsent.value = false;
    }
  }

  /** 重发登录二次验证邮箱码 */
  async function sendEmailVerifyCode() {
    if (!emailVerifyState.value?.verifyToken || emailVerifyCountdown.active.value) return;
    try {
      await authApi.sendLoginVerifyCode(emailVerifyState.value.verifyToken);
      emailVerifyCountdown.start(60);
      showError('验证码已重新发送至邮箱');
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : '验证码发送失败');
    }
  }

  /** 提交邮箱二次验证码 */
  async function submitEmailVerify() {
    if (!emailVerifyState.value || emailVerifyCode.value.length < 4) {
      showError('请输入4位验证码');
      return;
    }
    try {
      const raw: unknown = await authApi.verifyEmailLogin(
        emailVerifyState.value.verifyToken,
        emailVerifyCode.value
      );
      showEmailVerify.value = false;
      emailVerifyState.value = null;
      emailVerifyCode.value = '';
      emailVerifyCountdown.stop();
      const parsed = parseLoginResponse(raw);
      finishLogin(parsed.kind === 'success' ? parsed.value : raw);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : '验证码错误');
    }
  }

  return {
    // 授权确认
    showConsent,
    consentState,
    submittingConsent,
    denyConsent,
    approveConsent,
    // 邮箱二次验证
    showEmailVerify,
    emailVerifyState,
    emailVerifyCode,
    emailVerifyCountdown,
    sendEmailVerifyCode,
    submitEmailVerify,
    // 登录 + 通知父窗口
    executeLogin,
    notifyParentLoginSuccess
  };
}
