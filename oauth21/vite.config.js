import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      // 注意：不放 '@vueuse/core' —— 本仓零使用，且其 useCountdown 与本地
      // src/composables/useCountdown.ts 重名，会触发 Duplicated imports 警告
      imports: ['vue', 'vue-router', 'pinia', 'vue-i18n'],
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
      iconDirs: [path.resolve(import.meta.dirname, 'src/assets/icons')],
      symbolId: 'icon-[dir]-[name]'
    })

    // ⛔️ 这里刻意**没有** `VitePWA` —— 2026-09-27 整体移除。
    //
    // 判断依据不是"收益不高"，而是**登录页根本不适用**，规范里本来就写着这一条：
    // `docs/frontend/PWA_GUIDE.md` §一「适用场景：内容型应用…**不适用**：纯登录页（oauth21 用完即走，
    // 安装价值低）」。也就是说此前的集成是**违反自家规范**的 —— 这条移除是把实现改回规范，不是改规范迁就实现。
    //
    // 为什么"收益低"就足以移除：登录页是入口闸门，SW 的首访成本必须每次重付
    // （全新浏览器 / 无痕 / 清了缓存 / 新用户），而它换来的复用收益恰恰付在最不需要快的地方
    // （用户不会反复冷启同一个 origin，一次登录能用很久）。
    //
    // 直接原因是两条**已实测**的危害，任一都足以定案：
    //   ① 未配 denylist 的 `NavigationRoute` 会把一切同源 GET 导航顶成预缓存的 index.html
    //      ⇒ 后端设备码授权页 `/oauth2.1/device`（`verification_uri`，只能靠浏览器导航打开）
    //        必然不可用。A/B 对照实验坐实：屏蔽 SW 拿到设备页，装过 SW 变成 SPA 骨架。
    //   ② 预缓存把整棵 dist 写进 `sw.js` 清单，首访多下 780 KB —— 页面自身按需只要 214 KB，
    //      78% 的流量是这次根本用不到的东西。
    //
    // ⚠️ 想加回来之前，先读 `docs/frontend/PWA_GUIDE.md` 第六节「如何移除」：
    //    光删配置**清不掉**已经装过 SW 的浏览器（它会一直用旧 SW、永远不回源），必须留一次自毁迁移。
    //    本仓那次迁移就是 `oauth21/public/sw.js`（它的顶部注释写了何时可以删）。
  ],
  resolve: {
    alias: {
      // Vite 原生 configLoader（未来默认）不支持 CJS 的 __dirname，用 ESM 的 import.meta.dirname
      '@': path.resolve(import.meta.dirname, './src'),
      'stable-deviceid': path.resolve(import.meta.dirname, '../packages/shared-device/src/index.ts'),
      // 主题内核（工作区源码直供，与 stable-deviceid 同形）：包只发源码，不发 dist。
      // 指到 src/index.ts 而不是包目录，是为了不依赖 node_modules 里那条符号链接
      // （符号链接由 npm install 生成，首次克隆后还没装依赖时也必须能解析）。
      'mauth-theme-core': path.resolve(import.meta.dirname, '../packages/theme-core/src/index.ts')
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
    // chunk 大小警告阈值：回落 Vite 默认 500 KB。
    // 实测最大 chunk 仅 170.91 KB，远未触及 500 KB 默认线 —— 此前抬高到 1024 无实际收益，
    // 反而会掩盖未来的真实膨胀，故回落默认值，让体积告警重新生效。
    chunkSizeWarningLimit: 500
  }
});
