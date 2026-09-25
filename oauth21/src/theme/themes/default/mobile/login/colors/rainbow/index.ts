/**
 * 「彩」演示配色（rainbow）—— 演示「同一页面不同位置用不同颜色」
 *
 * === 这个配色想证明什么 ===
 * 一套配色的 \`tokens\` 就是一张 \`--mauth-*\` 变量表，**可以只改想要的那几个位置**，
 * 其余位置自动吃样式表基线。样式表里已有 129 个语义 token，覆盖：
 *   主按钮 / 链接 / 输入框 / 头部表面 / 社交渠道图标 / 徽标 / 对话框 / 进度条 / 危险提示 …
 * 所以「一页里不同位置不同颜色」不需要改任何代码或样式 —— 写 token 即可。
 *
 * === 本配色的具体分工（刻意每个位置一个色系，便于肉眼核对）===
 *   主按钮       → 紫
 *   链接 / 忘记密码 → 蓝
 *   输入框边框   → 绿（聚焦时更亮）
 *   头部表面     → 暖橙（浅色下是很淡的橙）
 *   第三方渠道图标 → 各用各家品牌色
 *   进度条       → 品红
 *   危险/错误    → 红
 *
 * ⚠️ 两条硬约束（写错会被运行时丢弃，控制台留 \`[theme] 忽略了 N 条…\`）：
 *   ① token 名必须是 \`--mauth-\` 前缀的小写短横线命名
 *   ② 取值只能是 hex / rgb() / hsl() / 长度 / var(--mauth-*) / 少数关键字
 *      —— **不支持 CSS 颜色名**（\`red\`）、**不支持 \`url()\`**、不支持函数
 *
 * @author yijiu2025
 */
import type { MauthThemeColor } from '@/theme/types';

export default {
  meta: {
    id: 'rainbow',
    name: '彩',
    description: '演示配色：主按钮紫、链接蓝、输入框绿、头部橙、进度品红 —— 同页多位不同色',
    preview: { primary: '#7c3aed', accent: '#2563eb' },
    author: 'oauth21'
  },
  tone: 'light',
  tokens: {
    /* ---- 主按钮：紫 ---- */
    '--mauth-submit-bg': '#7c3aed',
    '--mauth-submit-fg': '#ffffff',
    '--mauth-primary': '#7c3aed',
    '--mauth-primary-fg': '#ffffff',
    /* ---- 链接 / 忘记密码：蓝 ---- */
    '--mauth-link-fg': '#2563eb',
    '--mauth-forgot-fg': '#2563eb',
    '--mauth-forgot-fg-press': '#1d4ed8',
    '--mauth-emphasis-fg': '#1d4ed8',
    /* ---- 输入框：绿框 ---- */
    '--mauth-field-bg': '#f0fdf4',
    '--mauth-field-bg-focus': '#ffffff',
    '--mauth-field-border': '#86efac',
    '--mauth-field-border-focus': '#16a34a',
    '--mauth-focus-ring': 'rgba(22, 163, 74, 0.18)',
    /* ---- 头部表面：暖橙（浅色档给很淡的一层，不刺眼）---- */
    '--mauth-header-bg': '#fff7ed',
    '--mauth-canvas': '#fff7ed',
    /* ---- 第三方渠道：各用各家品牌色 ---- */
    '--mauth-social-ink-wechat': '#07c160',
    '--mauth-social-ink-alipay': '#1677ff',
    '--mauth-social-ink-github': '#24292f',
    '--mauth-social-ink-qq': '#12b7f5',
    '--mauth-social-ink-weibo': '#e6162d',
    '--mauth-social-ink-apple': '#111827',
    /* ---- 徽标 / 面板 / 进度：与主色拉开 ---- */
    '--mauth-social-badge-bg': '#ede9fe',
    '--mauth-social-badge-fg': '#6d28d9',
    '--mauth-progress-bg': '#f3e8ff',
    '--mauth-progress-fill': '#c026d3',
    /* ---- 危险 / 错误：红 ---- */
    '--mauth-danger': '#dc2626',
    '--mauth-err-fg': '#dc2626',
    '--mauth-warn': '#d97706',
    '--mauth-warn-bg': '#fffbeb'
  }
} satisfies MauthThemeColor;
