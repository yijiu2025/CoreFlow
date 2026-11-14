/**
 * 界面风格（主题包）切换 —— 一个 composable 收口三件事
 *
 *   1. **写意图**：`themeStore.setDeviceView(设备, 包名)`（view ≡ pkg）。
 *      两个设备都写：同一份配置在手机与桌面上都该稳定，不能"拉宽窗口就换回来"。
 *   2. **落本地**：URL 里的 `?th=` 只活这一次会话，用户点完再刷新就丢了。
 *      偏好写 localStorage，启动时由 `restoreThemePackage()` 恢复 ——
 *      放在启动期而不是组件挂载期，是为了首帧就是对的（否则会先闪一下珍珠壳）。
 *   3. **主色联动**：主题包的主色写在 token 里，而用户的主色偏好是更后写入的
 *      inline 变量（见 `stores/accent.ts` 文件头）—— 不联动的话，选了「微信」
 *      进来还是蓝色。选包时顺手切到配套色，切回默认时再把临时换上的色换回去。
 *
 * 🔴 恢复必须让位给 URL：`?th=` / `?th_mobile=` / `?th_std=` 是"这次就要看这个"，
 *    本地偏好不该把它盖掉（`deviceView` 的优先级高于通用 `th`）。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { computed } from 'vue';
import { useAccentStore } from '@/stores/accent';
import { useThemeStore } from '@/stores/theme';
import { PACKAGE_STORAGE_KEY, THEME_PACKAGES } from '@/theme/packages';

/** 两个设备都写：否则换屏宽就掉回默认壳，看起来像"设置没保存" */
const DEVICES = ['mobile', 'standard'] as const;

/** URL 上是否显式带了版式参数（`th` 或 `th_<设备>`） */
function hasViewParam(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    for (const key of params.keys()) {
      if (key === 'th' || key.startsWith('th_')) return true;
    }
  } catch {
    // 取不到就当没有：此时宁可恢复本地偏好，也不让用户看到默认壳
  }
  return false;
}

/**
 * 启动期恢复界面风格
 *
 * 只在没有 URL 版式参数时生效；未保存过或保存的是默认包则什么都不做
 * （默认包是兜底值，写进去等于给两个设备各加一条"显式锁定"）。
 */
export function restoreThemePackage(): void {
  if (hasViewParam()) return;
  let saved = '';
  try {
    saved = localStorage.getItem(PACKAGE_STORAGE_KEY) ?? '';
  } catch {
    return;
  }
  if (!saved || saved === 'default') return;
  if (!THEME_PACKAGES.some(item => item.id === saved)) return;
  const themeStore = useThemeStore();
  for (const device of DEVICES) themeStore.setDeviceView(device, saved);
}

/**
 * 本地是否"明确选过"主题色
 *
 * `mauth:accent` 只有用户点过色卡（或服务端偏好落到本地）才会存在；没有这个键
 * 说明一直是默认值 —— 那种情况下主题包可以替用户做主色。
 */
function hasExplicitAccent(): boolean {
  try {
    return localStorage.getItem('mauth:accent') !== null;
  } catch {
    // 读不到就当作"选过"：宁可少联动，也不要覆盖用户的偏好
    return true;
  }
}

/**
 * 让主色跟上当前主题包（用户没表达过主色偏好时才动）
 *
 * 为什么不在 `pick()` 里做：`?th=wechat` 深链、或上次会话留在微信包时不会经过
 * `pick()`，但那时用户同样期待"微信就是绿的"。放在根组件的主题 watch 里，
 * 换包 / 刷新 / URL 直进三条路都覆盖。
 */
export function alignAccentToPackage(): void {
  const themeStore = useThemeStore();
  const option = THEME_PACKAGES.find(item => item.id === themeStore.packageId);
  if (!option?.accent) return;
  const accentStore = useAccentStore();
  if (accentStore.currentId === option.accent) return;
  if (hasExplicitAccent()) return;
  accentStore.adopt(option.accent);
}

/**
 * 界面风格选择器（设置页 / 「我」页用）
 *
 * @returns 可选清单、当前生效的包 id、以及切换方法
 */
export function useThemePackage() {
  const themeStore = useThemeStore();
  const accentStore = useAccentStore();

  /** 当前生效的包（换包后立刻更新，选择器无需自己轮询） */
  const current = computed(() => themeStore.packageId);

  /**
   * 切换界面风格
   *
   * @param id 包 id（未知值忽略，不写脏数据）
   */
  function pick(id: string): void {
    const option = THEME_PACKAGES.find(item => item.id === id);
    if (!option) return;
    for (const device of DEVICES) themeStore.setDeviceView(device, option.id);
    try {
      localStorage.setItem(PACKAGE_STORAGE_KEY, option.id);
    } catch {
      // 隐私模式下存不上：本次会话仍然生效，不阻塞
    }
    if (option.accent) accentStore.pick(option.accent);
    // 切回"没指定主色"的包时，把联动时临时换上的绿换回默认色 —— 否则回到珍珠玻璃
    // 会是满屏绿，而用户从未主动选过绿色
    else if (accentStore.currentId === 'wechat') accentStore.pick('ocean');
  }

  return { packages: THEME_PACKAGES, current, pick };
}
