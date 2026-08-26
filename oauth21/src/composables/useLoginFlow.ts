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
import { useCountdown } from './useCountdown';

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
  function notifyParentLoginSuccess(res: any) {
    if (!(window.parent && window.parent !== window)) return;
    const token = res?.accessToken || res?.access_token;
    const sessionToken = res?.session_token;
    const user = res?.user || {};
    postToParent({
      type: 'LOGIN_SUCCESS',
      token,
      sessionToken,
      user: { id: user.id, username: user.username, name: user.name, email: user.email, avatar: user.avatar },
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
      const res = await authStore.login(loginPayload as any);
      if (res && res.action === 'consent') {
        consentState.value = res;
        showConsent.value = true;
      } else if (res && res.action === 'needs_email_verify') {
        emailVerifyState.value = {
          verifyToken: res.verifyToken,
          email: res.email,
          reason: res.reason || '登录环境变更'
        };
        emailVerifyCode.value = '';
        showEmailVerify.value = true;
        emailVerifyCountdown.start(60);
      } else if (res && res.action === 'max_sessions') {
        if (window.parent && window.parent !== window) {
          postToParent({
            type: 'MAX_SESSIONS',
            sessions: res.sessions,
            maxSessions: res.maxSessions
          });
        }
      } else {
        notifyParentLoginSuccess(res);
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
      const res: any = await authApi.confirmConsent(consentState.value.consentKey);
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
      const res: any = await authApi.verifyEmailLogin(
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
