# 主题系统 {#frontend-theme}

## CSS 变量

所有前端使用统一的 HSL 色彩变量：

```css
:root {
  --primary: 238.7 83.5% 66.7%;
  --accent: 238.3 82.7% 67.5%;
  --muted: 210 40% 96.1%;
  --bg: #f8fafc;
  --text: #1e293b;
  --glass-bg: rgba(255, 255, 255, 0.7);
  --glass-border: rgba(255, 255, 255, 0.4);
}

.dark {
  --primary: 188.9 94.4% 42.7%;
  --accent: 188.9 94.4% 42.7%;
  --muted: 217.2 32.6% 17.5%;
  --bg: #020617;
  --text: #f1f5f9;
  --glass-bg: rgba(15, 23, 42, 0.6);
  --glass-border: rgba(255, 255, 255, 0.1);
}
```

## theme Store

```typescript
import { defineStore } from 'pinia'
import { ref, watchEffect } from 'vue'
import { useColorMode, usePreferredDark } from '@vueuse/core'

export const useThemeStore = defineStore('theme', () => {
  const colorMode = useColorMode({ storageKey: 'theme_mode' })
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
```

## 字体栈

```css
/* 标题 */
h1, h2, h3 { font-family: 'Outfit', 'Plus Jakarta Sans', sans-serif; }

/* 正文 */
body { font-family: 'DM Sans', 'Source Sans 3', system-ui, sans-serif; }

/* 代码 */
code, pre { font-family: 'JetBrains Mono', 'Fira Code', monospace; }
```

## UI 风格预设

| 风格 | 特点 |
|------|------|
| Minimalist | 极简、高留白、细边框 |
| Glassmorphism | 毛玻璃、半透明、灵动渐变 |
| Shadcn/Radix | 现代极简原语风格，HSL 变量驱动 |

## Vite 配置

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia', 'vue-i18n'],
      dts: './src/types/auto-imports.d.ts'
    }),
    Components({
      dirs: ['src/components'],
      dts: './src/types/components.d.ts'
    })
  ],
  base: '/your-base-path/',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } }
  },
  build: {
    outDir: '../public/your-app-name',
    emptyOutDir: true
  }
})
```
