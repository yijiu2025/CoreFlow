/**
 * iframe 嵌入方（父应用）origin 白名单 —— **单一来源**
 *
 * 为什么单独抽出来：这份白名单原先在 `utils/parent.ts`（发消息）与
 * `composables/useParentThemeSync.ts`（收消息）里**各抄了一份**，两处的 fallback 默认值
 * 也会各写各的 —— 一旦漂移，就会出现"发得出去、收不回来"或反之的诡异现象。
 * 收敛到一处后，改白名单只需改这里 + 各 `.env` 的 `VITE_ALLOWED_PARENT_ORIGINS`。
 *
 * 语义：oauth21 被别的 app 用 iframe 嵌进弹窗时，只认这些父 origin ——
 *   • 发：`postToParent` 只往命中白名单的父窗口 postMessage（防泄漏 sessionToken）
 *   • 收：`useParentThemeSync` 只接受命中白名单的父窗口发来的主题消息（防伪造）
 *
 * 🔴 **漏配的症状**：宿主弹窗「正在加载安全登录」要等满宿主的 3s 兜底超时 ——
 * 因为 `SSO_READY` 被拒发、宿主收不到握手；控制台会出现
 * `[SSO] 拒绝 postMessage：父 origin 未授权 <origin>`。排查时先看这一行。
 *
 * ⚠️ 只写「嵌 oauth21 的父应用」的 origin，**别把 oauth21 自己的端口（5174 / 5175）写进来**
 * —— 它是被嵌方，不是父应用。
 *
 * @author yijiu2025
 * @since 2026-09-24
 */

/** 开发兜底：本地宿主常用 origin（仅当 env 未配置时生效，生产必须显式配置） */
const DEV_FALLBACK = 'http://localhost:5176,http://127.0.0.1:5176';

/**
 * 受信父应用 origin 列表（来自 `VITE_ALLOWED_PARENT_ORIGINS`，逗号分隔）
 *
 * 自动 trim 并丢弃空项 —— 手写 env 时常见的 `a, b` 带空格会让 `includes()` 恒不命中。
 */
const ALLOWED_PARENT_ORIGINS: readonly string[] = (
  (import.meta as { env?: Record<string, string> }).env?.VITE_ALLOWED_PARENT_ORIGINS || DEV_FALLBACK
)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

/**
 * 给定 origin 是否为受信父应用
 *
 * 写成类型谓词（`origin is string`）而不是返回 `boolean`：调用方拿到 true 之后
 * 往往紧接着要把它当 `string` 用（如 `postMessage(payload, origin)`），
 * 用谓词可以把 `null` 在这一步收窄掉，省掉调用点的 `!` 断言或二次判空。
 */
function isAllowedParentOrigin(origin: string | null | undefined): origin is string {
  return !!origin && ALLOWED_PARENT_ORIGINS.includes(origin);
}

/**
 * 取 iframe 父窗口 origin
 *
 * `ancestorOrigins` 不可被父页面伪造，优先；退化用 `document.referrer`。
 * @returns 父 origin 或 null
 */
function getParentOrigin(): string | null {
  try {
    const ancestors = (window.location as unknown as { ancestorOrigins?: string[] }).ancestorOrigins;
    if (ancestors && ancestors.length) return ancestors[0];
    if (document.referrer) return new URL(document.referrer).origin;
  } catch {
    // ignore：无 window / 受限环境，按"无父 origin"处理
  }
  return null;
}

export { ALLOWED_PARENT_ORIGINS, isAllowedParentOrigin, getParentOrigin };
