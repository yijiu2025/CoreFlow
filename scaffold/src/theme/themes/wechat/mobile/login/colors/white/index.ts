/**
 * 微信 · 白天（white） —— 手机端 / 登录页
 *
 * 登录页**没有本包版式**（回退 default 的登录卡），只有配色跟着换 ——
 * 但必须存在：`?th=wechat` 同样作用于登录页，缺了就是"登录页无样式"。
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
    description: '灰底白块 + 绿色主操作',
    author: 'login'
  },
  tone: 'light',
  tokens: { ...WECHAT_LIGHT_TOKENS, ...WECHAT_MOBILE_TOKENS }
} satisfies MauthThemeColor;
