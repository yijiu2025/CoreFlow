/**
 * 珍珠玻璃 · 微信夜间绿（wechat-dark） —— 桌面端 / 后台壳（侧栏 / 顶栏 / 内容区）
 *
 * 路径 `themes/default/standard/console/colors/wechat-dark/` 是**配色**：只换颜色 / 圆角 / 背景图，不动 DOM。
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
    id: 'wechat-dark',
    name: '微信夜间绿',
    description: '近黑底 + 深灰块，绿色保持品牌色',
    author: 'console'
  },
  tone: 'dark',
  tokens: {
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
    '--mauth-primary': '#07c160',
    '--mauth-primary-hover': '#2bd07c',
    '--mauth-primary-soft': 'rgba(7, 193, 96, 0.16)',
    '--mauth-tint': '#07c160',
    '--mauth-on-primary': '#101418',
    '--mauth-success': '#3eb575',
    '--mauth-success-soft': 'rgba(62, 181, 117, 0.16)',
    '--mauth-danger': '#fa5151',
    '--mauth-danger-soft': 'rgba(250, 81, 81, 0.16)',
    /* 提醒色：此前三个弹窗写死 #f59e0b，深色下偏刺眼且不跟配色 */
    '--mauth-warning': '#f0b453',
    '--mauth-warning-soft': 'rgba(240, 180, 83, 0.16)',
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
    /* 开关：轨道 / 开态 / 滑块分开，便于单独调（此前开态写死成成功色，不跟主题） */
    '--mauth-switch-track': 'rgba(214, 214, 214, 0.16)',
    '--mauth-switch-on': '#3eb575',
    '--mauth-switch-knob': '#191919'
  }
} satisfies MauthThemeColor;
