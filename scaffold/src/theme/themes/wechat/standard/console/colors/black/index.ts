/**
 * 微信 · 夜间（black） —— 桌面端 / 后台壳
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import type { MauthThemeColor } from 'skinsuite';
import { WECHAT_DARK_TOKENS } from '@/theme/palette-wechat';

export default {
  meta: {
    id: 'black',
    name: '微信夜间',
    description: '纯黑底 + 深灰块，绿保持品牌色',
    author: 'console'
  },
  tone: 'dark',
  tokens: { ...WECHAT_DARK_TOKENS }
} satisfies MauthThemeColor;
