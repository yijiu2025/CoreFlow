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
 *
 * ⚠️ `asThemeDevice` **不在这里转发**（2026-09-27）：它需要设备白名单（`THEME_DEVICES`），
 *    而取值集合已下沉到应用侧 `@/theme/devices.ts` —— 内核不认识设备集合，自然不提供
 *    归一化。要取设备归一化，从 `@/theme/devices` 引 `asThemeDevice`。
 */
export { readDeviceParam } from 'mauth-theme-core';
export type { DeviceScopedParam } from 'mauth-theme-core';
