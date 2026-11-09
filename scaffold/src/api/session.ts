/**
 * 会话与登录相关接口
 *
 * 登录不在这里：走 oauth21 `/mini-login` iframe（见 `composables/useSsoLogin`），
 * 拿到 `sessionToken` 后调 `/auth/v1/bind-session` 换 Cookie，再取 `/session/me`。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { get, post, put } from './http';
import type { CurrentUser, MenuNode } from './types';

/** 当前用户信息（含角色与扁平权限码） */
export function fetchMe(): Promise<CurrentUser> {
  return get<CurrentUser>('/admin/console/v1/session/me');
}

/** 当前用户可见菜单树 */
export function fetchRoutes(): Promise<MenuNode[]> {
  return get<MenuNode[]>('/admin/console/v1/session/routes');
}

/**
 * 修改本人密码
 *
 * @param oldPassword 原密码
 * @param newPassword 新密码
 */
export function changePassword(oldPassword: string, newPassword: string): Promise<null> {
  return put<null>('/admin/console/v1/session/password', { oldPassword, newPassword });
}

/** 退出登录（清 Cookie） */
export function logout(): Promise<null> {
  return post<null>('/admin/console/v1/session/logout');
}

/**
 * 用临时 session_token 换取 sid/sid_r Cookie
 *
 * 🔴 调用前必须先 `adoptDeviceId(deviceId)`：绑定请求即携带统一设备 ID，
 *    登录基准指纹与后续请求一致，否则会触发「设备环境变更」风控。
 *
 * @param sessionToken oauth21 postMessage 下发的临时凭证
 * @returns 绑定结果（含 accountKey / rememberMe / user）
 */
export function bindSession(sessionToken: string): Promise<{
  accountKey?: string;
  rememberMe?: boolean;
  user?: Partial<CurrentUser>;
}> {
  return post('/auth/v1/bind-session', { sessionToken });
}
