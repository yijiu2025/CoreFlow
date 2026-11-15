/**
 * 微信 · 微信白天（white） —— 桌面端 / 后台壳（侧栏 / 顶栏 / 内容区）
 *
 * 路径 `themes/wechat/standard/console/colors/white/` 是**配色**：只换颜色 / 圆角，不动 DOM。
 *
 * 🔴 色值表在 `@/theme/palettes/wechat-white.ts` —— **每个包 × 每个明暗各一份**，
 *    改那份只影响这一种配色；组件级 token（侧栏 / 面板 / 标签…）就在同一份表里。
 *    设备尺度（手机端圆角）另在 `@/theme/palettes/device.ts`，与颜色无关。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import type { MauthThemeColor } from 'skinsuite';
import WECHAT_WHITE_TOKENS from '@/theme/palettes/wechat-white';

export default {
  meta: {
    id: 'white',
    name: '微信白天',
    description: '灰底 + 白块，绿色作主操作',
    author: 'console'
  },
  tone: 'light',
  tokens: { ...WECHAT_WHITE_TOKENS }
} satisfies MauthThemeColor;
