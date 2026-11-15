/**
 * 界面风格（主题包）切换 —— 一个 composable 收口三件事
 *
 *   1. **写意图**：`themeStore.setDeviceView(设备, 包名)`（view ≡ pkg）。两个设备都写：
 *      同一份配置在手机与桌面上都该稳定，不能"拉宽窗口就换回来"。
 *   2. **落盘**：由 skinsuite 1.3.0 负责（`mauth:view`）。此前这里手写
 *      `localStorage['mauth:package']`，与库内的 mode/theme 两套键各管一段，
 *      启动时还得自己 `restoreThemePackage()` 追一遍 —— 现在统一成一份，
 *      启动恢复也不必再写（`createThemeState` 会读回来）。
 *   3. **主色联动**：主题包的主色写在 token 里，而用户的主色偏好是更后写入的
 *      inline 变量（见 `stores/accent.ts` 文件头）—— 不联动的话，选了「口袋版」
 *      进来还是蓝色。选包时顺手切到配套色，切回默认时再把临时换上的绿换回去。
 *
 * 🔴 包清单**不再手抄**：`listPackages()` 读的是各包 `index.ts` 的 `export default`
 *    （显示名 / 描述 / 配套主色都在包自己身上）。以前宿主另有一份 `theme/packages.ts`，
 *    加包忘了同步 = 面板里看不到 —— 两份真相必然漂移。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { computed } from 'vue';
import { listPackages } from 'skinsuite';
import { useAccentStore } from '@/stores/accent';
import { useThemeStore } from '@/stores/theme';
import { useRenderDevice } from '@/views/device/useRenderDevice';

/**
 * 只写**当前设备**
 *
 * 早期"两个设备都写"是为了避免"拉宽窗口就换回来"。但那样桌面与手机只能同步，
 * 而用户明确要的是"桌面一套、手机另一套"。现在按设备落盘（`mauth:view:<设备>`），
 * 在哪个设备上选就只改那个设备；换屏宽读到的是那台设备自己的偏好。
 */
const CURRENT_DEVICE = () => useRenderDevice().value;

/** 一个可选的界面风格（视图层拿到的形状） */
export interface ThemePackageOption {
  /** 包 id（= `themes/<包>/` 目录名） */
  id: string;
  /** 显示名（包定义 `meta.name`） */
  name: string;
  /** 一句话说明（说清"换了什么"，而不是形容词） */
  description: string;
  /** 选中时联动的主色预设 id（包定义里的 `accent`） */
  accent?: string;
}

/**
 * 可选的界面风格（直接来自注册表，加包即生效）
 *
 * @returns 包清单（按包名排序）
 */
export function themePackageOptions(): ThemePackageOption[] {
  return listPackages().map(def => ({
    id: def.meta.id,
    name: def.meta.name,
    description: def.meta.description ?? '',
    accent: def.accent
  }));
}

/**
 * 采纳 URL 里显式写下的版式 / 配色 —— **已废弃，保留空实现**
 *
 * 曾经把 `?th=` / `?th_color=` 直接写成本地偏好，想法是"深链即偏好"。
 * 实测这个策略是错的：登录页的一个 `?th=pearl` 链接会把**全站**（含主内容、另一台设备）
 * 的版式一起改掉 —— 用户只是想看登录页某种样子，回去却发现后台换了版式。
 *
 * 现在的分工：
 *   · **URL 参数 = 本次预览**：只影响当前这次会话的这个页面，不落盘，切路由即失效；
 *   · **设置页 = 记住**：`setDeviceView` / `setTheme` 才写本地 + 服务端。
 *
 * 保留函数是为了让 `bootstrap` 的调用点不用改（它现在什么都不做）。
 *
 * @returns 无
 */
export function adoptUrlThemeIntents(): void {
  // 有意留空，见上面注释
}

/**
 * 本地是否"明确选过"主题色
 *
 * `mauth:accent` 只有用户点过色卡（或服务端偏好落到本地）才会存在；没有这个键
 * 说明一直是默认值 —— 那种情况下主题包可以替用户做主色。
 *
 * @returns 是否已有显式偏好
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
 * 为什么不在 `pick()` 里做：`?th=pocket` 深链、或上次会话留在口袋版时不会经过
 * `pick()`，但那时用户同样期待"口袋版就是绿的"。放在根组件的主题 watch 里，
 * 换包 / 刷新 / URL 直进三条路都覆盖。
 *
 * @returns 无
 */
export function alignAccentToPackage(): void {
  const themeStore = useThemeStore();
  const option = themePackageOptions().find(item => item.id === themeStore.packageId);
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
    const option = themePackageOptions().find(item => item.id === id);
    if (!option) return;
    // 落盘在 store 的写入口里（`mauth:view:<设备>`），这里不手写 localStorage
    themeStore.setDeviceView(CURRENT_DEVICE(), option.id);
    if (option.accent) accentStore.pick(option.accent);
    // 切回"没指定主色"的包时，把联动时临时换上的绿换回默认色 —— 否则回到珍珠玻璃
    // 会是满屏绿，而用户从未主动选过绿色
    else if (accentStore.currentId === 'wechat') accentStore.pick('ocean');
  }

  return { packages: themePackageOptions(), current, pick };
}
