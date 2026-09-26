/**
 * 「蓝」单色配色（blue）—— 某个主题包下的一套单色
 *
 * === 它在「一个主题包 = 一种版式」里的位置 ===
 * `themes/<包>/<设备>/<页面>/colors/<颜色>/` 是**配色**：
 * 只换颜色 / 圆角 / 背景图，**不动 DOM**（DOM 由同包同设备同页的版式决定）。
 * 本套 蓝 色原先叫 sky（天青），为了与「一套配色一个色名」的单色模型对齐而改名。
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
 * 选择器一律带 `html[data-mauth-theme='blue']` 前缀 —— 切走配色后 DOM 属性消失，
 * 规则自动失效，不需要运行时卸载样式表，也不会污染别的配色。
 *
 * @author yijiu2025
 */
import type { MauthThemeColor } from '@/theme/types';

export default {
  meta: {
    id: 'blue',
    name: '蓝',
    description: '冷蓝渐变 + 城市天际线剪影，白底圆角字段与蓝色胶囊按钮，克制的工具风',
    preview: { primary: '#2f7fd6', accent: '#3b8fe0' },
    author: 'oauth21'
  },
  tone: 'light',
  tokens: {
    /* 品牌色：CTA / logo / 选中态 / 链接强调 */
    '--mauth-primary': '#2f7fd6',
    '--mauth-primary-fg': '#ffffff',
    '--mauth-accent': '#3b8fe0',
    '--mauth-emphasis-fg': '#2f7fd6',
    /* 表面：头部与主体交还给页面底色，让 theme.scss 的渐变透上来 */
    '--mauth-header-bg': 'transparent',
    '--mauth-body-bg': 'transparent',
    '--mauth-surface-2': '#ffffff',
    '--mauth-surface-3': '#eaf2fb',
    '--mauth-surface-press': '#dce8f5',
    /* 文字与图标：整体偏冷灰蓝。基线是纯中性灰，压在浅蓝底上会发脏 */
    '--mauth-text-body': '#40566e',
    '--mauth-text-mid': '#6b8199',
    '--mauth-text-faint': '#93a9bf',
    '--mauth-icon': '#9cb2c7',
    /* 边框：浅蓝描边代替基线中性灰 */
    '--mauth-border': '#dae7f4',
    '--mauth-border-strong': '#bcd5ea',
    '--mauth-border-focus': '#2f7fd6',
    '--mauth-focus-ring': 'rgba(47, 127, 214, 0.14)',
    '--mauth-field-bg': '#ffffff',
    '--mauth-field-bg-focus': '#ffffff',
    '--mauth-field-border': '#dae7f4',
    '--mauth-field-border-focus': '#2f7fd6',
    /* 输入框内嵌动作：参考稿是纯文字，去掉基线的竖线分隔 */
    '--mauth-code-btn-border': 'transparent',
    '--mauth-code-btn-fg': '#2f7fd6',
    /* 次要动作也走品牌蓝（基线是中性灰） */
    '--mauth-forgot-fg': '#2f7fd6',
    /* 渐变三色标：结构在 theme.scss，颜色留在这里 —— 部署方改渐变配色不必碰样式表 */
    '--mauth-sky-top': '#d8e9f8',
    '--mauth-sky-mid': '#eef6fc',
    '--mauth-sky-bot': '#ffffff',
    /* 主按钮顶部高光色，theme.scss 用它拼 180deg 竖向渐变 */
    '--mauth-submit-bg-top': '#4e96e2',
    '--mauth-font-family': "'Inter', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
  }
} satisfies MauthThemeColor;
