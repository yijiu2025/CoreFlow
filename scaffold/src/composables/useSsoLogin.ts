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
 * @author yijiu2025
 * @since 2026-11-09
 */
import { onMounted, onUnmounted, ref, type Ref } from 'vue';
import { adoptDeviceId } from 'stable-deviceid';
import { bindSession } from '@/api/session';

/** SSO 服务地址（必须浏览器可直达；vite 代理只代理 API，iframe 是整页导航） */
export const SSO_URL = import.meta.env.VITE_SSO_URL || 'http://localhost:5174';

/** 登录页路径（mini 版，尺寸紧凑，适合嵌 856×484 卡片） */
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
 * @returns 带应用标识与随机数的完整地址
 */
export function buildSsoLoginUrl(): string {
  const params = new URLSearchParams({
    appName: 'console',
    appEntrance: 'web',
    lang: 'zh_cn',
    styleType: 'horizontal',
    notLoadSsoView: 'false',
    isMobile: 'false',
    rnd: Math.random().toString()
  });
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
 * @returns iframe 引用、加载态、消息处理与 iframe load 回调
 */
export function useSsoLogin(onSuccess: () => Promise<void> | void) {
  const iframeRef: Ref<HTMLIFrameElement | null> = ref(null);
  const loading = ref(true);
  const errorMessage = ref('');
  const busy = ref(false);
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
    try {
      // 1. 设备身份归一（必须在绑定会话之前）
      if (data.deviceId) adoptDeviceId(data.deviceId);

      // 2. 用临时 session_token 换 Cookie
      const sessionToken = data.sessionToken || data.token;
      if (!sessionToken) throw new Error('登录响应缺少会话凭证');
      await bindSession(sessionToken);

      // 3. 拉取用户与菜单，交由调用方跳转
      await onSuccess();
    } catch (err) {
      errorMessage.value = err instanceof Error ? err.message : '登录失败，请重试';
    } finally {
      busy.value = false;
    }
  }

  onMounted(() => window.addEventListener('message', handleMessage));
  onUnmounted(() => {
    window.removeEventListener('message', handleMessage);
    if (readyTimeout) window.clearTimeout(readyTimeout);
  });

  return { iframeRef, loading, errorMessage, busy, loginUrl: buildSsoLoginUrl(), onIframeLoad };
}
