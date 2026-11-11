/**
 * 弹窗挂载守卫（约定测试）
 *
 * 背景（2026-11-11）：`UserDangerDialog` 的模板根节点漏了 `v-if`，而它在用户页是
 * **常驻挂载**的 —— 于是"点用户管理菜单，整页被一个空的高危操作弹窗盖住"。
 * 这类 bug 类型检查、SFC 组件自检、单测全都抓不到：它不报错，只是把整页挡住。
 *
 * 本守卫固化一条规则：**弹窗必须有一个显式的"打开条件"**，二选一 ——
 *   ① 组件自己在模板根节点的 `.modal-mask` 上写 `v-if`（如 GrantHistoryDialog / DeptHistoryDialog）；
 *   ② 挂载处写 `v-if`（如 BatchGrantDialog 用 `v-if="batchOpen"`）。
 * 由代码动态 createApp 的弹窗（RiskVerifyDialog）两个都不满足，但它是**按需创建**的，
 * 不会常驻，故在白名单里显式声明理由 —— 不允许"什么都不写"地漏过。
 *
 * 只读源码文本做静态断言，不 import 被测组件（与 app-isolation 同类结构守卫）。
 *
 * @author yijiu2025
 * @since 2026-11-11
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../../scaffold/src');
const COMPONENTS_DIR = path.join(SRC, 'components');
const VIEWS_DIR = path.join(SRC, 'views');

/**
 * 不设打开条件的弹窗（必须写清理由）
 *
 * key 是相对 `scaffold/src/components/` 的路径。
 */
const DYNAMIC_ONLY = new Map([
  ['business/RiskVerifyDialog.vue', '由 http 层 requireRiskVerify 通过 createApp 按需挂载，不存在"常驻"形态，无需 v-if']
]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.vue')) out.push(full);
  }
  return out;
}

const rel = full => path.relative(COMPONENTS_DIR, full).replace(/\\/g, '/');

/**
 * 取模板段（`<template>` 之後的文本）
 *
 * 只看第一个 template：本仓弹窗都是单根 div，`<template #slot>` 不会出现在最前面。
 *
 * @param {string} src SFC 源码
 * @returns {string} 模板文本
 */
function templateOf(src) {
  const start = src.indexOf('<template>');
  return start === -1 ? '' : src.slice(start + '<template>'.length);
}

/**
 * 组件根节点是否是 `.modal-mask`，以及它是否带 `v-if`
 *
 * @param {string} src SFC 源码
 * @returns {{isMask: boolean, guarded: boolean, tag: string}} 判定结果
 */
function rootShape(src) {
  const tpl = templateOf(src).trimStart();
  if (!tpl.startsWith('<')) return { isMask: false, guarded: false, tag: '' };
  const end = tpl.indexOf('>');
  const tag = tpl.slice(0, end + 1);
  return {
    isMask: /class="[^"]*modal-mask[^"]*"/.test(tag),
    guarded: /\bv-if\s*=/.test(tag),
    tag
  };
}

/**
 * 找出某个 SFC 里挂载了哪些 `*Dialog`，以及挂载标签上有没有 `v-if`
 *
 * @param {string} src SFC 源码
 * @returns {Array<{name: string, hasIf: boolean}>} 挂载点
 */
function dialogUsages(src) {
  const usages = [];
  const re = /<([A-Z][A-Za-z0-9]*Dialog)\b([^>]*)>/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    usages.push({ name: m[1], hasIf: /\bv-if\s*=/.test(m[2]) });
  }
  return usages;
}

describe('弹窗挂载守卫', () => {
  const componentFiles = walk(COMPONENTS_DIR);
  const viewFiles = walk(VIEWS_DIR);

  /** 组件名 → 文件（按文件名，本仓约定一致） */
  const byName = new Map();
  for (const file of componentFiles) {
    byName.set(path.basename(file, '.vue'), file);
  }

  test('每个弹窗要么自己写 v-if，要么挂载处写 v-if，要么显式声明为动态挂载', () => {
    const violations = [];

    for (const file of componentFiles) {
      const src = fs.readFileSync(file, 'utf8');
      const root = rootShape(src);
      if (!root.isMask) continue;
      if (root.guarded) continue;
      if (DYNAMIC_ONLY.has(rel(file))) continue;

      // 自身没守 → 必须所有挂载处都写了 v-if
      const name = path.basename(file, '.vue');
      const mountSites = viewFiles.filter(view => new RegExp(`<${name}\\b`).test(fs.readFileSync(view, 'utf8')));
      if (mountSites.length === 0) {
        violations.push(`${rel(file)}：根节点 .modal-mask 没有 v-if，且没有找到任何挂载点`);
        continue;
      }
      for (const view of mountSites) {
        const bad = dialogUsages(fs.readFileSync(view, 'utf8')).filter(u => u.name === name && !u.hasIf);
        if (bad.length > 0) {
          violations.push(
            `${rel(file)} 没有根节点 v-if，且挂载点 ${path.relative(SRC, view).replace(/\\/g, '/')} 的标签也没写 v-if`
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('白名单里的条目必须仍然存在且确实没有根节点 v-if（防幽灵豁免）', () => {
    for (const key of DYNAMIC_ONLY.keys()) {
      const file = path.join(COMPONENTS_DIR, key);
      expect(fs.existsSync(file)).toBe(true);
      expect(rootShape(fs.readFileSync(file, 'utf8')).guarded).toBe(false);
    }
  });
});
