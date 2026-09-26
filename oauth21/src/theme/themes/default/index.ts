/**
 * 默认主题包：石墨 —— **包定义**（不再是"默认配色"）
 *
 * === 它在三级结构里的位置 ===
 * `themes/default/` 是一个**主题包**（一套完整设计），本文件只声明它：
 *   • `meta`  —— 展示用信息（其中 `id` 一律以**目录名**为准，这里写 'default' 与之一致）
 *   • `views` —— （可选）该包所有设备、所有配色共用的版式声明：`{ register: '<版式 id>' }`
 *               **版式 id ≡ 主题包名**（一个主题包 = 一种版式），所以这里填本包名或另一个包名。
 *               写在包定义 → 全包共用；写在 `<设备>/colors/<配色>/index.ts` → 只覆盖那一套。
 *
 * 本包在三种设备上的呈现（版式跟随主题包，换一套设计就是换一个包）：
 *   • `mobile/`   —— 手机端：`<page>/index.vue` + `<page>/colors/<配色>/`
 *   • `standard/` —— 桌面主窗口：同结构
 *   • `mini/`     —— iframe 紧凑版：同结构
 *
 * 🔴 `<页面>/` 下**没有**「版式」这一层目录（2026-09-26）：要另一种版式请**新建包**
 *    （如 `themes/compact/`），不要建 `<页面>/<版式>/`。
 *
 * ⚠️ 包定义**不再**充当"该包的默认配色"：黑白档是**两个具名配色**
 *    `<设备>/<页面>/colors/{black,white}/`，与 blue/cyan/rainbow **平级、可被显式选中**。
 *    这么改是为了让"黑白"在配置层面有名字，而不是一个隐式的兜底 ——
 *    它同时保住了"零 token → 渲染路径与没有主题机制时完全一致"这条不变量
 *    （`black` / `white` 都带自己的 tokens，基线 SCSS 仍是那条没有主题机制时的渲染路径）。
 *
 * ⚠️ 配色 id 的唯一性作用域是「同包 × 同设备 × 同页面」：**跨设备可以同名** ——
 *    本包的 `mobile/login/colors/black` 与 `standard/login/colors/black` 就是两份
 *    独立文件（各写各的 tokens），这正是"两端各配一套色值"的落点。
 *    两端要用**不同的配色 id**（手机 `blue`、电脑 `black`）时用**设备维度参数**
 *    `?theme.mobile=blue&theme.standard=black`（见 `stores/theme.ts`）。
 *
 * @author yijiu2025
 */
import type { MauthThemePackage } from '@/theme/types';

export default {
  meta: {
    id: 'default',
    name: '石墨（默认包）',
    description: '中性灰蓝，深色 CTA + 浅灰底，适配任何品牌色的中性底座',
    preview: { primary: '#1e293b', accent: '#2563eb' }
  }
} satisfies MauthThemePackage;
