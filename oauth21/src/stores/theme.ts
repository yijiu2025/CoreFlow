/**
 * 主题状态管理
 *
 * === 三个维度 + 一个作用域 ===
 *   mode（明暗意图）—— 用户可控：'system' | 'light' | 'dark'（见 @/theme/mode）
 *                       🔴 明暗 ≡ 色系（2026-09-25 定）：light=白系、dark=黑系、
 *                       system=跟随系统偏好。它不是独立于配色的第二个维度，而是
 *                       「切到哪一系别」的意图；最终明暗由**当前配色的 tone** 决定。
 *   theme（配色）—— 一个**配色 id**，对应
 *                   `theme/themes/<包>/<设备>/<页面>/[<版式>/]colors/<配色>/`；
 *                   每套配色自带 `tone`（白系/黑系）与完整底色。
 *   view（版式） —— 版式 id（`?view=` / 包声明 / 环境变量），在"包 × 设备"内查找
 *   **设备**（'mobile' | 'web'）—— 不是偏好，而是**页面身份**：本 store 存的
 *               `themeId` 是"当前这套配色"，但**能不能用**要按调用方所在设备判：
 *               电脑端页面拿手机端的配色来渲染会得到一套尺寸/圆角都对不上的东西，
 *               所以按设备取值、设备不匹配就回落到**该范围的默认配色**。
 * 配色与版式各自独立成维度：换配色不影响版式，反之亦然。
 * ⚠️ 明暗与配色**是同一个东西**：`isDark = 当前配色的系别`；`mode` 是系别意图，
 *    二者通过 `setTheme`（点色卡同步 mode）/`setMode`（切 mode 联动配色）保持**永远一致**。
 *    点黑卡即暗、点白卡即明；切「暗」落到黑系、切「明」落到白系（两侧各自记住上次选的配色）。
 *
 * === 为什么设备不放进 store、而是由调用方传 ===
 * 同一个 SPA 里可以既有 `/m/login`（移动端页面）又有 `/login`（电脑端分发器），
 * 它们是**同时存在**的两类页面，不存在"整个应用当前是哪种设备"这件事。
 * 若把设备做成 store 里一个全局值，两个页面就会互相覆盖它。
 * 因此设备是**每个调用点自己的身份**（移动端容器写常量 'mobile'），store 只负责
 * "按你所在的设备，把配色解析成一个可用的值"。
 *
 * === 相比旧实现修掉的问题 ===
 * 旧版本只有布尔 isDark + 一个 `theme-manual` 标记：用户点过一次切换按钮，
 * `theme-manual` 就永久为 true，**此后再也无法回到「跟随系统」**
 * （store 里的系统主题监听器会一直跳过更新）。现在用 mode 三态表达，
 * 'system' 就是显式地跟随系统，随时可回。
 *
 * === 主题来源与优先级（高 → 低）===
 *   theme：URL `?theme=` / `?skin=`  >  后端下发  >  localStorage  >  该范围默认配色
 *   mode ：URL `?mode=`           >  后端下发  >  localStorage  >  跟随系统
 *
 * 为什么 URL 最高：入口链接是**本次访问的显式意图**（部署方给不同租户发不同链接），
 * 它必须压过后端按 client_id 推的默认值，否则链接参数就形同虚设。
 * URL 命中的项会被「锁定」，后续后端下发不再覆盖它。
 *
 * 为什么 URL 与后端都不落盘：两者都是「这一侧的默认值」，不是用户的选择。
 * 只有用户/开发者在界面上显式调用 setMode/setTheme 才写 localStorage，
 * 否则「点开过一次带 ?mode=dark 的链接」会让用户此后的偏好被永久改写。
 *
 * @author yijiu2025
 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { MODE_CYCLE, normalizeMode, type ThemeMode } from '@/theme/mode';
import { applyThemeLayers, type ThemeTokenOverrides } from '@/theme/runtime';
import { type ThemeTone } from '@/theme/tone';
import {
  DEFAULT_THEME_PACKAGE,
  DEFAULT_THEME_DEVICE,
  DEFAULT_THEME_PAGE,
  getDefaultThemeId,
  getThemeRecord,
  isKnownTheme,
  listColorIdsOfTone,
  listThemes,
  resolveThemeId,
  toneOfAnyScope,
  type ThemeDevice
} from '@/theme';

/** localStorage 键名（沿用旧键，让老用户的手动选择可以平滑迁移） */
const STORAGE_MODE = 'theme';
const STORAGE_THEME = 'theme-id';
/** 旧版本存配色 id 的键，只读不写（迁移用） */
const LEGACY_STORAGE_SKIN = 'theme-skin';
/** 旧版本用于标记「用户手动选过明暗」的键，只读不写（迁移用） */
const LEGACY_MANUAL = 'theme-manual';

/** 承载主题附加样式（theme.scss）的 <style> 元素 id，切换主题时整体替换 */
const STYLE_ELEMENT_ID = 'mauth-theme-css';

/** 安全读写 localStorage：隐私模式 / 禁用存储时会抛错，不能让它把应用带崩 */
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 存不了就算了，本次会话内仍正常工作 */
  }
}

