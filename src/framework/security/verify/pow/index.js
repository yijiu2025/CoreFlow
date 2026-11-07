/**
 * 工作量证明（PoW）模块入口
 *
 * 能力边界见 `./service.js` 头注释：**只出题、判题**；
 * 何时出题 / 绑谁 / 通过后给多久 / 页面怎么渲，全部留在调用方（防火墙）。
 *
 * ⚠️ `makePowSolver` 与 `SHA256_K` 是给"内联进浏览器"用的：挑战页会用
 * `toString()` 把函数体发过去，所以这两个导出不能改成 class/箭头简写，
 * 也不能让它们依赖闭包外的其他变量（跨端对拍用例会红）。
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
export * from './service.js';
export * as powService from './service.js';
export { default as powDao } from './dao.js';
