/**
 * hCaptcha 人机验证 composable
 *
 * 仅在 RECAPTCHA_ENABLED=true 时加载 hCaptcha SDK 并采集 token。
 * 默认不启用（隐私友好 + 避免无密钥时阻塞注册流程）。
 *
 * 使用：
 *   const { loadRecaptcha, getRecaptchaToken, isEnabled } = useRecaptcha()
 *   if (isEnabled.value) {
 *     await loadRecaptcha()        // 提前加载 SDK
 *     const token = await getRecaptchaToken()  // 提交前取 token
 *   }
 *
 * @author yijiu2025
 * @since 2026-08-22
 */
import { ref } from 'vue';

/** hCaptcha SDK 脚本 URL（含 siteKey，从 meta 或环境变量注入） */
function getSiteKey(): string {
  // 后端通过页面 meta 注入，或前端环境变量
  const meta = document.querySelector('meta[name="recaptcha-site-key"]')?.getAttribute('content');
  if (meta) return meta;
  return import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';
}

const isEnabled = ref(import.meta.env.VITE_RECAPTCHA_ENABLED === 'true');
let sdkLoaded = false;
let hcaptchaObj: any = null;

/** 加载 hCaptcha SDK（仅一次） */
async function loadSdk(): Promise<any> {
  if (sdkLoaded && hcaptchaObj) return hcaptchaObj;

  const siteKey = getSiteKey();
  if (!siteKey) {
    console.warn('[hCaptcha] siteKey 未配置，跳过人机验证');
    return null;
  }

  return new Promise((resolve) => {
    if ((window as any).hcaptcha) {
      hcaptchaObj = (window as any).hcaptcha;
      sdkLoaded = true;
      resolve(hcaptchaObj);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.hcaptcha.com/1/api.js?onload=hcaptchaOnLoad&render=explicit';
    script.async = true;
    script.defer = true;
    (window as any).hcaptchaOnLoad = () => {
      hcaptchaObj = (window as any).hcaptcha;
      sdkLoaded = true;
      resolve(hcaptchaObj);
    };
    document.head.appendChild(script);
  });
}

/** 预加载 SDK（页面加载时调，提前 warm up） */
async function loadRecaptcha(): Promise<void> {
  if (!isEnabled.value) return;
  await loadSdk();
}

/** 获取 hCaptcha token（提交前调） */
async function getRecaptchaToken(): Promise<string | null> {
  if (!isEnabled.value) return null;
  const hcaptcha = await loadSdk();
  if (!hcaptcha) return null;

  const siteKey = getSiteKey();
  try {
    // invisible 模式：执行人机验证拿 token（无感，不弹框）
    const token = await hcaptcha.execute(siteKey, { action: 'register' });
    return token?.response || token || null;
  } catch (err) {
    console.warn('[hCaptcha] 获取 token 失败:', err);
    return null;
  }
}

export function useRecaptcha() {
  return { isEnabled, loadRecaptcha, getRecaptchaToken };
}
