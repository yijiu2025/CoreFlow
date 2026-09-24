/**
 * 安全 postMessage 到父窗口（oauth21 iframe → 父应用）
 *
 * 防止 oauth21 iframe 被恶意页面嵌入后 postMessage('*') 泄露 sessionToken：
 * 父 origin 必须在白名单内（ancestorOrigins 不可被父页面伪造），否则拒绝发送。
 *
 * 白名单与"取父 origin"的实现收敛在 `utils/parent-origins.ts`（单一来源，与收消息侧共用）。
 *
 * 🔴 若控制台出现 `[SSO] 拒绝 postMessage：父 origin 未授权 <origin>`，说明宿主弹窗会等满
 *    3s 兜底超时（收不到 SSO_READY 握手）—— 检查 `.env` 的 `VITE_ALLOWED_PARENT_ORIGINS` 是否漏了该 origin。
 *
 * @author yijiu2025
 */
import { getParentOrigin, isAllowedParentOrigin } from './parent-origins';

/**
 * 安全 postMessage 到父窗口：父 origin 必须在白名单内，否则拒绝（防恶意嵌入窃 sessionToken）
 * @param payload 消息体
 */
function postToParent(payload: unknown): void {
  if (!(window.parent && window.parent !== window)) return;
  const origin = getParentOrigin();
  if (!isAllowedParentOrigin(origin)) {
    console.warn('[SSO] 拒绝 postMessage：父 origin 未授权', origin);
    return;
  }
  window.parent.postMessage(payload, origin);
}

export { postToParent };
