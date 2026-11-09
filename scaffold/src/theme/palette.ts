/**
 * 珍珠玻璃配色表（**纯数据**，供主题包的「配色目录」引用）
 *
 * 为什么单独放这里：`themes/<包>/<设备>/<页面>/colors/<配色>/index.ts` 需要按
 * 「设备 × 页面」重复 8 份壳文件，但**色值只应有一份**。把这些 token 抽到一处，
 * 壳文件只声明 meta/tone 并展开本表 —— 改一次色值，全设备全页面同时生效。
 *
 * 🔴 token 名必须是 `--mauth-` 前缀：skinsuite 运行期注入会做白名单校验
 *    （名字 `^--mauth-[a-z0-9-]{1,64}$`，值只接受 hex / rgb(a) / hsl(a) / px / % /
 *    em / var(--mauth-*) / 少数关键字）。**阴影、字体栈这类复合值不能进 token** ——
 *    它们在 `assets/styles/*.css` 里直接写（构建期受信），不要试图塞进来。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */

/** 浅色（珍珠白） */
export const LIGHT_TOKENS = {
  /* 场景与表面 */
  '--mauth-bg': '#f6f8f7',
  '--mauth-surface': '#ffffff',
  '--mauth-surface-2': '#fbfcfc',
  '--mauth-hover': 'rgba(46, 58, 62, 0.045)',
  '--mauth-press': 'rgba(46, 58, 62, 0.075)',
  '--mauth-overlay': 'rgba(16, 20, 24, 0.28)',
  '--mauth-plate-bg': 'rgba(21, 24, 26, 0.9)',
  '--mauth-plate-ink': '#f2f5f4',

  /* 文字四档 */
  '--mauth-text': '#101418',
  '--mauth-text-mid': '#596368',
  '--mauth-text-soft': '#7e888c',
  '--mauth-text-faint': '#99a2a5',

  /* 语义色 */
  '--mauth-primary': '#236de9',
  '--mauth-primary-hover': '#1d61d5',
  '--mauth-primary-soft': 'rgba(35, 109, 233, 0.1)',
  '--mauth-success': '#58a021',
  '--mauth-success-soft': 'rgba(88, 160, 33, 0.12)',
  '--mauth-danger': '#e0443b',
  '--mauth-danger-soft': 'rgba(224, 68, 59, 0.11)',
  '--mauth-focus': 'rgba(35, 109, 233, 0.8)',

  /* 描边 */
  '--mauth-border': 'rgba(46, 58, 62, 0.09)',
  '--mauth-border-strong': 'rgba(46, 58, 62, 0.13)',

  /* 圆角与排版 */
  '--mauth-radius-xs': '8px',
  '--mauth-radius-sm': '12px',
  '--mauth-radius-md': '16px',
  '--mauth-radius-lg': '20px',
  '--mauth-radius-xl': '24px',
  '--mauth-fs-display-m': '24px',
  '--mauth-track-eyebrow': '0.14em',

  /* 分类色（只区分类别，不表示状态） */
  '--mauth-cat-1-bg': '#f6e7c4',
  '--mauth-cat-1-ink': '#7a5a16',
  '--mauth-cat-2-bg': '#d7e7fb',
  '--mauth-cat-2-ink': '#275a96',
  '--mauth-cat-3-bg': '#e4dcf7',
  '--mauth-cat-3-ink': '#5b4597',
  '--mauth-cat-4-bg': '#f7dce1',
  '--mauth-cat-4-ink': '#94384c',
  '--mauth-cat-5-bg': '#d8f0dc',
  '--mauth-cat-5-ink': '#2d7140'
} as const;

/** 深色（石墨夜） */
export const DARK_TOKENS = {
  '--mauth-bg': '#0f1214',
  '--mauth-surface': '#161a1d',
  '--mauth-surface-2': '#1b2024',
  '--mauth-hover': 'rgba(255, 255, 255, 0.06)',
  '--mauth-press': 'rgba(255, 255, 255, 0.1)',
  '--mauth-overlay': 'rgba(0, 0, 0, 0.6)',
  '--mauth-plate-bg': 'rgba(21, 24, 26, 0.9)',
  '--mauth-plate-ink': '#f2f5f4',

  '--mauth-text': '#eef2f1',
  '--mauth-text-mid': '#a8b3b1',
  '--mauth-text-soft': '#8b9795',
  '--mauth-text-faint': '#6f7b79',

  '--mauth-primary': '#6ea8ff',
  '--mauth-primary-hover': '#8bbaff',
  '--mauth-primary-soft': 'rgba(110, 168, 255, 0.16)',
  '--mauth-success': '#8fd45a',
  '--mauth-success-soft': 'rgba(143, 212, 90, 0.16)',
  '--mauth-danger': '#ff7a70',
  '--mauth-danger-soft': 'rgba(255, 122, 112, 0.16)',
  '--mauth-focus': 'rgba(110, 168, 255, 0.85)',

  '--mauth-border': 'rgba(255, 255, 255, 0.1)',
  '--mauth-border-strong': 'rgba(255, 255, 255, 0.16)',

  '--mauth-radius-xs': '8px',
  '--mauth-radius-sm': '12px',
  '--mauth-radius-md': '16px',
  '--mauth-radius-lg': '20px',
  '--mauth-radius-xl': '24px',
  '--mauth-fs-display-m': '24px',
  '--mauth-track-eyebrow': '0.14em',

  '--mauth-cat-1-bg': 'rgba(246, 231, 196, 0.16)',
  '--mauth-cat-1-ink': '#e6cf94',
  '--mauth-cat-2-bg': 'rgba(215, 231, 251, 0.16)',
  '--mauth-cat-2-ink': '#a8caf5',
  '--mauth-cat-3-bg': 'rgba(228, 220, 247, 0.16)',
  '--mauth-cat-3-ink': '#c6b6ee',
  '--mauth-cat-4-bg': 'rgba(247, 220, 225, 0.16)',
  '--mauth-cat-4-ink': '#efb3bf',
  '--mauth-cat-5-bg': 'rgba(216, 240, 220, 0.16)',
  '--mauth-cat-5-ink': '#a9ddb6'
} as const;
