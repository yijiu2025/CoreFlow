/**
 * 设备维度 URL 参数（`?view.<设备>`）—— **re-export 壳**（2026-09-26 抽包 Stage 1）
 *
 * 实现已迁到工作区包 `mauth-theme-core`（`packages/theme-core/src/views/params.ts`）。
 * 本文件只做转发，作用有两个：
 *   1. `@/theme/views/params` 这个导入面**一个字不变** —— 三页容器、三页注册表、
 *      调试面板、路由守卫都在用它取 `readDeviceParam`；
 *   2. 任何一期抽包都能**独立回滚**：把实现搬回本文件、删掉壳即可。
 *
 * 🔴 壳里**不得有任何逻辑**。要改行为，去 `packages/theme-core/src/views/params.ts`。
 */
export { asThemeDevice, readDeviceParam } from 'mauth-theme-core';
export type { DeviceScopedParam } from 'mauth-theme-core';
