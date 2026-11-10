/**
 * iframe SSO 登录（复用防火墙 LoginModal 的协议，去掉账号列表）
 *
 * 协议要点（缺一条都会导致「登录成功但进不去」或安全边界被绕过）：
 *   1. **origin + event.source 双校验** —— 只认 SSO 域且必须来自当前 iframe 窗口；
 *   2. `SSO_READY` 才是「iframe 内 Vue 已挂载、监听器就绪」的可靠信号，用它关加载态；
 *      `iframe @load` 只启动兜底超时（3s），防握手丢失导致永久 loading；
 *   3. `LOGIN_SUCCESS` → **先 `adoptDeviceId` 再 `bindSession`**（顺序不可颠倒，
 *      否则登录基准指纹与后续请求不一致，会触发「设备环境变更」风控）；
 *   4. 绑定成功后再 `auth.load(true)` 拉取用户与菜单。
 *
 * === 准入被拒（403）是一等公民 ===
 * 统一认证面向所有注册用户，而后台只对**被授予管理权限**的账号开放（判定发生在
 * `bind-session` 之前，见后端 `app/console/config.js` 的 `access`）。被拒时后端
 * 不写任何 Cookie，这里把文案原样展示，并用 `denied` 区分「没权限」与「临时故障」：
 * 前者给"换账号 / 找管理员"，后者给"重试"。
 *
 * === 登录页的外观由 oauth21 的主题机制决定 ===
 * iframe 里是 oauth21 的 `/mini-login`，它的**版式（主题包）与配色**都按
 * `?th` / `?th_color` 解析（见 `packages/theme-core` 的 `readUrlViewIntent` /
 * `readUrlIntent`）。所以本应用不自己画登录表单；想换外观时不改 oauth21 代码：
 *
 * ```bash
 * # .env.local（下次刷新 iframe 即生效）
 * VITE_SSO_THEME_VIEW=default     # 版式 ≡ 主题包名（oauth21/src/theme/themes/<pkg>）
 * VITE_SSO_THEME_COLOR=black      # 配色 id（themes/<pkg>/mini/login/colors/<id>）
 * ```
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue';
import { adoptDeviceId } from 'stable-deviceid';
import { bindSession } from '@/api/session';
import { ApiError } from '@/api/http';

/** SSO 服务地址（必须浏览器可直达；vite 代理只代理 API，iframe 是整页导航） */
export const SSO_URL = import.meta.env.VITE_SSO_URL || 'http://localhost:5174';

/** 登录页路径（mini 版，尺寸紧凑，适合嵌 854×484 卡片） */
const SSO_LOGIN_PATH = '/mini-login';

/** 只接受 SSO 域的 postMessage */
const SSO_ORIGIN = (() => {
  try {
    return new URL(SSO_URL).origin;
  } catch {
    return '';
  }
})();

/**
 * 构建 SSO 登录 URL
 *
 * 主题参数只在显式配置时才拼上：oauth21 的解析链是「设备专属键 → 通用键 → 包声明」，
 * 传空串等于没传，但传了不认识的值会落兜底并留一条 dev 警告 —— 宁可不传，也别塞默认值。
 *
 * @param nonce 随机数（重建 iframe 时用新值，避免浏览器复用旧页面）
 * @returns 带应用标识、主题参数与随机数的完整地址
 */
export function buildSsoLoginUrl(nonce: string = Math.random().toString()): string {
  const params = new URLSearchParams({
    appName: 'console',
    appEntrance: 'web',
    lang: 'zh_cn',
    styleType: 'horizontal',
    notLoadSsoView: 'false',
    isMobile: 'false',
    rnd: nonce
  });

  const view = import.meta.env.VITE_SSO_THEME_VIEW;
  // 配色优先级：显式配置 > **跟随宿主当前配色**
  //
  // 后半句是两个前端"联调"的关键：宿主切到深色（`?th_color=black` 或用户偏好），
  // iframe 里如果还是白底，就是一个深色页面中间嵌一块白卡 —— 再好看也像没做完。
  // 宿主的生效配色 id 由主题运行期写在 `data-mauth-theme` 上，白/黑两侧同名，
  // 所以这里可以原样透传；其它值（自定义配色）不猜，交给 oauth21 的兜底链。
  const hostColor = document.documentElement.getAttribute('data-mauth-theme');
  const color =
    import.meta.env.VITE_SSO_THEME_COLOR || (hostColor === 'white' || hostColor === 'black' ? hostColor : '');
  if (view) params.set('th', view);
  if (color) params.set('th_color', color);

  return `${SSO_URL}${SSO_LOGIN_PATH}?${params.toString()}`;
}

