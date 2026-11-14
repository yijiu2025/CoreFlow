/**
 * 个人设置页面域声明（page: profile）+ 「版式契约」
 *
 * 与 oauth21 的 `views/login.ts` 同一机制：`defineThemePage({ page })` 一次声明，
 * 即把本页注册进页面域（`<ThemeView>` 的 `page` 依赖）。
 *
 * 这一页有三块「偏好」：昵称/头像、界面风格（主题包）、主色（accent）。三块的**状态与落库**
 * 都在容器里（`views/settings/Profile.vue` + 两个 store），版式只把卡片画出来。
 *
 * 🔴 契约把 store 收窄成结构视图（`AccentView` / `StyleView`）：版式看得见的只有
 *    「有哪些预设、当前是哪个、点了调谁」，看不到 store 的实现细节。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import type { ComputedRef, Ref } from 'vue';
import { defineThemePage } from 'skinsuite/vue';
import type { MyDeviceRow } from '@/api/types';

/** 主色预设（收窄视图：只要画卡片需要的字段） */
export interface AccentPresetView {
  id: string;
  name: string;
  primary: string;
  hover: string;
  soft: string;
  focus: string;
  tint: string;
}

/** 主色保存状态 */
export type AccentSaveState = 'idle' | 'saving' | 'saved' | 'error';

/** 主色切换（容器给的是 store 实例，结构上满足本视图） */
export interface AccentView {
  presets: AccentPresetView[];
  currentId: string;
  saveState: AccentSaveState;
  errorMessage: string;
  pick: (id: string) => void;
}

/** 界面风格（主题包）选项 */
export interface StylePackageView {
  id: string;
  name: string;
  /** 卡片上的说明（这套包长什么样） */
  description?: string;
}

/** 界面风格切换 */
export interface StyleView {
  packages: StylePackageView[];
  current: string;
  pick: (id: string) => void;
}

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
  /** 界面风格 / 主色 */
  styles: StyleView;
  accent: AccentView;
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
