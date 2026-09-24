/**
 * 主题状态管理
 *
 * === 两个正交维度 ===
 *   mode（明暗）—— 用户可控：'system' | 'light' | 'dark'（见 @/theme/mode）
 *   theme（配色）—— 部署方决定：一个**配色 id**，对应 `src/theme/themes/<包>/` 的包根
 *                   或包内 `colors/<配色>/`；配色再反查出**主题包**（版式就在那个包里找）
 * 两者组合出 `配色数 × 2` 种外观，互不干扰：切黑白不影响品牌色，换配色不影响明暗偏好。
 *
 * === 相比旧实现修掉的问题 ===
 * 旧版本只有布尔 isDark + 一个 `theme-manual` 标记：用户点过一次切换按钮，
 * `theme-manual` 就永久为 true，**此后再也无法回到「跟随系统」**
 * （store 里的系统主题监听器会一直跳过更新）。现在用 mode 三态表达，
 * 'system' 就是显式地跟随系统，随时可回。
 *
 * === 主题来源与优先级（高 → 低）===
 *   theme：URL `?theme=` / `?skin=`  >  后端下发  >  localStorage  >  默认主题
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
import { DEFAULT_THEME_ID, getThemePackage, getThemeRecord, listThemes, resolveThemeId } from '@/theme';

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

/** 初始化主题：旧键 `theme-skin` 兜底，未登记/非法一律回默认主题 */
function readInitialTheme(): string {
  return resolveThemeId(safeGet(STORAGE_THEME) ?? safeGet(LEGACY_STORAGE_SKIN)) ?? DEFAULT_THEME_ID;
}

/**
 * 读取 URL 上的主题意图
 *
 * `skin` 作为 `theme` 的兼容别名继续支持（已发出的历史链接不能失效）。
 * 非法值一律折成 null —— 不抛错、不锁项，让后端配置与本地存储照常参与。
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

  /** 主题包自带 token（换主题时从注册表同步取，见 @/theme） */
  const themeTokens = ref<ThemeTokenOverrides | null>(getThemeRecord(themeId.value).tokens ?? null);
  /** 外部覆写 token（后端下发 / 父应用 postMessage）；优先级高于主题包 */
  const externalTokens = ref<ThemeTokenOverrides | null>(null);

  /** 可选主题列表（注册表是静态的，取一次即可） */
  const themes = listThemes();

  /**
   * 统一的注入入口：明暗、主题 token、外部覆写任一变化都重算
   *
   * 必须三合一：inline style 会盖过 `html.dark` 这一整块基线深色值，
   * 所以「改明暗」也必须重新决定注入哪些 token，否则深色下品牌色不会跟着换。
   * immediate 保证首帧前就写好 class 与变量，不会闪一下默认色。
   */
  watch(
    [isDark, themeTokens, externalTokens],
    ([dark]) => {
      document.documentElement.classList.toggle('dark', dark);
      const rejected = applyThemeLayers(
        { theme: themeTokens.value, external: externalTokens.value },
        dark
      );
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
  async function loadThemeStyle(id: string): Promise<void> {
    const epoch = ++styleEpoch;
    const loader = getThemeRecord(id).loadStyle;

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
   * 承载主题标识：`data-mauth-theme="<id>"` 既是主题 theme.scss 的选择器钩子
   * （`html[data-mauth-theme='ocean'] …`），也让排查线上问题时一眼看出当前主题。
   * 默认主题不设属性，避免 DOM 上出现无意义的 data-mauth-theme="default"。
   */
  watch(
    themeId,
    id => {
      const root = document.documentElement;
      if (id === DEFAULT_THEME_ID) delete root.dataset.mauthTheme;
      else root.dataset.mauthTheme = id;

      themeTokens.value = getThemeRecord(id).tokens ?? null;
      void loadThemeStyle(id);
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
   * 取当前主题为某页面声明的版式 id（`theme/themes/<包>/index.ts` 的 `views[page]`）
   *
   * 只做取值，**不校验**：合法性由各页的版式注册表判定（`theme/views/<page>.ts`），
   * 于是"主题包写错版式名"的后果是回退基础版式，而不是页面打不开。
   *
   * 读的是 `themeId`，因此本函数在 computed / watch 里调用会跟着主题变化 ——
   * 这一点是必须的：后端下发的主题配置在 `App.vue` 的 onMounted 才到，
   * 可能晚于页面 setup，声明式版式要能在之后才生效。
   *
   * @param page 页面名，与 `theme/views/<page>.ts` 目录名一致（如 'register'）
   */
  function viewFor(page: string): string | undefined {
    return getThemeRecord(themeId.value).views?.[page];
  }

  /**
   * 当前配色所属的**主题包** —— 版式的查找范围（版式跟随主题包）
   *
   * 做成 computed 而不是函数：容器的 watch 要把它当响应源 —— 包变了，即使解析出的
   * 版式 id 字符串没变（例如都是 `base`），渲染的组件也可能换了一套，必须重新取。
   * 未登记 / 非法配色由 `getThemePackage` 回退到内置包，调用方不必判空。
   */
  const packageId = computed(() => getThemePackage(themeId.value));

  /**
   * 设置主题（开发者/部署方调用 → 落盘）
   *
   * @param id 主题 id，须已在 src/theme/themes/ 登记；未登记时返回 false 且不改动现状
   */
  function setTheme(id: string): boolean {
    const resolved = resolveThemeId(id);
    if (!resolved) return false;
    themeId.value = resolved;
    safeSet(STORAGE_THEME, resolved);
    return true;
  }

  /**
   * 应用外部主题配置（后端下发 / 父应用同步）
   *
   * @param config theme/skin 为主题 id；mode 为明暗；tokens 为按明暗分组的变量覆写表。
   *               传 null 表示撤销外部覆写（回到主题包 + SCSS 基线）。
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
    themes,
    systemDark,
    themeTokens,
    externalTokens,
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
