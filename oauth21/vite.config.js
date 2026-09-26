import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { readFileSync } from 'node:fs';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons';
import { VitePWA } from 'vite-plugin-pwa';

/** 惰性主题资产的产出目录名（PWA 预缓存按它整目录排除，见 globIgnores） */
const LAZY_THEME_DIR = 'lazy-theme';

/**
 * 内置主题包 id 的**唯一来源**：内核包常量，不在构建配置里再写一份字面量
 *
 * 构建期要按它区分「内置包的版式（首屏可能用）」与「别的包的版式（惰性）」。
 * 解析失败就抛 —— 宁可构建期炸，也不要静默退回一个字面量、让排除规则错位。
 */
const BUILTIN_THEME_PKG = (() => {
  const file = path.resolve(import.meta.dirname, '../packages/theme-core/src/constants.ts');
  const matched = /DEFAULT_THEME_PACKAGE\s*=\s*'([a-z0-9-]+)'/.exec(readFileSync(file, 'utf8'));
  if (!matched) {
    throw new Error(`没从 ${file} 读到 DEFAULT_THEME_PACKAGE：构建配置要靠它判定哪些版式属于内置包`);
  }
  return matched[1];
})();

/** 主题包源码根目录（统一成正斜杠，Windows 下也要能前缀比对） */
const THEMES_SRC = path.resolve(import.meta.dirname, 'src/theme/themes').replace(/\\/g, '/');

/** 去 query、统一分隔符：`.../colors/cyan/theme.scss?inline` → `.../colors/cyan/theme.scss` */
const normalizeId = id => String(id ?? '').replace(/\\/g, '/').split('?')[0];

/**
 * 这个源文件属于「惰性主题资产」吗 —— 决定它产出到 `lazy-theme/` 还是 `assets/`
 *
 * === 为什么需要它 ===
 * 主题与版式是**刻意按需加载**的：第一跳只该有内置包三设备的版式与首屏配色，
 * 其它靠 `import.meta.glob` 切出的 chunk「用到才下」。但 `vite-plugin-pwa` 默认把
 * **整棵 dist** 塞进 precache，于是"按需"在生产首访被静默还原成"全下"——
 * dev 期看不出来（`devOptions` 关着），只有量产物才发现。
 *
 * 要让 SW 把惰性资产排除，`globIgnores` 只能按**产物路径**匹配，而默认产物名是
 * `assets/<basename>-<hash>.js`，直接用 basename 必然误伤：
 *   • 配色 `theme.scss`（`?inline`）切出的 chunk 叫 `theme-*.js`
 *     —— 与 `stores/theme.ts` 那个 50 kB chunk **撞名**，按名字排除会把 store 也排掉；
 *   • compact 包版式切出的 chunk 叫 `register-*.js` —— 与一堆路由 chunk 撞名。
 * 所以先把「惰性」写进**路径**（`lazy-theme/`），再让 SW 排除整个目录：
 * 规则与源目录口径一一对应，且与构建哈希无关。
 *
 * 判定口径（与关卡 `verify-theme-dirs.mjs` 的目录口径同源）：
 *   • `themes/<包>/<设备>/<页面>/colors/<配色>/theme.scss`
 *                                     → **永远惰性**（配色附加样式，选到才要）
 *   • `themes/<非内置包>/…`            → 惰性（换包/换版式才要）
 *   • `themes/<内置包>/…`              → 保留（三设备版式首屏可能就要）
 *
 * ⚠️ 本段注释里**不能**出现「星号紧跟斜杠」的字符组合（写 glob 时最容易顺手写出来）：
 *    它会提前闭合块注释，报的错会落在下面的正文上（`colors is not defined` 之类），
 *    排查时很难联想到注释。这个坑本仓踩过两次（见 types.ts 的同类告警）。
 *
 * @returns `'lazy-theme'` = 排除出预缓存；`null` = 走默认 `assets/`
 */
function lazyThemeDir(sourceId) {
  const id = normalizeId(sourceId);
  if (!id.startsWith(`${THEMES_SRC}/`)) return null;
  if (id.endsWith('/theme.scss')) return LAZY_THEME_DIR;
  const pkg = id.slice(THEMES_SRC.length + 1).split('/')[0];
  return pkg === BUILTIN_THEME_PKG ? null : LAZY_THEME_DIR;
}

/** 统一的产出路径：`<目录>/[name]-[hash]<尾巴>`（目录由 lazyThemeDir 决定） */
const themedFileNames = (dir, tail) => `${dir ?? 'assets'}/[name]-[hash]${tail}`;

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
    }),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        /**
         * 预缓存**不收录**惰性主题资产（`lazy-theme/` 整个目录，见上面的 lazyThemeDir）
         *
         * 用户口径（2026-09-26）：「第一次访问要用到的主题和版式是固定的（桌面 / mini / 手机版
         * 都在内置包里），缓存那些就够了；其它惰性主题和版式不必加载，首访流量最小」。
         * 代价：离线或二访时用到那些 chunk 会回源 —— 已确认接受，因为它换来的是
         * "预缓存不跟按需加载的设计对着干"。
         *
         * ⚠️ 这条规则**只影响预缓存**，产物照常生成、照常能被请求到；
         *    改这里之前先想清楚：排除太多 = 首访少下、离线缺件；排除太少 = 首访白下。
         */
        globIgnores: ['**/lazy-theme/**']
      },
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
    // chunk 大小警告阈值（Vite 默认 500KB，oauth21 较大组件略超）
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        /**
         * 惰性主题资产产出到 `lazy-theme/`，其余照旧 `assets/`
         *
         * 目的只有一个：让 PWA 那条 `globIgnores` 有东西可精确匹配（见 lazyThemeDir 的长注释）。
         * ⚠️ 想删掉这两个函数之前先读那段注释 —— 名字级的排除会误伤 `stores/theme.ts`。
         */
        chunkFileNames: info => themedFileNames(lazyThemeDir(info.facadeModuleId), '.js'),
        assetFileNames: info =>
          themedFileNames(lazyThemeDir(info.originalFileNames?.[0] ?? info.names?.[0]), '[extname]')
      }
    }
  }
});
