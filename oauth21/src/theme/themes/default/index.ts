/**
 * 默认主题包：石墨 —— **包定义，同时是该包的默认配色**
 *
 * === 它现在还是"包"的定义 ===
 * `themes/default/` 是一个**主题包**（一套完整设计），本文件声明它：
 *   • `meta`  —— 展示用信息（其中 `id` 一律以**目录名**为准，这里写 'default' 与之一致）
 *   • `tokens`—— 该包**默认配色**的取值（本包刻意留空，见下）
 *   • `views` —— （可选）该包所有配色共用的版式声明：`{ register: '<版式 id>' }`
 *              写在包根 → 全包共用；写在 `colors/<配色>/index.ts` → 只覆盖那一套配色。
 *
 * 本包的**版式**就在同级目录下：`register/{base,compact}/`、`login/base/`、
 * `forgot-password/base/` —— 版式跟随主题包，换一套设计就是换一个包。
 * 包内的其它配色见 `colors/`。
 *
 * === 为什么默认配色刻意不给任何 token ===
 * 默认配色就是 `mobile-auth.scss` 里的基线配色本身。这样有两个好处：
 *   1. 不启用任何配色时，渲染路径与「没有主题机制」时完全一致（零回归风险）
 *   2. 基线的明暗两档色值只存在于一个地方，不会与配色包里的副本互相漂移
 *
 * @author yijiu2025
 */
import type { MauthThemePackage } from '@/theme/types';

export default {
  meta: {
    id: 'default',
    name: '石墨（默认）',
    description: '中性灰蓝，深色 CTA + 浅灰底，适配任何品牌色的中性底座',
    preview: { primary: '#1e293b', accent: '#2563eb' }
  }
} satisfies MauthThemePackage;
