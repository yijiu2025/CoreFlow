/**
 * 聚光 · 石墨夜 —— 桌面端 / 登录页（深色）
 *
 * 本包只换版式，色值仍取 `@/theme/palette.ts` 的单一来源：这样"换版式"与
 * "换配色"彼此正交，不会出现某个包偷偷改了主色。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import type { MauthThemeColor } from 'skinsuite';
import { DARK_TOKENS } from '@/theme/palette';

export default {
  meta: {
    id: 'black',
    name: '石墨夜',
    description: '深色：近黑画布 + 石墨表面，蓝色提亮作主操作',
    author: 'console'
  },
  tone: 'dark',
  tokens: { ...DARK_TOKENS }
} satisfies MauthThemeColor;
