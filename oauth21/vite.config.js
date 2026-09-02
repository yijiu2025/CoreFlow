import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia', '@vueuse/core', 'vue-i18n'],
      dts: 'src/auto-import.d.ts',
      dirs: ['src/composables', 'src/stores'],
      vueTemplate: true
    }),
    Components({
      extensions: ['vue'],
      include: [/\.vue$/, /\.vue\?vue/],
      dts: 'src/components.d.ts'
    }),
    createSvgIconsPlugin({
      iconDirs: [path.resolve(process.cwd(), 'src/assets/icons')],
      symbolId: 'icon-[dir]-[name]'
    }),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Enterprise Login',
        short_name: 'Login',
        theme_color: '#4f46e5',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@nodeservers/shared-device': path.resolve(__dirname, '../packages/shared-device/src/index.ts')
    }
  },
  server: {
    host: '0.0.0.0', // 允许内网 IP 访问（手机调试）
    port: 5174,
    strictPort: true, // 端口被占直接报错，不自动换端口（避免手机连错端口）
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, '')
      },
      '/verify': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/user': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/oauth2.1': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/assets/styles/variables.scss" as *;`
      }
    }
  },
  build: {
    // 生产构建删除所有 console 调用（防 Error 堆栈泄露到浏览器 DevTools）
    // 关键错误通过 main.ts 的 useErrorReporter 上报到后端（/api/v1/client-error）
    // 不依赖客户端 console 留痕
    esbuild: {
      drop: ['console']
    },
    // 生产不输出 .map 文件（防源码泄露到 dist）
    // 需要调试时单独配 sourcemap: true 单独 build
    sourcemap: false,
    // chunk 大小警告阈值（Vite 默认 500KB，oauth21 较大组件略超）
    chunkSizeWarningLimit: 1024
  }
});
