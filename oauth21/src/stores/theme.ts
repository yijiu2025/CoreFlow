/**
 * 主题状态管理
 *
 * === 三个维度（正交） + 一个作用域 ===
 *   mode（明暗）—— 用户可控：'system' | 'light' | 'dark'（见 @/theme/mode）
 *                   只决定 `<html>` 是否带 `dark` 类（基线 SCSS 切深色底），
 *                   **不再参与配色 token 的选档**（2026-09-25 取消 tokens 明暗两档）
 *   theme（配色）—— 部署方决定：一个**配色 id**，对应
 *                   `theme/themes/<包>/<设备>/<页面>/[<版式>/]colors/<配色>/`；
 *                   配色再反查出**主题包**（版式就在那个包下找）
 *   view（版式） —— 版式 id（`?view=` / 包声明 / 环境变量），在"包 × 设备"内查找
 *   **设备**（'mobile' | 'web'）—— 不是偏好，而是**页面身份**：本 store 存的
 *               `themeId` 是"当前这套配色"，但**能不能用**要按调用方所在设备判：
 *               电脑端页面拿手机端的配色来渲染会得到一套尺寸/圆角都对不上的东西，
 *               所以按设备取值、设备不匹配就回落到**该范围的默认配色**。
 * 配色与版式各自独立成维度：换配色不影响版式，反之亦然。
 * ⚠️ mode（明暗）与配色**彻底正交**：配色自带完整底色，选黑就是黑、选蓝就是蓝，
 *    与当前明暗偏好无关 —— 所以不再有"配色数 × 2(明暗)"这个组合数。
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
import {
  BASE_VIEW_ID,
  DEFAULT_THEME_DEVICE,
  DEFAULT_THEME_PAGE,
  getDefaultThemeId,
  getThemeRecord,
  listThemes,
  resolveThemeId,
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

  /** 最终是否深色：mode 为 system 时取自系统偏好 */
  const isDark = computed(() => (mode.value === 'system' ? systemDark.value : mode.value === 'dark'));

  /**
   * 当前**生效设备** —— 决定把哪一套配色的 token 注入 `html`
   *
   * 由路由在每次导航后告知（`setActiveDevice`），默认移动端（本应用的默认入口
   * `/m/login` 是移动端；纯电脑端应用可把默认值改成 `'web'`）。
   *
   * ⚠️ 它不是"用户在用什么设备"这种全局状态，而是"**当前这条路由**属于哪种设备"。
   *    做成响应式是为了让"从 /login 跳到 /m/login"时 token 能跟着重算。
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
  const activeView = ref<string>(BASE_VIEW_ID);

  /** 容器告知当前页面 / 版式（同一页面切换版式时会再次调用） */
  function setActivePageView(page: string, view: string): void {
    if (page && activePage.value !== page) activePage.value = page;
    const next = view || BASE_VIEW_ID;
    if (activeView.value !== next) activeView.value = next;
  }

  /**
   * 按设备 + 页面 + 版式解析出**实际生效**的配色记录
   *
   * 这是本 store 里唯一一处"把 themeId 变成可渲染的配色"的地方，其余访问器都由它派生，
   * 避免"有的地方判维度、有的地方不判"导致同一个 id 在不同组件里表现不一致。
   * 不匹配（如电脑端页面遇上手机端的配色）时由 `getThemeRecord` 回落到该版式默认配色。
   */
  function themeRecordFor(
    device: ThemeDevice = activeDevice.value,
    page: string = activePage.value,
    view: string = activeView.value
  ) {
    return getThemeRecord(themeId.value, device, page, view);
  }

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
   * 所以此处只能用**一个**设备的 token。取 `activeDevice`（由当前路由决定，
   * 见下方 `setActiveDevice`）：`/m/*` 用移动端配色，其余用电脑端配色。
   *
   * 这在实践中不会出问题：一个页面要么是移动端要么是电脑端，切换页面时会重算
   * （`activeDevice` 变化本身就是这个 watch 的依赖）。真正需要避免的是"两端配色
   * 同时生效"——那在单文档模型下不可能，也不是本机制要解决的问题。
   *
   * 之所以不在这里重新跑视口判定：那是路由分发的职责（`utils/device.ts`），
   * 重复实现会出现"路由说电脑版、注入说移动端"的分裂。由路由把结论告诉 store。
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
  async function loadThemeStyle(id: string, device: ThemeDevice, page: string, view: string): Promise<void> {
    const epoch = ++styleEpoch;
    const loader = getThemeRecord(id, device, page, view).loadStyle;

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
      const record = getThemeRecord(id, device, page, view);
      const root = document.documentElement;
      // 解析出的 id 与请求的 id 不一致 = 该版式下没有这套配色，用了回落档
      if (record.meta.id === id) root.dataset.mauthTheme = id;
      else delete root.dataset.mauthTheme;

      themeTokens.value = record.tokens ?? null;
      void loadThemeStyle(id, device, page, view);
    },
    { immediate: true }
  );

  /** 设置明暗模式（用户显式选择 → 落盘） */
  function setMode(next: ThemeMode): void {
    mode.value = next;
    safeSet(STORAGE_MODE, next);
  }

  /** 循环切换明暗（跟随系统 → 浅色 → 深色 → 跟随系统） */
  function cycleMode(): void {
    const idx = MODE_CYCLE.indexOf(mode.value);
    setMode(MODE_CYCLE[(idx + 1) % MODE_CYCLE.length]);
  }

  /**
   * 在浅色/深色之间切换（桌面版浮按钮沿用此语义，保持二态手感）
   *
   * 与 cycleMode 的区别：这个不进入 'system'，纯做反色切换。
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
   * ⚠️ 这里查的是**基础版式**（`activeView` 用不了：本函数正是用来决定"该用哪套版式"的，
   *    拿它当查找条件会自指）。配色的 `views` 声明写在哪个版式下都能被读到 ——
   *    实践中部署方把它写在基础版式的那份配色里即可。
   */
  function viewFor(page: string, device: ThemeDevice = activeDevice.value): string | undefined {
    return themeRecordFor(device, page, BASE_VIEW_ID).views?.[page];
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
      if (resolved) themeId.value = resolved;
    }
    if (config.mode && !urlLockedMode) mode.value = config.mode;
    if (config.tokens) externalTokens.value = config.tokens;
  }

  /**
   * 应用外部明暗（父应用旧协议兼容）
   * @param dark 是否深色
   */
  function applyTheme(dark: boolean): void {
    mode.value = dark ? 'dark' : 'light';
  }

  /**
   * 清理系统主题监听（HMR / 单测场景）
   * 导出是为了遵循优雅关闭原则；正常 SPA 生命周期下 store 与 app 同寿命不会调。
   */
  function dispose(): void {
    mediaQuery?.removeEventListener('change', onSystemChange);
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
    themes,
    systemDark,
    themeTokens,
    externalTokens,
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
