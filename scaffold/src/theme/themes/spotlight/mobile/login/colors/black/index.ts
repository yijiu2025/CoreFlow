/**
 * 极光 · 极光夜（black） —— 手机端 / 登录页
 *
 * 路径 `themes/spotlight/mobile/login/colors/black/` 是**配色**：只换颜色 / 圆角，不动 DOM。
 *
 * 🔴 色值表在 `@/theme/palettes/spotlight-black.ts` —— **每个包 × 每个明暗各一份**，
 *    改那份只影响这一种配色；组件级 token（侧栏 / 面板 / 标签…）就在同一份表里。
 *    设备尺度（手机端圆角）另在 `@/theme/palettes/device.ts`，与颜色无关。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import type { MauthThemeColor } from 'skinsuite';
import SPOTLIGHT_BLACK_TOKENS from '@/theme/palettes/spotlight-black';
import { MOBILE_TOKENS } from '@/theme/palettes/device';

export default {
  meta: {
    id: 'black',
    name: '极光夜',
    description: '深色：极光版式，沿用石墨夜的底色起点（可单独调）',
    author: 'console'
  },
  tone: 'dark',
  tokens: { ...SPOTLIGHT_BLACK_TOKENS, ...MOBILE_TOKENS }
} satisfies MauthThemeColor;
