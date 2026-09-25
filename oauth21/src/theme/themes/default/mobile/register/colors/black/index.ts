/**
 * 「黑」配色（black）—— 与「白」「蓝」「青」等**并列的一个颜色选项**
 *
 * 注册页 · 手机端。
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
    /* 画布色 = 页面最上沿。black 色卡语义 = 纯黑底（2026-09-25 用户定夺：
       "黑色背景就要使用纯黑"），不再借 slate-950 那套深蓝灰 —— 选黑就是 #000000 */
    '--mauth-canvas': '#000000',
    /* 表面：背景纯黑；surface 系列用极暗灰保留「卡片 vs 页面」的层次
       （#0a0a0a 比 #020617 slate-950 更贴近纯黑，但仍能看到卡片轮廓） */
    '--mauth-bg': '#000000',
    /* 🔴 body 背景 = bg（= #000000），不再借 surface —— 用户原话：
       "黑色背景就要使用纯黑"。mobile-auth.scss 默认
       --mauth-body-bg = var(--mauth-surface)，会让页面主体显示 surface 色
       (#0a0a0a)，不是纯黑。覆盖一下，body 与 bg 融合 → 整片 #000000，
       卡片仍用 surface (#0a0a0a) 露出轮廓。 */
    '--mauth-body-bg': '#000000',
    '--mauth-surface': '#0a0a0a',
    '--mauth-surface-2': '#141414',
    '--mauth-surface-3': '#1f1f1f',
    '--mauth-surface-press': '#262626',
    /* 文字：纯黑底下用近白仍能看清，整体偏中性（black 是无品牌色方案） */
    '--mauth-text': '#f5f5f5',
    '--mauth-text-strong': '#f5f5f5',
    '--mauth-text-body': '#a3a3a3',
    '--mauth-text-mid': '#a3a3a3',
    '--mauth-text-faint': '#737373',
    '--mauth-icon': '#a3a3a3',
    /* 边框：纯黑下原 #334155 几乎隐形，提亮一档；field-* 同理 */
    '--mauth-border': '#262626',
    '--mauth-border-strong': '#525252',
    '--mauth-border-focus': '#737373',
    '--mauth-focus-ring': 'rgba(115, 115, 115, 0.3)',
    /* 主色：black 是无品牌色方案 —— CTA 用近白，对比度压满 */
    '--mauth-primary': '#f5f5f5',
    '--mauth-primary-fg': '#0a0a0a',
    '--mauth-accent': '#93c5fd',
    '--mauth-emphasis-fg': '#e5e5e5',
    /* 表单：纯黑底上 6% 白覆盖仍偏暗，提到 8%；focus 同步提 */
    '--mauth-field-bg': 'rgba(255, 255, 255, 0.08)',
    '--mauth-field-bg-focus': 'rgba(255, 255, 255, 0.12)',
    '--mauth-field-border': 'rgba(255, 255, 255, 0.16)',
    '--mauth-field-border-focus': '#a3a3a3',
    /* 第三方渠道品牌色提亮（沿用基线，避免在纯黑底上消失） */
    '--mauth-social-ink-github': '#e5e7eb',
    '--mauth-social-ink-apple': '#f9fafb'
  }
} satisfies MauthThemeColor;
