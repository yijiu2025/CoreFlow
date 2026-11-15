/**
 * 珍珠玻璃 · 珍珠白（white） —— 手机端 / 后台壳（侧栏 / 顶栏 / 内容区）
 *
 * 路径 `themes/default/mobile/console/colors/white/` 是**配色**：只换颜色 / 圆角，不动 DOM。
 *
 * 🔴 色值表在 `@/theme/palettes/pearl-white.ts` —— **每个包 × 每个明暗各一份**，
 *    改那份只影响这一种配色；组件级 token（侧栏 / 面板 / 标签…）就在同一份表里。
 *    设备尺度（手机端圆角）另在 `@/theme/palettes/device.ts`，与颜色无关。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import type { MauthThemeColor } from 'skinsuite';
import PEARL_WHITE_TOKENS from '@/theme/palettes/pearl-white';
import { MOBILE_TOKENS } from '@/theme/palettes/device';

export default {
  meta: {
    id: 'white',
    name: '珍珠白',
    description: '浅色：柔和灰白底 + 白表面，蓝色作主操作',
    author: 'console'
  },
  tone: 'light',
  tokens: { ...PEARL_WHITE_TOKENS, ...MOBILE_TOKENS }
} satisfies MauthThemeColor;
