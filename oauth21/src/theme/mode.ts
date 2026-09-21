/**
 * 明暗模式（mode）的取值、循环顺序与展示文案
 *
 * 与「主题（theme）」是两个正交维度：
 *   mode  —— 用户自己的偏好，可在界面上切换（三态，含「跟随系统」）
 *   theme —— 部署方/后端决定的品牌外观，用户通常改不动
 * 两者组合出 `主题数 × 2` 种外观，互不干扰。
 *
 * @author yijiu2025
 */

/** 明暗三态：'system' 显式跟随系统（旧版只有布尔值，切过就回不来） */
export type ThemeMode = 'system' | 'light' | 'dark';

/** 切换按钮的循环顺序：跟随系统 → 浅色 → 深色 → 跟随系统 */
export const MODE_CYCLE: readonly ThemeMode[] = ['system', 'light', 'dark'];

/** 界面与无障碍标签用的中文文案 */
export const MODE_LABELS: Record<ThemeMode, string> = {
  system: '跟随系统',
  light: '浅色',
  dark: '深色'
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
