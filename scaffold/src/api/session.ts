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
import type { CurrentUser, MenuNode, MyDeviceRow } from './types';

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

/**
 * 保存个人偏好（主题色等）
 *
 * 自动保存用：合并语义，只传变化的键，不会覆盖其它偏好。
 */
export function savePreferences(payload: { accent?: string }): Promise<{ accent?: string }> {
  return put<{ accent?: string }>('/admin/console/v1/session/preferences', payload);
}

/**
 * 保存后台内的展示身份（昵称 / 头像）
 *
 * 只影响 console，不动全局 `user_user.username / avatar`。
 * 传空串表示清除该字段（回落到全局值）。
 */
export function saveProfile(payload: {
  nickname?: string;
  avatar?: string;
}): Promise<{ nickname: string; avatar: string }> {
  return put<{ nickname: string; avatar: string }>('/admin/console/v1/session/profile', payload);
}

/**
 * 上传头像（multipart）
 *
 * 直接发 FormData：不手写 Content-Type，交给浏览器带 boundary —— 手写会把 boundary
 * 写死，服务端解析必失败。
 *
 * @param file 图片文件（JPG / PNG / WebP，≤2MB）
 * @returns 可访问的头像 URL
 */
export function uploadAvatar(file: File): Promise<{ avatar: string }> {
  const form = new FormData();
  form.append('file', file);
  return post<{ avatar: string }>('/admin/console/v1/session/avatar', form);
}

/** 退出登录（清 Cookie） */
export function logout(): Promise<null> {
  return post<null>('/admin/console/v1/session/logout');
}

/* ── 我的登录设备（自服务） ───────────────────────────────────
 *
 * 与用户管理里的设备页不是同一组接口：这里只能碰**自己**的设备，不需要
 * `admin:user:*` 权限；踢下线按设备行 id 走（列表里的设备码是打码值，不能用来匹配）。
 */

/** 我的登录设备（含已失效的历史行） */
export function myDevices(): Promise<{ devices: MyDeviceRow[]; total: number }> {
  return get('/user/v1/sessions/devices');
}

/**
 * 踢掉我的某一台设备
 *
 * @param id 设备行 id（`myDevices()` 返回的 `id`）
 * @returns `current` 为 true 表示踢的就是当前设备，会话已失效、需要重新登录
 */
export function kickMyDevice(
  id: number
): Promise<{ kicked: number; revoked: number; clearedRefresh: number; current: boolean }> {
  return post('/user/v1/sessions/kick-device', { id });
}

/** 退出其他所有设备（保留当前会话） */
export function kickOtherDevices(): Promise<{ kicked: number }> {
  return post('/user/v1/sessions/kick-all');
}

/**
 * 清理我的「已下线」设备记录
 *
 * 只删 `revoked = 1` 的历史行，不影响任何在线会话（后端按 userId 强制限定，
 * 不接受前端传用户 ID）。
 *
 * @returns 实际删除的记录数
 */
export function pruneMyRevokedDevices(): Promise<{ removed: number }> {
  return post('/user/v1/sessions/prune-revoked');
}

/**
 * 用临时 session_token 换取 sid/sid_r Cookie
 *
 * 🔴 请求体字段是 **snake_case 的 `session_token`**，不是 `sessionToken`：
 *    后端 `api/auth/v1/session.js` 里直接 `const { session_token } = request.body`，
 *    传 camelCase 会得到 400「缺少 session_token」——而此时网络面板里
 *    oauth21 明明已经下发了 session_token，很容易误判成"凭证没拿到"。
 *    firewall 的 `bindSession` 也是 snake_case，两边必须一致。
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
  return post('/auth/v1/bind-session', { session_token: sessionToken });
}
