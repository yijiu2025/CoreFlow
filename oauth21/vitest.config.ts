/**
 * oauth21 前端单元测试配置（vitest）
 *
 * === 为什么用 vitest 而非根 Jest ===
 * 根 jest.config.js 的 testMatch 是 `<root>/src/__tests__/` 下的 `.test.js`，且
 * `testEnvironment: 'node'` —— 匹配不到 `oauth21/__tests__`，也渲染不了 Vue 组件。
 * 前端组件测试需要 happy-dom（DOM）+ @vue/test-utils，vitest 与 Vite 同构、
 * 直接复用本仓的 alias 与 vue 插件，是 Vue 3 生态的标准选择。
 *
 * === alias 必须与 vite.config.js 一致 ===
 * `@` → src；`skinsuite` / `stable-deviceid` → 两个 workspace 包源码
 * （与 vite.config.js 的 resolve.alias 同形，否则组件里 import 这些包会解析失败）。
 */
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      'skinsuite': path.resolve(import.meta.dirname, '../packages/theme-core/src/index.ts'),
      'stable-deviceid': path.resolve(import.meta.dirname, '../packages/shared-device/src/index.ts')
    }
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    // 只认 `__tests__/` 与 `src/**/__tests__/` 下的测试文件
    include: ['__tests__/**/*.{test,spec}.{ts,js}', 'src/**/__tests__/**/*.{test,spec}.{ts,js}']
  }
});
