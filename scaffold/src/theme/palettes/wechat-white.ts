/**
 * 微信 · 微信白天（white） —— **本配色专属色值表**（可整份单独调）
 *
 * 每份配色一份表：改这里只影响「这个包 × 这个明暗」，不会牵动别的配色。
 * 分两段：
 *   · **基础层**（底色 / 文字四档 / 语义色 / 描边 / 圆角）—— 全局骨架；
 *   · **组件层**（`--mauth-nav-*` / `--mauth-panel-bg` / `--mauth-tag-*` …）——
 *     想只改侧栏、只改标签、只改弹窗底色，动这里，别去动基础层。
 *
 * 微信的语义色是品牌绿（`--mauth-primary` / `--mauth-success`），与珍珠的蓝不同 ——
 *   组件层默认值也跟着这套底色走，别直接照抄珍珠那份。
 *
 * 🔴 值只能是单值（hex / rgb(a) / hsl(a) / px / % / var(--mauth-*) / 少数关键字）——
 *    skinsuite 注入前有白名单校验，渐变、阴影、字体栈这类复合值放不进 token。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */

const tokens = {
  /* 场景与表面 */
  '--mauth-bg': '#ededed',
  '--mauth-surface': '#ffffff',
  '--mauth-surface-2': '#f7f7f7',
  '--mauth-hover': 'rgba(0, 0, 0, 0.04)',
  '--mauth-press': 'rgba(0, 0, 0, 0.07)',
  '--mauth-overlay': 'rgba(0, 0, 0, 0.4)',
  '--mauth-plate-bg': 'rgba(25, 25, 25, 0.9)',
  '--mauth-plate-ink': '#f2f2f2',

  /* 文字四档（微信：正文近黑、次要 #888、最弱 #b2） */
  '--mauth-text': '#191919',
  '--mauth-text-mid': '#555555',
  '--mauth-text-soft': '#888888',
  '--mauth-text-faint': '#b2b2b2',

  /* 语义色 */
  '--mauth-primary': '#0b8f45',
  '--mauth-primary-hover': '#097a3b',
  '--mauth-primary-soft': 'rgba(7, 193, 96, 0.12)',
  '--mauth-tint': '#07c160',
  '--mauth-success': '#2aa650',
  '--mauth-success-soft': 'rgba(42, 166, 80, 0.12)',
  '--mauth-danger': '#fa5151',
  '--mauth-danger-soft': 'rgba(250, 81, 81, 0.12)',
  '--mauth-focus': 'rgba(7, 193, 96, 0.7)',

  /* 描边（发丝线：微信的分隔线比珍珠玻璃淡一半） */
  '--mauth-border': 'rgba(0, 0, 0, 0.08)',
  '--mauth-border-strong': 'rgba(0, 0, 0, 0.14)',

  /* 圆角与排版 */
  '--mauth-radius-xs': '6px',
  '--mauth-radius-sm': '8px',
  '--mauth-radius-md': '10px',
  '--mauth-radius-lg': '12px',
  '--mauth-radius-xl': '16px',
  '--mauth-fs-display-m': '24px',
  '--mauth-track-eyebrow': '0.08em',

  /* 分类色（微信里的标签是浅底 + 同色系深字，不用高饱和） */
  '--mauth-cat-1-bg': '#fbf0d9',
  '--mauth-cat-1-ink': '#8a6414',
  '--mauth-cat-2-bg': '#e3eefc',
  '--mauth-cat-2-ink': '#2b5f9e',
  '--mauth-cat-3-bg': '#ece7fb',
  '--mauth-cat-3-ink': '#5a4a9c',
  '--mauth-cat-4-bg': '#fce7e7',
  '--mauth-cat-4-ink': '#9a3b3b',
  '--mauth-cat-5-bg': '#e3f5e8',
  '--mauth-cat-5-ink': '#25734a',

  /* ── 组件层：单独控制用这一组 ───────────────────────────────── */
  '--mauth-nav-bg': 'rgba(255, 255, 255, 0.72)',
  '--mauth-nav-ink': '#555555',
  '--mauth-nav-active-bg': 'rgba(7, 193, 96, 0.12)',
  '--mauth-topbar-bg': 'rgba(246, 248, 247, 0.88)',
  '--mauth-panel-bg': '#ffffff',
  '--mauth-table-head-bg': '#f7f7f7',
  '--mauth-table-row-hover': 'rgba(0, 0, 0, 0.04)',
  '--mauth-btn-bg': '#ffffff',
  '--mauth-input-bg': '#ffffff',
  '--mauth-modal-bg': '#ffffff',
  '--mauth-tabbar-bg': '#f7f7f7',
  '--mauth-tab-active-bg': '#ffffff',
  '--mauth-tag-bg': 'rgba(0, 0, 0, 0.04)',
  '--mauth-tag-ink': '#555555',
  '--mauth-tag-ok-bg': 'rgba(42, 166, 80, 0.12)',
  '--mauth-tag-ok-ink': '#2aa650',
  '--mauth-tag-off-bg': 'rgba(250, 81, 81, 0.12)',
  '--mauth-tag-off-ink': '#fa5151',
  '--mauth-tag-info-bg': 'rgba(7, 193, 96, 0.12)',
  '--mauth-tag-info-ink': '#0b8f45',
};

export default tokens;
