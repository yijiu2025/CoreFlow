/**
 * 密度（表格行高 / 单元格内距 / 控件高度）
 *
 * === 为什么它不属于「主题」 ===
 * 主题（包）换的是**结构**，配色换的是**颜色**，而密度换的是**一屏能放多少东西** ——
 * 它既不改变 DOM，也不改变色板，只改三个尺寸变量的值。三者正交，可任意组合。
 *
 * 参考实现（scaffold-master-main）把密度做在 `appearance.ts` 里（comfy / regular / compact），
 * 这是后台类产品的标配：数据密集的岗位/日志页要紧凑，编辑类页面要宽松。
 *
 * 🔴 只动这三个尺寸，**不要**顺手改字号或圆角：字号变化会打乱排版的节奏，
 *    圆角已经由配色层（`--mauth-radius-*`）管了。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */

/** 一个密度档位 */
export interface DensityPreset {
  id: string;
  name: string;
  description: string;
}

/** 全部档位（顺序 = 面板顺序，中间那档是默认） */
export const DENSITIES: DensityPreset[] = [
  { id: 'comfy', name: '宽松', description: '行高 56，适合阅读与录入' },
  { id: 'regular', name: '标准', description: '行高 48，默认' },
  { id: 'compact', name: '紧凑', description: '行高 40，一屏多看几行' }
];

/** 本地存储键（与 `mauth:mode` / `mauth:accent` 同一命名族） */
export const DENSITY_STORAGE_KEY = 'mauth:density';

/** 默认档位 */
const DEFAULT_DENSITY_ID = 'regular';

/**
 * 读本地密度偏好
 *
 * @returns 合法档位 id；从未选过或值已失效时返回默认
 */
export function readDensityId(): string {
  try {
    const saved = localStorage.getItem(DENSITY_STORAGE_KEY);
    if (saved && DENSITIES.some(item => item.id === saved)) return saved;
  } catch {
    // 隐私模式下 localStorage 可能抛错：按默认走，不阻塞启动
  }
  return DEFAULT_DENSITY_ID;
}

/**
 * 应用密度（写 `<html data-density>`）
 *
 * 具体尺寸在 `assets/styles/tokens.css` 里按属性选择器覆盖 —— 那里只改三个变量，
 * 所以任何组件（表格、工具栏、分页）都自动跟着变，不用逐个组件改。
 *
 * @param id 档位 id
 * @returns 实际生效的 id（非法值回落默认）
 */
export function applyDensity(id: string): string {
  const known = DENSITIES.some(item => item.id === id);
  const next = known ? id : DEFAULT_DENSITY_ID;
  if (typeof document !== 'undefined') document.documentElement.dataset.density = next;
  return next;
}
