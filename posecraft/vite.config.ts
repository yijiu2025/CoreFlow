import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
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
  base: '/posecraft/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5176,
    proxy: {
      // 代理 API 接口（不代理前端路由）
      '/auth/': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/user/': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/oauth21/': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/posecraft/v1/': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      // 代理 AI 模型文件
      '/models/': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../public/posecraft',
    emptyOutDir: true
  }
})
