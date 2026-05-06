/**
 * Dark/Light theme composable
 * 统一管理组件中的主题样式选择
 */

interface ThemeProps {
  isDarkMode?: boolean
  isDark?: boolean
}

interface ThemeReturn {
  isDark: () => boolean
  t: (darkClass: string, lightClass: string) => string
  tm: (base: string, darkClass: string, lightClass: string) => string
}

export function useTheme(props: ThemeProps): ThemeReturn {
  const isDark = (): boolean => props.isDarkMode ?? props.isDark ?? false

  const t = (darkClass: string, lightClass: string): string =>
    isDark() ? darkClass : lightClass

  const tm = (base: string, darkClass: string, lightClass: string): string =>
    `${base} ${isDark() ? darkClass : lightClass}`

  return { isDark, t, tm }
}
