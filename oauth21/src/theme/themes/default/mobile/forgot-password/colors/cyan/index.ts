/**
 * 「青」单色配色（cyan）—— 某个主题包下的一套单色
 *
 * === 它在「一个主题包 = 一种版式」里的位置 ===
 * `themes/<包>/<设备>/<页面>/colors/<颜色>/` 是**配色**：
 * 只换颜色 / 圆角 / 背景图，**不动 DOM**（DOM 由同包同设备同页的版式决定）。
 * 本套 青 色原先叫 ocean（海蓝），为了与「一套配色一个色名」的单色模型对齐而改名。
 *
 * 🔴 配色**只挂在页面下**，永远不挂在版式下（2026-09-26 定案）：
 *    要另一种版式就**新建一个主题包**（如 `themes/compact/`），
 *    所以配色路径里没有 `<版式>` 这一层。注册表里配色记录的 view **恒等于包名**。
 *    配色 id 的唯一性作用域是「同包同设备同页」；跨包、跨页、跨设备都可以同名。
 *
 * === tokens 是一组**扁平值**，不分明暗档（2026-09-25 改）===
 * 每套配色**自带完整底色**，选谁就是谁 —— 与当前明暗偏好无关。
 * 需要「深色版品牌色」？**另加一个颜色目录**（如 `navy`），不要把深浅两档塞回 token 里。
 * 明暗（`theme/mode.ts`）仍存在，但只在基线 SCSS 那层生效，与配色彻底正交。
 *
 * === 装饰（theme.scss + assets/）===
 * token 表达不了的（背景图 / 伪元素 / 结构级差异）在同目录的 `theme.scss` 里，
 * 选择器一律带 `html[data-mauth-theme='cyan']` 前缀 —— 切走配色后 DOM 属性消失，
 * 规则自动失效，不需要运行时卸载样式表，也不会污染别的配色。
 *
 * @author yijiu2025
 */
import type { MauthThemeColor } from '@/theme/types';

export default {
  meta: {
    id: 'cyan',
    name: '青',
    description: '青色品牌主色 + 更大圆角，logo 带描边，底部有波浪背景',
    preview: { primary: '#0e7490', accent: '#0891b2' },
    author: 'oauth21'
  },
  tone: 'light',
  tokens: {
    '--mauth-primary': '#0e7490',
    '--mauth-primary-fg': '#fff',
    '--mauth-accent': '#0891b2',
    '--mauth-emphasis-fg': '#0e7490',
    /* 品牌字体栈：主题只给字体名，字体文件（若有）走 theme.scss 的 @font-face */
    '--mauth-font-family': "'Avenir Next', 'PingFang SC', system-ui, sans-serif",
    /* 边框类：logo 描边宽度是独立 token，改它不会波及输入框 */
    '--mauth-logo-border-width': '2px',
    '--mauth-logo-border': '#0891b2'
  }
} satisfies MauthThemeColor;
