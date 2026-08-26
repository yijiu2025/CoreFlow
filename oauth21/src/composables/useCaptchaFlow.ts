/**
 * 图形验证码流程 composable
 *
 * 统一封装"发验证码/登录前先弹图形验证码，通过后拿 captchaKey 走后续流程"
 * 的通用逻辑，替代散落在登录/注册/找回密码 5-6 处的重复实现。
 *
 * 状态机：showCaptcha（弹窗开关）+ captchaKey（通过后的 key）+ purpose（区分用途）
 * 流程：openCaptcha(purpose) 弹窗 → GraphicCaptcha 验证 → onCaptchaSuccess(data)
 *       → 存 captchaKey + 闭关弹窗 + 调用方注入的 onSuccess(purpose) 继续后续流程
 *
 * @author yijiu2025
 * @since 2026-08-26
 */
import { ref } from 'vue';

export type CaptchaPurpose = 'code' | 'login' | 'register' | 'reset';

export interface CaptchaSuccessData {
  captchaKey: string;
}

export function useCaptchaFlow<TPurpose extends string = CaptchaPurpose>(
  onSuccess: (purpose: TPurpose) => void
) {
  const captchaKey = ref('');
  const showCaptcha = ref(false);
  const captchaPurpose = ref<TPurpose | null>(null);

  /** 弹出图形验证码弹窗（指定用途，通过后 onSuccess 按此分支） */
  function openCaptcha(purpose: TPurpose) {
    captchaPurpose.value = purpose;
    showCaptcha.value = true;
  }

  /** GraphicCaptcha 验证成功回调：存 key、闭关弹窗、按 purpose 调 onSuccess */
  function onCaptchaSuccess(data: CaptchaSuccessData) {
    showCaptcha.value = false;
    captchaKey.value = data.captchaKey;
    if (captchaPurpose.value !== null) {
      const p = captchaPurpose.value;
      captchaPurpose.value = null;
      onSuccess(p);
    }
  }

  /** 关闭弹窗（用户取消） */
  function closeCaptcha() {
    showCaptcha.value = false;
    captchaPurpose.value = null;
  }

  return {
    captchaKey,
    showCaptcha,
    captchaPurpose,
    openCaptcha,
    onCaptchaSuccess,
    closeCaptcha
  };
}
