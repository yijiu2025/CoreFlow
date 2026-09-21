/**
 * 海蓝主题
 *
 * === 迁移说明 ===
 * 本主题原先以两个静态 CSS 块的形式硬编码在 `mobile-auth.scss` 里
 * （`html[data-mauth-skin='ocean']` 与 `html.dark[data-mauth-skin='ocean']`）。
 * 现在搬到主题包里由运行时注入，值逐条照搬，**渲染结果与迁移前一致**。
 *
 * 这么做的意义：加/删主题不再需要改共享样式表。共享样式表一旦被主题改动，
 * 每个主题都会在里面留下自己的痕迹，最后没人敢删。
 *
 * === tokens 两档的语义 ===
 *   light —— 浅色生效，深色下**也生效**（打底）
 *   dark  —— 仅深色追加覆盖
 * 所以 `--mauth-radius` 只写在 light 里：圆角不分品牌明暗，深色下沿用 16px。
 * 而颜色类 token 必须成对给：深色下主色要提亮，否则在深底上发闷。
 *
 * @author yijiu2025
 */
import type { MauthThemePackage } from '../types';

export default {
  meta: {
    id: 'ocean',
    name: '海蓝',
    description: '青色品牌主色 + 更大圆角，logo 带描边，底部有波浪背景',
    preview: { primary: '#0e7490', accent: '#0891b2' },
    author: 'oauth21'
  },
  tokens: {
    light: {
      '--mauth-primary': '#0e7490',
      '--mauth-primary-fg': '#fff',
      '--mauth-accent': '#0891b2',
      '--mauth-emphasis-fg': '#0e7490',
      '--mauth-radius': '16px',
      /* 品牌字体栈：主题只给字体名，字体文件（若有）走 theme.scss 的 @font-face */
      '--mauth-font-family': "'Avenir Next', 'PingFang SC', system-ui, sans-serif",
      /* 边框类：logo 描边宽度是独立 token，改它不会波及输入框 */
      '--mauth-logo-border-width': '2px',
      '--mauth-logo-border': '#0891b2'
    },
    dark: {
      '--mauth-primary': '#67e8f9',
      '--mauth-primary-fg': '#083344',
      '--mauth-accent': '#22d3ee',
      '--mauth-emphasis-fg': '#a5f3fc',
      '--mauth-logo-border': '#22d3ee'
    }
  }
} satisfies MauthThemePackage;
