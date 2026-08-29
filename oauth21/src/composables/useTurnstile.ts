/**
 * Cloudflare Turnstile 人机验证 composable
 *
 * ✅ 比 hCaptcha 优势（推荐在中国大陆/隐私敏感场景用）：
 * - SDK 极小（约 50KB，hCaptcha 是 200-500KB）
 * - 加载快（Cloudflare CDN 全球，国内访问 ~200ms，hCaptcha 国内 1-3s）
 * - 无 cookie 跟踪（隐私友好，GDPR 合规）
 * - "Invisible" 模式无感（类似 hCaptcha invisible）
 * - 完全免费（Cloudflare 不收费）
 *
 * 启用方式（.env）：
 *   VITE_TURNSTILE_ENABLED=true
 *   VITE_TURNSTILE_SITE_KEY=0x4AAAAAAA...   (从 Cloudflare Dashboard 获取)
 *
 * 流程（与 hCaptcha 一致）：
 * 1. 页面加载 render invisible widget
 * 2. 提交时 execute(widgetId) 触发验证，拿到 token
 * 3. token 随表单提交到后端，后端调 Cloudflare siteverify 校验
 *
 * 后端 verify endpoint（参考）：
 *   POST https://challenges.cloudflare.com/turnstile/v0/siteverify
 *   body: { secret, response: <token> }
 *
 * @author yijiu2025
 * @since 2026-08-29
 */

interface TurnstileInstance {
  widgetId: string | null;
  container: HTMLDivElement | null;
  sdkLoaded: boolean;
}

function getSiteKey(): string {
  const meta = document.querySelector('meta[name="turnstile-site-key"]')?.getAttribute('content');
  if (meta) return meta;
  return import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
}

const isEnabled = import.meta.env.VITE_TURNSTILE_ENABLED === 'true';

function createInstance(): TurnstileInstance {
  return { widgetId: null, container: null, sdkLoaded: false };
}

/** 加载 Turnstile SDK（一次性，15s 超时兜底） */
async function loadSdk(): Promise<any> {
  if ((window as any).turnstile) return (window as any).turnstile;

  return new Promise((resolve) => {
    const LOAD_TIMEOUT_MS = 15_000;
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ok && (window as any).turnstile) {
        resolve((window as any).turnstile);
      } else {
        resolve(null);
      }
    };

    (window as any).turnstileOnLoad = () => done(true);
    (window as any).onloadTurnstileCallback = () => done(true);

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=turnstileOnLoad';
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      console.warn('[Turnstile] SDK 加载失败（网络/CSP）');
      done(false);
    };
    document.head.appendChild(script);

    const timer = setTimeout(() => {
      console.warn('[Turnstile] SDK 加载超时');
      done(false);
    }, LOAD_TIMEOUT_MS);
  });
}

/** render invisible widget */
function ensureWidget(ts: any, inst: TurnstileInstance, siteKey: string, action: string): string {
  if (inst.widgetId !== null) return inst.widgetId;
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
  inst.widgetId = ts.render(inst.container, {
    sitekey: siteKey,
    size: 'invisible',
    action,
    callback: (_token: string) => { /* token 在 getToken 时通过 promise resolve */ },
    'error-callback': () => { /* 错误处理在 promise 端 */ }
  });
  return inst.widgetId!;  // 上面已 guard 不为 null
}

/** 清理实例：移除 container DOM + 重置状态 */
function cleanup(inst: TurnstileInstance) {
  if (inst.container && inst.container.parentNode) {
    inst.container.parentNode.removeChild(inst.container);
  }
  inst.container = null;
  inst.widgetId = null;
  inst.sdkLoaded = false;
}

/**
 * 创建 Cloudflare Turnstile 人机验证实例（每组件独立）
 * @param action Turnstile action 标识（如 'register'/'login'，用于后台分析区分）
 */
export function useTurnstile(action = 'login') {
  const inst = createInstance();
  let resolveExecute: ((token: string | null) => void) | null = null;

  /** 预加载 SDK + render widget（页面加载时调，提前 warm up） */
  async function loadTurnstile(): Promise<void> {
    if (!isEnabled) return;
    const siteKey = getSiteKey();
    if (!siteKey) {
      console.warn('[Turnstile] siteKey 未配置，跳过人机验证');
      return;
    }
    const ts = await loadSdk();
    if (ts) ensureWidget(ts, inst, siteKey, action);
  }

  /**
   * 获取 Turnstile token（提交前调，触发 invisible 验证）
   * 60s 超时兜底：用户不操作时避免 Promise 永久 pending
   * 失败/超时返回 null：调用方据此决定是否继续
   */
  async function getTurnstileToken(): Promise<string | null> {
    if (!isEnabled) return null;
    const ts = await loadSdk();
    if (!ts) return null;
    const id = ensureWidget(ts, inst, getSiteKey(), action);

    const TIMEOUT_MS = 60_000;
    return new Promise<string | null>((resolve) => {
      let settled = false;
      resolveExecute = (token) => {
        if (settled) return;
        settled = true;
        resolve(token);
      };
      const timer = setTimeout(() => {
        if (resolveExecute) resolveExecute(null);
        resolveExecute = null;
      }, TIMEOUT_MS);

      try {
        // Turnstile 重新 render 一个新 widget 拿 token（旧 token 一次性）
        ts.reset(id);
        ts.execute(id, {
          callback: (token: string) => {
            if (resolveExecute) resolveExecute(token);
            resolveExecute = null;
            clearTimeout(timer);
          },
          'error-callback': () => {
            if (resolveExecute) resolveExecute(null);
            resolveExecute = null;
            clearTimeout(timer);
          }
        });
      } catch (e) {
        console.warn('[Turnstile] execute 失败', e);
        if (resolveExecute) resolveExecute(null);
        resolveExecute = null;
        clearTimeout(timer);
      }
    });
  }

  /** 组件卸载时调，清理 DOM + 重置实例状态 */
  function dispose() {
    cleanup(inst);
  }

  return { isEnabled, loadTurnstile, getTurnstileToken, dispose };
}
