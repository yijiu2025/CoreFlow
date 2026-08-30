import { defineStore } from 'pinia';
import { ref, watchEffect } from 'vue';

/**
 * 主题状态管理
 * 功能：切换深浅色、持久化偏好、监听系统级 prefers-color-scheme、iframe 父应用同步
 *
 * 三种主题来源（优先级从高到低）：
 * 1. 父应用同步（iframe 嵌入时，父切主题子跟着切，applyTheme 触发）
 * 2. 本地手动偏好（localStorage 'theme' + 'theme-manual' 标记）
 * 3. 系统偏好（prefers-color-scheme，未手动锁定时跟随）
 */
export const useThemeStore = defineStore('theme', () => {
  // 1. 初始化：优先本地存储，其次系统偏好
  const isDark = ref(
    localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );

  // 2. 响应式同步 DOM 与本地存储
  watchEffect(() => {
    document.documentElement.classList.toggle('dark', isDark.value);
    localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
  });

  // 3. 切换主题（用户在本应用内主动切）
  function toggleTheme() {
    isDark.value = !isDark.value;
    localStorage.setItem('theme-manual', 'true'); // 标记为手动选择
  }

  /**
   * 应用外部主题（iframe 父应用同步用）
   * 父应用切主题时 postMessage 通知子应用，子应用调此方法同步。
   * 不写 'theme-manual' 标记（父应用是来源，不算子应用用户手动选择）。
   * @param dark 是否深色
   */
  function applyTheme(dark: boolean) {
    isDark.value = dark;
  }

  // 4. 监听系统主题变化 (仅在未手动锁定时跟随)
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => {
    if (!localStorage.getItem('theme-manual')) {
      isDark.value = e.matches;
    }
  };
  mediaQuery.addEventListener('change', handler);

  /**
   * 清理系统主题监听器（应用卸载或 HMR 时调）
   * 导出 dispose 是为了遵循优雅关闭原则；正常 SPA 生命周期 store 与 app 同寿命不会调，
   * 主要给 HMR / 单元测试场景用
   */
  function dispose() {
    mediaQuery.removeEventListener('change', handler);
  }

  return { isDark, toggleTheme, applyTheme, dispose };
});
