/**
 * theme store 的持久化与 URL 解析层（从 `stores/theme.ts` 抽出，2026-09-28）
 *
 * === 为什么单独抽这一份 ===
 * `stores/theme.ts` 是「明暗 ≡ 配色系别」状态机的实现，主体是 6 个互相咬合的 watch。
 * 但其中**约 140 行是完全不依赖 store 实例的纯函数与常量**（localStorage 安全读写、
 * 旧数据迁移、URL 多设备意图解析）—— 它们无需闭包、无副作用顺序、可独立测试。
 *
 * 抽出它们让 `theme.ts` 只剩"状态 + watch 编排"这件事，同时**不动任何时序**：
 *   • store 主体（ref 声明、watch 顺序、TDZ 依赖）一行未改；
 *   • 导出面 100% 不变（`useThemeStore` 仍是 `stores/theme.ts` 的唯一对外出口）。
 *
 * ⚠️ 这些函数**不自带 DOM 守卫**（如 `typeof window !== 'undefined'`）：原实现在
 *    store 初始化时调用，SPA 场景下 window 必然存在。抽文件不改变这一点。
 *
 * @author yijiu2025
 * @since 2026-09-28
 */
import {
  DEFAULT_THEME_ID,
  DEFAULT_THEME_DEVICE,
  getDefaultThemeId,
  resolveThemeId,
  THEME_DEVICES,
  type ThemeDevice
} from '@/theme';
import { normalizeMode, type ThemeMode } from '@/theme/mode';

/** localStorage 键名（沿用旧键，让老用户的手动选择可以平滑迁移） */
export const STORAGE_MODE = 'theme';
export const STORAGE_THEME = 'theme-id';
/** 旧版本存配色 id 的键，只读不写（迁移用） */
export const LEGACY_STORAGE_SKIN = 'theme-skin';
/** 旧版本用于标记「用户手动选过明暗」的键，只读不写（迁移用） */
export const LEGACY_MANUAL = 'theme-manual';

/** 安全读写 localStorage：隐私模式 / 禁用存储时会抛错，不能让它把应用带崩 */
export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string): void {
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
export function readInitialMode(): ThemeMode {
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
 * 未登记 / 非法一律回**默认设备 × 默认页面 × 默认包**里的兜底配色 ——
 * 即 `DEFAULT_THEME_COLOR`（`white`，2026-09-26 定；此前是"字母序最前者"= `black`）。
 * 这里不按具体设备判：落盘的只是一个"用户/部署方选过的配色"，
 * 它在哪端可用由各调用点按自己的设备解析（见 `themeRecordFor`）。
 *
 * ⚠️ 最后兜底是 `DEFAULT_THEME_ID`（`'default'`）而**不是** `DEFAULT_THEME_DEVICE`：
 *    后者是设备名（`'mobile'`），拿它当配色 id 会得到一个永远查不到的 id ——
 *    虽然渲染层会回落到该范围第一套，但 `?debug=theme` 里看到一个设备名当配色、
 *    且 `data-mauth-theme` 被无谓地摘掉，排查时极具误导性。
 */
export function readInitialTheme(): string {
  return (
    resolveThemeId(safeGet(STORAGE_THEME) ?? safeGet(LEGACY_STORAGE_SKIN)) ??
    getDefaultThemeId(DEFAULT_THEME_DEVICE) ??
    DEFAULT_THEME_ID
  );
}

/** URL 上按设备解析出的配色意图：只记"这台设备被**显式**指定了哪套色" */
export type DeviceThemeIntent = Partial<Record<ThemeDevice, string>>;

/**
 * 读取 URL 上的主题意图（**含设备维度**，2026-09-26 起）
 *
 * === 每台设备各一条取值链 ===
 *   `?theme.<设备>` / `?skin.<设备>`  →  `?theme` / `?skin`  → （缺则不算命中）
 * 即"**设备专属优先，缺了退到通用键**"。两条都可能缺 —— 缺了这台设备就走
 * 落盘偏好 / 该范围默认色（由 `themeRecordFor` 后面的链路决定）。
 *
 *   例 ① 三端共用一套：      `/login?theme=blue&view=compact`
 *   例 ② 两端各一套配色：    `/login?theme.mobile=blue&theme.standard=black`
 *   例 ③ 设备专属 + 通用版式：`/login?theme.mobile=blue&view=default`（mini 无专属 → 走通用/落盘）
 *
 * `skin` 作为 `theme` 的兼容别名继续支持（已发出的历史链接不能失效），
 * 设备维度下同样支持 `?skin.<设备>`。
 *
 * 非法值一律折成 null —— 不抛错、不锁项，让后端配置与本地存储照常参与。
 *
 * ⚠️ 这里**不校验"该设备下是否真有这套色"**：只在"任意一处登记过"这一层过滤
 *    （`resolveThemeId` 的默认口径）。设备不匹配时由 `getThemeRecord` 回落
 *    （同系别首套 → 该范围兜底）—— 这正是「电脑端没有 blue 就自动下沉到 white」的落点。
 *    若在这里按设备拒绝，`?theme.standard=blue` 会连"下沉"的机会都没有。
 *
 * 🔴 **空串 = 未指定**（2026-09-26 修，与版式侧 `theme/views/params.ts` 的
 *    `readDeviceParam` 同形）：`?theme.mobile=` 不能把 `?theme=blue` 顶掉。
 *    `URLSearchParams.get()` 对 `?theme.mobile=` 返回 `''`（**不是** null），
 *    `'' ?? anyScope` 仍是 `''` —— 旧写法下这一条会让**通用键也一起失效**
 *    （`resolveThemeId('')` 返回 null ⇒ 该设备一条锁都不记），与文档承诺
 *    「留空 = 这台设备不特殊指定」正好相反。部署方常把参数留空当成"不特殊指定"。
 */
export function readUrlIntent(): { deviceTheme: DeviceThemeIntent; mode: ThemeMode | null } {
  const deviceTheme: DeviceThemeIntent = {};
  try {
    const params = new URLSearchParams(window.location.search);
    /** 空串 / 纯空白视为**未指定** —— 与 `readDeviceParam` 的 `isPresent()` 同一口径 */
    const present = (raw: string | null): string | null =>
      raw && raw.trim() !== '' ? raw : null;
    // 无设备前缀的通用键：三端共用，任一设备没有专属键时用它
    const anyScope = present(params.get('theme') ?? params.get('skin'));
    for (const device of THEME_DEVICES) {
      const scoped = present(params.get(`theme.${device}`) ?? params.get(`skin.${device}`));
      const resolved = resolveThemeId(scoped ?? anyScope);
      if (resolved) deviceTheme[device] = resolved;
    }
    return { deviceTheme, mode: normalizeMode(params.get('mode')) };
  } catch {
    return { deviceTheme, mode: null };
  }
}
