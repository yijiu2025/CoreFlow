/**
 * 珍珠玻璃 · 石墨夜（black） —— 桌面端 / 登录页
 *
 * 路径 `themes/default/standard/login/colors/black/` 是**配色**：只换颜色 / 圆角 / 背景图，不动 DOM。
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
    id: 'black',
    name: '石墨夜',
    description: '深色：近黑画布 + 石墨表面，蓝色提亮作主操作',
    author: 'console'
  },
  tone: 'dark',
  tokens: {
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
    '--mauth-tint': '#6ea8ff',
    '--mauth-on-primary': '#101418',
    '--mauth-success': '#8fd45a',
    '--mauth-success-soft': 'rgba(143, 212, 90, 0.16)',
    '--mauth-danger': '#ff7a70',
    '--mauth-danger-soft': 'rgba(255, 122, 112, 0.16)',
    /* 提醒色：此前三个弹窗写死 #f59e0b，深色下偏刺眼且不跟配色 */
    '--mauth-warning': '#f0b453',
    '--mauth-warning-soft': 'rgba(240, 180, 83, 0.16)',
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
    '--mauth-cat-5-ink': '#a9ddb6',
    '--mauth-nav-bg': 'rgba(22, 26, 29, 0.72)',
    '--mauth-nav-ink': '#a8b3b1',
    '--mauth-nav-active-bg': 'rgba(110, 168, 255, 0.16)',
    '--mauth-topbar-bg': 'rgba(15, 18, 20, 0.88)',
    '--mauth-panel-bg': '#161a1d',
    '--mauth-table-head-bg': '#1b2024',
    '--mauth-table-row-hover': 'rgba(255, 255, 255, 0.06)',
    '--mauth-btn-bg': '#161a1d',
    '--mauth-input-bg': '#161a1d',
    '--mauth-modal-bg': '#161a1d',
    '--mauth-tabbar-bg': '#1b2024',
    '--mauth-tab-active-bg': '#161a1d',
    '--mauth-tag-bg': 'rgba(255, 255, 255, 0.06)',
    '--mauth-tag-ink': '#a8b3b1',
    '--mauth-tag-ok-bg': 'rgba(143, 212, 90, 0.16)',
    '--mauth-tag-ok-ink': '#8fd45a',
    '--mauth-tag-off-bg': 'rgba(255, 122, 112, 0.16)',
    '--mauth-tag-off-ink': '#ff7a70',
    '--mauth-tag-info-bg': 'rgba(110, 168, 255, 0.16)',
    '--mauth-tag-info-ink': '#6ea8ff',
    /* 开关：轨道 / 开态 / 滑块分开，便于单独调（此前开态写死成成功色，不跟主题） */
    '--mauth-switch-track': 'rgba(238, 242, 241, 0.16)',
    '--mauth-switch-on': '#8fd45a',
    '--mauth-switch-knob': '#161a1d'
  }
} satisfies MauthThemeColor;
