import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // 自动导入 Vue 核心 API、Router、Pinia、i18n
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia', 'vue-i18n'],
      dirs: ['./src/composables/auto-imports/**'],
      dts: './src/types/auto-imports.d.ts',
      eslintrc: { enabled: false }
    }),
    // 自动注册 src/components/ 下所有组件
    Components({
      dirs: ['src/components'],
      extensions: ['vue'],
      dts: './src/types/components.d.ts'
    })
  ],
  base: '/firewall/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../public/firewall',
    emptyOutDir: true
  },
  test: {
    environment: 'happy-dom',
    globals: true,
  }
})
