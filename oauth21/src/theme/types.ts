/**
 * 主题包契约 —— **re-export 壳**（2026-09-26 抽包 Stage 1）
 *
 * 实现已迁到工作区包 `mauth-theme-core`（`packages/theme-core/src/types.ts`）。
 * 本文件只做转发，作用有两个：
 *   1. `@/theme/types` 这个导入面**一个字不变** —— 30 多个配色/版式文件都用它取
 *      `MauthThemeColor` / `MauthThemePackage`，少改一处就少一份漂移风险；
 *   2. 任何一期抽包都能**独立回滚**：把实现搬回本文件、删掉壳即可。
 *
 * 🔴 壳里**不得有任何逻辑**，也**不得再用 `export *`**：公开面要能被一行行读出来，
 *    加一个契约类型就显式加一行（契约是承诺，不承诺的别顺手带出去）。
 *    要改契约，去 `packages/theme-core/src/types.ts`。
 */
export type {
  MauthThemeMeta,
  MauthThemePackage,
  MauthThemeColor,
  MauthThemeRecord
} from 'mauth-theme-core';
