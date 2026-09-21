/**
 * 重定向目标白名单校验（防开放重定向）
 *
 * 用途：?redirect= 回跳（守卫送登录页后把用户送回原页面）、OAuth 回跳前校验等。
 *
 * 规则：只放行站内相对路径
 * - 必须以 / 开头
 * - 排除 //evil.com（协议相对 URL）与 /\evil.com（浏览器会归一化）
 * - 排除含 :// 的绝对 URL（http://... / javascript:... 等）
 *
 * @author yijiu2025
 * @since 2026-09-20
 */

/** 校验通过返回原路径，不通过返回 null（调用方自行决定兜底目标） */
export function sanitizeLocalRedirect(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
  if (raw.includes('://')) return null;
  return raw;
}
