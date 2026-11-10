/**
 * 聚光 · 珍珠白 —— 手机端 / 登录页（浅色）
 *
 * 本包只换版式，色值仍取 `@/theme/palette.ts` 的单一来源：这样"换版式"与
 * "换配色"彼此正交，不会出现某个包偷偷改了主色。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import type { MauthThemeColor } from 'skinsuite';
import { LIGHT_TOKENS } from '@/theme/palette';

export default {
  meta: {
    id: 'white',
    name: '珍珠白',
    description: '浅色：柔和灰白底 + 白表面，蓝色作主操作',
    author: 'console'
  },
  tone: 'light',
  tokens: { ...LIGHT_TOKENS }
} satisfies MauthThemeColor;