/**
 * 初始化明暗模式（含旧数据迁移）
 *
 * 旧版本把明暗写成 'light'/'dark'，另用 `theme-manual` 标记是否手动选过。
 * 迁移规则：
 *   • 存的是三态值 'system' → 直接用
 *   • 存的是 'light'/'dark' 且有 manual 标记（用户真的手动选过）→ 保留其选择
 *   • 存的是 'light'/'dark' 但没有 manual 标记 → 那只是旧版跟随系统的副产物，算 'system'
 */
function readInitialMode(): ThemeMode {
  const saved = safeGet(STORAGE_MODE);
  if (saved === 'system') return 'system';
  if (saved === 'light' || saved === 'dark') {
    return safeGet(LEGACY_MANUAL) === 'true' ? saved : 'system';
  }
  return 'system';
}

/**
 * 初始化主题：旧键 `theme-skin` 兜底
 *
 * 未登记 / 非法一律回**默认设备的默认配色**（通常是黑白 mono）。
 * 这里不按具体设备判：落盘的只是一个"用户/部署方选过的配色"，它在哪端可用
 * 由各调用点按自己的设备解析（见 `themeRecordFor`）。
 */
function readInitialTheme(): string {
  return (
    resolveThemeId(safeGet(STORAGE_THEME) ?? safeGet(LEGACY_STORAGE_SKIN)) ??
    getDefaultThemeId(DEFAULT_THEME_DEVICE) ??
    DEFAULT_THEME_DEVICE
  );
}

/**
 * 读取 URL 上的主题意图
 *
 * `skin` 作为 `theme` 的兼容别名继续支持（已发出的历史链接不能失效）。
 * 非法值一律折成 null —— 不抛错、不锁项，让后端配置与本地存储照常参与。
 *
 * ⚠️ 这里**不限定设备**：URL 可能来自部署方给电脑端的链接，也可能给手机端。
 *    设备匹配留到各调用点（`themeRecordFor`）判 —— 在那里才知道"我是什么设备"。
 */
function readUrlIntent(): { theme: string | null; mode: ThemeMode | null } {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      theme: resolveThemeId(params.get('theme') ?? params.get('skin')),
      mode: normalizeMode(params.get('mode'))
    };
  } catch {
    return { theme: null, mode: null };
  }
}

