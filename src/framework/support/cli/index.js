/**
 * CLI 工具库入口
 *
 * 定位：跨业务 CLI 基础设施，零业务语义。供两处共用：
 * - `scripts/cli.js` 宿主及其内置命令
 * - 各应用的 CLI 插件 `src/app/<app>/cli/*.js`
 *
 * 为什么放在 `src/` 而不是 `scripts/`：
 * `src/` 内的代码不得反向依赖 `scripts/` —— `scripts/` 是**可选宿主**，不一定随部署安装。
 * 历史上这些工具位于 `scripts/lib/`，导致 `src/app/<app>/cli/` 反向 import `scripts/`，
 * 形成 `src → scripts → src` 的依赖环，且打包/部署时路径直接解析失败。
 *
 * @module framework/cli
 */
export * from './table.js';
export * from './input.js';
