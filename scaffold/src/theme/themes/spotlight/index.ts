/**
 * 聚光主题包（spotlight）—— **包定义**
 *
 * 与 `default`（珍珠玻璃 / 居中承台）平级的第二套设计：**版式只改登录页**。
 *   · 版式：`standard/login/index.vue`、`mobile/login/index.vue`（后者共用同一实现）
 *   · 其它页面（console 壳）没有本包版式 → 版式回退 default 包
 *
 * 🔴 但**配色必须覆盖全部页面**（所以 console 也有 colors/）：`getThemeRecord` 只会在
 *    "同包同设备同页"里找，找不到就返回空记录 —— 那意味着 `?th=spotlight` 停留在
 *    后台壳页面时，token 一个都注入不了，整站退化成无样式。版式可以缺，配色不能缺。
 *
 * 切换版式 = 切换主题包：`?th=spotlight`（`th` 的值就是目标包名）。
 * 配色同样按 `?th_color=` 走，本包提供 white / black 两项（色值与 default 同源，见
 * `@/theme/palette.ts`）—— 也就是说本包只换**组织方式**，不改颜色语言。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import type { MauthThemePackage } from 'skinsuite';

export default {
  meta: {
    id: 'spotlight',
    name: '聚光',
    description: '左深右浅：叙事面板 + 登录卡分栏，适合首次接触与需要解释的场景',
    preview: { primary: '#236de9', accent: '#8bd94f' }
  },
  // 只覆盖「登录页」：console 壳与其它页面回退 default
  coverage: {
    devices: ['standard', 'mobile'],
    pages: ['login', 'console']
  }
} satisfies MauthThemePackage;
