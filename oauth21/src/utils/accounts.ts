/**
 * 本机已登录账号（抖音式多账号免密切换）
 *
 * - readAccounts：从 accounts cookie 读展示列表（非 HttpOnly，后端登录成功时下发）
 * - switchAccount：调 /auth/v1/switch-account，成功返回 {user, session_token}，
 *   需密码返回 {action:'need_password', uid, username?, avatar?}
 * - removeSavedAccount：从本机清单移除某账号
 *
 * 真正的免切凭据是 device_id cookie + 后端注册表，accounts cookie 仅展示。
 */
import request from '@/utils/request';

export interface SavedAccount {
  uid: string;
  name: string;
  avatar?: string;
}

export interface SwitchResult {
  /** 'need_password' 表示需回退密码登录；undefined 表示切换成功 */
  action?: 'need_password';
  uid?: string;
  username?: string;
  avatar?: string;
  user?: { id: number | string; uid: string; username: string; name?: string; email?: string; avatar?: string };
  session_token?: string;
}

/** 从 accounts cookie 读取本机已登录账号列表 */
export function readAccounts(): SavedAccount[] {
  if (typeof document === 'undefined') return [];
  const m = document.cookie.match(/(^| )accounts=([^;]*)(;|$)/);
  if (!m) return [];
  try {
    const list = JSON.parse(decodeURIComponent(m[2]));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** 免密切换账号；成功返回 {user, session_token}，需密码返回 {action:'need_password',...} */
export async function switchAccount(uid: string): Promise<SwitchResult> {
  return request.post('/auth/v1/switch-account', { uid });
}

/** 从本机清单移除某账号 */
export async function removeSavedAccount(uid: string): Promise<any> {
  return request.delete(`/auth/v1/saved-accounts/${encodeURIComponent(uid)}`);
}
