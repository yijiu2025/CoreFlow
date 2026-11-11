#!/usr/bin/env node
/**
 * SFC 组件解析自检
 *
 * 为什么需要它：`vue-tsc` **不会**对模板里未导入的 PascalCase 组件报错（实测
 * 0 error），只在运行时由 Vue 打 `[Vue warn]: Failed to resolve component: X`。
 * 这类错误在生产构建里同样静默——组件直接渲染成空标签，图标/面板凭空消失。
 *
 * 判据（任一命中即视为已解析）：
 *   1. `<script>` / `<script setup>` 里 import 进来的名字（含 default 与命名导入的本地别名）
 *   2. script 里 `const X = ...` / `function X` / `defineAsyncComponent`
 *   3. Vue 内置（Transition / Teleport / Suspense …）与框架全局注册（RouterView / RouterLink）
 *   4. `<script setup>` 的同目录自动注册（未实现：本项目不依赖它）
 *
 * 用法：
 *   node scripts/check-sfc-components.mjs               # 默认扫 src
 *   node scripts/check-sfc-components.mjs src ../oauth21/src
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** Vue 自身与框架提供的全局组件 */
const GLOBAL_ALLOW = new Set([
  'Transition', 'TransitionGroup', 'KeepAlive', 'Teleport', 'Suspense',
  'Component', 'Slot', 'Fragment', 'BaseTransition',
  'RouterView', 'RouterLink', 'NuxtLink',
]);

/** 从脚本段收集已定义的名字 */
function collectDefined(scriptText) {
  const names = new Set();

  // import Default, { a, b as c } from '...'
  const importRe = /import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g;
  let m;
  while ((m = importRe.exec(scriptText))) {
    const clause = m[1];
    const defaultPart = clause.split('{')[0];
    for (const piece of defaultPart.split(',')) {
      const name = piece.replace(/\btype\b/g, '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
    const braceMatch = /\{([\s\S]*?)\}/.exec(clause);
    if (braceMatch) {
      for (const piece of braceMatch[1].split(',')) {
        const cleaned = piece.replace(/\btype\b/g, '').trim();
        if (!cleaned) continue;
        const local = cleaned.split(/\s+as\s+/).pop().trim();
        if (/^[A-Za-z_$][\w$]*$/.test(local)) names.add(local);
      }
    }
  }

  // const X = / function X / class X
  for (const re of [/\bconst\s+([A-Za-z_$][\w$]*)\s*=/g, /\bfunction\s+([A-Za-z_$][\w$]*)/g, /\bclass\s+([A-Za-z_$][\w$]*)/g]) {
    while ((m = re.exec(scriptText))) names.add(m[1]);
  }

  return names;
}

/**
 * 提取模板正文：把 <script> / <style> 整段删掉，剩下的就是模板。
 *
 * 不用「截第一个 <template> 到第一个 </template>」—— 模板里常嵌套 `<template #slot>`，
 * 那种写法会把嵌套 template 的收尾当成根节点的收尾，后半段漏检。
 */
function extractTemplate(sfc) {
  return sfc
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/** PascalCase 组件标签 */
function collectTags(templateText) {
  const tags = [];
  const tagRe = /<([A-Z][\w$]*)(?=[\s/>])/g;
  let m;
  while ((m = tagRe.exec(templateText))) tags.push(m[1]);
  return tags;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.vue')) out.push(full);
  }
  return out;
}

const roots = process.argv.slice(2);
if (roots.length === 0) roots.push('src');

const problems = [];
let scanned = 0;

for (const root of roots) {
  const abs = resolve(root);
  let files;
  try {
    files = statSync(abs).isDirectory() ? walk(abs) : [abs];
  } catch {
    console.error(`跳过不存在的路径：${root}`);
    continue;
  }
  for (const file of files) {
    scanned += 1;
    const sfc = readFileSync(file, 'utf8');
    const template = extractTemplate(sfc);
    if (!template) continue;
    const scriptMatch = /<script[^>]*>([\s\S]*?)<\/script>/.exec(sfc);
    const defined = collectDefined(scriptMatch ? scriptMatch[1] : '');
    // SFC 可以按文件名自引用（递归组件），算已解析
    const selfName = file.split(/[\\/]/).pop().replace(/\.vue$/, '');
    const missing = new Set();
    for (const tag of collectTags(template)) {
      if (GLOBAL_ALLOW.has(tag)) continue;
      if (defined.has(tag)) continue;
      if (tag === selfName) continue;
      missing.add(tag);
    }
    if (missing.size) problems.push({ file: relative(process.cwd(), file), tags: [...missing] });
  }
}

if (problems.length === 0) {
  console.log(`OK · 扫描 ${scanned} 个 SFC，未发现未解析组件`);
  process.exit(0);
}

console.error(`发现 ${problems.length} 个 SFC 使用了未定义组件（Vue 运行时会打 warn 并渲染为空）：`);
for (const p of problems) console.error(`  ${p.file}  →  ${p.tags.join(', ')}`);
process.exit(1);