export const useThemeStore = defineStore('theme', () => {
  const urlIntent = readUrlIntent();
  /** URL 显式命中的项要锁定，避免随后到达的后端配置把它覆盖掉 */
  const urlLockedTheme = urlIntent.theme !== null;
  const urlLockedMode = urlIntent.mode !== null;

  const mode = ref<ThemeMode>(urlIntent.mode ?? readInitialMode());
  const themeId = ref<string>(urlIntent.theme ?? readInitialTheme());

  /** 系统偏好（始终跟踪，是否采用由 mode 决定） */
  const systemDark = ref(false);
  const mediaQuery =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  if (mediaQuery) systemDark.value = mediaQuery.matches;

  /** 系统偏好变化：只更新系统值，是否采用交给 isDark 判断（mode 为 system 时才生效） */
  const onSystemChange = (e: MediaQueryListEvent) => {
    systemDark.value = e.matches;
  };
  mediaQuery?.addEventListener('change', onSystemChange);

  /**
   * 最终是否深色 = 当前**生效配色**的系别（明暗 ≡ 色系，不是独立维度）
   *
   * 用户（2026-09-25）定：「明暗切换就是切换白色和黑色这个色系，不是另一套规则」。
   * 因此 `isDark` 不再由 `mode` 三态单独决定，而是**直接等于当前配色的 tone**：
   * 选黑系配色（black/red…）即暗、选白系配色（white/blue…）即明。
   * `mode` 退化为「系别意图」（明=白系 / 暗=黑系 / 跟随系统），由它驱动配色、
   * 由配色决定明暗 —— 两者通过 `setTheme`/`setMode` 的互相同步保持**永远一致**。
   *
   * ⚠️ 这里用 `themeRecordFor()`（函数声明、自动提升，computed 惰性求值在
   *    所有 ref 初始化之后才首次触发），取**生效**那套配色的 tone —— 跨设备
   *     回落后 tone 跟着实际渲染的那套走（如 mobile 选 blue、web 回落 white → light）。
   */
  const isDark = computed(() => themeRecordFor().tone === 'dark');

  /**
   * 当前**生效设备** —— 决定把哪一套配色的 token 注入 `html`
   *
   * 两个写入方，后者覆盖前者（2026-09-25 起，用户：「主题应跟随视图，而不是路由」）：
   *   ① **路由基线**：`router/index.ts` 的 `setupThemeDeviceSync` 按路由 meta 告知
   *      —— `/m/*` 恒为移动端，其余按电脑端；默认移动端（本应用的默认入口是 `/m/login`）。
   *   ② **桌面分发器纠正**：`view/web/<page>/index.vue` 按**实际渲染的形态**告知
   *      —— `/login` 在窄视口下渲染的是手机端容器，主题作用域就必须是 mobile，
   *      否则"页面是手机端、token 却是电脑端那套"，调试面板切手机端主题也不生效。
   *
   * ⚠️ 它不是"用户在用什么设备"这种全局状态，而是"**当前渲染的视图**属于哪种设备"。
   *    做成响应式是为了让"拉宽窗口把手机端组件换回桌面版"这类**无导航**的形态切换
   *    也能让 token 跟着重算。
   */
  const activeDevice = ref<ThemeDevice>(DEFAULT_THEME_DEVICE);

  /** 路由告知当前设备（由 `router/index.ts` 的 `setupThemeDeviceSync` 在应用启动时接管） */
  function setActiveDevice(device: ThemeDevice): void {
    if (activeDevice.value !== device) activeDevice.value = device;
  }

  /**
   * 当前**生效页面**与**生效版式** —— 配色的归属从 2026-09-24 起是「包 × 设备 × 页面 × 版式」
   *
   * 🔴 配色挂在**版式**下（`themes/<包>/<设备>/<页面>/[<版式>/]colors/<颜色>/`），
   *    所以"当前用哪套配色"必须先知道"当前是哪一页、哪套版式"。
   *    这两个值由容器（`view/app/<page>/index.vue`）在 setup 里告知。
   *
   * ⚠️ 与 `activeDevice` 同一思路：**不是**全局用户状态，而是"当前这条路由 + 当前版式"。
   *    做成响应式是为了让"从 /login 跳到 /register"或"切成 compact 版式"时 token 能重算。
   */
  const activePage = ref<string>(DEFAULT_THEME_PAGE);
  // 新版式下 view ≡ pkg —— 默认主题包是 `default`，所以默认 view 是包名而不是
  // 已废弃的 `BASE_VIEW_ID='base'`。容器会在 setup 里通过 `setActivePageView` 立即覆盖。
  const activeView = ref<string>(DEFAULT_THEME_PACKAGE);

  /** 容器告知当前页面 / 版式（同一页面切换版式时会再次调用） */
  function setActivePageView(page: string, view: string): void {
    if (page && activePage.value !== page) activePage.value = page;
    // 空 view 兜底成默认包名（新版式下默认 view = 包名）；不再用 BASE_VIEW_ID='base'
    const next = view || DEFAULT_THEME_PACKAGE;
    if (activeView.value !== next) activeView.value = next;
  }

  /**
   * 当前**生效配色**的系别（light=白系 / dark=黑系）
   *
   * 由 `themeRecordFor()` 派生 —— 跨设备回落后取的是**生效**那套的 tone，
   * 不是 `themeId` 字面上的那套（如 mobile 选 blue、web 无 blue 回落 white 时，
   * tone 取 white 的 light，不是 blue 的 light —— 此例恰好一致，但语义不同）。
   *
   * 桌面卡片根容器靠它决定是否挂局部 `.dark` class（见 StandardLogin 等），
   * 让 Tailwind `dark:` 变体在"选了黑系配色但 mode 仍是 light"时也能触发深色样式 ——
   * 否则点黑色色卡只改 token（html 背景变黑），卡片仍白，视觉割裂。
   */
  const activeTone = computed(() => themeRecordFor().tone ?? 'light');

  /**
   * 按设备 + 页面 + 版式解析出**实际生效**的配色记录
   *
   * 这是本 store 里唯一一处"把 themeId 变成可渲染的配色"的地方，其余访问器都由它派生，
   * 避免"有的地方判维度、有的地方不判"导致同一个 id 在不同组件里表现不一致。
   * 不匹配（如电脑端页面遇上手机端的配色）时由 `getThemeRecord` 回落到该版式默认配色。
   *
   * 🔴 接收 `pkg` 参数（2026-09-25 起）：新版式下 view ≡ pkg，**配色查找必须按当前包**，
   *    否则 `findRecord` 会以 `DEFAULT_THEME_PACKAGE` 兜底（修前曾 hardcode），导致
   *    切到 compact 包点 blue 永远命中 default 包 —— 用户反馈「切换版式后蓝青颜色切换无效」。
   *    缺省值仍是 `DEFAULT_THEME_PACKAGE`，保留旧调用点的语义（`getThemeRecord` 内部
   *    会在 pkg ≠ default 时把 view 兜底成 pkg，避免 view='base' 这种非法名）。
   */
  function themeRecordFor(
    pkg: string = DEFAULT_THEME_PACKAGE,
    device: ThemeDevice = activeDevice.value,
    page: string = activePage.value,
    view: string = activeView.value
  ) {
    return getThemeRecord(themeId.value, pkg, device, page, view);
  }

  /* ==========================================================================
     明暗 ≡ 配色系别（会话级记忆槽）
     ==========================================================================
     需求（用户 2026-09-25）：「明暗切换就是切换白色和黑色这个色系，不是另一套规则」。
     每套配色标一个**系别**（tone），明暗即系别：暗=黑系、明=白系、跟随系统=按系统偏好。
     切「暗」→ 落到黑系配色、切「明」→ 落到白系配色。

     === 为什么需要"两个槽" ===
     只记一个 `themeId` 的话，切系别就无从来处 —— 切到黑系时，"白系用的是哪套"
     这个信息已经被覆盖掉了。所以两侧各记一个：
       lightColor —— 切暗前正在用的白系配色（下次切明恢复它）
       darkColor  —— 切明前正在用的黑系配色（下次切暗恢复它）

     === 🔴 槽是「会话级 + 只记切走前」===
     用户（2026-09-25）：「黑色主题点明 → 白（不是蓝）；只有用蓝色时切黑再切回才保持蓝」。
     因此槽**不持久化**、**不在点色卡时写**，只在 `syncColorToTone` 这个「明暗切换」动作里
     记下「切走前正在用的那套」。这样"历史选过 blue"不会残留，黑色主题点明落到标配 white。

     === 一致性（很重要）===
     明暗与配色**是同一个东西**，必须永远一致：`setTheme`（点色卡）同步把 `mode`
     设成该配色的系别；`setMode`（切明暗）联动把配色切到目标系别。
     两条路径互相咬合，杜绝「明暗是明、配色却是黑系」的撕裂态。

     === 与"配色自带底色"的关系 ===
     配色仍是一套扁平 token、自带底色（2026-09-25 定）。这里做的是**换一套配色**，
     不是给同一套配色挑明暗档 —— 明暗档不存在，"明暗"就是"黑系/白系"。
     ========================================================================== */

  /**
   * 白系 / 黑系两侧的**会话级**记忆槽：只记「切走前正在用的那套」，不持久化。
   *
   * 用户（2026-09-25）定：「黑色主题点『明』应该切到白色而不是蓝色；只有在用蓝色
   * 主题时切黑再切回才继续保持蓝色」。所以槽**不能**是「历史选过哪套」的持久化记录
   * （否则历史选过 blue 后，任何时候切明都会误恢复 blue），而必须只在「明暗切换」
   * 这个动作里记下「切走前的那一套」——会话内存、初始为空、点色卡不写槽。
   */
  const lightColor = ref<string | null>(null);
  const darkColor = ref<string | null>(null);

  /**
   * 把配色切到与目标明暗匹配的系别（**明暗 → 配色**，单向）
   *
   * 三种情况**什么都不做**，都是刻意的：
   *   ① 当前配色已同系别 —— 最常见，用户手选的颜色被尊重（夜间下选白系也照用）；
   *   ② 该版式下没有这个系别的配色 —— **绝不**跨系别回落，否则"开夜间"会拿到
   *      一套浅底，看起来像联动没生效，比不切更难排查；
   *   ③ 算出的目标与当前相同 —— 避免无谓触发下游 watch。
   *
   * ⚠️ 本函数**不落盘 `themeId`**：联动是"系统推导"，不是用户选择。
   *    槽也只记「切走前」的会话级值（见上方「会话级记忆槽」），不落盘 ——
   *    点开一次带 mode=dark 的链接不会永久改写用户的配色偏好。
   */
  function syncColorToTone(dark: boolean): void {
    const target: ThemeTone = dark ? 'dark' : 'light';
    const device = activeDevice.value;
    const page = activePage.value;
    const view = activeView.value;

    // ① 已经同系别 —— 按**任意登记处**查系别，而不是只看当前作用域：
    //    "当前作用域没有这套配色"（如 blue 只在手机端有）时，渲染层已经按同系别
    //    回落（见 theme/index.ts 的 getThemeRecord），选择本身不该被这里改写。
    if (toneOfAnyScope(themeId.value) === target) return;

    // 记住「切走前」当前系别正在用的那套：从白系切暗 → 记下白系配色（切回明时恢复它），
    // 从黑系切明 → 记下黑系配色。⚠️ 只有「明暗切换」这个动作才写槽；点色卡（setTheme）
    // 不写 —— 于是「黑色主题点明」时若没有刚从白系切过来的上下文，槽为空 → 落到标配 white，
    // 只有「当前在用蓝色、切黑再切回」才会恢复 blue（用户 2026-09-25 定）。
    const curTone = toneOfAnyScope(themeId.value);
    if (curTone === 'light') lightColor.value = themeId.value;
    else if (curTone === 'dark') darkColor.value = themeId.value;

    // 优先取该系别槽里那套；它在当前版式下不存在时（如 rainbow 只有 login 有）弃用
    const slot = dark ? darkColor.value : lightColor.value;
    const fromSlot = slot && isKnownTheme(slot, device, page, view) ? slot : null;
    // 明暗切换的目标系别配色：优先该系别的「标配」（白系=white / 黑系=black），
    // 没有标配时退回该系别第一套。白/黑是默认搭配的两套（用户 2026-09-25 定），
    // 不能因为字母序让「切到明」落到 blue 上（"切到明"就该是白、"切到暗"就该是黑）。
    const standard = target === 'dark' ? 'black' : 'white';
    const ids = listColorIdsOfTone(device, page, view, target);
    const next = fromSlot ?? (ids.includes(standard) ? standard : ids[0]) ?? null;

    // ② / ③
    if (!next || next === themeId.value) return;

    themeId.value = next;
  }

  /**
   * 首屏对齐：打开页面时按**当前明暗**把配色校正到匹配的系别
   *
   * 场景：用户上次在浅色的 `blue` 下关掉页面，这次系统已是深色 —— 首屏就该是黑系。
   *
   * ⚠️ URL 显式给了 `?theme=` 时**不干预**：那是部署方/用户的明确意图
   *    （部署方可能故意发一条"永远用蓝"的链接），链接必须压过联动。
   *    与既有优先级「URL > 后端 > localStorage」同一口径。
   *
   * ⚠️ 只在**有落盘偏好**时对齐（theme-id / 旧键 / 任一记忆槽任一存在）：
   *    全新用户什么都没选过时，"默认长什么样"必须保持既有事实
   *    （该范围的默认配色），不能因为一次系别对齐被换到意料之外的色上。
   */
  /**
   * 首屏对齐：按当前「系别意图」把配色校正到匹配的系别
   *
   * 明 = 白系、暗 = 黑系、跟随系统 = 按系统偏好。全新用户也走这里：默认配色
   * 字母序是 black（黑系），若系统是亮色就该首屏落到白系，否则「跟随系统」形同虚设
   * 且出现 html 深色 / 页面浅色的撕裂。
   *
   * ⚠️ URL 显式给了 `?theme=` 时不干预：那是部署方/用户的明确意图
   *    （部署方可能故意发一条"永远用蓝"的链接），链接必须压过联动。
   */
  if (!urlLockedTheme) {
    syncColorToTone(mode.value === 'system' ? systemDark.value : mode.value === 'dark');
  }

  /**
   * 明暗意图变化 → 联动切配色（唯一运行时入口）
   *
   * 明=白系、暗=黑系、跟随系统=按系统偏好。首屏那一次不走这里（watch 是"变化"语义），
   * 已由上面的显式调用处理。系统偏好变化（跟随系统模式）也在这里联动。
   */
  watch(mode, m => syncColorToTone(m === 'system' ? systemDark.value : m === 'dark'));
  watch(systemDark, dark => {
    if (mode.value === 'system') syncColorToTone(dark);
  });

  /**
   * 主题包自带 token（按**当前生效作用域**解析；设备/页面/版式变化时由 watch 重算）
   *
   * ⚠️ 是一组**扁平值**，不分明暗档（2026-09-25 改）：配色自带完整底色。
   */
  const themeTokens = ref<ThemeTokenOverrides | null>(themeRecordFor().tokens ?? null);
  /** 外部覆写 token（后端下发 / 父应用 postMessage）；优先级高于主题包 */
  const externalTokens = ref<ThemeTokenOverrides | null>(null);

  /** 可选主题列表（注册表是静态的，取一次即可） */
  const themes = listThemes();

  /**
   * 统一注入入口：配色 token、外部覆写、生效范围任一变化都重算
   *
   * ⚠️ 注入的是 `html` 上的 inline style，而 `html` 是**整份文档唯一**的 ——
   * 所以此处只能用**一个**设备的 token。取 `activeDevice`（路由基线 + 桌面分发器
   * 按实际渲染形态纠正，见上方 `setActiveDevice`）：渲染的是手机端视图就用移动端配色，
   * 是电脑端视图就用电脑端配色。
   *
   * 这在实践中不会出问题：一个页面要么是移动端要么是电脑端，切换形态（含拉宽窗口这类
   * 无导航的切换）时会重算（`activeDevice` 变化本身就是这个 watch 的依赖）。
   * 真正需要避免的是"两端配色同时生效"——那在单文档模型下不可能，也不是本机制要解决的问题。
   *
   * 之所以不在这里重新跑视口判定：那是分发器的职责（`utils/device.ts` +
   * `useDeviceDetect`），重复实现会出现"分发器说电脑版、注入说移动端"的分裂。
   * 由**渲染方**把结论告诉 store —— 谁渲染，主题就跟谁。
   *
   * ⚠️ tokens 已是一组扁平值、不再分明暗档（2026-09-25 改），所以**不再依赖 `isDark`**：
   * 配色外观由"选了哪套颜色"完全决定。`isDark` 只负责给 `<html>` 挂/摘 `dark` 类
   * （基线 SCSS 用它切深色底），挂在同一个 watch 里只是因为两者都在同一个"重算"时机。
   */
  watch(
    [themeTokens, externalTokens, activeDevice, isDark],
    ([, , , dark]) => {
      document.documentElement.classList.toggle('dark', dark);
      const rejected = applyThemeLayers({
        theme: themeTokens.value,
        external: externalTokens.value
      });
      if (rejected.length > 0) {
        // 被拒绝的条目多为后端配色表写错（值不在白名单内），留痕便于排查。
        // 生产构建会 drop console，不会泄露到用户侧。
        console.warn(`[theme] 忽略了 ${rejected.length} 条不合规的主题变量：${rejected.join('、')}`);
      }
    },
    { immediate: true }
  );

  /**
   * 加载主题附加样式（theme.scss，惰性动态 import）
   *
   * 每次加载带一个递增 epoch：主题 A→B→A 连续切换时，先发出的 A 请求可能后返回，
   * 若不加序号就会用过期结果覆盖当前主题 —— 表现为「切了主题但样式是上一个的」。
   *
   * 失败静默：附加样式拿不到只是少个背景图，绝不能挡住登录。
   *
   * ⚠️ `styleEpoch` 与这个函数都必须声明在下面的 `watch(themeId, …, {immediate:true})`
   *    之前：immediate watcher 会在 watch() 调用当场同步跑一遍，那时若 `let styleEpoch`
   *    还没求值就会踩 TDZ，抛出的 ReferenceError 被 async 函数转成 rejected promise、
   *    又被 `void` 丢掉 —— 现象是「只有首屏那次主题样式加载不到，之后手动切主题都正常」，
   *    极难从表象定位。
   */
  let styleEpoch = 0;
  async function loadThemeStyle(id: string, pkg: string, device: ThemeDevice, page: string, view: string): Promise<void> {
    const epoch = ++styleEpoch;
    // 新版式下 view ≡ pkg，但外部传 view 仍可能是 'base'（旧机制） —— getThemeRecord
    // 内部会把 `view === 'base' && pkg !== 'default'` 的情况兜底成 `pkg`，所以这里直传即可。
    const loader = getThemeRecord(id, pkg, device, page, view).loadStyle;

    if (!loader) {
      document.getElementById(STYLE_ELEMENT_ID)?.remove();
      return;
    }
    try {
      const css = await loader();
      if (epoch !== styleEpoch) return; // 期间又切了主题，丢弃本次结果
      let node = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
      if (!node) {
        node = document.createElement('style');
        node.id = STYLE_ELEMENT_ID;
        document.head.appendChild(node);
      }
      node.textContent = css;
    } catch {
      /* 主题附加样式加载失败不影响登录 */
    }
  }

  /**
   * 承载配色标识 + 同步 token / 附加样式
   *
   * `data-mauth-theme="<id>"` 既是配色 theme.scss 的选择器钩子
   * （`html[data-mauth-theme='ocean'] …`），也让排查线上问题时一眼看出当前配色。
   *
   * === 什么时候**不**写这个属性 ===
   * 仅当"该设备下没有这套配色、用了回落档"时（`record.meta.id !== id`）才 delete。
   * 此时若照写，`theme.scss` 的选择器会挂到一套**并未生效**的配色上 ——
   * 背景图、字体都来自别处，而 DOM 却宣称用的是它，排查时极难归因。
   *
   * === 为什么 mono 会（并且应当）写出属性 ===
   * `mono` 是**具名基线配色**（`<设备>/colors/mono/`，零 token）：它的色值就是
   * 样式表基线本身，所以"写不写属性"在**当前**不影响任何像素 —— 基线规则不带
   * 属性选择器。写出来的好处有两条：
   *   ① 语义诚实：配置层面用户确实选了 `mono`（`?theme=mono`），DOM 应当如实反映；
   *   ② 前向兼容：将来若给 mono 加 `theme.scss`（例如换个中性灰底纹），
   *      选择器立刻可用，不必回头改这里。
   * "零配色 → 渲染路径与没有主题机制时一致"这条不变量由 **mono 零 token** 保证，
   * 而不是靠不写属性 —— 少写一个属性省不下任何渲染代价，却让排查少一个线索。
   *
   * ⚠️ 必须同时依赖 `activeDevice` / `activePage` / `activeView`：同一个 `themeId`
   *    在四段归属不同的地方解析出的记录可能不同（不匹配时会回落），只盯 themeId
   *    会漏掉"从 /login 跳到 /register""切成 compact 版式"这一整类切换。
   */
  watch(
    [themeId, activeDevice, activePage, activeView],
    ([id, device, page, view]) => {
      // 新版式下 view ≡ pkg —— 主动用 activeView 同时充当 view 和 pkg：
      //   • view 给 findRecord 的视图段（精确匹配当前生效配色）
      //   • pkg 给 findRecord 的包段（避免被 DEFAULT_THEME_PACKAGE 兜底抢走）
      const record = getThemeRecord(id, view, device, page, view);
      const root = document.documentElement;
      // 解析出的 id 与请求的 id 不一致 = 该版式下没有这套配色，用了回落档
      if (record.meta.id === id) root.dataset.mauthTheme = id;
      else delete root.dataset.mauthTheme;

      themeTokens.value = record.tokens ?? null;
      void loadThemeStyle(id, view, device, page, view);
    },
    { immediate: true }
  );

  /**
   * 切版式 → 自动重置配色（让用户**立刻**感受到新版的视觉特征）
   *
   * 新版式（register 等）下 `activeView ≡ pkg`：切版式 = 切主题包。
   * 当前 themeId 仍指向**旧包**的同名配色（如 blue），新包下的同名 tokens
   * 通常一致（紧凑版式不该改色）→ 视觉零差异 → 用户感觉「颜色没刷新」。
   *
   * 修：切到新包时把 themeId 重置到该包/页/设备的默认色（字母序最前者），
   *    让用户首帧就看到新版的颜色基调。
   *
   * 守门（每个都要有，写在前头防止后人手贱删）：
   *   • 仅**新版式**触发：用 `oldView` 查 themeId 当前解析到的包（**不是**当前 view）——
   *     当前 view 已是 newView，用它查 `themeRecordFor()` 会扫全命中**新**包 → currentPkg
   *     永远等于 newView → 整段逻辑失效。换成「用旧 view 看 themeId 在哪」：
   *       • 同包切变体（旧机制 login 'base' → 'mini'）→ currentPkg='default'、newView='mini'
   *         **都是 default**（mini 是 default 包下的变体）→ 不动 ✓
   *       • 切到另一主题包（新版式 register 'default' → 'compact'）→ currentPkg='default'
   *         ≠ newView='compact' → 重置 ✓
   *   • 仅 activeView **真的变了**（`newView !== oldView`）—— 重复设同值、setup 时
   *     初次赋值等情况都不应触发重置（后者由 `urlLockedTheme` 兜底，但少一次副作用更好）。
   *   • URL 锁定的 theme 不动：部署方/用户的显式意图必须压过联动
   *     （如 `?view=compact&theme=blue`）。
   *   • **不写 STORAGE_THEME**：切版式 ≠ 用户选色 —— 用户切回旧版式应恢复上次自选色。
   *   • **不联动 mode / 不动记忆槽**：同理，切版式 ≠ 用户定系别。
   *
   * ⚠️ 默认不 immediate：避免初次加载把 URL/后端下发的有效 themeId 覆盖。
   */
  watch(activeView, (newView, oldView) => {
    if (!newView || newView === oldView) return;
    // 用**旧 view**查 themeId 当前解析到的包（activeView 已变 → 用它查会落到新包 → currentPkg=newView → 永远相等 = 整段失效）
    const currentPkg = themeRecordFor(
      DEFAULT_THEME_PACKAGE,
      activeDevice.value,
      activePage.value,
      oldView
    ).pkg;
    if (currentPkg === newView) return;
    // URL 锁定 theme（如 `?theme=blue&view=compact`）→ 部署方的显式意图，不被切版式覆盖
    if (urlLockedTheme) return;
    const fallback = getDefaultThemeId(activeDevice.value, activePage.value, newView);
    if (!fallback || fallback === themeId.value) return;
    // 仅 in-memory 重置 —— 切回旧版式时能恢复 STORAGE_THEME 里的「上次自选色」
    themeId.value = fallback;
  });

  /** 设置明暗意图（明=白系 / 暗=黑系 / 跟随系统；用户显式选择 → 落盘，联动切配色由 watch(mode) 驱动） */
  function setMode(next: ThemeMode): void {
    mode.value = next;
    safeSet(STORAGE_MODE, next);
  }

  /** 循环切换明暗意图（跟随系统 → 明 → 暗 → 跟随系统） */
  function cycleMode(): void {
    const idx = MODE_CYCLE.indexOf(mode.value);
    setMode(MODE_CYCLE[(idx + 1) % MODE_CYCLE.length]);
  }

  /**
   * 在明/暗之间切换（= 白系 ↔ 黑系；桌面版浮按钮沿用此语义，保持二态手感）
   *
   * 与 cycleMode 的区别：这个不进入 'system'，纯做反色切换。
   * 现在 `isDark` = 当前配色的系别，所以"切到相反明暗"即"切到相反系别的配色"。
   */
  function toggleTheme(): void {
    setMode(isDark.value ? 'light' : 'dark');
  }

  /**
   * 取当前配色为某页面声明的版式 id
   *
   * 只做取值，**不校验**：合法性由各页的版式注册表判定（`theme/views/<page>.ts`），
   * 于是"主题包写错版式名"的后果是回退基础版式，而不是页面打不开。
   *
   * ⚠️ 声明来自**配色记录**（包定义或配色自带），而记录要按设备解析 ——
   *    所以在电脑端页面上取到的可能是电脑端那套配色的声明。
   *
   * 读的是 `themeId` + `activeDevice`，因此本函数在 computed / watch 里调用会跟着变化
   * —— 这一点是必须的：后端下发的配色配置在 `App.vue` 的 onMounted 才到，
   * 可能晚于页面 setup，声明式版式要能在之后才生效。
   *
   * @param page   页面名，与 `theme/views/<page>.ts` 的文件名一致（如 'register'）
   * @param device 哪个设备下的声明；默认当前生效设备
   *
   * 🔴 **新版式下用 activeView 作 view 段**（2026-09-25）：`BASE_VIEW_ID='base'` 在新版式
   *    下不再是合法 view 名（见 `theme/index.ts` 的 `colorFromKey` 注释）。改用
   *    `activeView` 让查找范围与"当前渲染的版式"一致。views 字段通常为空（包定义里
   *    没声明），本函数绝大多数调用点会拿到 undefined —— 调用方按包名兜底即可。
   */
  function viewFor(page: string, device: ThemeDevice = activeDevice.value): string | undefined {
    return themeRecordFor(DEFAULT_THEME_PACKAGE, device, page, activeView.value).views?.[page];
  }

  /**
   * 当前配色所属的**主题包** —— 版式查找范围的包那一段（版式跟随主题包）
   *
   * 做成 computed 而不是函数：容器的 watch 要把它当响应源 —— 包变了，即使解析出的
   * 版式 id 字符串没变（例如都是 `base`），渲染的组件也可能换了一套，必须重新取。
   * 未登记 / 非法配色由 `getThemeRecord` 回落到该设备默认配色，调用方不必判空。
   */
  const packageId = computed(() => themeRecordFor().pkg);

  /**
   * 当前**生效设备** —— 版式查找范围的设备那一段
   *
   * 容器侧一般用自己的常量（移动端容器写 `'mobile'`）而不是这个值：设备是页面身份，
   * 由文件位置决定，比"全局状态"可靠。本值供确实需要"当前是哪端"的场景用
   * （调试面板、路由分发）。
   */
  const device = computed(() => activeDevice.value);

  /**
   * 设置配色（开发者/部署方调用 → 落盘）
   *
   * @param id 配色 id，须已在 `src/theme/themes/<包>/<设备>/colors/` 登记；
   *           未登记时返回 false 且不改动现状。
   *
   * ⚠️ 这里**不按设备过滤**：用户/部署方可能先设一个"手机端配色"，随后又访问电脑端页面
   *    —— 后者会因设备不匹配而回落（见 `themeRecordFor`），但选择本身仍被记住。
   *    若在这里判设备拒绝，就会出现"在手机端能设、在电脑端设了无声失败"的怪现象。
   */
  function setTheme(id: string): boolean {
    const resolved = resolveThemeId(id);
    if (!resolved) return false;
    themeId.value = resolved;
    safeSet(STORAGE_THEME, resolved);
    // 明暗 = 色系：点色卡同步把「明暗意图」设为该配色的系别（点黑卡→暗、点白卡→明、
    // 点红卡（黑系）→暗、点蓝卡（白系）→明），并脱离「跟随系统」—— 用户显式选了
    // 一套配色，即显式定下了系别。这样明暗与配色永远一致，不会出现"明暗是明、配色却是黑系"的撕裂。
    const tone = toneOfAnyScope(resolved);
    // 点色卡 = 显式选配色，**打断「切走前」记忆链**：清空对侧槽，让下次明暗切换落到标配。
    // 否则「白色/青色下手动点黑卡 → 点明」会误恢复历史白系残留（如 cyan）而非 white。
    if (tone === 'dark') lightColor.value = null;
    else if (tone === 'light') darkColor.value = null;
    if (tone) {
      const next: ThemeMode = tone === 'dark' ? 'dark' : 'light';
      if (mode.value !== next) {
        mode.value = next;
        safeSet(STORAGE_MODE, next);
      }
    }
    return true;
  }

  /**
   * 应用外部配色配置（后端下发 / 父应用同步）
   *
   * @param config theme/skin 为配色 id；mode 为明暗；tokens 为一组扁平的变量覆写表。
   *               传 null 表示撤销外部覆写（回到配色 + SCSS 基线）。
   *               传入的项若已被 URL 参数锁定则跳过，其余照常生效。
   *
   * 注意本方法**不写 localStorage**：后端默认值不应覆盖用户自己的明暗偏好。
   */
  function applyThemeConfig(
    config: {
      theme?: string;
      /** @deprecated 旧字段名，等价于 theme */
      skin?: string;
      mode?: ThemeMode;
      tokens?: ThemeTokenOverrides;
    } | null
  ): void {
    if (!config) {
      externalTokens.value = null;
      return;
    }

    const wanted = config.theme ?? config.skin;
    if (wanted !== undefined && !urlLockedTheme) {
      // 不按设备过滤：后端可能只配了一套配色给某一端，落库后由各端自行回落。
      // 若这里按当前设备拒绝，会把"下次访问另一端的正确配置"也一起丢掉。
      const resolved = resolveThemeId(wanted);
      if (resolved) {
        themeId.value = resolved;
        // 明暗 = 色系：后端下发配色也同步系别意图（除非 mode 被 URL 锁定）
        const tone = toneOfAnyScope(resolved);
        if (tone && !urlLockedMode) {
          const next: ThemeMode = tone === 'dark' ? 'dark' : 'light';
          if (mode.value !== next) mode.value = next;
        }
      }
    }
    if (config.mode && !urlLockedMode) mode.value = config.mode;
    if (config.tokens) externalTokens.value = config.tokens;
  }

  /**
   * 应用外部明暗（父应用旧协议兼容）
   * @param dark 是否深色 —— 即切到黑系（dark）/ 白系（light）
   */
  function applyTheme(dark: boolean): void {
    setMode(dark ? 'dark' : 'light');
  }

  /**
   * 清理系统主题监听（HMR / 单测场景）
   * 导出是为了遵循优雅关闭原则；正常 SPA 生命周期下 store 与 app 同寿命不会调。
   */
  function dispose(): void {
    mediaQuery?.removeEventListener('change', onSystemChange);
  }

  // 便于 dev 调试面板 / Playwright 关卡探针读到 store 状态（仅 dev + ?debug=theme 时挂，
  // 生产构建不会启用，import.meta.env.DEV 由 Vite 注入 false）
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(location.search).get('debug') === 'theme') {
    (window as unknown as Record<string, unknown>).__MAUTH_STORE__ = {
      get themeId() { return themeId.value; },
      get mode() { return mode.value; },
      get packageId() { return packageId.value; },
      get activeDevice() { return activeDevice.value; },
      get activePage() { return activePage.value; },
      get activeView() { return activeView.value; }
    };
  }

  return {
    mode,
    isDark,
    themeId,
    packageId,
    device,
    activeDevice,
    activePage,
    activeView,
    activeTone,
    themes,
    systemDark,
    themeTokens,
    externalTokens,
    lightColor,
    darkColor,
    themeRecordFor,
    setActiveDevice,
    setActivePageView,
    setMode,
    cycleMode,
    toggleTheme,
    setTheme,
    viewFor,
    applyThemeConfig,
    applyTheme,
    dispose
  };
});
