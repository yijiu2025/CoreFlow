> **⚠️ 已迁出本仓（仅作历史参考）**
>
> 本文描述的前端工程（`oauth21` / `posecraft` / `admin` / `poseadmin` / `firewall` / `phonecopy`）
> 已于 2026-10-31 从本仓库移除，改为独立维护。**文中出现的源码路径、目录结构与 npm 命令均已失效**，
> 接入或改造时请以对应前端仓自身的文档为准（`oauth21` → https://github.com/yijiu2025/oauth-web ）。
>
> 本仓只保留**后端**相关规范；后端侧的认证集成契约见 [auth-integration](../../standards/auth-integration.md)。

---

# 主题系统 {#frontend-theme}

> 本文是**基线层**（CSS 变量 + 明暗 Store），即主题替换机制的「第 1 层」。
> 多主题包 / 多版式 / 多配色的完整替换机制（换 UI 不改业务代码）见
> [theme-replacement.md](./theme-replacement.md)；演进细节见 [multi-theme.md](./theme-replacement.md)。

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
import { defineStore } from 'pinia';
import { ref, watchEffect } from 'vue';
import { useColorMode, usePreferredDark } from '@vueuse/core';

export const useThemeStore = defineStore('theme', () => {
  const colorMode = useColorMode({ storageKey: 'theme_mode' });
  const isDark = ref(false);
  const preferredDark = usePreferredDark();

  watchEffect(() => {
    isDark.value = colorMode.value === 'dark' || (colorMode.value === 'auto' && preferredDark.value);
    document.documentElement.classList.toggle('dark', isDark.value);
  });

  function toggleTheme() {
    colorMode.value = colorMode.value === 'light' ? 'dark' : 'light';
  }

  return { isDark, colorMode, toggleTheme };
});
```

## 字体栈

```css
/* 标题 */
h1,
h2,
h3 {
  font-family: 'Outfit', 'Plus Jakarta Sans', sans-serif;
}

/* 正文 */
body {
  font-family: 'DM Sans', 'Source Sans 3', system-ui, sans-serif;
}

/* 代码 */
code,
pre {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}
```

## UI 风格预设

| 风格          | 特点                           |
| ------------- | ------------------------------ |
| Minimalist    | 极简、高留白、细边框           |
| Glassmorphism | 毛玻璃、半透明、灵动渐变       |
| Shadcn/Radix  | 现代极简原语风格，HSL 变量驱动 |

## Vite 配置

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';

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
});
```
