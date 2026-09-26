/**
 * 明暗意图（mode）—— **re-export 壳**（2026-09-26 抽包 Stage 1）
 *
 * 实现已迁到工作区包 `mauth-theme-core`（`packages/theme-core/src/mode.ts`）。
 * 本文件只做转发，作用有两个：
 *   1. `@/theme/mode` 这个导入面**一个字不变** —— 容器、面板、关卡都不用改；
 *   2. 任何一期抽包都能**独立回滚**：把实现搬回本文件、删掉壳即可。
 *
 * 🔴 壳里**不得有任何逻辑**（哪怕是重命名、默认值、一行工具函数）：一旦有，
 *    就会出现"两份真相"。要改行为，去 `packages/theme-core/src/mode.ts`。
 */
export { MODE_CYCLE, MODE_LABELS, isThemeMode, normalizeMode } from 'mauth-theme-core';
export type { ThemeMode } from 'mauth-theme-core';
