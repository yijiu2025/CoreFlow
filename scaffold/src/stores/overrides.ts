/**
 * 自定义模式 store（逐令牌覆盖）
 *
 * 三层职责：
 *   · `@/theme/overrides`：校验 + 写 DOM（纯函数）；
 *   · 本 store：当前覆盖表 + 落本地 + 上报账号；
 *   · 设置页的材质面板：只是这个 store 的视图。
 *
 * 🔴 **应用时机是命门**：覆盖必须写在主题层与 accent 层**之后**（三者同为 inline，
 *    后写者胜）。`App.vue` 的 watch 在 `flush: 'post'` + `nextTick` 里依次调
 *    `accentStore.sync()` 与 `overridesStore.apply()` —— 顺序不能颠倒。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { savePreferences } from '@/api/session';
import { useThemeStore } from '@/stores/theme';
import {
  applyOverrides,
  hasOverrides,
  isValidOverride,
  normalizeOverrides,
  readOverrides,
  writeOverrides,
  type TokenOverrides
} from '@/theme/overrides';

export const useOverridesStore = defineStore('overrides', () => {
  /** 当前覆盖表 */
  const current = ref<TokenOverrides>(readOverrides());

  /** 是否有任何覆盖 */
  const active = computed(() => hasOverrides(current.value));

  /** 覆盖项数（面板角标） */
  const count = computed(() => Object.keys(current.value).length);

  /** 防抖定时器 */
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** 上报账号（覆盖式：清空也要同步，否则别的设备还原不回来） */
  function persist(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void savePreferences({ overrides: current.value }).catch(() => {
        // 本地已生效；上报失败不打断操作（下次任意改动会再传一次）
      });
    }, 400);
  }

  /**
   * 应用当前覆盖表
   *
   * 每次都从主题 store 读一遍基值：换配色 / 换明暗后，被取消的覆盖要还原成**新**配色的值，
   * 而不是上一套配色的值。
   */
  function apply(): void {
    const tokens = useThemeStore().themeRecordFor().tokens ?? {};
    applyOverrides(current.value, tokens);
  }

  /**
   * 设置一项覆盖
   *
   * @param key 令牌名
   * @param value CSS 值（非法值忽略，不写脏数据）
   */
  function set(key: string, value: string): void {
    if (!isValidOverride(key, value)) return;
    current.value = { ...current.value, [key]: value.trim() };
    writeOverrides(current.value);
    apply();
    persist();
  }

  /**
   * 取消若干项覆盖（还原成配色自带的值）
   *
   * @param keys 令牌名列表
   */
  function reset(keys: string[]): void {
    const next = { ...current.value };
    let touched = false;
    for (const key of keys) {
      if (key in next) {
        delete next[key];
        touched = true;
      }
    }
    if (!touched) return;
    current.value = next;
    writeOverrides(next);
    apply();
    persist();
  }

  /** 清空全部覆盖 */
  function resetAll(): void {
    if (!active.value) return;
    current.value = {};
    writeOverrides({});
    apply();
    persist();
  }

  /**
   * 用服务端覆盖表覆盖本地（登录 / 刷新后调用）
   *
   * 服务端**没有**这个键（老账号 / 从没用过自定义）时保留本地，并把本地上报一次 ——
   * 否则用户在新设备上必须先动一下才会留下记录。
   *
   * @param remote 服务端下发的覆盖表
   */
  function hydrate(remote?: unknown): void {
    if (remote && typeof remote === 'object' && Object.keys(remote).length > 0) {
      current.value = normalizeOverrides(remote);
      writeOverrides(current.value);
      apply();
      return;
    }
    apply();
    if (active.value) persist();
  }

  return { current, active, count, apply, set, reset, resetAll, hydrate };
});
