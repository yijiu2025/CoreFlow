/**
 * 「蓝」单色配色（blue）—— 挂在**版式**下的一套单色
 *
 * === 它在四级结构里的位置 ===
 * `themes/default/<设备>/<页面>/[<版式>/]colors/blue/` 是**配色**：
 * 只换颜色 / 圆角 / 背景图，**不动 DOM**（DOM 由同级的版式决定）。
 * 本套 蓝 色原先叫 sky（天青），为了与「一个版式有几种颜色」的单色模型对齐而改名。
 *
 * 🔴 配色自 2026-09-24 起挂在**版式**下，而不是设备下：
 *    「一个版式有几种颜色」—— 同一个页面的基础版式与紧凑版式各自可以有不同的可选颜色，
 *    所以颜色目录落在 `<页面>/[<版式>/]colors/<颜色>/`。基础版式的目录少一层
 *    （`<页面>/colors/<颜色>/`），注册表里统一记作 view = `base`。
 *    配色 id 的唯一性作用域是「同包同设备同页同版式」—— 所以同名颜色（如本目录的
 *    `blue`）在基础版式与变体下各有一份，是**正常且必要**的。
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
    /* 形状：字段 10px 圆角；主按钮改胶囊（参考稿两屏都是胶囊按钮） */
    '--mauth-radius': '12px',
    '--mauth-field-radius': '10px',
    '--mauth-submit-radius': '999px',
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
