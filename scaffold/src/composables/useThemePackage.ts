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
import { useRouter } from 'vue-router';
import { listPackages } from 'skinsuite';
import { useAccentStore } from '@/stores/accent';
import { useThemeStore } from '@/stores/theme';
import { DEVICES } from '@/views/device/devices';

/** 包没声明 coverage.devices 时视为覆盖全部设备 */
const ALL_DEVICES = DEVICES.map(item => item.id);

/** 包没声明 coverage.pages 时视为覆盖全部页面 */
const ALL_PAGES = ['console', 'login'];

/**
 * 「主题（版式）」选择器可用的包：在当前设备上**真的能换掉后台壳**
 *
 * 判据两条：设备被覆盖 + 声明了 `console` 页。缺一条就说明选了也没变化（如聚光只有
 * 登录页版式、口袋版只有手机端），列出来只会造成"点了没反应"的困惑。
 *
 * @param device 当前设备 id
 * @returns 可切换的包（顺序同注册表）
 */
export function shellPackageOptions(device: string): ThemePackageOption[] {
  return themePackageOptions().filter(
    item => item.devices.includes(device) && item.pages.includes('console')
  );
}

/**
 * 只写**当前设备**
 *
 * 早期"两个设备都写"是为了避免"拉宽窗口就换回来"。但那样桌面与手机只能同步，
 * 而用户明确要的是"桌面一套、手机另一套"。现在按设备落盘（`mauth:view:<设备>`），
 * 在哪个设备上选就只改那个设备；换屏宽读到的是那台设备自己的偏好。
 */
const CURRENT_DEVICE = (): string => useThemeStore().activeDevice;

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
  /**
   * 这个包覆盖哪些**页面**（包定义里的 `coverage.pages`；缺省 = 全部）
   *
   * 选择器只收「有后台壳版式」的包：`console` 不在其中说明它只做了登录页，
   * 选了也不会改变后台布局 —— 列出来只会让人以为坏了。
   */
  pages: string[];
  /**
   * 这个包覆盖哪些设备（包定义里的 `coverage.devices`；缺省 = 全设备）
   *
   * 选择器按它过滤：口袋版只有手机端版式，在桌面上列出来只会让人点了一下发现没反应。
   */
  devices: string[];
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
    accent: def.accent,
    pages: def.coverage?.pages ?? ALL_PAGES,
    devices: def.coverage?.devices ?? ALL_DEVICES
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
 * 让主色跟上**当前配色**（用户没表达过主色偏好时才动）
 *
 * === 为什么需要这一步 ===
 * 主色是后写的 inline 变量，优先级高于配色层。而 `readAccentId()` 在"没设置过"时
 * 返回的是**首个预设（海蓝 #236de9）**，于是出现：选了「微信绿」，按钮/链接/选中态
 * 仍是海蓝 —— 配色只改了底与字，主色被 accent 层压住（真实事故：2026-11-15 加
 * 「岛屿米」时发现，微信绿与星空其实一直是蓝按钮）。
 *
 * 现在的规则：**没表达过偏好 ⇒ 主色跟随配色**（`auto` 档，从配色记录整组回写）。
 * 珍珠白的主色组与「海蓝」预设逐值相同，所以默认外观零变化；而一旦用户点过任何色卡，
 * `mauth:accent` 就有值，这里不再插手。
 *
 * 🔴 必须排在 `alignAccentToPackage()` **之前**：主题包的配套主色（口袋版 = 微信绿）
 *    优先级更高，先跟随配色再让包覆盖，否则包联动会被这步冲掉。
 *
 * @returns 无
 */
export function alignAccentToTheme(): void {
  const accentStore = useAccentStore();
  if (hasExplicitAccent()) return;
  if (accentStore.currentId === 'auto') return;
  accentStore.adopt('auto');
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
    /*
     * 🔴 当前设备只能从 store 取（`activeDevice` 由壳渲染时写入）。
     *    不能调 `useRenderDevice()`：它内部用 `useRoute()`，而 `pick()` 是**事件回调**、
     *    不在 setup 上下文里 —— `useRoute()` 会返回 undefined，取 `.query` 直接抛
     *    TypeError，表现为"点了一下什么都没发生，也没有报错提示"（2026-11-15 用户反馈）。
     */
    const device = CURRENT_DEVICE();
    if (!device) return;
    // 这个包在当前设备上没有**后台壳**版式（口袋版在桌面 / 聚光在任意设备）：
    // 不切换，也不写脏数据 —— 保证"能点就一定有效果"
    if (!option.devices.includes(device) || !option.pages.includes('console')) return;
    // 落盘在 store 的写入口里（`mauth:view:<设备>`），这里不手写 localStorage
    themeStore.setDeviceView(device, option.id);
    // 清掉 URL 上的临时版式意图：否则下一次路由 query 同步会把这次选择覆盖回去
    clearUrlViewIntent();
    /*
     * 配套主色**只在用户没表达过偏好时**跟着换，而且用 `adopt`（只改当前视觉、不落盘）：
     *   · 用户显式选过「跟随配色」或某个色卡 ⇒ 换包不该改他的主色；
     *   · 不落盘 ⇒ 用户下次手动改色时不会被这次的临时绿色干扰。
     * 关掉页面再进来由 `alignAccentToPackage()` 按同一规则再对一次。
     */
    if (option.accent && !hasExplicitAccent()) accentStore.adopt(option.accent);
  }

  // 返回**全部**包；要不要显示某个包由调用方按设备/页面过滤（见 `shellPackageOptions`）
  return { packages: themePackageOptions(), current, pick };
}

/**
 * 清掉 URL 上的版式临时意图（`?th` / `?th_std` / `?th_mobile`）
 *
 * 用户在设置页显式选了包，就不该再被地址栏里那个"看一眼"的参数往回拽。
 * 只改 query、不动其它参数；`replace` 不留历史记录。
 *
 * @returns 无
 */
function clearUrlViewIntent(): void {
  try {
    const router = useRouter();
    const query = { ...router.currentRoute.value.query };
    let touched = false;
    for (const key of ['th', 'th_std', 'th_mobile']) {
      if (key in query) {
        delete query[key];
        touched = true;
      }
    }
    if (touched) void router.replace({ query });
  } catch {
    // 没有 router（单测 / 非路由环境）：本来就是可选行为，忽略
  }
}
