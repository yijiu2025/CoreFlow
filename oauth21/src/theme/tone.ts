/**
 * 配色的「明暗系别」（tone）
 *
 * 与 `mode`（明暗偏好）是两个不同的维度，本模块负责把它们**关联起来做联动**：
 *   • tone —— 一套配色**自带**的属性：它的底是浅色还是深色
 *       'light' 白系：浅底深字（white / blue / cyan / rainbow）
 *       'dark'  黑系：深底浅字（black）
 *   • mode —— 用户的明暗偏好（'system' | 'light' | 'dark'，见 ./mode）
 *
 * === 联动规则（用户 2026-09-25 定）===
 *   切换夜间模式时，自动切到**目标系别**的配色；两侧各自记住上一次的选择，
 *   切回来即恢复。例如：白天用 blue，开夜间 → 自动变 black，关夜间 → 回到 blue。
 *   实现见 `stores/theme.ts` 的「双侧记忆槽」。
 *
 * ⚠️ 它**不是 CSS 的一部分**：不是 token，不会写成 `--mauth-*` 变量，
 *    也不参与渲染。唯一用途是让 store 判断"当前配色与目标明暗是否一致"。
 *
 * ⚠️ 与 tokens 的分档无关：自 2026-09-25 起 `tokens` 是一组扁平值，
 *    一套配色内部不再分深浅两档 —— tone 描述的是**配色之间**的关系，
 *    不是"一套配色内部的明暗两档"。别再把它理解成旧版的 `light`/`dark` 两块。
 *
 * ⚠️ 联动**只允许单向**（明暗 → 配色）：手动点颜色**不改**明暗。
 *    反向联动会让"五色并列、用户说了算"失效（点个白底就被强制切成浅色模式）。
 *
 * @author yijiu2025
 */

/** 明暗系别：配色自带的底色深浅 */
export type ThemeTone = 'light' | 'dark';

/** 全部系别（遍历 / 校验用；顺序与界面展示一致） */
export const THEME_TONES: readonly ThemeTone[] = ['light', 'dark'];

/** 界面与日志用的中文文案 */
export const TONE_LABELS: Record<ThemeTone, string> = {
  light: '白系',
  dark: '黑系'
};

/** 是否是合法的系别取值（用于校验外部输入这一类不可信来源） */
export function isThemeTone(value: unknown): value is ThemeTone {
  return value === 'light' || value === 'dark';
}

/**
 * 归一化外部输入：容忍大小写与首尾空白，非法返回 null（由调用方决定回退）
 *
 * ⚠️ 与 `mode` 不同，这里**没有** `'system'` —— 系别是配色自带的属性，
 *    不存在"跟随系统"这回事。
 */
export function normalizeTone(raw: unknown): ThemeTone | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  return isThemeTone(v) ? v : null;
}
