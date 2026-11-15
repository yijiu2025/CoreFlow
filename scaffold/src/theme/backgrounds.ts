/**
 * 背景（壁纸）—— 「外观三档」的第一档，与**配色**互相独立
 *
 * === 为什么背景不塞进配色 ===
 * 配色管的是"这套搭配本身长什么样"（底色、文字四档、语义色、组件色），而背景是
 * **同一套配色下的另一种选择**：同一套「石墨夜」，有人喜欢纯色、有人喜欢壁纸。
 * 早先壁纸绑在 `star` 配色里，结果是"想要壁纸就得连配色一起换"，浅色主题也用不了。
 *
 * 现在它是独立维度：`<html data-mauth-bg="…">` + `assets/styles/backgrounds.css`，
 * 与配色正交、可任意组合，落盘 `mauth:bg`。
 *
 * 🔴 壁纸是**图片**，进不了 token（skinsuite 白名单只收单值），所以走 CSS。
 * 🔴 新增一张壁纸 = 这里加一条 + backgrounds.css 加一段选择器 + 放图到 assets。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */

/** 一个可选背景 */
export interface BackgroundPreset {
  /** id（进 `data-mauth-bg`，只允许 [a-z0-9-]） */
  id: string;
  /** 显示名 */
  name: string;
  /** 一句话说明 */
  description: string;
}

/** 全部背景（顺序 = 面板里的顺序，第一条是默认） */
export const BACKGROUNDS: BackgroundPreset[] = [
  {
    id: 'none',
    name: '纯色',
    description: '跟随配色自带的底色'
  },
  {
    id: 'star',
    name: '星空',
    description: '深蓝夜空 + 星野，面板半透明（配深色配色）'
  }
];

/** 本地存储键（与 `mauth:mode` / `mauth:theme` / `mauth:view` 同一命名族） */
export const BACKGROUND_STORAGE_KEY = 'mauth:bg';

/** 默认背景 id（= 纯色，不写任何额外样式） */
const DEFAULT_BACKGROUND_ID = 'none';

/**
 * 读本地背景偏好
 *
 * @returns 合法的背景 id；从未选过或值已失效时返回默认
 */
export function readBackgroundId(): string {
  try {
    const saved = localStorage.getItem(BACKGROUND_STORAGE_KEY);
    if (saved && BACKGROUNDS.some(item => item.id === saved)) return saved;
  } catch {
    // 隐私模式下 localStorage 可能抛错：按默认走，不阻塞启动
  }
  return DEFAULT_BACKGROUND_ID;
}

/**
 * 应用背景（写 `<html data-mauth-bg>`）
 *
 * 样式全部在 `backgrounds.css` 里按属性选择器生效，所以这里只改属性 ——
 * 不往 DOM 里塞内联样式，切回来时也不会留下脏行内样式。
 *
 * @param id 背景 id
 * @returns 实际生效的 id（非法值回落默认）
 */
export function applyBackground(id: string): string {
  const known = BACKGROUNDS.some(item => item.id === id);
  const next = known ? id : DEFAULT_BACKGROUND_ID;
  if (typeof document !== 'undefined') document.documentElement.dataset.mauthBg = next;
  return next;
}
