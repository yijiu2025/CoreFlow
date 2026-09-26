/**
 * `mauth-theme-core` 的**唯一公开出口**
 *
 * === 这里装什么 ===
 * 主题机制里**与业务、与框架都无关**的那一半：取值白名单、契约类型、系别/明暗取值、
 * 设备维度参数读取、token 形态与校验。它是纯函数 + 数据，可以在任何前端（Vue / React /
 * 单测 / 将来的 SSR）里被同一套代码驱动。
 *
 * ### 不在这里装什么（重要）
 *   • **DOM 与注入**（`documentElement`、`localStorage`、`matchMedia`）→ 由宿主适配器提供
 *   • **构建器耦合**（`import.meta.glob` / `import.meta.env`）→ 由宿主适配器提供
 *   • **路由**（vue-router）→ 应用自己的世界观
 *   • **业务资产**（`themes/**` 的版式与配色实现）→ 随应用走
 * 见 `docs/frontend/theme-package-extraction.md` 的「〇、一条原则」与「五、四个注入点契约」。
 *
 * === 为什么用显式具名导出，而不是 `export *` ===
 * 立项文档 §四 有一张"公开 API 面"的表，本文件就是那张表的**落地**：表里没有的名字
 * 就不该从这里出去（如内部用的正则、解析器）。用 `export *` 会让"包到底承诺了什么"
 * 变成一份隐式清单，加一个内部导出就悄悄扩大了对外承诺。
 * 代价是新增导出要手工补一行 —— 这是刻意的摩擦。
 *
 * ⚠️ 公开面一旦发出就是承诺：改名/删名要先想清楚下游（当前只有 `oauth21` 一个消费者，
 *    所以现在改是免费的，见立项文档 §八）。
 *
 * @author yijiu2025
 */

export {
  THEME_ID_RE,
  DEFAULT_THEME_ID,
  DEFAULT_THEME_PACKAGE,
  THEME_DEVICES,
  DEFAULT_THEME_DEVICE,
  DEFAULT_THEME_PAGE,
  DEFAULT_THEME_COLOR,
  DEFAULT_THEME_DARK_COLOR,
  BASE_VIEW_ID
} from './constants';
export type { ThemeDevice } from './constants';

export { THEME_TONES, TONE_LABELS, isThemeTone, normalizeTone } from './tone';
export type { ThemeTone } from './tone';

export { MODE_CYCLE, MODE_LABELS, isThemeMode, normalizeMode } from './mode';
export type { ThemeMode } from './mode';

export {
  isSafeTokenName,
  isSafeTokenValue,
  isSafeTokenEntry,
  sanitizeOverrides
} from './tokens';
export type { ThemeTokenOverrides, SanitizeResult, ThemeTokenLayers } from './tokens';

export type {
  MauthThemeMeta,
  MauthThemePackage,
  MauthThemeColor,
  MauthThemeRecord
} from './types';

export { asThemeDevice, readDeviceParam } from './views/params';
export type { DeviceScopedParam } from './views/params';
