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

/** hCaptcha siteKey（从 meta 或环境变量注入） */
function getSiteKey(): string {
  const meta = document.querySelector('meta[name="recaptcha-site-key"]')?.getAttribute('content');
  if (meta) return meta;
  return import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';
}

/** 是否启用（编译期定值，运行时不变，用常量即可） */
const isEnabled = import.meta.env.VITE_RECAPTCHA_ENABLED === 'true';

/**
 * 每个使用方持有独立实例（widgetId/container/状态），避免模块级单例
 * 导致多页面/多组件共用一个 widget、SPA 路由切换后 widgetId 失效等问题。
 * onUnmounted 调 cleanup 清理 DOM + 重置状态，防内存泄漏。
 */
interface RecaptchaInstance {
  sdkLoaded: boolean;
  hcaptchaObj: any;
  widgetId: string | null;
  container: HTMLDivElement | null;
}

function createInstance(): RecaptchaInstance {
  return { sdkLoaded: false, hcaptchaObj: null, widgetId: null, container: null };
}

/** 加载 hCaptcha SDK（仅一次，带 onerror 超时兜底，防永久 pending） */
async function loadSdk(inst: RecaptchaInstance): Promise<any> {
  if (inst.sdkLoaded && inst.hcaptchaObj) return inst.hcaptchaObj;

  const siteKey = getSiteKey();
  if (!siteKey) {
    console.warn('[hCaptcha] siteKey 未配置，跳过人机验证');
    return null;
  }

  // 已被别的实例加载过（同页共享 window.hcaptcha）
  if ((window as any).hcaptcha) {
    inst.hcaptchaObj = (window as any).hcaptcha;
    inst.sdkLoaded = true;
    return inst.hcaptchaObj;
  }

  return new Promise((resolve) => {
    const LOAD_TIMEOUT_MS = 15_000;
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ok && (window as any).hcaptcha) {
        inst.hcaptchaObj = (window as any).hcaptcha;
        inst.sdkLoaded = true;
        resolve(inst.hcaptchaObj);
      } else {
        resolve(null);
      }
    };

    // 全局回调（hCaptcha SDK 加载完调）
    (window as any).hcaptchaOnLoad = () => done(true);

    const script = document.createElement('script');
    script.src = 'https://js.hcaptcha.com/1/api.js?onload=hcaptchaOnLoad&render=explicit';
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      console.warn('[hCaptcha] SDK 加载失败（网络/CSP）');
      done(false);
    };
    document.head.appendChild(script);

    // 超时兜底：网络慢/CSP 拦截时 SDK 不回调，避免 Promise 永久 pending
    const timer = setTimeout(() => {
      console.warn('[hCaptcha] SDK 加载超时');
      done(false);
    }, LOAD_TIMEOUT_MS);
  });
}

/** render invisible widget（拿到 widgetId） */
function ensureWidget(inst: RecaptchaInstance, hcaptcha: any): string {
  if (inst.widgetId !== null) return inst.widgetId;
  const siteKey = getSiteKey();
  // 隐藏容器：必须留在可视区域内（不能偏移到 -9999px 屏外，否则挑战弹窗跑到屏幕外），
  // 也不能用 overflow:hidden + 零尺寸（会让挑战 UI 被裁切，只剩部分可见）。
  // 用 fixed + 透明 + 不可交互，挑战弹窗由 hCaptcha SDK 自行挂到 body 层，正常居中弹出。
  if (!inst.container) {
    inst.container = document.createElement('div');
    inst.container.style.position = 'fixed';
    inst.container.style.bottom = '0';
    inst.container.style.left = '0';
    inst.container.style.opacity = '0';
    inst.container.style.pointerEvents = 'none';
    inst.container.style.zIndex = '0';
    document.body.appendChild(inst.container);
  }
  // invisible 模式：size=invisible，提交时手动 execute
  inst.widgetId = hcaptcha.render(inst.container, {
    sitekey: siteKey,
    size: 'invisible'
  });
  return inst.widgetId;
}

