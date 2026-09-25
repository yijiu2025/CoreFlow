/**
 * 「黑」配色（black）—— 与「白」「蓝」「青」等**并列的一个颜色选项**
 *
 * 重置密码页 · 电脑端。
 *
 * === 它在四级结构里的位置 ===
 * `themes/default/<设备>/<页面>/colors/black/` 是**配色**：
 * 只换颜色 / 圆角 / 背景图，**不动 DOM**（DOM 由同级的版式决定）。
 *
 * 🔴 配色自 2026-09-24 起挂在**版式**下，而不是设备下：
 *    「一个版式有几种颜色」—— 同一个页面的基础版式与紧凑版式各自可以有不同的可选颜色，
 *    所以颜色目录落在 `<页面>/[<版式>/]colors/<颜色>/`。基础版式的目录少一层
 *    （`<页面>/colors/<颜色>/`），注册表里统一记作 view = `base`。
 *    配色 id 的唯一性作用域是「同包同设备同页同版式」。
 *
 * === 🔴 底色由配色自己决定，不再借道「明暗」（2026-09-25 改）===
 * 早先本套**零 token**，靠"吃样式表基线 + 面板点它时顺带把明暗切成 dark"来呈现黑底。
 * 那个做法有两个毛病，用户实测后指出：
 *   ① **不等权** —— 黑白能偷偷改明暗、蓝青不能，于是「先点黑再点蓝」会拿到 blue 的
 *      **深色档**（底色近黑），用户看到的是"选了蓝但底色还是黑的"；
 *   ② **命名会崩** —— 将来按"色彩搭配"给颜色命名（如 `warm` / `candy`）时，
 *      把"明暗开关"语义塞在颜色里根本表达不出来。
 *
 * 现在改成：**每套配色自带该有的底色**，选黑就是黑底，
 * **与当前明暗偏好无关**。明暗是用户偏好（`theme/mode.ts`），只在基线 SCSS 那层生效，
 * 不再由"选颜色"这个动作代劳。
 * 「黑」这个选项的语义就是黑底，不该因为系统明暗而反过来。
 *
 * === 与「零 token 基线」的关系 ===
 * 本套不再零 token，所以"零配色 → 渲染路径与没有主题机制时完全一致"这条不变量
 * 不再由它承担。基线仍完整存在于 `assets/styles/mobile-auth.scss`
 * （任何**未声明**的 token 依旧自动吃基线）。
 *
 * @author yijiu2025
 * @since 2026-09-23
 */
import type { MauthThemeColor } from '@/theme/types';

export default {
  meta: {
    id: 'black',
    name: '黑',
    description: '深色底 + 浅色字：中性无品牌色，自带深色底，不随明暗偏好改变',
    preview: { primary: '#0f172a', accent: '#334155' },
    author: 'oauth21'
  },
  tone: 'dark',
  tokens: {
    /* 画布色 = 页面最上沿。黑底页面的画布也是黑的（否则顶部/底部会露白条） */
    '--mauth-canvas': '#020617',
    /* 表面：页面底 → 常规面 → 次级面 → 三级面 → 按压态 */
    '--mauth-bg': '#020617',
    '--mauth-surface': '#0f172a',
    '--mauth-surface-2': '#1e293b',
    '--mauth-surface-3': '#1e293b',
    '--mauth-surface-press': '#334155',
    /* 文字：黑底上必须是浅字，否则整页不可读 */
    '--mauth-text': '#f1f5f9',
    '--mauth-text-strong': '#f1f5f9',
    '--mauth-text-body': '#94a3b8',
    '--mauth-text-mid': '#94a3b8',
    '--mauth-text-faint': '#94a3b8',
    '--mauth-icon': '#64748b',
    /* 边框 */
    '--mauth-border': '#334155',
    '--mauth-border-strong': '#475569',
    '--mauth-border-focus': '#64748b',
    '--mauth-focus-ring': 'rgba(100, 116, 139, 0.18)',
    /* 主色：黑套是无品牌色的中性方案 —— CTA 用近白，压在深底上最清楚 */
    '--mauth-primary': '#f1f5f9',
    '--mauth-primary-fg': '#0f172a',
    '--mauth-accent': '#93c5fd',
    '--mauth-emphasis-fg': '#e2e8f0',
    /* 表单：深底上用"白 6% 覆盖"才有层次（与基线深色档同口径） */
    '--mauth-field-bg': 'rgba(255, 255, 255, 0.06)',
    '--mauth-field-bg-focus': 'rgba(255, 255, 255, 0.1)',
    '--mauth-field-border': 'rgba(255, 255, 255, 0.14)',
    '--mauth-field-border-focus': '#94a3b8',
    /* 深色下把第三方渠道里"近黑"的品牌色提亮，否则压在深底上看不见 */
    '--mauth-social-ink-github': '#e5e7eb',
    '--mauth-social-ink-apple': '#f9fafb'
  }
} satisfies MauthThemeColor;
