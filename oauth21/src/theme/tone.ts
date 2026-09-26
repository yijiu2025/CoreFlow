/**
 * 系别（tone）—— **re-export 壳**（2026-09-26 抽包 Stage 1）
 *
 * 实现已迁到工作区包 `mauth-theme-core`（`packages/theme-core/src/tone.ts`）。
 * 本文件只做转发，作用有两个：
 *   1. `@/theme/tone` 这个导入面**一个字不变** —— 容器、面板、关卡都不用改；
 *   2. 任何一期抽包都能**独立回滚**：把实现搬回本文件、删掉壳即可。
 *
 * 🔴 壳里**不得有任何逻辑**（哪怕是重命名、默认值、一行工具函数）：一旦有，
 *    就会出现"两份真相"。要改行为，去 `packages/theme-core/src/tone.ts`，
 *    本文件只在导入面需要变化时才动。
 */
export { THEME_TONES, TONE_LABELS, isThemeTone, normalizeTone } from 'mauth-theme-core';
export type { ThemeTone } from 'mauth-theme-core';
