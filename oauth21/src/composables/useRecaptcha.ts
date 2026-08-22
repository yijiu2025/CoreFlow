/**
 * hCaptcha 人机验证 composable（invisible 模式，无感）
 *
 * 仅在 VITE_RECAPTCHA_ENABLED=true 时加载 hCaptcha SDK 并采集 token。
 * 默认不启用（隐私友好 + 避免无密钥时阻塞注册流程）。
 *
 * hCaptcha invisible 模式流程：
 * 1. 页面加载时 render 一个隐藏 widget（拿到 widgetId）
 * 2. 提交时 execute(widgetId) 触发验证，拿到 token
 * 3. token 随表单提交到后端，后端调 siteverify 校验
 *
 * @author yijiu2025
 * @since 2026-08-22
 */
import { ref } from 'vue';

/** hCaptcha siteKey（从 meta 或环境变量注入） */
function getSiteKey(): string {
  const meta = document.querySelector('meta[name="recaptcha-site-key"]')?.getAttribute('content');
  if (meta) return meta;
  return import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';
}

const isEnabled = ref(import.meta.env.VITE_RECAPTCHA_ENABLED === 'true');
let sdkLoaded = false;
let hcaptchaObj: any = null;
let widgetId: string | null = null;
/** 隐藏容器，用于 render invisible widget */
let container: HTMLDivElement | null = null;

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
    // hcaptcha SDK 加载后调用全局回调
    (window as any).hcaptchaOnLoad = () => {
      hcaptchaObj = (window as any).hcaptcha;
      sdkLoaded = true;
      resolve(hcaptchaObj);
    };
    const script = document.createElement('script');
    script.src = 'https://js.hcaptcha.com/1/api.js?onload=hcaptchaOnLoad&render=explicit';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  });
}

/** render invisible widget（拿到 widgetId） */
function ensureWidget(hcaptcha: any): string {
  if (widgetId !== null) return widgetId;
  const siteKey = getSiteKey();
  // 创建隐藏容器
  if (!container) {
    container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '-9999px';
    container.style.left = '-9999px';
    document.body.appendChild(container);
  }
  // invisible 模式：size=invisible，提交时手动 execute
  widgetId = hcaptcha.render(container, {
    sitekey: siteKey,
    size: 'invisible'
  });
  return widgetId;
}

/** 预加载 SDK + render widget（页面加载时调，提前 warm up） */
async function loadRecaptcha(): Promise<void> {
  if (!isEnabled.value) return;
  const hcaptcha = await loadSdk();
  if (hcaptcha) ensureWidget(hcaptcha);
}

/** 获取 hCaptcha token（提交前调，触发 invisible 验证） */
async function getRecaptchaToken(): Promise<string | null> {
  if (!isEnabled.value) return null;
  const hcaptcha = await loadSdk();
  if (!hcaptcha) return null;

  const id = ensureWidget(hcaptcha);
  return new Promise((resolve) => {
    hcaptcha.execute(id, { action: 'register' }, (tokenResp: any) => {
      const token = tokenResp?.response || tokenResp?.token || tokenResp || null;
      resolve(token);
    });
  });
}

export function useRecaptcha() {
  return { isEnabled, loadRecaptcha, getRecaptchaToken };
}
