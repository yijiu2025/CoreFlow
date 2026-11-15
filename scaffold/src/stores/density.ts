/**
 * 密度 store
 *
 * 与 `stores/background.ts` 同构：数据在 `theme/density.ts`，这里只管当前值 +
 * 落盘 + 写到 DOM 属性。密度是**宿主产品概念**（一屏放多少内容），主题库不认识它。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { DENSITIES, DENSITY_STORAGE_KEY, applyDensity, readDensityId } from '@/theme/density';

export const useDensityStore = defineStore('density', () => {
  /** 可选档位（顺序 = 面板顺序） */
  const presets = DENSITIES;

  /** 当前档位 id */
  const currentId = ref(applyDensity(readDensityId()));

  /**
   * 切一个密度档位（落盘 + 立即生效）
   *
   * @param id 档位 id（未知值忽略，不写脏数据）
   */
  function pick(id: string): void {
    if (!presets.some(item => item.id === id)) return;
    currentId.value = applyDensity(id);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, currentId.value);
    } catch {
      // 隐私模式下存不上：本次会话仍然生效，不阻塞
    }
  }

  return { presets, currentId, pick };
});
