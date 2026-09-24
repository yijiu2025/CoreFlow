/**
 * 海蓝配色 —— 属于 `themes/default/` 主题包
 *
 * === 它在三级结构里的位置 ===
 * `themes/default/mobile/colors/ocean/` 是**配色**：只换颜色 / 圆角 / 背景图，**不动 DOM**。
 * 它的上位 `themes/default/` 才是**主题包**（一套完整设计），本目录同级的 `mobile/`
 * 是这套设计在**移动端**的版式（见 `theme/views/registry.ts` 的「版式跟随主题包」）。
 * 配色 id 以**目录名**为准（`ocean`），URL `?theme=ocean` 用的就是它；
 * 想加一套新配色 = 建一个同级目录，不用改任何其它文件。
 *
 * ⚠️ 配色 id **全局唯一**（跨包、跨设备）。电脑端若也要海蓝，不能同样叫 `ocean`，
 *    要另起名（如 `web-ocean`）—— 否则后加载的那套会被判重名而忽略。
 *
 * === 迁移说明 ===
 * 本主题原先以两个静态 CSS 块的形式硬编码在 `mobile-auth.scss` 里
 * （`html[data-mauth-skin='ocean']` 与 `html.dark[data-mauth-skin='ocean']`）。
 * 现在搬到配色目录里由运行时注入，值逐条照搬，**渲染结果与迁移前一致**。
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
 * ⚠️ 明暗由 `theme/mode.ts` 管（浅色 / 深色 / 跟随系统），**不要**为它另开配色目录：
 *    那会让同一个效果有两个入口。配色只管"品牌色系"，明暗是用户偏好，两者正交。
 *
 * @author yijiu2025
 */
import type { MauthThemeColor } from '@/theme/types';

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
} satisfies MauthThemeColor;
