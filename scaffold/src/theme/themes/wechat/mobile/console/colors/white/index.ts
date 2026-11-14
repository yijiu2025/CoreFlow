/**
 * 微信 · 白天（white） —— 手机端 / 后台壳
 *
 * 色值单一来源 `@/theme/palette-wechat.ts`：8 个壳文件只声明 meta/tone 并展开它。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import type { MauthThemeColor } from 'skinsuite';
import { WECHAT_LIGHT_TOKENS, WECHAT_MOBILE_TOKENS } from '@/theme/palette-wechat';

export default {
  meta: {
    id: 'white',
    name: '微信白天',
    description: '灰底 + 白块，绿色作主操作（手机端尺度）',
    author: 'console'
  },
  tone: 'light',
  tokens: { ...WECHAT_LIGHT_TOKENS, ...WECHAT_MOBILE_TOKENS }
} satisfies MauthThemeColor;
