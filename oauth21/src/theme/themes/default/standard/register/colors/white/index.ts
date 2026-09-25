/**
 * 「白」配色（white）—— 与「黑」「蓝」「青」等**并列的一个颜色选项**
 *
 * 注册页 · 电脑端。
 *
 * === 它在四级结构里的位置 ===
 * `themes/default/<设备>/<页面>/colors/white/` 是**配色**：
 * 只换颜色 / 圆角 / 背景图，**不动 DOM**（DOM 由同级的版式决定）。
 *
 * 🔴 配色自 2026-09-24 起挂在**版式**下，而不是设备下：
 *    「一个版式有几种颜色」—— 同一个页面的基础版式与紧凑版式各自可以有不同的可选颜色，
 *    所以颜色目录落在 `<页面>/[<版式>/]colors/<颜色>/`。基础版式的目录少一层
 *    （`<页面>/colors/<颜色>/`），注册表里统一记作 view = `base`。
 *    配色 id 的唯一性作用域是「同包同设备同页同版式」。
 *
 * === 🔴 底色由配色自己决定，不再借道「明暗」（2026-09-25 改）===
 * 早先本套**零 token**，靠"吃样式表基线 + 面板点它时顺带把明暗切成 light"来呈现白底。
 * 那个做法有两个毛病，用户实测后指出：
 *   ① **不等权** —— 黑白能偷偷改明暗、蓝青不能，于是「先点黑再点蓝」会拿到 blue 的
 *      **深色档**（底色近黑），用户看到的是"选了蓝但底色还是黑的"；
 *   ② **命名会崩** —— 将来按"色彩搭配"给颜色命名（如 `warm` / `candy`）时，
 *      把"明暗开关"语义塞在颜色里根本表达不出来。
 *
 * 现在改成：**每套配色自带该有的底色**，选白就是白底，
 * **与当前明暗偏好无关**。明暗是用户偏好（`theme/mode.ts`），只在基线 SCSS 那层生效，
 * 不再由"选颜色"这个动作代劳。
 * 「白」这个选项的语义就是白底，不该因为系统明暗而反过来。
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
    id: 'white',
    name: '白',
    description: '浅色底 + 深色字：中性无品牌色，自带浅色底，不随明暗偏好改变',
    preview: { primary: '#f8fafc', accent: '#cbd5e1' },
    author: 'oauth21'
  },
  tone: 'light',
  tokens: {
    /* 画布色 = 页面最上沿。白底页面的画布也是白的（否则顶部/底部会露深色条） */
    '--mauth-canvas': '#ffffff',
    /* 表面：页面底 → 常规面 → 次级面 → 三级面 → 按压态 */
    '--mauth-bg': '#f8fafc',
    '--mauth-surface': '#ffffff',
    '--mauth-surface-2': '#f8fafc',
    '--mauth-surface-3': '#f1f5f9',
    '--mauth-surface-press': '#e2e8f0',
    /* 文字：浅底上必须是深字 */
    '--mauth-text': '#0f172a',
    '--mauth-text-strong': '#0f172a',
    '--mauth-text-body': '#475569',
    '--mauth-text-mid': '#64748b',
    '--mauth-text-faint': '#94a3b8',
    '--mauth-icon': '#94a3b8',
    /* 边框 */
    '--mauth-border': '#e2e8f0',
    '--mauth-border-strong': '#cbd5e1',
    '--mauth-border-focus': '#475569',
    '--mauth-focus-ring': 'rgba(71, 85, 105, 0.1)',
    /* 主色：白套同样是中性无品牌色 —— CTA 用深板岩色 */
    '--mauth-primary': '#1e293b',
    '--mauth-primary-fg': '#ffffff',
    '--mauth-accent': '#2563eb',
    '--mauth-emphasis-fg': '#1e293b',
    /* 表单：浅底上的字段用白面 + 细描边 */
    '--mauth-field-bg': '#f8fafc',
    '--mauth-field-bg-focus': '#ffffff',
    '--mauth-field-border': '#e2e8f0',
    '--mauth-field-border-focus': '#475569',
    /* 状态色（v2.21.0 错误底：浅底上的红用极淡红） */
    '--mauth-danger': '#ef4444',
    '--mauth-danger-bg': '#fef2f2',
    /* v2.21.0 警告：浮层 MessageToast + GraphicCaptcha 的 warn 类用 */
    '--mauth-warn': '#f59e0b',
    '--mauth-warn-bg': 'rgba(245, 158, 11, 0.12)',
    /* v2.21.0 body bg：--mauth-canvas 已声明在上方；这里只补 body bg */
    '--mauth-body-bg': '#ffffff'
  }
} satisfies MauthThemeColor;