/** 清理实例：移除 container DOM + 重置状态（组件卸载时调） */
function cleanup(inst: RecaptchaInstance) {
  if (inst.container && inst.container.parentNode) {
    inst.container.parentNode.removeChild(inst.container);
  }
  inst.container = null;
  inst.widgetId = null;
  inst.hcaptchaObj = null;
  inst.sdkLoaded = false;
}

/** 约束 CSS 的 ID（全局唯一，注入一次即可，多实例共享同一样式） */
const STYLE_ID = 'hcaptcha-challenge-constraint';

/**
 * 注入约束 CSS：把 hCaptcha 挑战层约束成居中、有限尺寸的浮层，
 * 不被 body{overflow:hidden} 裁切，也不占满全屏。
 */
function injectChallengeStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
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
    iframe[title="hCaptcha挑战"],
    iframe[title*="hCaptcha" i] {
      width: 520px !important;
      height: 570px !important;
      max-width: 90vw !important;
      max-height: 85vh !important;
      border-radius: 8px !important;
    }
    div:has(> iframe[title="hCaptcha挑战"]) > div {
      width: auto !important;
      height: auto !important;
    }
  `;
  document.head.appendChild(style);
}

function removeChallengeStyle() {
  document.getElementById(STYLE_ID)?.remove();
}

/**
 * 创建 hCaptcha 人机验证实例（每组件独立）
 * @param action hCaptcha action 标识（如 'register'/'login'，用于后台分析区分）
 */
export function useRecaptcha(action = 'login') {
  const inst = createInstance();

  /** 预加载 SDK + render widget（页面加载时调，提前 warm up） */
  async function loadRecaptcha(): Promise<void> {
    if (!isEnabled) return;
    const hcaptcha = await loadSdk(inst);
    if (hcaptcha) ensureWidget(inst, hcaptcha);
  }

  /**
   * 获取 hCaptcha token（提交前调，触发 invisible 验证）
   * 60s 超时兜底：用户不操作挑战弹窗 / 关闭弹窗时，避免 Promise 永久 pending 卡死提交
   * 失败/超时返回 null：调用方据此决定是否继续（后端可放行或拒绝）
   */
  async function getRecaptchaToken(): Promise<string | null> {
    if (!isEnabled) return null;
    const hcaptcha = await loadSdk(inst);
    if (!hcaptcha) return null;

    const id = ensureWidget(inst, hcaptcha);
    const TIMEOUT_MS = 60_000;

    injectChallengeStyle();

    return new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (val: string | null) => {
        if (settled) return;
        settled = true;
        timer && clearTimeout(timer);
        removeChallengeStyle();
        resolve(val);
      };
      const timer = setTimeout(() => finish(null), TIMEOUT_MS);

      try {
        // 兼容三种 SDK 形式：Promise 返回 / callback 回调 / 同步返回 tokenResp
        // callback 形式：execute(id, opts, cb) —— 旧 SDK 第三个参数是回调
        const cb = (tokenResp: any) => finish(tokenResp?.response || tokenResp?.token || null);
        const maybe = hcaptcha.execute(id, { action }, cb);

        // 新 SDK 返回 Promise
        if (maybe && typeof maybe.then === 'function') {
          maybe
            .then((tokenResp: any) => finish(tokenResp?.response || tokenResp?.token || null))
            .catch(() => finish(null));
        }
        // 同步返回 tokenResp（旧 SDK 不调 callback 直接返回）—— cb 不会被触发，用 maybe
        else if (maybe && (maybe.response || maybe.token)) {
          finish(maybe.response || maybe.token);
        }
        // 纯 callback 形式：maybe 为 undefined，等 cb 被调（已传 cb）
      } catch (e) {
        console.warn('[hCaptcha] execute 失败', e);
        finish(null);
      }
    });
  }

  /** 组件卸载时调，清理 DOM + 重置实例状态 */
  function dispose() {
    cleanup(inst);
  }

  return { isEnabled, loadRecaptcha, getRecaptchaToken, dispose };
}
