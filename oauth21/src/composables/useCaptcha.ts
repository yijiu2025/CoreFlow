/**
 * 人机验证统一接口（按 env 自动选 hCaptcha 或 Cloudflare Turnstile）
 *
 * 调用方用 useCaptcha('register') 即可，不用关心是哪种验证方案。
 * 优先级（同时只能开一种）：
 *   1. VITE_TURNSTILE_ENABLED=true → 用 Cloudflare Turnstile（推荐国内/隐私场景）
 *   2. VITE_RECAPTCHA_ENABLED=true → 用 hCaptcha（兼容旧配置）
 *   3. 都未开 → 验证器不可用，getToken 返回 null（调用方据此决定是否继续）
 *
 * 两种实现都暴露统一接口：
 *   { isEnabled, load(), getToken(), dispose() }
 *
 * 调用方（StandardRegister/MiniRegister/app/register）：
 *   const { isEnabled, load, getToken, dispose } = useCaptcha('register');
 *   onMounted(() => { if (isEnabled) load(); });
 *   onUnmounted(() => dispose());
 *   const token = isEnabled ? await getToken() : null;
 *
 * 启用示例（.env）：
 *   # 选 Turnstile（推荐国内）
 *   VITE_TURNSTILE_ENABLED=true
 *   VITE_TURNSTILE_SITE_KEY=0x4AAAAAAA...
 *   # 或选 hCaptcha（兼容旧配置）
 *   VITE_RECAPTCHA_ENABLED=true
 *   VITE_RECAPTCHA_SITE_KEY=649e9b18-...
 *
 * @author yijiu2025
 * @since 2026-08-29
 */

import { useHCaptcha } from './useHCaptcha';
import { useTurnstile } from './useTurnstile';

const TURNSTILE_ENABLED = import.meta.env.VITE_TURNSTILE_ENABLED === 'true';
const HCAPTCHA_ENABLED = import.meta.env.VITE_RECAPTCHA_ENABLED === 'true';

/**
 * 统一的人机验证接口（所有实现都返回这个形状）
 * 调用方解构 { isEnabled, load, getToken, dispose }，不用关心具体方案
 */
export interface CaptchaInstance {
  isEnabled: boolean;
  load: () => Promise<void>;
  getToken: () => Promise<string | null>;
  dispose: () => void;
}

/** 适配器：把 useHCaptcha 的 { loadHCaptcha, getRecaptchaToken } 映射成 { load, getToken } */
function adaptHCaptcha(action: string): CaptchaInstance {
  const { isEnabled, loadHCaptcha, getRecaptchaToken, dispose } = useHCaptcha(action);
  return {
    isEnabled: isEnabled as boolean,
    load: loadHCaptcha,
    getToken: getRecaptchaToken,
    dispose
  };
}

/** 适配器：把 useTurnstile 的 { loadTurnstile, getTurnstileToken } 映射成 { load, getToken } */
function adaptTurnstile(action: string): CaptchaInstance {
  const { isEnabled, loadTurnstile, getTurnstileToken, dispose } = useTurnstile(action);
  return {
    isEnabled: isEnabled as boolean,
    load: loadTurnstile,
    getToken: getTurnstileToken,
    dispose
  };
}

/**
 * 自动选最合适的验证器（Turnstile 优先）
 * 都未开 → 返回 stub（isEnabled: false, getToken: null），调用方无 if 分支
 */
export function useCaptcha(action: string = 'login'): CaptchaInstance {
  if (TURNSTILE_ENABLED) return adaptTurnstile(action);
  if (HCAPTCHA_ENABLED) return adaptHCaptcha(action);
  return {
    isEnabled: false,
    async load() { /* noop */ },
    async getToken() { return null; },
    dispose() { /* noop */ }
  };
}

// 显式导出两个具体实现（高级用户/调试用）
export { useHCaptcha, useTurnstile };
