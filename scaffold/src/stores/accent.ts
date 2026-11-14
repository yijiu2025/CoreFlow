/**
 * 主题色 store（宿主壳）
 *
 * 三层职责分开：
 *   - `@/theme/accent`：预设表 + 写 CSS 变量 + 本地缓存（纯函数，无网络）；
 *   - 本 store：当前选择 + **自动保存**（防抖后写 `user_user.preferences`）；
 *   - 个人设置页：只是这个 store 的一个视图。
 *
 * 🔴 自动保存不是"每次点击都发请求"：连点色卡会打出一串 PUT。
 *    统一 400ms 防抖，并且**只发最后一个值**；保存状态用 `saveState` 暴露给页面提示。
 *
 * 🔴 登录后以**服务端为准**（`hydrate`）：本地缓存只是"离线也能记住"，
 *    换设备时若本地还留着旧色、却不让服务端覆盖，用户会看到"设置没同步"。
 *
 * `sync()` 必须在**主题应用之后**调用：主题包与我们是同一层 inline 变量，
 * 后写者胜。根组件 watch 主题状态并在 `flush: 'post'` + `nextTick` 后 sync，
 * 保证换明暗 / 换主题包时主色不会被主题默认值顶回去。
 *
 * @author yijiu2025
 * @since 2026-11-12
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { savePreferences } from '@/api/session';
import { ACCENTS, applyAccent, readAccentId, setAccent } from '@/theme/accent';

/** 自动保存状态 */
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export const useAccentStore = defineStore('accent', () => {
  const presets = ACCENTS;
  const currentId = ref(readAccentId());
  const saveState = ref<SaveState>('idle');
  const errorMessage = ref('');
  /** 防抖定时器（同一时刻只应有一个待发请求） */
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** 立即写库（内部用） */
  async function persist(): Promise<void> {
    saveState.value = 'saving';
    errorMessage.value = '';
    try {
      await savePreferences({ accent: currentId.value });
      saveState.value = 'saved';
    } catch (err) {
      saveState.value = 'error';
      errorMessage.value = err instanceof Error ? err.message : '保存失败';
    }
  }

  /**
   * 选择主题色：立即生效 + 防抖落库
   *
   * @param id 预设 ID
   */
  function pick(id: string): void {
    currentId.value = setAccent(id).id;
    saveState.value = 'saving';
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void persist();
    }, 400);
  }

  /**
   * 用服务端偏好覆盖本地（登录 / 刷新后调用）
   *
   * 服务端没有值（新账号）时保留本地，并**顺手把本地上报一次** ——
   * 否则用户在新设备上必须先点一下才会留下记录。
   *
   * @param accent 服务端保存的主题色 ID
   */
  function hydrate(accent?: string): void {
    const known = accent && presets.some(item => item.id === accent);
    if (known && accent !== currentId.value) {
      currentId.value = setAccent(accent).id;
      return;
    }
    applyAccent(currentId.value);
    if (!accent) void persist();
  }

  /** 主题变化后重写变量（明暗/主题包切换会重写 token） */
  function sync(): void {
    applyAccent(currentId.value);
  }

  return { presets, currentId, saveState, errorMessage, pick, hydrate, sync };
});
