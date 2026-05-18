import { defineStore } from 'pinia'
import { ref, watchEffect } from 'vue'

export const useThemeStore = defineStore('theme', () => {
  const isDark = ref(
    localStorage.getItem('theme') === 'dark' ||
    (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
  )

  watchEffect(() => {
    // 同步到 class
    document.documentElement.classList.toggle('dark', isDark.value)
    // 持久化
    localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
  })

  function toggleTheme() {
    isDark.value = !isDark.value
    localStorage.setItem('theme-manual', 'true')
  }

  // 监听系统主题变化
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme-manual')) {
      isDark.value = e.matches
    }
  })

  return { isDark, toggleTheme }
})
