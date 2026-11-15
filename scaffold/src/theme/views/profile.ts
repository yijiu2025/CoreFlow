/**
 * 个人设置页面域声明（page: profile）+ 「版式契约」
 *
 * 与 oauth21 的 `views/login.ts` 同一机制：`defineThemePage({ page })` 一次声明，
 * 即把本页注册进页面域（`<ThemeView>` 的 `page` 依赖）。
 *
 * 这一页只管**个人资料**（昵称 / 头像 / 登录设备）。外观那三档（背景 / 颜色 / 版式）
 * 收在独立页面 `views/settings/Theme.vue`，这里只留一个入口 —— 三档各有长列表，
 * 平铺在这里会把整页顶得非常长。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import type { ComputedRef, Ref } from 'vue';
import { defineThemePage } from 'skinsuite/vue';
import type { MyDeviceRow } from '@/api/types';

/** 个人设置版式上下文（版式只读它） */
export interface ProfileViewContext {
  /** 顶栏 / 头像兜底用的账号名 */
  userName: string;
  /** 昵称（自动保存） */
  nickname: Ref<string>;
  avatar: Ref<string>;
  /** 头像地址失效（裂图 → 走首字母兜底） */
  avatarBroken: Ref<boolean>;
  profileState: Ref<'idle' | 'saving' | 'saved' | 'error'>;
  profileError: Ref<string>;
  /** 隐藏的文件选择框（点「更换头像」时由版式触发 click） */
  fileInput: Ref<HTMLInputElement | null>;
  uploading: Ref<boolean>;
  avatarError: Ref<string>;
  /** 登录设备 */
  devices: Ref<MyDeviceRow[]>;
  devicesLoading: Ref<boolean>;
  devicesError: Ref<string>;
  deviceNotice: Ref<string>;
  /** 正在踢的设备 id */
  kicking: Ref<number | null>;
  kickingAll: Ref<boolean>;
  showRevoked: Ref<boolean>;
  pruning: Ref<boolean>;
  activeDevices: ComputedRef<MyDeviceRow[]>;
  revokedDevices: ComputedRef<MyDeviceRow[]>;
  visibleDevices: ComputedRef<MyDeviceRow[]>;
  onPickAvatar: (event: Event) => Promise<void>;
  clearAvatar: () => Promise<void>;
  isRevoked: (row: MyDeviceRow) => boolean;
  deviceKind: (row: MyDeviceRow) => string;
  uaSummary: (ua: string | null) => string;
  when: (iso: string | null) => string;
  kickDevice: (row: MyDeviceRow) => Promise<void>;
  kickOthers: () => Promise<void>;
  pruneRevoked: () => Promise<void>;
}

/** 页面域声明（`<ThemeView page="profile">` 依赖它） */
defineThemePage({ page: 'profile' });
