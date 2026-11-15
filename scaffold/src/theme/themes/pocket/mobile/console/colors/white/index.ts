/**
 * 口袋版 · 口袋白（white） —— 手机端 / 后台壳（侧栏 / 顶栏 / 内容区）
 *
 * 路径 `themes/pocket/mobile/console/colors/white/` 是**配色**：只换颜色 / 圆角 / 背景图，不动 DOM。
 *
 * === 这份表是**本配色专属**的，不引用任何共享色表（与 oauth21 同构）===
 * 改这里只影响「这个包 × 这个设备 × 这个页面 × 这个配色」；要另一种版式才新建包，
 * 只换颜色就加一个配色目录（`colors/<id>/`）—— 两者不要混（包 = 布局，配色 = 搭配）。
 *
 * 分两层：
 *   · **基础层**（底色 / 文字四档 / 语义色 / 描边 / 圆角）
 *   · **组件层**（`--mauth-nav-*` / `--mauth-panel-bg` / `--mauth-tag-*` …）
 *     想只改侧栏、只改标签、只改弹窗底色，动组件层那一行，别去动基础层。
 *
 * 🔴 值只能是单值（hex / rgb(a) / hsl(a) / px / % / var(--mauth-*) / 少数关键字）——
 *    skinsuite 注入前有白名单校验。**背景图不属于 token**，写在同目录的 `theme.scss`。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import type { MauthThemeColor } from 'skinsuite';

export default {
  meta: {
    id: 'white',
    name: '口袋白',
    description: '灰底 + 白块，绿色作主操作',
    author: 'console'
  },
  tone: 'light',
  tokens: {
    '--mauth-bg': '#ededed',
    '--mauth-surface': '#ffffff',
    '--mauth-surface-2': '#f7f7f7',
    '--mauth-hover': 'rgba(0, 0, 0, 0.04)',
    '--mauth-press': 'rgba(0, 0, 0, 0.07)',
    '--mauth-overlay': 'rgba(0, 0, 0, 0.4)',
    '--mauth-plate-bg': 'rgba(25, 25, 25, 0.9)',
    '--mauth-plate-ink': '#f2f2f2',
    '--mauth-text': '#191919',
    '--mauth-text-mid': '#555555',
    '--mauth-text-soft': '#888888',
    '--mauth-text-faint': '#b2b2b2',
    '--mauth-primary': '#0b8f45',
    '--mauth-primary-hover': '#097a3b',
    '--mauth-primary-soft': 'rgba(7, 193, 96, 0.12)',
    '--mauth-tint': '#07c160',
    '--mauth-on-primary': '#101418',
    '--mauth-success': '#2aa650',
    '--mauth-success-soft': 'rgba(42, 166, 80, 0.12)',
    '--mauth-danger': '#fa5151',
    '--mauth-danger-soft': 'rgba(250, 81, 81, 0.12)',
    '--mauth-focus': 'rgba(7, 193, 96, 0.7)',
    '--mauth-border': 'rgba(0, 0, 0, 0.08)',
    '--mauth-border-strong': 'rgba(0, 0, 0, 0.14)',
    '--mauth-radius-xs': '6px',
    '--mauth-radius-sm': '8px',
    '--mauth-radius-md': '10px',
    '--mauth-radius-lg': '10px',
    '--mauth-radius-xl': '16px',
    '--mauth-fs-display-m': '24px',
    '--mauth-track-eyebrow': '0.08em',
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
    /* 开关：轨道 / 开态 / 滑块分开，便于单独调（此前开态写死成成功色，不跟主题） */
    '--mauth-switch-track': 'rgba(25, 25, 25, 0.16)',
    '--mauth-switch-on': '#2aa650',
    '--mauth-switch-knob': '#ffffff',
  }
} satisfies MauthThemeColor;
