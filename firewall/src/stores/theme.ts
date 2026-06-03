/**
 * 主题状态管理
 *
 * 特性：
 * - 深浅色切换，持久化到 localStorage
 * - 响应系统级 prefers-color-scheme
 * - HSL 色彩变量驱动
 * - 主题色变更自动生成 9 级色阶
 */
import { defineStore } from 'pinia'
import { ref, watchEffect } from 'vue'
import { useColorMode, usePreferredDark } from '@vueuse/core'
import { useCache } from '@/composables/useCache'

const cache = useCache('localStorage')

/** 默认主题色 HSL */
const DEFAULT_PRIMARY = '222.2 47.4% 11.2%'

export const useThemeStore = defineStore('theme', () => {
  // 使用 VueUse 管理色彩模式
  const colorMode = useColorMode({
    storageKey: 'fw_theme',
    modes: {
      light: 'light',
      dark: 'dark',
      auto: 'auto'
    }
  })

  const isDark = ref(false)
  const primaryColor = ref(cache.get<string>('primaryColor') || DEFAULT_PRIMARY)
  const preferredDark = usePreferredDark()

  /** 同步 isDark 状态 */
  watchEffect(() => {
    if (colorMode.value === 'auto') {
      isDark.value = preferredDark.value
    } else {
      isDark.value = colorMode.value === 'dark'
    }
    document.documentElement.classList.toggle('dark', isDark.value)
  })

  /**
   * 设置主题色（HSL 格式）
   * @param hsl HSL 字符串，如 '222.2 47.4% 11.2%'
   */
  function setPrimaryColor(hsl: string) {
    primaryColor.value = hsl
    cache.set('primaryColor', hsl)
    applyPrimaryColor(hsl)
  }

  /** 应用主题色到 CSS 变量 */
  function applyPrimaryColor(hsl: string) {
    const root = document.documentElement.style
    root.setProperty('--primary', hsl)
  }

  /** 切换深浅色 */
  function toggleTheme() {
    if (colorMode.value === 'light') {
      colorMode.value = 'dark'
    } else if (colorMode.value === 'dark') {
      colorMode.value = 'auto'
    } else {
      colorMode.value = 'light'
    }
    cache.set('themeMode', colorMode.value)
  }

  /** 直接设置模式 */
  function setTheme(mode: 'light' | 'dark' | 'auto') {
    colorMode.value = mode
    cache.set('themeMode', mode)
  }

  // 初始化主题色
  applyPrimaryColor(primaryColor.value)

  return {
    isDark,
    colorMode,
    primaryColor,
    toggleTheme,
    setTheme,
    setPrimaryColor
  }
})
