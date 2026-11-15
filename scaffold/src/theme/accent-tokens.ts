/**
 * 主色派生令牌 —— **唯一来源**
 *
 * === 为什么需要这个文件 ===
 * 主色不是一个变量，而是一组。除了名字里带 primary 的那几个，还有两个
 * **换了用法的主色**，光看名字看不出来：
 *
 * | 令牌 | 真实身份 |
 * | --- | --- |
 * | `--mauth-nav-active-bg` | 主色 10% 浅底（侧栏选中行） |
 * | `--mauth-tag-info-bg`   | 主色 10% 浅底（信息徽标：「页面」「管理后台」） |
 * | `--mauth-tag-info-ink`  | 主色本身（信息徽标的字） |
 *
 * 它们以前只写在配色表里（每套配色抄一遍主色值），而"换主色"是运行期的 inline
 * 覆盖层 —— 只覆盖了 5 个带 primary 的变量。结果就是：**主色选了琥珀，按钮变琥珀了，
 * 徽标和侧栏选中底还是配色表里的蓝**（2026-11-15 用户截图反馈）。
 *
 * 所以派生关系必须集中在"写主色"的那一刻算，而不是散在 CSS 或配色表里靠人抄。
 * 配色表仍然定义这 9 个键（构建期的静态值，缺了任何一份配色首屏都会闪），
 * 但**运行期谁改主色，谁就把这 9 个一起改**。
 *
 * === 为什么是独立叶子文件 ===
 * 三处消费者都要用：`theme/accent.ts`（写主色）、`stores/accent.ts`（跟随配色时回写）、
 * `theme/overrides.ts`（用户取消自定义覆盖时要知道"这一项的真值是谁写的"）。
 * 其中 `overrides.ts` 会被 `scripts/check-color.mjs` 用 Node 直接加载，Node 的类型剥离
 * 不支持无扩展名相对导入 —— 所以本文件**不 import 任何东西**，避免把这条链拖进浏览器模块。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */

/** 一个预设色里与本模块相关的那几项（`AccentPreset` 结构上满足它） */
export interface PrimaryLike {
  primary: string;
  hover: string;
  soft: string;
  tint: string;
  focus: string;
  /** 落在主色上的文字色；预设留空（由配色表给），自定义色必填 */
  onPrimary?: string;
}

/** 令牌名 → CSS 值 */
export type AccentVars = Record<string, string>;

/**
 * 主色组包含的全部令牌
 *
 * 这份清单是给**关卡**用的（`scripts/check-accent-tokens.mjs` 拿它对配色表做反查：
 * 凡是值与主色/主色浅底相同的令牌，都必须在这个组里，否则换主色时它不会跟着变）。
 * 写入逻辑本身仍以 `accentVarsOf()` 为准 —— 它才是"值从哪来"的答案。
 */
export const ACCENT_TOKEN_KEYS = [
  '--mauth-primary',
  '--mauth-primary-hover',
  '--mauth-primary-soft',
  '--mauth-tint',
  '--mauth-focus',
  '--mauth-on-primary',
  '--mauth-nav-active-bg',
  '--mauth-tag-info-bg',
  '--mauth-tag-info-ink'
] as const;

/**
 * 当前**生效中**的主色组
 *
 * 只用于一件事：用户自定义覆盖了某个主色派生令牌后又取消覆盖，得知道该写回什么。
 * 写配色表的基值是错的 —— 那会把主色退回配色自带色，用户看到的是"取消自定义后颜色变了"。
 */
let effective: AccentVars = {};

/**
 * 由一个预设色算出整组派生值
 *
 * @param preset 预设色（含 primary / hover / soft / tint / focus）
 * @returns 令牌名 → 值（未提供 `onPrimary` 时不写该项，交给配色表）
 */
export function accentVarsOf(preset: PrimaryLike): AccentVars {
  const vars: AccentVars = {
    '--mauth-primary': preset.primary,
    '--mauth-primary-hover': preset.hover,
    '--mauth-primary-soft': preset.soft,
    '--mauth-tint': preset.tint,
    '--mauth-focus': preset.focus,
    /* 浅底两处：侧栏选中行与信息徽标，视觉权重与 primary-soft 完全一致 */
    '--mauth-nav-active-bg': preset.soft,
    '--mauth-tag-info-bg': preset.soft,
    /* 徽标字直接用主色本身：白底下它就是"主色系的小字" */
    '--mauth-tag-info-ink': preset.primary
  };
  /*
   * 自定义色要把"主色上的文字色"一起写：主色被提亮到 `#ffe066` 时白字只有 1.3:1，
   * 实心按钮会看不清。预设不写这一项 —— 它们由配色表给（都是手调过的配对）。
   */
  if (preset.onPrimary) vars['--mauth-on-primary'] = preset.onPrimary;
  return vars;
}

/**
 * 把整组主色写到根元素，并记下来
 *
 * @param vars 令牌名 → 值
 */
export function writeAccentVars(vars: AccentVars): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
  effective = { ...effective, ...vars };
}

/**
 * 「跟随配色」时从配色记录整组回写
 *
 * 主题层刚把 token 整批重写过，此时读到的就是这套配色的真值 —— 照抄即可，
 * 只是把派生关系补上（配色表里那三个键缺失时用主色现算）。
 *
 * @param tokens 配色记录（`themeRecordFor().tokens`）
 * @returns 记录未就绪返回 false（调用方据此不做任何事）
 */
export function restoreAccentVars(tokens: Record<string, string | undefined>): boolean {
  const primary = tokens['--mauth-primary'];
  /*
   * 拿不到记录就**什么都不做**（不能退回内置默认色）：启动早期 `activePage` 还是空串，
   * 此时记录是空的；退回默认色会把"跟随配色"变成"海蓝"，而且之后没人再纠正它。
   */
  if (!primary) return false;
  const soft = tokens['--mauth-primary-soft'] ?? primary;
  writeAccentVars({
    '--mauth-primary': primary,
    '--mauth-primary-hover': tokens['--mauth-primary-hover'] ?? primary,
    '--mauth-primary-soft': soft,
    '--mauth-tint': tokens['--mauth-tint'] ?? primary,
    '--mauth-focus': tokens['--mauth-focus'] ?? primary,
    '--mauth-on-primary': tokens['--mauth-on-primary'] ?? '#fff',
    '--mauth-nav-active-bg': tokens['--mauth-nav-active-bg'] ?? soft,
    '--mauth-tag-info-bg': tokens['--mauth-tag-info-bg'] ?? soft,
    '--mauth-tag-info-ink': tokens['--mauth-tag-info-ink'] ?? primary
  });
  return true;
}

/**
 * 查一个令牌当前生效的主色值
 *
 * @param key 令牌名
 * @returns 主色层没写过它时返回 `undefined`（调用方应回落到配色记录）
 */
export function accentVarOf(key: string): string | undefined {
  return effective[key];
}

/**
 * 是否为"由主色派生"的令牌
 *
 * 给覆盖层判断"这一项的真值出自哪一层"用：它不属于主色组时应当回写配色基值。
 *
 * @param key 令牌名
 * @returns 属于主色组返回 true
 */
export function isAccentOwned(key: string): boolean {
  return key in effective;
}
