/**
 * 动物岛 · 岛屿米（island） —— 桌面端 / 登录页
 *
 * 路径 `themes/spotlight/standard/login/colors/island/` 是**配色**：只换颜色 / 圆角 / 背景图，不动 DOM。
 *
 * === 色板取自 animal-island-ui（MIT），只取"颜色 + 形状"，不取字体与 3D 阴影 ===
 * 那张奶油纸 + 可可棕字 + 松石绿按钮 + 大圆角的底子，是这套配色的全部来处。
 *
 * 🔴 主色刻意压深到 `#0b7f74`：原作的亮松石 `#19c8b9` 在奶油底上只有 **2.1:1**，
 *    当链接文字根本看不清（它那边只把亮松石当"按钮填充"用）。亮色没丢 —— 它落在
 *    `--mauth-tint`（大面积 / 光斑 / 卡面渐变用），所以"岛屿青"的味道还在，
 *    而正文、链接、选中态用的是同色系的深档（对白面 4.8:1）。
 *
 * 🔴 字体（Nunito + Noto Sans SC）与 3D 硬阴影**进不来**：skinsuite 的令牌白名单只收
 *    单值颜色/长度，字体栈与 `box-shadow` 组合值都不在里面；要改字体得动 `assets/styles`
 *    的全局 `--font-*`，那会影响所有配色，不该由一套配色偷偷改。
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
    id: 'island',
    name: '岛屿米',
    description: '奶油米底 + 可可棕字，松石绿作主操作，大圆角（取自 animal-island-ui）',
    author: 'console'
  },
  tone: 'light',
  tokens: {
    '--mauth-bg': '#f6f2e3',
    '--mauth-surface': '#fffdf4',
    '--mauth-surface-2': '#f2ecda',
    '--mauth-hover': 'rgba(121, 79, 39, 0.06)',
    '--mauth-press': 'rgba(121, 79, 39, 0.11)',
    '--mauth-overlay': 'rgba(74, 53, 27, 0.34)',
    '--mauth-plate-bg': 'rgba(58, 43, 24, 0.92)',
    '--mauth-plate-ink': '#fbf3df',
    '--mauth-text': '#6b4526',
    '--mauth-text-mid': '#856340',
    '--mauth-text-soft': '#94856e',
    '--mauth-text-faint': '#ada08a',
    '--mauth-primary': '#0b7f74',
    '--mauth-primary-hover': '#096d63',
    '--mauth-primary-soft': 'rgba(25, 200, 185, 0.14)',
    '--mauth-tint': '#19c8b9',
    '--mauth-on-primary': '#ffffff',
    '--mauth-success': '#4f8a16',
    '--mauth-success-soft': 'rgba(111, 186, 44, 0.18)',
    '--mauth-danger': '#cf4b46',
    '--mauth-danger-soft': 'rgba(224, 90, 90, 0.14)',
    '--mauth-warning': '#96640a',
    '--mauth-warning-soft': 'rgba(245, 195, 28, 0.22)',
    '--mauth-focus': 'rgba(25, 200, 185, 0.8)',
    '--mauth-border': 'rgba(160, 138, 96, 0.3)',
    '--mauth-border-strong': 'rgba(150, 126, 84, 0.48)',
    '--mauth-radius-xs': '10px',
    '--mauth-radius-sm': '14px',
    '--mauth-radius-md': '18px',
    '--mauth-radius-lg': '24px',
    '--mauth-radius-xl': '28px',
    '--mauth-fs-display-m': '24px',
    '--mauth-track-eyebrow': '0.1em',
    '--mauth-cat-1-bg': '#fdeec9',
    '--mauth-cat-1-ink': '#8a6414',
    '--mauth-cat-2-bg': '#d9e9f3',
    '--mauth-cat-2-ink': '#2f6b8f',
    '--mauth-cat-3-bg': '#e8def3',
    '--mauth-cat-3-ink': '#6a4c93',
    '--mauth-cat-4-bg': '#fbdcd8',
    '--mauth-cat-4-ink': '#a4433c',
    '--mauth-cat-5-bg': '#dcefd0',
    '--mauth-cat-5-ink': '#4a7a24',
    '--mauth-nav-bg': 'rgba(255, 253, 244, 0.82)',
    '--mauth-nav-ink': '#856340',
    '--mauth-nav-active-bg': 'rgba(25, 200, 185, 0.14)',
    '--mauth-topbar-bg': 'rgba(246, 242, 227, 0.9)',
    '--mauth-panel-bg': '#fffdf4',
    '--mauth-table-head-bg': '#f2ecda',
    '--mauth-table-row-hover': 'rgba(121, 79, 39, 0.06)',
    /* 工作台：只作用于后台工作台（脉搏卡 / 成功率 / 最近登录 / 常用入口），默认跟着主色走 */
    '--mauth-dash-rate': 'var(--mauth-primary)',
    '--mauth-dash-ring': 'var(--mauth-primary)',
    '--mauth-dash-chip-bg': 'var(--mauth-primary-soft)',
    '--mauth-dash-chip-ink': 'var(--mauth-primary)',
    '--mauth-dash-today': 'var(--mauth-primary)',

    '--mauth-btn-bg': '#fffdf4',
    '--mauth-input-bg': '#fffdf4',
    '--mauth-modal-bg': '#fffdf4',
    '--mauth-tabbar-bg': '#f2ecda',
    '--mauth-tab-active-bg': '#fffdf4',
    '--mauth-tag-bg': 'rgba(121, 79, 39, 0.07)',
    '--mauth-tag-ink': '#856340',
    '--mauth-tag-ok-bg': 'rgba(111, 186, 44, 0.18)',
    '--mauth-tag-ok-ink': '#4f8a16',
    '--mauth-tag-off-bg': 'rgba(224, 90, 90, 0.14)',
    '--mauth-tag-off-ink': '#cf4b46',
    '--mauth-tag-info-bg': 'rgba(25, 200, 185, 0.14)',
    '--mauth-tag-info-ink': '#0b7f74',
    '--mauth-switch-track': 'rgba(121, 79, 39, 0.22)',
    '--mauth-switch-on': '#6fba2c',
    '--mauth-switch-knob': '#fffdf4'
  }
} satisfies MauthThemeColor;
