/**
 * 天青配色（冷蓝工具风）—— 属于 `themes/default/` 主题包
 *
 * === 它在两级结构里的位置 ===
 * `themes/default/colors/sky/` 是**配色**：只换颜色 / 圆角 / 背景图，**不动 DOM**
 * （本套的装饰走同目录的 `theme.scss` + `assets/skyline.svg`）。
 * 它的上一级 `themes/default/` 才是**主题包**（一套完整设计），版式在包根放着
 * （见 `theme/views/registry.ts` 的「版式跟随主题包」）。
 * 配色 id 以**目录名**为准（`sky`），URL `?theme=sky` 用的就是它。
 *
 * 参考稿：浅蓝渐变底 + 城市天际线剪影 + 白底圆角字段 + 蓝色胶囊主按钮。
 * 与默认配色的差别只在「配色 + 一层装饰」—— 不动 DOM、不动尺寸、不动间距节奏。
 *
 * === 两个刻意的取舍 ===
 *
 * ① `--mauth-header-bg / --mauth-body-bg` 设为 transparent
 *    基线里这两块是不透明表面（页面被切成「头部 + 主体」两张面）。
 *    本主题要的是「表单直接浮在渐变底上」，所以必须把表面交还给页面底色，
 *    否则 header / body 会把 theme.scss 里的渐变整块盖住。
 *
 * ② 不覆写任何出现在断点里的 token
 *    `--mauth-pad-*` / `--mauth-gap-*` / `--mauth-logo-size` / `--mauth-title-size` /
 *    `--mauth-field-h` / `--mauth-control-h` / `--mauth-err-h` 这几个会被 0.5 节的
 *    矮屏与横屏断点下调。主题 tokens 写在 `html` 的 inline style 上，**优先级高于
 *    媒体查询里的 :root** —— 一旦在这里写死，矮屏适配就被整体废掉（横屏会重新挤不下）。
 *    想让主题调字号/间距，得先改机制，不能靠这里加一条。
 *
 * @author yijiu2025
 */
import type { MauthThemePackage } from '@/theme/types';

export default {
  meta: {
    id: 'sky',
    name: '天青',
    description: '冷蓝渐变 + 城市天际线剪影，白底圆角字段与蓝色胶囊按钮，克制的工具风',
    preview: { primary: '#2f7fd6', accent: '#3b8fe0' },
    author: 'oauth21'
  },
  tokens: {
    light: {
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

      /* 输入框：白底 + 细描边。基线的「浅灰底 + 浅灰描边」浮在渐变上会糊成一片，
         白底才能在浅蓝背景上立起来 */
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
    },
    dark: {
      /* 深色下主色提亮：否则深底上的 #2f7fd6 发闷、对比度不足 */
      '--mauth-primary': '#5aa9f0',
      '--mauth-primary-fg': '#06213a',
      '--mauth-accent': '#7fc0f5',
      '--mauth-emphasis-fg': '#7fc0f5',

      /* 基线在深色档把 logo 改成中性灰渐变，会跳出色板；这里拉回品牌蓝。
         ⚠️ 不能写 linear-gradient() —— 取值白名单刻意不放行函数，
         只放行 hex / rgb / hsl / 长度 / var / 关键字 */
      '--mauth-logo-bg': '#2f7fd6',
      '--mauth-logo-border': '#5aa9f0',
      '--mauth-logo-border-width': '1px',

      '--mauth-surface-2': '#0f2135',
      '--mauth-surface-3': '#12263c',
      '--mauth-surface-press': '#1b3552',

      '--mauth-text-body': '#9fb4c9',
      '--mauth-text-mid': '#8aa0b8',
      '--mauth-text-faint': '#7c93ac',
      '--mauth-icon': '#6e869e',

      '--mauth-border': 'rgba(255, 255, 255, 0.12)',
      '--mauth-border-strong': 'rgba(255, 255, 255, 0.22)',
      '--mauth-border-focus': '#5aa9f0',
      '--mauth-focus-ring': 'rgba(90, 169, 240, 0.18)',

      /* 深色下字段用「白 6% 覆盖」而非纯深色：浮在半透明表面上更有层次 */
      '--mauth-field-bg': 'rgba(255, 255, 255, 0.06)',
      '--mauth-field-bg-focus': 'rgba(255, 255, 255, 0.1)',
      '--mauth-field-border': 'rgba(255, 255, 255, 0.14)',
      '--mauth-field-border-focus': '#5aa9f0',

      '--mauth-code-btn-border': 'transparent',
      '--mauth-code-btn-fg': '#7fc0f5',
      '--mauth-forgot-fg': '#7fc0f5',

      '--mauth-sky-top': '#0a1728',
      '--mauth-sky-mid': '#0e2038',
      '--mauth-sky-bot': '#020617',
      '--mauth-submit-bg-top': '#6fb4f3'
    }
  }
} satisfies MauthThemePackage;
