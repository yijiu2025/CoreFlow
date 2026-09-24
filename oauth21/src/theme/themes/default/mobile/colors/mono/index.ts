/**
 * 黑白配色（mono）—— 属于 `themes/default/` 主题包，**移动端**
 *
 * === 它在两级结构里的位置 ===
 * `themes/default/mobile/colors/mono/` 是**配色**：只换颜色 / 圆角 / 背景图，**不动 DOM**。
 * 它的上位 `themes/default/` 才是**主题包**（一套完整设计），本目录同级的
 * `themes/default/mobile/` 是这套设计在**移动端**的版式。
 * 配色 id 以**目录名**为准（`mono`），URL `?theme=mono` 用的就是它。
 *
 * === 为什么 mono 是一套正式配色，而不是"没有配色" ===
 * 在补齐 devices（`mobile/` / `web/`）之前，黑白是"什么都不配"时的隐式兜底
 * —— 它没有名字、不出现在配色列表里、也没法被显式选中。补齐之后它有了 id，
 * 于是「黑白」与「海蓝」「天蓝」在配置层面是**平级的三套配色**：
 * 部署方可以显式写 `?theme=mono`，后台也能列出它。
 *
 * ⚠️ 但它刻意**不给任何 token**：黑白档的色值就是 `mobile-auth.scss` 的基线本身。
 *    这是为了保住"零配色时渲染路径与没有主题机制时完全一致"这条不变量
 *    —— 基线明暗两档色值只存在于一个地方，不会与配色副本互相漂移。
 *    所以本文件是**具名的基线配色**，语义上等于 `themes/default/` 的默认呈现。
 *
 * ⚠️ 明暗（浅色 / 深色 / 跟随系统）由 `theme/mode.ts` 管，与配色**正交**：
 *    `mono` 在浅色下是白底黑字、深色下是黑底白字，这是明暗维度在起作用，
 *    不是 mono 自己提供了两套色。所以这里同样不需要写 dark 变体。
 *
 * @author yijiu2025
 */
import type { MauthThemeColor } from '@/theme/types';

export default {
  meta: {
    id: 'mono',
    name: '黑白',
    description: '纯中性黑白灰，无品牌色倾向；明暗两档由系统/用户切换',
    preview: { primary: '#1e293b', accent: '#64748b' },
    author: 'oauth21'
  }
} satisfies MauthThemeColor;
