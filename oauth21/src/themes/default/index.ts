/**
 * 默认主题：石墨
 *
 * 刻意**不提供任何 token** —— 默认主题就是 `mobile-auth.scss` 里的基线配色本身。
 * 这样有两个好处：
 *   1. 不启用任何主题时，渲染路径与「没有主题机制」时完全一致（零回归风险）
 *   2. 基线的明暗两档色值只存在于一个地方，不会与主题包里的副本互相漂移
 *
 * @author yijiu2025
 */
import type { MauthThemePackage } from '../types';

export default {
  meta: {
    id: 'default',
    name: '石墨（默认）',
    description: '中性灰蓝，深色 CTA + 浅灰底，适配任何品牌色的中性底座',
    preview: { primary: '#1e293b', accent: '#2563eb' }
  }
} satisfies MauthThemePackage;
