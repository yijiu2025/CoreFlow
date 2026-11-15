/**
 * 极光 · 极光白（white） —— 桌面端 / 登录页
 *
 * 路径 `themes/spotlight/standard/login/colors/white/` 是**配色**：只换颜色 / 圆角，不动 DOM。
 *
 * 🔴 色值表在 `@/theme/palettes/spotlight-white.ts` —— **每个包 × 每个明暗各一份**，
 *    改那份只影响这一种配色；组件级 token（侧栏 / 面板 / 标签…）就在同一份表里。
 *    设备尺度（手机端圆角）另在 `@/theme/palettes/device.ts`，与颜色无关。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import type { MauthThemeColor } from 'skinsuite';
import SPOTLIGHT_WHITE_TOKENS from '@/theme/palettes/spotlight-white';

export default {
  meta: {
    id: 'white',
    name: '极光白',
    description: '浅色：极光版式，沿用珍珠的底色起点（可单独调）',
    author: 'console'
  },
  tone: 'light',
  tokens: { ...SPOTLIGHT_WHITE_TOKENS }
} satisfies MauthThemeColor;
