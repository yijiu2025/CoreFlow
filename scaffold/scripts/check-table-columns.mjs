#!/usr/bin/env node
/**
 * 表格列数自检（`<colgroup>` 与 `colspan` 必须自洽）
 *
 * === 为什么需要它 ===
 * `table-layout: fixed` 下，多出来的一列会把**剩余宽度全吃掉**：表头只铺到第 8 列、
 * 右侧留一大块白，空态文字还居中在整行里看起来"偏左"。这类问题 `vue-tsc` 看不出来、
 * 单测也测不到，只能靠肉眼在某个分辨率下撞见（2026-11-17 登录日志页真实反馈）。
 *
 * 成因几乎都是**列被合并了而 colspan 没跟上**：登录日志把"IP"与"归属地"合成一列
 * （9 → 8），空态行仍写 `colspan="9"`，于是凭空多出一列。
 *
 * 判据：
 *   1. 文件里同时有 `<colgroup>` 与 `colspan="N"` 才检查；
 *   2. `N` 必须等于 `<col>` 的数量（一个 `<col>` = 一列；`span` 属性展开后计算）；
 *   3. 表格有多个 `<table>` 时按出现顺序配对（本项目每页最多一个 `<colgroup>`）。
 *
 * 用法：
 *   node scripts/check-table-columns.mjs            # 默认扫 src
 *   node scripts/check-table-columns.mjs src other/src
 *
 * @author yijiu2025
 * @since 2026-11-17
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** 递归收集 .vue */
function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (entry.endsWith('.vue')) out.push(full);
  }
  return out;
}

/**
 * `<colgroup>` 里的列数（`<col span="2">` 算两列）
 *
 * @param {string} text 文件内容
 * @returns {number} 列数；没有 colgroup 返回 0
 */
function countColumns(text) {
  const start = text.indexOf('<colgroup');
  if (start < 0) return 0;
  const end = text.indexOf('</colgroup>', start);
  if (end < 0) return 0;
  const block = text.slice(start, end);
  let total = 0;
  for (const m of block.matchAll(/<col\b([^>]*)>/g)) {
    const span = /span="(\d+)"/.exec(m[1]);
    total += span ? Number(span[1]) : 1;
  }
  return total;
}

const roots = process.argv.slice(2).filter(arg => !arg.startsWith('-'));
const targets = roots.length ? roots : ['src'];

let problems = 0;
let checked = 0;

for (const root of targets) {
  const abs = resolve(root);
  let files = [];
  try {
    files = collect(abs);
  } catch {
    console.log(`跳过（不存在）：${root}`);
    continue;
  }

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const cols = countColumns(text);
    if (!cols) continue;
    checked += 1;

    for (const m of text.matchAll(/colspan="(\d+)"/g)) {
      const span = Number(m[1]);
      if (span === cols) continue;
      const line = text.slice(0, m.index).split('\n').length;
      console.log(`✗ ${relative(process.cwd(), file)}:${line}  colspan="${span}" ≠ ${cols} 列`);
      problems += 1;
    }
  }
}

if (problems) {
  console.log(`\n✗ 表格列数不自洽：${problems} 处（colgroup 有多少列，colspan 就该写多少）`);
  process.exit(1);
}
console.log(`OK · 检查 ${checked} 张带 colgroup 的表格，colspan 与列数一致`);
