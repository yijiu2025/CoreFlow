/**
 * 材质层 —— 把 64 个令牌收敛成 5 个「用户能理解的东西」
 *
 * === 为什么还要多一层 ===
 * `token-manifest.ts` 按**实现**分组（面与底 / 文字 / 语义色 / 控件 / 徽标…），
 * 那对写 CSS 的人合适，对调外观的人不合适：他脑子里想的是"我想把卡片弄得更透"
 * 或"侧栏别这么亮"，而不是"我要改 `--mauth-table-head-bg`"。
 *
 * 所以再加一层**材质**：画布 / 卡片 / 控件 / 文字 / 信号。这是用户面对编辑器时
 * 的第一层导航，也是「一套外观 = 五种材质的搭配」这个心智模型的落点。
 *
 * 🔴 材质**不新增任何令牌**，只是分组的归并视图。这样：
 *    · CSS 一行不用改（零回归风险）；
 *    · 令牌清单仍是唯一真相（`check:tokens` 继续守）；
 *    · 将来真要写 `materials.css`（材质类），也只是把现有组合固化成类，不用重定义色值。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { TOKEN_MANIFEST, type TokenGroup, type TokenMeta } from './token-manifest';

/** 一个材质 */
export interface Material {
  /** 材质 id（编辑器 tab 的 key） */
  id: string;
  /** 中文名 */
  name: string;
  /** 一句话：这个材质管的是什么 */
  description: string;
  /** 归入本材质的令牌分组 */
  groups: TokenGroup[];
}

/**
 * 五种材质（顺序 = 编辑器里的 tab 顺序，从"大面"到"细节"）
 *
 * 划分依据是**用户在界面上看到的东西**，不是代码里的模块：
 *   · 画布 —— 页面的底、侧栏、顶栏（决定"整体亮不亮"）
 *   · 卡片 —— 面板、表头、行悬停（决定"内容块之间怎么分开"）
 *   · 控件 —— 按钮、输入框、弹窗、分段、开关（决定"能点的东西长什么样"）
 *   · 文字 —— 四档文字、描边、圆角字号（决定"读起来累不累"）
 *   · 信号 —— 主色、成功/危险、徽标、分类色（决定"什么在提示我"）
 */
export const MATERIALS: Material[] = [
  {
    id: 'canvas',
    name: '画布',
    description: '页面底色、侧栏、顶栏 —— 决定整体亮不亮',
    groups: ['面与底', '侧栏与顶栏']
  },
  {
    id: 'panel',
    name: '卡片',
    description: '面板、表头、行悬停 —— 决定内容块怎么分开',
    groups: ['卡片与表格']
  },
  {
    id: 'control',
    name: '控件',
    description: '按钮、输入框、弹窗、分段、开关 —— 能点的东西',
    groups: ['控件']
  },
  {
    id: 'type',
    name: '文字',
    description: '四档文字、描边、圆角与字号',
    groups: ['文字', '描边', '形状与排版']
  },
  {
    id: 'signal',
    name: '信号',
    description: '主色、语义色、徽标、分类色 —— 什么在提示你',
    groups: ['语义色', '徽标', '分类色']
  }
];

/** 材质 id → 该材质下的令牌（按 `TOKEN_GROUPS` 的既有顺序展开） */
export function tokensOfMaterial(id: string): TokenMeta[] {
  const material = MATERIALS.find(item => item.id === id);
  if (!material) return [];
  return TOKEN_MANIFEST.filter(meta => material.groups.includes(meta.group));
}

/**
 * 材质 → 令牌数量（编辑器 tab 上的角标）
 *
 * @returns 材质 id → 数量
 */
export function materialCounts(): Record<string, number> {
  return Object.fromEntries(MATERIALS.map(item => [item.id, tokensOfMaterial(item.id).length]));
}

/**
 * 某个令牌属于哪个材质
 *
 * @param key 令牌名
 * @returns 材质 id；未登记返回空串
 */
export function materialOf(key: string): string {
  const meta = TOKEN_MANIFEST.find(item => item.key === key);
  if (!meta) return '';
  return MATERIALS.find(item => item.groups.includes(meta.group))?.id ?? '';
}
