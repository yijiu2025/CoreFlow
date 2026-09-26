/**
 * 紧凑主题包（compact）—— **包定义**
 *
 * === 它在多主题包结构里的位置 ===
 * `themes/compact/` 是一个**独立的主题包**（与 `default` 平级），
 * 每个主题包包含**一种版式**（架构约定）：
 *   • 本包只覆盖 register 页面的紧凑版式
 *   • login / forgot-password 在本包里没有实现 → 回退到 default 包
 *
 * 切换版式 = 切换主题包：用 `?view=compact`（`?view` 的值就是**目标包名**），
 * 或在某个包的 `index.ts` 里写 `views: { register: 'compact' }`。
 *
 * === 与 default 包的关系 ===
 * 本包与 default 包在 register 页面有**对称的版式**实现：
 *   • default 包：基础版式（`mobile/register/index.vue`）
 *   • compact 包：紧凑版式（本包 `mobile/register/index.vue`）
 * 两包各自的 colors/ 目录只服务本包内该版式的可选配色。
 *
 * @author yijiu2025
 */
import type { MauthThemePackage } from '@/theme/types';

export default {
  meta: {
    id: 'compact',
    name: '紧凑版式包',
    description: '手机端 register 紧凑版式与配套配色：信息密度更高、控件更紧凑',
    preview: { primary: '#0e7490', accent: '#2563eb' }
  }
} satisfies MauthThemePackage;