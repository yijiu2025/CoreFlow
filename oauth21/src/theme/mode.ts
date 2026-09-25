/**
 * 明暗意图（mode）的取值、循环顺序与展示文案
 *
 * 🔴 明暗 ≡ 色系（2026-09-25 定）：「明暗切换就是切换白色和黑色这个色系，不是另一套规则」。
 *   mode 不是独立于配色的第二个维度，而是「切到哪一系别」的意图：
 *     light  —— 明 = 白系
 *     dark   —— 暗 = 黑系
 *     system —— 跟随系统偏好（系统暗→黑系、亮→白系）
 *   最终明暗由**当前配色的 tone** 决定（见 `stores/theme.ts` 的 `isDark`）。
 *   点色卡同步 mode（点黑卡=dark、点白卡=light），切 mode 联动配色 —— 永远一致。
 *
 * @author yijiu2025
 */

/** 明暗三态：'system' 显式跟随系统（旧版只有布尔值，切过就回不来） */
export type ThemeMode = 'system' | 'light' | 'dark';

/** 切换按钮的循环顺序：跟随系统 → 浅色 → 深色 → 跟随系统 */
export const MODE_CYCLE: readonly ThemeMode[] = ['system', 'light', 'dark'];

/** 界面与无障碍标签用的中文文案（明=白系 / 暗=黑系 / 跟随系统） */
export const MODE_LABELS: Record<ThemeMode, string> = {
  system: '跟随系统',
  light: '明',
  dark: '暗'
};

/** 是否是合法的明暗取值（用于校验 URL 参数、后端下发这类不可信输入） */
export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** 归一化外部输入：大小写与首尾空白容忍，非法返回 null（由调用方决定回退） */
export function normalizeMode(raw: unknown): ThemeMode | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  return isThemeMode(v) ? v : null;
}
