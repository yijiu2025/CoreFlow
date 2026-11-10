/**
 * Vite 配置 —— 主题插件 / 别名 / 端口 / 代理
 *
 * 端口从 `.env` 的 `VITE_PORT` 读取（默认 5175，本机 5173/5174/5176/5177 已被占用），
 * `strictPort` 保持开启：端口被占直接报错，避免联调时连错服务。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { defineConfig, loadEnv, type PluginOption } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
// 🔴 这里必须走**相对源码路径**，不能写 `skinsuite/vite`：
//    vite 配置在加载时由 esbuild 单独打包，**不走 resolve.alias**（alias 只作用于
//    应用代码），而 packages/theme-core 的 exports 指向未构建的 dist。
//    写包名会在 `vite` / `vite build` 启动阶段直接报 "Cannot find package 'skinsuite'"。
import { themeAssets } from '../packages/theme-core/src/vite/index.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.VITE_PORT) || 5175;
  const apiTarget = env.VITE_API_TARGET || 'http://127.0.0.1:3000';

  return {
    // 主题域扫描：扫 src/theme（VITE_THEME_DIR，缺省 src/theme）→ 虚拟模块 virtual:theme。
    // 零参调用：目录由插件用 Vite 自己加载的 env 解析，无 mode 传递与 cwd 陷阱。
    // 类型桥接：packages/theme-core 自带一份 vite（版本与宿主不同），其 Plugin 类型
    // 与宿主 vite 的 PluginOption 不同源。运行期是同一套钩子协议，这里只做类型对齐。
    // TODO: 宿主 vite 升到 8 与 oauth21 对齐后，这个断言可以去掉。
    plugins: [themeAssets() as unknown as PluginOption, vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // 共享库源码直供（本仓约定：packages/* 在→源码，发布后走包）
        'stable-deviceid': fileURLToPath(new URL('../packages/shared-device/src/index.ts', import.meta.url)),
        // 人机挑战页共享库（纯源码，不经 npm 安装；见 packages/challenge-client/src/index.ts 注释）
        'challenge-client': fileURLToPath(new URL('../packages/challenge-client/src/index.ts', import.meta.url)),
        // 🔴 子路径必须排在裸包名之前：alias 是**前缀替换**，`skinsuite` 在前会把
        //    `skinsuite/vue` 改写成 `<…>/src/index.ts/vue`（实际踩过）。
        'skinsuite/vue': fileURLToPath(new URL('../packages/theme-core/src/vue/index.ts', import.meta.url)),
        'skinsuite/vite': fileURLToPath(new URL('../packages/theme-core/src/vite/index.ts', import.meta.url)),
        skinsuite: fileURLToPath(new URL('../packages/theme-core/src/index.ts', import.meta.url))
      }
    },
    server: {
      host: '0.0.0.0',
      port,
      strictPort: true,
      proxy: {
        // 后端同源代理：Cookie（sid/sid_r）随请求直达，不需要跨域配置
        '/admin': { target: apiTarget, changeOrigin: true },
        '/auth': { target: apiTarget, changeOrigin: true },
        '/user': { target: apiTarget, changeOrigin: true },
        // 人机挑战接口（/api/firewall/v1/challenge/*）：挑战页是独立入口，
        // 必须能直接打到它；被防火墙挡住时唯一的自救通道就是这里。
        '/api/firewall': { target: apiTarget, changeOrigin: true }
      }
    },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        // 双入口：主应用 + 独立人机挑战页。
        // 挑战页必须是独立产物：主应用启动即请求 session/me，而该请求此刻正被 428
        // 挡着，把它做成主应用的一个路由会"一进页面就自我打死"。
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          challenge: fileURLToPath(new URL('./challenge.html', import.meta.url))
        }
      }
    }
  };
});
