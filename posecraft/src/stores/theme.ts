/**
 * 主题状态管理
 *
 * iframe 主题同步：posecraft 嵌入 oauth21 登录 iframe 时，切主题通过 postMessage
 * 通知 oauth21 同步切换（解决 iframe 隔离导致父子主题不同步）。
 * 消息协议：{ type: 'THEME_CHANGE', isDark: boolean }
 */
import { defineStore } from 'pinia';
import { ref, watchEffect } from 'vue';
import { useColorMode, usePreferredDark } from '@vueuse/core';

/** oauth21 前端 origin（env 配置；dev 默认 oauth21 vite 端口） */
const OAUTH21_ORIGIN = (import.meta as any).env?.VITE_OAUTH21_ORIGIN || 'http://localhost:5174';

/**
 * 同步主题到所有 oauth21 iframe（切主题 + iframe load 时调）
 * @param isDark 是否深色
 */
function syncThemeToIframes(isDark: boolean) {
  try {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      try {
        iframe.contentWindow?.postMessage({ type: 'THEME_CHANGE', isDark }, OAUTH21_ORIGIN);
      } catch {
        // 跨域 iframe contentWindow 访问受限，忽略
      }
    });
  } catch {
    // ignore
  }
}

export const useThemeStore = defineStore('theme', () => {
  const colorMode = useColorMode({ storageKey: 'posecraft_theme' });
  const isDark = ref(false);
  const preferredDark = usePreferredDark();

  watchEffect(() => {
    isDark.value = colorMode.value === 'dark' || (colorMode.value === 'auto' && preferredDark.value);
    document.documentElement.classList.toggle('dark', isDark.value);
    // isDark 变化时同步给所有 oauth21 iframe（切主题 / 系统偏好变化都触发）
    syncThemeToIframes(isDark.value);
  });

  function toggleTheme() {
    colorMode.value = colorMode.value === 'light' ? 'dark' : 'light';
  }

  return { isDark, colorMode, toggleTheme, syncThemeToIframes };
});
