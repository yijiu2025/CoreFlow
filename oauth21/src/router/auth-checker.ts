/**
 * 检查用户是否已认证
 * 目前使用简单的 cookie 检查，未来可以替换为 Pinia store
 */
export function isAuthenticated(): boolean {
  // 检查 sid cookie 是否存在
  return document.cookie.includes('sid=');
}

/**
 * 检查用户是否已记住登录（使用 sid_r cookie）
 */
export function isRemembered(): boolean {
  return document.cookie.includes('sid_r=');
}