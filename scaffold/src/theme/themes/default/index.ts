/**
 * 默认主题包（default）—— 包定义
 *
 * 目录名固定为 `default`：skinsuite 的内置兜底包名就是它（`DEFAULT_THEME_PACKAGE`），
 * 配色也约定 `white`（浅）/ `black`（深）两个具名项。oauth21 同样如此 —— 包目录名是
 * **机制词汇**，设计名放 `meta.name`（本包 = 珍珠玻璃）。
 *
 * 结构：
 *   `themes/default/<设备>/<页面>/colors/<配色>/`  设备：standard / mobile
 *                                                 页面：console（后台壳）/ login（登录页）
 *                                                 配色：white（浅）/ black（深）
 *
 * 🔴 `<页面>/` 下**没有**「版式」这一层：要另一种版式请新建包（如 `themes/compact/`）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import type { MauthThemePackage } from 'skinsuite';

export default {
  meta: {
    id: 'default',
    name: '珍珠玻璃',
    description: '柔和灰白底 + 克制玻璃浮层 + 细边线，仪器化读数与刻度语汇',
    preview: { primary: '#236de9', accent: '#58a021' }
  }
} satisfies MauthThemePackage;
