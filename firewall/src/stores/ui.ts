/**
 * UI 状态 Store
 * 管理主题、语言、HUD 可见性、全局 loading
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import i18n from '@/i18n'

export const useUiStore = defineStore('ui', () => {
  const isDarkMode = ref(localStorage.getItem('theme') !== 'light')
  const isUIVisible = ref(true)
  const loading = ref(false)

  function toggleTheme(): void {
    setTheme(!isDarkMode.value)
  }

  function setTheme(mode: boolean): void {
    isDarkMode.value = mode
    localStorage.setItem('theme', isDarkMode.value ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', isDarkMode.value)
  }

  function toggleUI(): void {
    isUIVisible.value = !isUIVisible.value
  }

  function setLocale(l: string): void {
    i18n.global.locale.value = l
    localStorage.setItem('lang', l)
  }

  function toggleLang(): void {
    const langs = ['zh', 'en', 'ja', 'fr', 'de'] as const
    const nextIdx = (langs.indexOf(i18n.global.locale.value as any) + 1) % langs.length
    setLocale(langs[nextIdx])
  }

  return {
    isDarkMode,
    isUIVisible,
    loading,
    toggleTheme,
    setTheme,
    toggleUI,
    setLocale,
    toggleLang
  }
})
