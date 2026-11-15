/**
 * 极光 · 极光白（white） —— **本配色专属色值表**（可整份单独调）
 *
 * 每份配色一份表：改这里只影响「这个包 × 这个明暗」，不会牵动别的配色。
 * 分两段：
 *   · **基础层**（底色 / 文字四档 / 语义色 / 描边 / 圆角）—— 全局骨架；
 *   · **组件层**（`--mauth-nav-*` / `--mauth-panel-bg` / `--mauth-tag-*` …）——
 *     想只改侧栏、只改标签、只改弹窗底色，动这里，别去动基础层。
 *
 * 极光目前**从珍珠白起步**（同值），要分家就只改这一份：侧栏 `--mauth-nav-bg`、
 *   标签 `--mauth-tag-*`、面板 `--mauth-panel-bg` 都是独立项，改哪项就只影响哪项。
 *
 * 🔴 值只能是单值（hex / rgb(a) / hsl(a) / px / % / var(--mauth-*) / 少数关键字）——
 *    skinsuite 注入前有白名单校验，渐变、阴影、字体栈这类复合值放不进 token。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */

const tokens = {
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
  /* 大面积浅底（卡面渐变、图表填充）用的**饱和版**主色：默认与主色同值，
     只有绿色主题会把它换成更鲜的青柠（见 theme/accent.ts 的说明） */
  '--mauth-tint': '#236de9',
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
  '--mauth-cat-5-ink': '#2d7140',

  /* ── 组件层：单独控制用这一组 ───────────────────────────────── */
  '--mauth-nav-bg': 'rgba(255, 255, 255, 0.72)',
  '--mauth-nav-ink': '#596368',
  '--mauth-nav-active-bg': 'rgba(35, 109, 233, 0.1)',
  '--mauth-topbar-bg': 'rgba(246, 248, 247, 0.88)',
  '--mauth-panel-bg': '#ffffff',
  '--mauth-table-head-bg': '#fbfcfc',
  '--mauth-table-row-hover': 'rgba(46, 58, 62, 0.045)',
  '--mauth-btn-bg': '#ffffff',
  '--mauth-input-bg': '#ffffff',
  '--mauth-modal-bg': '#ffffff',
  '--mauth-tabbar-bg': '#fbfcfc',
  '--mauth-tab-active-bg': '#ffffff',
  '--mauth-tag-bg': 'rgba(46, 58, 62, 0.045)',
  '--mauth-tag-ink': '#596368',
  '--mauth-tag-ok-bg': 'rgba(88, 160, 33, 0.12)',
  '--mauth-tag-ok-ink': '#58a021',
  '--mauth-tag-off-bg': 'rgba(224, 68, 59, 0.11)',
  '--mauth-tag-off-ink': '#e0443b',
  '--mauth-tag-info-bg': 'rgba(35, 109, 233, 0.1)',
  '--mauth-tag-info-ink': '#236de9',
};

export default tokens;
