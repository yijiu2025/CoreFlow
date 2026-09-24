/**
 * 「青」单色配色（cyan）—— 挂在**版式**下的一套单色
 *
 * === 它在四级结构里的位置 ===
 * `themes/default/<设备>/<页面>/[<版式>/]colors/cyan/` 是**配色**：
 * 只换颜色 / 圆角 / 背景图，**不动 DOM**（DOM 由同级的版式决定）。
 * 本套 青 色原先叫 ocean（海蓝），为了与「一个版式有几种颜色」的单色模型对齐而改名。
 *
 * 🔴 配色自 2026-09-24 起挂在**版式**下，而不是设备下：
 *    「一个版式有几种颜色」—— 同一个页面的基础版式与紧凑版式各自可以有不同的可选颜色，
 *    所以颜色目录落在 `<页面>/[<版式>/]colors/<颜色>/`。基础版式的目录少一层
 *    （`<页面>/colors/<颜色>/`），注册表里统一记作 view = `base`。
 *    配色 id 的唯一性作用域是「同包同设备同页同版式」—— 所以同名颜色（如本目录的
 *    `cyan`）在基础版式与变体下各有一份，是**正常且必要**的。
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
  tokens: {
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
  }
} satisfies MauthThemeColor;
