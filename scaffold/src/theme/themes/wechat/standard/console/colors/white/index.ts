/**
 * 微信 · 白天（white） —— 桌面端 / 后台壳
 *
 * 桌面端没有本包版式（壳回退 default），但**配色必须有**：
 * 否则在桌面宽度下 `?th=wechat` 一注入空记录，整站变成无样式。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import type { MauthThemeColor } from 'skinsuite';
import { WECHAT_LIGHT_TOKENS } from '@/theme/palette-wechat';

export default {
  meta: {
    id: 'white',
    name: '微信白天',
    description: '灰底 + 白块，绿色作主操作',
    author: 'console'
  },
  tone: 'light',
  tokens: { ...WECHAT_LIGHT_TOKENS }
} satisfies MauthThemeColor;
