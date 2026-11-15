/**
 * 极光 · 珍珠白（white） —— 手机端 / 后台壳（侧栏 / 顶栏 / 内容区）
 *
 * 路径 `themes/spotlight/mobile/console/colors/white/` 是**配色**：只换颜色 / 圆角 / 背景图，不动 DOM。
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
    name: '珍珠白',
    description: '浅色：柔和灰白底 + 白表面，蓝色作主操作',
    author: 'console'
  },
  tone: 'light',
  tokens: {
    '--mauth-bg': '#f6f8f7',
    '--mauth-surface': '#ffffff',
    '--mauth-surface-2': '#fbfcfc',
    '--mauth-hover': 'rgba(46, 58, 62, 0.045)',
    '--mauth-press': 'rgba(46, 58, 62, 0.075)',
    '--mauth-overlay': 'rgba(16, 20, 24, 0.28)',
    '--mauth-plate-bg': 'rgba(21, 24, 26, 0.9)',
    '--mauth-plate-ink': '#f2f5f4',
    '--mauth-text': '#101418',
    '--mauth-text-mid': '#596368',
    '--mauth-text-soft': '#7e888c',
    '--mauth-text-faint': '#99a2a5',
    '--mauth-primary': '#236de9',
    '--mauth-primary-hover': '#1d61d5',
    '--mauth-primary-soft': 'rgba(35, 109, 233, 0.1)',
    '--mauth-tint': '#236de9',
    '--mauth-on-primary': '#ffffff',
    '--mauth-success': '#58a021',
    '--mauth-success-soft': 'rgba(88, 160, 33, 0.12)',
    '--mauth-danger': '#e0443b',
    '--mauth-danger-soft': 'rgba(224, 68, 59, 0.11)',
    /* 提醒色：此前三个弹窗写死 #f59e0b，深色下偏刺眼且不跟配色 */
    '--mauth-warning': '#b45309',
    '--mauth-warning-soft': 'rgba(180, 83, 9, 0.12)',
    '--mauth-focus': 'rgba(35, 109, 233, 0.8)',
    '--mauth-border': 'rgba(46, 58, 62, 0.09)',
    '--mauth-border-strong': 'rgba(46, 58, 62, 0.13)',
    '--mauth-radius-xs': '8px',
    '--mauth-radius-sm': '12px',
    '--mauth-radius-md': '14px',
    '--mauth-radius-lg': '18px',
    '--mauth-radius-xl': '24px',
    '--mauth-fs-display-m': '24px',
    '--mauth-track-eyebrow': '0.14em',
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
    '--mauth-nav-bg': 'rgba(255, 255, 255, 0.72)',
    '--mauth-nav-ink': '#596368',
    '--mauth-nav-active-bg': 'rgba(35, 109, 233, 0.1)',
    '--mauth-topbar-bg': 'rgba(246, 248, 247, 0.88)',
    '--mauth-panel-bg': '#ffffff',
    '--mauth-table-head-bg': '#fbfcfc',
    '--mauth-table-row-hover': 'rgba(46, 58, 62, 0.045)',
    /* 工作台：只作用于后台工作台（脉搏卡 / 成功率 / 最近登录 / 常用入口），默认跟着主色走 */
    '--mauth-dash-rate': 'var(--mauth-primary)',
    '--mauth-dash-ring': 'var(--mauth-primary)',
    '--mauth-dash-chip-bg': 'var(--mauth-primary-soft)',
    '--mauth-dash-chip-ink': 'var(--mauth-primary)',
    '--mauth-dash-today': 'var(--mauth-primary)',

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
    /* 开关：轨道 / 开态 / 滑块分开，便于单独调（此前开态写死成成功色，不跟主题） */
    '--mauth-switch-track': 'rgba(16, 20, 24, 0.16)',
    '--mauth-switch-on': '#58a021',
    '--mauth-switch-knob': '#ffffff'
  }
} satisfies MauthThemeColor;
