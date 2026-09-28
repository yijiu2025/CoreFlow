/**
 * oauth21 前端单元测试配置（vitest）
 *
 * === 为什么用 vitest 而非根 Jest ===
 * 根 jest.config.js 的 testMatch 是 `<root>/src/__tests__/` 下的 `.test.js`，且
 * `testEnvironment: 'node'` —— 匹配不到 `oauth21/__tests__`，也渲染不了 Vue 组件。
 * 前端组件测试需要 happy-dom（DOM）+ @vue/test-utils，vitest 与 Vite 同构、
 * 直接复用本仓的 alias 与 vue 插件，是 Vue 3 生态的标准选择。
 *
 * === alias 单一来源 ===
 * `@` / `skinsuite` / `stable-deviceid` 三个别名来自 `config/aliases.ts`，
 * 与 `vite.config.ts` 共用同一份定义（此前是两处手抄，漏改即静默解析失败）。
 * `tsconfig.app.json` 的 `paths` 因是静态 JSON 无法 import，仍手写 ——
 * 由 `e2e/verify-alias-single-source.mjs` 守三处一致。
 */
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { aliases } from './config/aliases';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: aliases
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    // 只认 `__tests__/` 与 `src/**/__tests__/` 下的测试文件
    include: ['__tests__/**/*.{test,spec}.{ts,js}', 'src/**/__tests__/**/*.{test,spec}.{ts,js}']
  }
});
