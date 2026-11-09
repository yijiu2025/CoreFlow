/**
 * 珍珠玻璃 · 珍珠白（white） —— 手机端 / 后台壳（侧栏 / 顶栏 / 内容区）
 *
 * 路径 `themes/default/mobile/console/colors/white/` 是**配色**：
 * 只换颜色 / 圆角，不动 DOM。tokens 是扁平值、不分明暗档 ——
 * 深浅就是 white / black 两个具名配色，各写各的。
 *
 * 🔴 色值单一来源在 `@/theme/palette.ts`（8 个壳文件只声明 meta/tone 并展开它）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import type { MauthThemeColor } from 'skinsuite';
import { LIGHT_TOKENS } from '@/theme/palette';

export default {
  meta: {
    id: 'white',
    name: '珍珠白',
    description: '浅色：柔和灰白底 + 白表面，蓝色作主操作',
    author: 'console'
  },
  tone: 'light',
  tokens: { ...LIGHT_TOKENS }
} satisfies MauthThemeColor;
