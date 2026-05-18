import { defineStore } from 'pinia'
import { ref, watchEffect } from 'vue'

/**
 * 主题状态管理
 * 功能：切换深浅色、持久化偏好、监听系统级 prefers-color-scheme
 */
export const useThemeStore = defineStore('theme', () => {
  // 1. 初始化：优先本地存储，其次系统偏好
  const isDark = ref(
    localStorage.getItem('theme') === 'dark' ||
    (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
  )

  // 2. 响应式同步 DOM 与本地存储
  watchEffect(() => {
    document.documentElement.classList.toggle('dark', isDark.value)
    localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
  })

  // 3. 切换主题
  function toggleTheme() {
    isDark.value = !isDark.value
    localStorage.setItem('theme-manual', 'true') // 标记为手动选择
  }

  // 4. 监听系统主题变化 (仅在未手动锁定时跟随)
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (e: MediaQueryListEvent) => {
    if (!localStorage.getItem('theme-manual')) {
      isDark.value = e.matches
    }
  }
  
  mediaQuery.addEventListener('change', handler)

  return { isDark, toggleTheme }
})
