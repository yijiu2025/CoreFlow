/**
 * 安全 postMessage 到父窗口（oauth21 iframe → 父应用）
 *
 * 防止 oauth21 iframe 被恶意页面嵌入后 postMessage('*') 泄露 sessionToken：
 * 父 origin 必须在白名单内（ancestorOrigins 不可被父页面伪造），否则拒绝发送。
 */

/** 受信父应用 origin 白名单（env 配置，逗号分隔；开发默认本地端口） */
const ALLOWED_PARENT_ORIGINS = (
  (import.meta as any).env?.VITE_ALLOWED_PARENT_ORIGINS || 'http://aaa.localhost:5176,http://localhost:5175'
).split(',');

/**
 * 取 iframe 父窗口 origin（ancestorOrigins 不可被父页面伪造，优先；fallback referrer）
 * @returns 父 origin 或 null
 */
function getParentOrigin(): string | null {
  try {
    const ancestors = (window.location as any).ancestorOrigins;
    if (ancestors && ancestors.length) return ancestors[0];
    if (document.referrer) return new URL(document.referrer).origin;
  } catch {
    // ignore
  }
  return null;
}

/**
 * 安全 postMessage 到父窗口：父 origin 必须在白名单内，否则拒绝（防恶意嵌入窃 sessionToken）
 * @param payload 消息体
 */
export function postToParent(payload: any): void {
  if (!(window.parent && window.parent !== window)) return;
  const origin = getParentOrigin();
  if (!origin || !ALLOWED_PARENT_ORIGINS.includes(origin)) {
    console.warn('[SSO] 拒绝 postMessage：父 origin 未授权', origin);
    return;
  }
  window.parent.postMessage(payload, origin);
}
