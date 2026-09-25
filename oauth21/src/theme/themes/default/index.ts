/**
 * 默认主题包：石墨 —— **包定义**（不再是"默认配色"）
 *
 * === 它在三级结构里的位置 ===
 * `themes/default/` 是一个**主题包**（一套完整设计），本文件只声明它：
 *   • `meta`  —— 展示用信息（其中 `id` 一律以**目录名**为准，这里写 'default' 与之一致）
 *   • `views` —— （可选）该包所有设备、所有配色共用的版式声明：`{ register: '<版式 id>' }`
 *              写在包定义 → 全包共用；写在 `<设备>/colors/<配色>/index.ts` → 只覆盖那一套。
 *
 * 本包在三种设备上的呈现（版式跟随主题包，换一套设计就是换一个包）：
 *   • `mobile/`   —— 手机端：`<page>/index.vue`（基础版式）+ `<page>/<变体>/` + `colors/<配色>/`
 *   • `standard/` —— 桌面主窗口：同结构
 *   • `mini/`     —— iframe 紧凑版：同结构
 *
 * ⚠️ 本文件**不再**充当"该包的默认配色"。黑白档现在是具名配色
 *    `mobile/colors/mono/`，与海蓝/天青**平级、可被显式选中**。
 *    这么改是为了让"黑白"在配置层面有名字，而不是一个隐式的兜底 ——
 *    它同时保住了"零 token → 渲染路径与没有主题机制时完全一致"这条不变量。
 *
 * ⚠️ 配色 id **全局唯一**（跨包、跨设备）：URL `?theme=` 只给一个 id，
 *    要靠它反查所属包与设备。所以电脑端不能也叫 `ocean`，需另起名（如 `standard-ocean`）。
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
