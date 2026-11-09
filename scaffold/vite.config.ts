/**
 * Vite 配置 —— 主题插件 / 别名 / 端口 / 代理
 *
 * 端口从 `.env` 的 `VITE_PORT` 读取（默认 5175，本机 5173/5174/5176/5177 已被占用），
 * `strictPort` 保持开启：端口被占直接报错，避免联调时连错服务。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.VITE_PORT) || 5175;
  const apiTarget = env.VITE_API_TARGET || 'http://127.0.0.1:3000';

  return {
    // 注意：**不挂 themeAssets()** —— console 只交付一套设计（珍珠玻璃），
    // 没有 themes/<包>/<设备>/<页面>/colors/ 目录可扫。配色在 assets/styles/tokens.css。
    // 需要多套设计时再建主题包目录并挂插件（见 stores/theme.ts 文件头）。
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // 共享库源码直供（本仓约定：packages/* 在→源码，发布后走包）
        'stable-deviceid': fileURLToPath(new URL('../packages/shared-device/src/index.ts', import.meta.url)),
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
        '/user': { target: apiTarget, changeOrigin: true }
      }
    },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 900
    }
  };
});
