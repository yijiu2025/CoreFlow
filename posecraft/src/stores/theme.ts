/**
 * 主题状态管理
 */
import { defineStore } from 'pinia'
import { ref, watchEffect } from 'vue'
import { useColorMode, usePreferredDark } from '@vueuse/core'

export const useThemeStore = defineStore('theme', () => {
  const colorMode = useColorMode({ storageKey: 'posecraft_theme' })
  const isDark = ref(false)
  const preferredDark = usePreferredDark()

  watchEffect(() => {
    isDark.value = colorMode.value === 'dark' ||
      (colorMode.value === 'auto' && preferredDark.value)
    document.documentElement.classList.toggle('dark', isDark.value)
  })

  function toggleTheme() {
    colorMode.value = colorMode.value === 'light' ? 'dark' : 'light'
  }

  return { isDark, colorMode, toggleTheme }
})
