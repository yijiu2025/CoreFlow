/**
 * 微信 · 微信夜间（black） —— **本配色专属色值表**（可整份单独调）
 *
 * 每份配色一份表：改这里只影响「这个包 × 这个明暗」，不会牵动别的配色。
 * 分两段：
 *   · **基础层**（底色 / 文字四档 / 语义色 / 描边 / 圆角）—— 全局骨架；
 *   · **组件层**（`--mauth-nav-*` / `--mauth-panel-bg` / `--mauth-tag-*` …）——
 *     想只改侧栏、只改标签、只改弹窗底色，动这里，别去动基础层。
 *
 * 🔴 值只能是单值（hex / rgb(a) / hsl(a) / px / % / var(--mauth-*) / 少数关键字）——
 *    skinsuite 注入前有白名单校验，渐变、阴影、字体栈这类复合值放不进 token。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */

const tokens = {
  '--mauth-bg': '#111111',
  '--mauth-surface': '#191919',
  '--mauth-surface-2': '#1f1f1f',
  '--mauth-hover': 'rgba(255, 255, 255, 0.05)',
  '--mauth-press': 'rgba(255, 255, 255, 0.09)',
  '--mauth-overlay': 'rgba(0, 0, 0, 0.66)',
  '--mauth-plate-bg': 'rgba(25, 25, 25, 0.92)',
  '--mauth-plate-ink': '#f2f2f2',

  '--mauth-text': '#d6d6d6',
  '--mauth-text-mid': '#a3a3a3',
  '--mauth-text-soft': '#8a8a8a',
  '--mauth-text-faint': '#666666',

  /* 深底上鲜绿就够读（6.2:1），不必再压深 */
  '--mauth-primary': '#07c160',
  '--mauth-primary-hover': '#2bd07c',
  '--mauth-primary-soft': 'rgba(7, 193, 96, 0.16)',
  '--mauth-tint': '#07c160',
  '--mauth-success': '#3eb575',
  '--mauth-success-soft': 'rgba(62, 181, 117, 0.16)',
  '--mauth-danger': '#fa5151',
  '--mauth-danger-soft': 'rgba(250, 81, 81, 0.16)',
  '--mauth-focus': 'rgba(7, 193, 96, 0.75)',

  '--mauth-border': 'rgba(255, 255, 255, 0.09)',
  '--mauth-border-strong': 'rgba(255, 255, 255, 0.16)',

  '--mauth-radius-xs': '6px',
  '--mauth-radius-sm': '8px',
  '--mauth-radius-md': '10px',
  '--mauth-radius-lg': '12px',
  '--mauth-radius-xl': '16px',
  '--mauth-fs-display-m': '24px',
  '--mauth-track-eyebrow': '0.08em',

  '--mauth-cat-1-bg': 'rgba(251, 240, 217, 0.14)',
  '--mauth-cat-1-ink': '#e8cf9a',
  '--mauth-cat-2-bg': 'rgba(227, 238, 252, 0.14)',
  '--mauth-cat-2-ink': '#a8c6ef',
  '--mauth-cat-3-bg': 'rgba(236, 231, 251, 0.14)',
  '--mauth-cat-3-ink': '#c3b6ee',
  '--mauth-cat-4-bg': 'rgba(252, 231, 231, 0.14)',
  '--mauth-cat-4-ink': '#f0b3b3',
  '--mauth-cat-5-bg': 'rgba(227, 245, 232, 0.14)',
  '--mauth-cat-5-ink': '#a5dbb9',

  /* ── 组件层：单独控制用这一组 ───────────────────────────────── */
  '--mauth-nav-bg': 'rgba(22, 26, 29, 0.72)',
  '--mauth-nav-ink': '#a3a3a3',
  '--mauth-nav-active-bg': 'rgba(7, 193, 96, 0.16)',
  '--mauth-topbar-bg': 'rgba(15, 18, 20, 0.88)',
  '--mauth-panel-bg': '#191919',
  '--mauth-table-head-bg': '#1f1f1f',
  '--mauth-table-row-hover': 'rgba(255, 255, 255, 0.05)',
  '--mauth-btn-bg': '#191919',
  '--mauth-input-bg': '#191919',
  '--mauth-modal-bg': '#191919',
  '--mauth-tabbar-bg': '#1f1f1f',
  '--mauth-tab-active-bg': '#191919',
  '--mauth-tag-bg': 'rgba(255, 255, 255, 0.05)',
  '--mauth-tag-ink': '#a3a3a3',
  '--mauth-tag-ok-bg': 'rgba(62, 181, 117, 0.16)',
  '--mauth-tag-ok-ink': '#3eb575',
  '--mauth-tag-off-bg': 'rgba(250, 81, 81, 0.16)',
  '--mauth-tag-off-ink': '#fa5151',
  '--mauth-tag-info-bg': 'rgba(7, 193, 96, 0.16)',
  '--mauth-tag-info-ink': '#07c160',
};

export default tokens;
