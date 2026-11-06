/**
 * 生成 `scripts/jest/shims/cookie.cjs`（jest 专用 CJS 镜像）
 *
 * 为什么需要：`cookie@2` 是纯 ESM，而 `light-my-request@6`（fastify `app.inject()`
 * 的实现）是 CJS，在里面静态 `require('cookie')`。Node ≥ 24.9 时 jest 30 能原生
 * require(esm)；Node 22.x 会走 `createRequireEsmError` → 所有 `app.inject()` 用例
 * 整片失败（"Must use import to load ES Module"）。
 *
 * 为什么不手写 shim：`@fastify/cookie` 用 `await import('cookie')` 取 parseCookie，
 * 手写镜像迟早漏 API（漏一个是 500，不是编译错误）。这里直接把真包**整份转译**成
 * CJS，导出面与语义跟被安装的版本逐字一致。
 *
 * 用法（升级 cookie 后重跑，产物需一并提交）：
 *   node scripts/jest/shims/build-cookie-shim.mjs
 *
 * 守卫：src/__tests__/test-env-cookie-shim.test.js 会比对镜像与真包的输出，
 * 并断言镜像头部的版本号与实际安装版本一致 —— 忘了重跑会直接红。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const SRC = path.join(ROOT, 'node_modules/cookie/dist/index.js');
const PKG = path.join(ROOT, 'node_modules/cookie/package.json');
const OUT = path.join(HERE, 'cookie.cjs');

if (!fs.existsSync(SRC)) {
  console.error(`✗ 找不到 cookie 包源码：${SRC}（先 npm i）`);
  process.exit(1);
}

const version = JSON.parse(fs.readFileSync(PKG, 'utf8')).version;
const source = fs.readFileSync(SRC, 'utf8');

// 用包自己的 exports 面核对，避免转译产物与 package.json 声明漂移
const declaredExports = Object.keys(await import(pathToFileURL(SRC).href)).sort();

const { code } = transformSync(source, {
  loader: 'js',
  format: 'cjs',
  target: 'node22',
  legalComments: 'inline'
});

const banner = `/**
 * ⚠️ 自动生成，请勿手改 —— 改这个文件等于给自己埋一个"跟真包行为不一致"的雷。
 *
 * cookie 的 CJS 镜像（**仅供 jest**，不进运行时）：
 * jest 里 light-my-request@6(CJS) 会 require('cookie')，而 cookie@2 是纯 ESM，
 * Node 22.x 的 jest 无法 require(esm) → 所有 app.inject() 用例整片失败。
 * jest.config.js 的 moduleNameMapper 把 'cookie' 指到本文件兜底。
 *
 * 来源：node_modules/cookie/dist/index.js
 * 版本：cookie@${version}
 * 导出：${declaredExports.join(', ')}
 * 再生成：node scripts/jest/shims/build-cookie-shim.mjs
 */

`;

fs.writeFileSync(OUT, banner + code, 'utf8');
console.log(`✓ 已生成 ${path.relative(ROOT, OUT)}（cookie@${version}，导出 ${declaredExports.length} 个）`);
