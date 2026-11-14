/**
 * 微信 · 白天（white） —— 桌面端 / 登录页
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
    description: '灰底白块 + 绿色主操作',
    author: 'login'
  },
  tone: 'light',
  tokens: { ...WECHAT_LIGHT_TOKENS }
} satisfies MauthThemeColor;
