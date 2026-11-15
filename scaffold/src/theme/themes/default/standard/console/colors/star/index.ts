/**
 * 珍珠玻璃 · 星空（star） —— 桌面端 / 后台壳（侧栏 / 顶栏 / 内容区）
 *
 * 路径 `themes/default/standard/console/colors/star/` 是**配色**：只换颜色 / 圆角 / 背景图，不动 DOM。
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
    id: 'star',
    name: '星空',
    description: '深蓝夜空 + 壁纸背景，半透明面板浮在星野上',
    author: 'console'
  },
  tone: 'dark',
  tokens: {
    '--mauth-bg': '#0a1020',
    '--mauth-surface': 'rgba(20, 28, 48, 0.72)',
    '--mauth-surface-2': 'rgba(28, 38, 62, 0.6)',
    '--mauth-hover': 'rgba(140, 170, 255, 0.1)',
    '--mauth-press': 'rgba(140, 170, 255, 0.16)',
    '--mauth-overlay': 'rgba(4, 8, 18, 0.72)',
    '--mauth-plate-bg': 'rgba(21, 24, 26, 0.9)',
    '--mauth-plate-ink': '#f2f5f4',
    '--mauth-text': '#eef3ff',
    '--mauth-text-mid': '#aab8d8',
    '--mauth-text-soft': '#8b99bb',
    '--mauth-text-faint': '#71809f',
    '--mauth-primary': '#7fb0ff',
    '--mauth-primary-hover': '#a1c6ff',
    '--mauth-primary-soft': 'rgba(127, 176, 255, 0.18)',
    '--mauth-tint': '#7fb0ff',
    '--mauth-on-primary': '#101418',
    '--mauth-success': '#8fd45a',
    '--mauth-success-soft': 'rgba(143, 212, 90, 0.16)',
    '--mauth-danger': '#ff7a70',
    '--mauth-danger-soft': 'rgba(255, 122, 112, 0.16)',
    /* 提醒色：此前三个弹窗写死 #f59e0b，深色下偏刺眼且不跟配色 */
    '--mauth-warning': '#f0b453',
    '--mauth-warning-soft': 'rgba(240, 180, 83, 0.16)',
    '--mauth-focus': 'rgba(127, 176, 255, 0.9)',
    '--mauth-border': 'rgba(150, 180, 255, 0.16)',
    '--mauth-border-strong': 'rgba(150, 180, 255, 0.26)',
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
    '--mauth-cat-5-ink': '#a9ddb6',
    '--mauth-nav-bg': 'rgba(10, 16, 32, 0.52)',
    '--mauth-nav-ink': '#aab8d8',
    '--mauth-nav-active-bg': 'rgba(127, 176, 255, 0.2)',
    '--mauth-topbar-bg': 'rgba(10, 16, 32, 0.4)',
    '--mauth-panel-bg': 'rgba(18, 26, 46, 0.7)',
    '--mauth-table-head-bg': 'rgba(26, 36, 60, 0.62)',
    '--mauth-table-row-hover': 'rgba(140, 170, 255, 0.1)',
    '--mauth-btn-bg': 'rgba(22, 30, 52, 0.72)',
    '--mauth-input-bg': 'rgba(14, 21, 38, 0.66)',
    '--mauth-modal-bg': 'rgba(18, 26, 46, 0.9)',
    '--mauth-tabbar-bg': 'rgba(26, 36, 60, 0.6)',
    '--mauth-tab-active-bg': 'rgba(40, 54, 84, 0.8)',
    '--mauth-tag-bg': 'rgba(255, 255, 255, 0.06)',
    '--mauth-tag-ink': '#a8b3b1',
    '--mauth-tag-ok-bg': 'rgba(143, 212, 90, 0.16)',
    '--mauth-tag-ok-ink': '#8fd45a',
    '--mauth-tag-off-bg': 'rgba(255, 122, 112, 0.16)',
    '--mauth-tag-off-ink': '#ff7a70',
    '--mauth-tag-info-bg': 'rgba(110, 168, 255, 0.16)',
    '--mauth-tag-info-ink': '#6ea8ff',
    /* 开关：轨道 / 开态 / 滑块分开，便于单独调（此前开态写死成成功色，不跟主题） */
    '--mauth-switch-track': 'rgba(238, 243, 255, 0.16)',
    '--mauth-switch-on': '#8fd45a',
    '--mauth-switch-knob': 'rgba(20, 28, 48, 0.72)',
  }
} satisfies MauthThemeColor;
