import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { VitePWA } from 'vite-plugin-pwa';

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
    }),
    // PWA：离线缓存静态资源 + 可安装到主屏幕
    // base 对齐 /posecraft/，SW 注册路径正确
    // generateSW 自动生成 SW（默认缓存策略），适合 SPA
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo.svg'],
      // 排除 AI 模型文件（29M+），不预缓存大资源
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff,woff2,ttf}'],
        // 调高上限兜底（默认 2MiB，部分 chunk 可能略超）
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // 导航 fallback：SPA 路由离线可用
        navigateFallback: '/posecraft/index.html',
        navigateFallbackDenylist: [/^\/posecraft\/models\//]
      },
      manifest: {
        name: 'PoseCraft',
        short_name: 'PoseCraft',
        description: 'AI 姿势分析 + 图片编辑平台',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        scope: '/posecraft/',
        start_url: '/posecraft/',
        icons: [
          { src: '/posecraft/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/posecraft/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/posecraft/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  base: '/posecraft/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'stable-deviceid': fileURLToPath(new URL('../packages/shared-device/src/index.ts', import.meta.url))
    }
  },
  server: {
    port: 5176,
    host: '0.0.0.0',
    allowedHosts: ['posecraft.localhost'],
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
      },
      '/uploads/': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../public/posecraft',
    emptyOutDir: true,
    rollupOptions: {
      // 🔴 这些是 @tensorflow-models 的 peer 依赖，但它们的 esm 构建顶部**无条件** import，
      //    而本项目所有模型一律用 `runtime: 'tfjs'` + `tfjs-backend-webgl`（见 useAi.ts /
      //    useAIAnalysis.ts），从不走 mediapipe / wasm / webgpu 分支，这些 import 全是死路径。
      //    - @mediapipe/*：IIFE 全局脚本，无 ESM 命名导出（vite5/esbuild 宽容，vite8/rolldown 报错）
      //    - tfjs-backend-wasm / webgpu：本项目未安装、也从不启用（只装 webgl）
      //    vite8/rolldown 对未解析 import 严格报错，externalize 它们：构建时不解析、运行时也不加载
      //    （死分支不触发这些 import），行为与 vite5 时代完全一致。
      external: [
        '@mediapipe/hands',
        '@mediapipe/selfie_segmentation',
        '@mediapipe/face_mesh',
        '@mediapipe/pose',
        '@tensorflow/tfjs-backend-wasm',
        '@tensorflow/tfjs-backend-webgpu'
      ]
    }
  }
});
