/**
 * 背景 store（壁纸 / 纯色）
 *
 * 与 `stores/accent.ts` 同构：数据在 `theme/backgrounds.ts`，这里只管**当前值 + 落盘 +
 * 写到 DOM 属性**。之所以独立成 store 而不是塞进 theme store：
 *
 *   · 背景是**宿主产品概念**（有哪些壁纸、缩略图怎么画），主题库不认识它；
 *   · 它与配色正交（同一套配色可配不同背景），生命周期也不同（配色由注册表决定，
 *     背景由用户偏好决定）。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';
import {
  BACKGROUNDS,
  BACKGROUND_STORAGE_KEY,
  applyBackground,
  readBackgroundId
} from '@/theme/backgrounds';

export const useBackgroundStore = defineStore('background', () => {
  /** 可选背景（顺序 = 面板顺序） */
  const presets = BACKGROUNDS;

  /** 当前背景 id */
  const currentId = ref(applyBackground(readBackgroundId()));

  /**
   * 选一个背景（落盘 + 立即生效）
   *
   * @param id 背景 id（未知值忽略，不写脏数据）
   */
  function pick(id: string): void {
    if (!presets.some(item => item.id === id)) return;
    currentId.value = applyBackground(id);
    try {
      localStorage.setItem(BACKGROUND_STORAGE_KEY, currentId.value);
    } catch {
      // 隐私模式下存不上：本次会话仍然生效，不阻塞
    }
  }

  return { presets, currentId, pick };
});