/**
 * 登录结果
 *
 * @param ok 是否成功
 * @param message 失败原因（成功时为空）
 */
export interface SsoLoginResult {
  ok: boolean;
  message?: string;
}

/**
 * 组合式：iframe 登录
 *
 * @param onSuccess 登录并绑定会话成功后的回调（通常是拉用户信息并跳转）
 * @returns iframe 引用、加载态、消息处理、iframe load 回调与重载入口
 */
export function useSsoLogin(onSuccess: () => Promise<void> | void) {
  const iframeRef: Ref<HTMLIFrameElement | null> = ref(null);
  const loading = ref(true);
  const errorMessage = ref('');
  const busy = ref(false);
  /** 失败是否属于「没有权限」（403）—— 决定文案语气与可做什么，而不是笼统的"登录失败" */
  const denied = ref(false);
  /**
   * iframe 的 `src`
   *
   * 做成 ref 而不是常量：重载要换一个 `rnd`，否则浏览器可能直接复用旧页面
   * （oauth21 那边还带着上一次的错误提示，用户会以为"点了没反应"）。
   *
   * 🔴 初值 `about:blank`、真正地址在 `onMounted` 里算：`buildSsoLoginUrl` 要读
   *    宿主当前配色（`data-mauth-theme`），而该属性由主题运行期在挂载时才写上 ——
   *    setup 阶段读只会拿到 null，"跟随宿主配色"就静默失效（实测 iframe URL 里
   *    没有 `th_color`）。`about:blank` 不产生网络请求，也不会让 iframe 缺位
   *    （`bindIframe` 需要元素先存在）。
   */
  const loginUrl = ref('about:blank');
  let readyTimeout: number | null = null;

  /** iframe HTML 加载完成：启动兜底超时（等 SSO_READY） */
  function onIframeLoad(): void {
    if (readyTimeout) window.clearTimeout(readyTimeout);
    readyTimeout = window.setTimeout(() => {
      // 握手丢失时不能让用户永远看转圈：兜底关掉加载态，用户仍可操作 iframe
      loading.value = false;
    }, 3000);
  }

  /**
   * 重建 iframe（换账号 / 临时故障后重试）
   *
   * 同时清掉错误态：否则重载后旧的红字还在，用户无从判断这次到底有没有重新尝试。
   */
  function reload(): void {
    errorMessage.value = '';
    denied.value = false;
    loading.value = true;
    loginUrl.value = buildSsoLoginUrl(String(Date.now()));
  }

  /**
   * 处理 iframe 消息
   *
   * @param event postMessage 事件
   */
  async function handleMessage(event: MessageEvent): Promise<void> {
    if (event.origin !== SSO_ORIGIN) return;
    if (!iframeRef.value || event.source !== iframeRef.value.contentWindow) return;

    const data = event.data as { type?: string; sessionToken?: string; token?: string; deviceId?: string };
    if (!data || typeof data !== 'object') return;

    if (data.type === 'SSO_READY') {
      if (readyTimeout) {
        window.clearTimeout(readyTimeout);
        readyTimeout = null;
      }
      loading.value = false;
      return;
    }

    if (data.type === 'MAX_SESSIONS') {
      errorMessage.value = '登录设备数已达上限，请先在其它设备退出。';
      return;
    }

    if (data.type !== 'LOGIN_SUCCESS') return;

    busy.value = true;
    errorMessage.value = '';
    denied.value = false;
    try {
      // 1. 设备身份归一（必须在绑定会话之前）
      if (data.deviceId) adoptDeviceId(data.deviceId);

      // 2. 用临时 session_token 换 Cookie（准入判定就在这一步的服务端）
      const sessionToken = data.sessionToken || data.token;
      if (!sessionToken) throw new Error('登录响应缺少会话凭证');
      await bindSession(sessionToken);

      // 3. 拉取用户与菜单，交由调用方跳转
      await onSuccess();
    } catch (err) {
      // 403 = 该账号通过认证但没有后台权限（后端在开会话之前就拒了）
      denied.value = err instanceof ApiError && err.status === 403;
      errorMessage.value = err instanceof Error ? err.message : '登录失败，请重试';
    } finally {
      busy.value = false;
    }
  }

  onMounted(() => {
    window.addEventListener('message', handleMessage);
    // 主题属性已就位，此时算出的地址才带得上宿主的配色
    loginUrl.value = buildSsoLoginUrl();
  });
  onUnmounted(() => {
    window.removeEventListener('message', handleMessage);
    if (readyTimeout) window.clearTimeout(readyTimeout);
  });

  return {
    iframeRef,
    loading,
    busy,
    errorMessage,
    denied: computed(() => denied.value),
    loginUrl,
    reload,
    onIframeLoad
  };
}
