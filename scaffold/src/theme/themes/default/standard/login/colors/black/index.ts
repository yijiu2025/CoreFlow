/**
 * 珍珠玻璃 · 石墨夜（black） —— 桌面端 / 登录页（iframe SSO）
 *
 * 路径 `themes/default/standard/login/colors/black/` 是**配色**：
 * 只换颜色 / 圆角，不动 DOM。tokens 是扁平值、不分明暗档 ——
 * 深浅就是 white / black 两个具名配色，各写各的。
 *
 * 🔴 色值单一来源在 `@/theme/palette.ts`（8 个壳文件只声明 meta/tone 并展开它）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import type { MauthThemeColor } from 'skinsuite';
import { DARK_TOKENS } from '@/theme/palette';

export default {
  meta: {
    id: 'black',
    name: '石墨夜',
    description: '深色：近黑画布 + 石墨表面，蓝色提亮作主操作',
    author: 'console'
  },
  tone: 'dark',
  tokens: { ...DARK_TOKENS }
} satisfies MauthThemeColor;
