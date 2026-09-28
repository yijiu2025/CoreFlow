/**
 * 路径别名**单一来源**（vite / vitest / tsconfig 三处共用）
 *
 * === 为什么要有这个文件 ===
 * 此前 `@` / `skinsuite` / `stable-deviceid` 三个别名被**手抄三份**：
 *   - `vite.config.js` 的 `resolve.alias`（构建 + dev server）
 *   - `vitest.config.ts` 的 `resolve.alias`（单测）
 *   - `tsconfig.app.json` 的 `compilerOptions.paths`（类型检查）
 * 三份里任意一份漏改，症状都不是报错而是**静默解析失败或解析到另一份实现**：
 *   - vite / vitest 漏改 → 组件 import 时 `Cannot find module`
 *   - tsconfig 漏改 → `vue-tsc -b` 报找不到声明（或退化成 any 而静默放过）
 * 两个本地包（`skinsuite` / `stable-deviceid`）**必须指到包内 `src/index.ts`（源码直供）**，
 * 刻意不指向包目录 —— 那样解析要靠 npm 建的 `node_modules/<pkg>` 符号链接，
 * 首次克隆还没装依赖时就解析不了。npm 侧在 package.json 里声明版本号只是为了
 * 让 lockfile / 供应链审计说得通，**运行期真伪以本文件为准**。
 *
 * === 为什么是 `.ts` 而不是 `.js` ===
 * 本文件被 `vite.config.ts`（TS）与 `vitest.config.ts`（TS）共同 import，且自身
 * 需要 `import.meta.dirname` 与类型标注。统一成 TS 后，两处 config 的**语言也统一为 TS**
 * （此前 vite.config 是 .js、vitest.config 是 .ts，同一份 alias 却跨语言抄）。
 *
 * === tsconfig paths 为什么不直接 import 本文件 ===
 * `compilerOptions.paths` 是 JSON 静态配置，无法求值 TS 模块。因此 `tsconfig.app.json`
 * 里那几条必须手写 —— 这是该约束下唯一无法消除的重复。为把风险降到最低：
 *   🔴 关卡 `e2e/verify-alias-single-source.mjs` 会**比对三处**（本文件 / tsconfig.app.json /
 *      vitest 实际解析）是否一致，任何一处漂移直接红。
 *
 * @see oauth21/e2e/verify-alias-single-source.mjs
 */
import path from 'node:path';

/** 本文件所在目录（= oauth21/config）。用 import.meta.dirname 避免 CJS 的 __dirname。 */
const HERE = import.meta.dirname;

/** oauth21 工程根（config/ 的上一级）。 */
export const OAUTH21_ROOT = path.resolve(HERE, '..');

/** monorepo 根（packages/ 的所在处，即 oauth21 的上一级）。 */
export const MONOREPO_ROOT = path.resolve(OAUTH21_ROOT, '..');

/**
 * 别名表：键 = import 说明符，值 = 绝对路径。
 *
 * 注：Vite 的 `resolve.alias` 做的是**精确键匹配**（不做前缀通配），
 * 所以 `skinsuite` 只解析裸说明符 `skinsuite` 本身，不会吞掉 `skinsuite/xxx` 子路径。
 * 两个本地包目前也只从入口 import（无子路径用法），故不需要通配键。
 */
export const aliases: Record<string, string> = {
  '@': path.resolve(OAUTH21_ROOT, 'src'),
  'stable-deviceid': path.resolve(MONOREPO_ROOT, 'packages/shared-device/src/index.ts'),
  'skinsuite': path.resolve(MONOREPO_ROOT, 'packages/theme-core/src/index.ts')
};

/**
 * tsconfig `paths` 形态（值必须是**相对 tsconfig 文件**的路径，且用 `/` 分隔）。
 * 供关卡与本文件比对；运行时不被 vite/vitest 读取。
 */
export const tsconfigPaths: Record<string, string[]> = {
  '@/*': ['./src/*'],
  'stable-deviceid': ['../packages/shared-device/src/index.ts'],
  'stable-deviceid/*': ['../packages/shared-device/src/*'],
  'skinsuite': ['../packages/theme-core/src/index.ts']
};

export default aliases;
