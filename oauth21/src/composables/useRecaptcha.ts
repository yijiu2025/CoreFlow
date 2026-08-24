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
  // 隐藏容器：必须留在可视区域内（不能偏移到 -9999px 屏外，否则挑战弹窗跑到屏幕外），
  // 也不能用 overflow:hidden + 零尺寸（会让挑战 UI 被裁切，只剩部分可见）。
  // 用 fixed + 透明 + 不可交互，挑战弹窗由 hCaptcha SDK 自行挂到 body 层，正常居中弹出。
  if (!container) {
    container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.bottom = '0';
    container.style.left = '0';
    container.style.opacity = '0';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '0';
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

/**
 * 获取 hCaptcha token（提交前调，触发 invisible 验证）
 *
 * 体验与健壮性保障：
 * - 注入约束 CSS：hCaptcha 挑战 iframe 默认占满屏幕且被 body{overflow:hidden} 裁切上下，
 *   注入样式把挑战层约束成居中、有限尺寸的浮层（内容在 iframe 内滚动），不再占满全屏
 * - 60s 超时兜底：用户不操作挑战弹窗 / 关闭弹窗时，避免 Promise 永久 pending 卡死提交
 * - 失败/超时返回 null：调用方据此决定是否继续（后端可放行或拒绝）
 * - 兼容 hCaptcha SDK 两种 execute 形式（Promise 返回 / callback 回调）
 */
async function getRecaptchaToken(): Promise<string | null> {
  if (!isEnabled.value) return null;
  const hcaptcha = await loadSdk();
  if (!hcaptcha) return null;

  const id = ensureWidget(hcaptcha);
  const TIMEOUT_MS = 60_000;
  const styleId = 'hcaptcha-challenge-constraint';

  // 触发挑战前：注入约束 CSS，让挑战弹窗居中、有限尺寸，不占满全屏
  injectChallengeStyle(styleId);

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (val: string | null) => {
      if (settled) return;
      settled = true;
      timer && clearTimeout(timer);
      // 挑战结束：移除约束 CSS
      removeChallengeStyle(styleId);
      resolve(val);
    };
    // 超时兜底：用户搁置挑战弹窗或 SDK 无响应时放行，避免卡死
    const timer = setTimeout(() => finish(null), TIMEOUT_MS);

    try {
      // 优先使用 Promise 形式（hCaptcha 较新 SDK）
      const maybe = hcaptcha.execute(id, { action: 'register' });
      if (maybe && typeof maybe.then === 'function') {
        maybe
          .then((tokenResp: any) => finish(tokenResp?.response || tokenResp?.token || null))
          .catch(() => finish(null));
        return;
      }
      // 回退 callback 形式（旧 SDK）：execute 返回值不是 Promise 时
      finish(maybe?.response || maybe?.token || null);
    } catch (e) {
      console.warn('[hCaptcha] execute 失败', e);
      finish(null);
    }
  });
}

/**
 * 注入约束 CSS：把 hCaptcha 挑战层约束成居中、有限尺寸的浮层，
 * 不被 body{overflow:hidden} 裁切，也不占满全屏。
 *
 * hCaptcha 挑战层 DOM 结构（实测）：
 *   <div position:absolute left:167 top:10>              ← 最外层浮层（相对 container 定位）
 *     <div width:520 height:570>
 *       <iframe title="hCaptcha挑战" width:520 height:570>  ← 挑战内容
 *     </div>
 *     <div position:fixed 全屏遮罩>                        ← 点遮罩关闭
 *   </div>
 * 根因：最外层是 absolute 相对 container 定位 + body overflow:hidden 裁切 → 上下看不到。
 * 修复：把最外层改 fixed 居中，不依赖 container 位置，也不被 body 裁切。
 */
function injectChallengeStyle(id: string) {
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  // 挑战浮层最外层容器：通过 iframe[title="hCaptcha挑战"] 的祖先 div 命中
  // 用 :has 匹配包含挑战 iframe 的浮层容器（现代浏览器支持），回退用通用选择器
  style.textContent = `
    /* 挑战浮层最外层（absolute→fixed 居中，绕开 container 定位与 body 裁切） */
    div:has(> iframe[title="hCaptcha挑战"]),
    div:has(> iframe[title*="hCaptcha" i]) {
      position: fixed !important;
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%) !important;
      margin: 0 !important;
      z-index: 2147483647 !important;
      max-width: 90vw !important;
      max-height: 85vh !important;
      box-shadow: 0 20px 60px -10px rgba(0,0,0,0.35) !important;
    }
    /* 挑战 iframe 本身：尺寸固定，小屏自适应 */
    iframe[title="hCaptcha挑战"],
    iframe[title*="hCaptcha" i] {
      width: 520px !important;
      height: 570px !important;
      max-width: 90vw !important;
      max-height: 85vh !important;
      border-radius: 8px !important;
    }
    /* 挑战内容包裹层 */
    div:has(> iframe[title="hCaptcha挑战"]) > div {
      width: auto !important;
      height: auto !important;
    }
    /* 全屏遮罩层保持 fixed 即可（已是 fixed），不裁切 */
  `;
  document.head.appendChild(style);
}

/** 移除约束 CSS（挑战结束后恢复 SDK 默认行为） */
function removeChallengeStyle(id: string) {
  document.getElementById(id)?.remove();
}

export function useRecaptcha() {
  return { isEnabled, loadRecaptcha, getRecaptchaToken };
}
