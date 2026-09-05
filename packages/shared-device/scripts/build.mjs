/**
 * deviceid npm 包构建脚本
 *
 * 逐模块转换 src/*.js + index.ts → dist/*.js（ESM，target es2020，保留目录结构，
 * 不打包成单文件以保持 tree-shaking），并复制全部手写 .d.ts 到 dist——
 * .d.ts 内的相对导入 './xxx.js' 与 dist 结构一致，可直接解析。
 * dist/index.d.ts 由 tsconfig.build.json（tsc emitDeclarationOnly）单独产出。
 *
 * esbuild 从根 node_modules 解析（vite 的依赖），无需在包内重复安装。
 *
 * @author qirly
 * @since 2026-09-05
 */
import { build } from 'esbuild';
import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(pkgRoot, 'src');
const distDir = join(pkgRoot, 'dist');

/** 递归收集 src 下的 .js 与 .ts 文件（跳过 __tests__） */
function collectSourceFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__') continue;
      files.push(...collectSourceFiles(full));
    } else if (/\.(js|ts)$/.test(name) && !name.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

mkdirSync(distDir, { recursive: true });

const entries = collectSourceFiles(srcDir);
for (const entry of entries) {
  const outPath = join(distDir, entry.slice(srcDir.length + 1)).replace(/\.ts$/, '.js');
  await build({
    entryPoints: [entry],
    outfile: outPath,
    bundle: false, // 逐模块转换，保留 import 关系以支持 tree-shaking
    format: 'esm',
    target: 'es2020',
    minify: false,
    sourcemap: false,
    legalComments: 'none'
  });
}

// 复制手写 .d.ts（与 dist 下 .js 同构相对路径）
for (const entry of entries) {
  const dts = entry.replace(/\.(js|ts)$/, '.d.ts');
  try {
    cpSync(dts, join(distDir, dts.slice(srcDir.length + 1)));
  } catch {
    // index.ts 无同名 .d.ts（由 tsc 产出），跳过
  }
}

console.log(`✅ [deviceid] 构建完成：${entries.length} 个模块 → dist/`);
