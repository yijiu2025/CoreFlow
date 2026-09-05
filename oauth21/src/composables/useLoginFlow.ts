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
 * @author yijiu2025
 * @since 2026-08-26
 */
import { ref } from 'vue';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { postToParent } from '@/utils/parent';
import { getStableDeviceId } from 'stable-deviceid';
import { useCountdown } from './useCountdown';

/** 登录响应判别联合（按 action 区分四种分支） */
export type LoginResponse =
  | { action: 'consent'; consentKey: string; client_name: string; scope: string; user: LoginUser }
  | { action: 'needs_email_verify'; verifyToken: string; email: string; reason?: string }
  | { action: 'max_sessions'; sessions: any[]; maxSessions: number }
  | LoginSuccessResponse;

/** 登录成功响应（兼容 JWT 与 Session） */
export interface LoginSuccessResponse {
  accessToken?: string;      // JWT 模式
  access_token?: string;     // JWT 模式（snake_case 兜底）
  session_token?: string;    // Session 模式
  refresh_token?: string;    // JWT 模式
  expires_in?: number;
  scope?: string;
  user: LoginUser;
}

export interface LoginUser {
  id: string | number;
  username: string;
  name?: string;
  email?: string;
  avatar?: string | null;
}

/**
 * 类型守卫函数（按 action 区分响应类型，分支内用 narrowing 自动收窄）
 * 替代 `LoginResponse | any` —— 判别联合的 discriminant 在 `| any` 时彻底失效
 */
export function isConsentResponse(res: unknown): res is Extract<LoginResponse, { action: 'consent' }> {
  return !!res && typeof res === 'object' && (res as any).action === 'consent';
}
export function isEmailVerifyResponse(res: unknown): res is Extract<LoginResponse, { action: 'needs_email_verify' }> {
  return !!res && typeof res === 'object' && (res as any).action === 'needs_email_verify';
}
export function isMaxSessionsResponse(res: unknown): res is Extract<LoginResponse, { action: 'max_sessions' }> {
  return !!res && typeof res === 'object' && (res as any).action === 'max_sessions';
}
export function isLoginSuccessResponse(res: unknown): res is LoginSuccessResponse {
  return !!res && typeof res === 'object' && (res as any).action === undefined
    && (('accessToken' in (res as any)) || ('access_token' in (res as any)) || ('session_token' in (res as any)));
}

export interface EmailVerifyState {
  verifyToken: string;
  email: string;
  reason: string;
}

export interface UseLoginFlowOptions {
  /** 是否保持登录（控制 sid_r 长登录） */
  keepLogin: () => boolean;
  /** 表单值（username/password/email/code/type） */
  values: () => any;
  /** 图形验证码 key */
  captchaKey: () => string;
  /** 客户端 ID */
  clientId: () => string | undefined;
  /** 错误提示函数 */
  showError: (msg: string) => void;
}

export function useLoginFlow(opts: UseLoginFlowOptions) {
  const { keepLogin, values, captchaKey, clientId, showError } = opts;
  const authStore = useAuthStore();

  // 授权确认状态
  const showConsent = ref(false);
  const consentState = ref<any>(null);
  const submittingConsent = ref(false);

  // 邮箱二次验证状态
  const showEmailVerify = ref(false);
  const emailVerifyState = ref<EmailVerifyState | null>(null);
  const emailVerifyCode = ref('');
  const emailVerifyCountdown = useCountdown(60);

  /** 通知父窗口登录成功（兼容 JWT/Session） */
  function notifyParentLoginSuccess(res: LoginSuccessResponse | unknown) {
    if (!(window.parent && window.parent !== window)) return;
    // narrow unknown → LoginSuccessResponse 才能读字段
    const data = res as LoginSuccessResponse | undefined;
    if (!data || typeof data !== 'object') return;
    const token = (data as any).accessToken || (data as any).access_token;
    const sessionToken = (data as any).session_token;
    const user: LoginUser = (data as any).user || {};
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

  /** 执行登录（提交后端 + 处理四种响应分支） */
  async function executeLogin() {
    try {
      const loginPayload = {
        ...values(),
        keepLogin: keepLogin(),
        captchaKey: captchaKey(),
        client_id: clientId()
      };
      // 响应类型未知（后端可能微调字段），用 unknown + 类型守卫 narrowing
      const res: unknown = await authStore.login(loginPayload);
      if (isConsentResponse(res)) {
        consentState.value = res;
        showConsent.value = true;
      } else if (isEmailVerifyResponse(res)) {
        emailVerifyState.value = {
          verifyToken: res.verifyToken,
          email: res.email,
          reason: res.reason || '登录环境变更'
        };
        emailVerifyCode.value = '';
        showEmailVerify.value = true;
        emailVerifyCountdown.start(60);
      } else if (isMaxSessionsResponse(res)) {
        if (window.parent && window.parent !== window) {
          postToParent({
            type: 'MAX_SESSIONS',
            sessions: res.sessions,
            maxSessions: res.maxSessions
          });
        }
      } else if (isLoginSuccessResponse(res)) {
        notifyParentLoginSuccess(res);
      } else {
        // 后端返回了未识别的响应（可能是新 action 或字段微调），按成功处理兜底
        showError('登录响应格式异常，请重试');
      }
    } catch (err: any) {
      showError(err.message || '登录失败');
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
      const res: LoginSuccessResponse | unknown = await authApi.confirmConsent(consentState.value.consentKey);
      showConsent.value = false;
      consentState.value = null;
      notifyParentLoginSuccess(res);
    } catch (err: any) {
      showError(err.message || '授权确认失败');
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
    } catch (err: any) {
      showError(err.message || '验证码发送失败');
    }
  }

  /** 提交邮箱二次验证码 */
  async function submitEmailVerify() {
    if (!emailVerifyState.value || emailVerifyCode.value.length < 4) {
      showError('请输入4位验证码');
      return;
    }
    try {
      const res: LoginSuccessResponse | unknown = await authApi.verifyEmailLogin(
        emailVerifyState.value.verifyToken,
        emailVerifyCode.value
      );
      showEmailVerify.value = false;
      emailVerifyState.value = null;
      emailVerifyCode.value = '';
      emailVerifyCountdown.stop();
      notifyParentLoginSuccess(res);
    } catch (err: any) {
      showError(err.message || '验证码错误');
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
