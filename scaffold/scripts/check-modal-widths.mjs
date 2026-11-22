#!/usr/bin/env node
/**
 * 弹窗宽度守卫（居中弹窗只能用 `.modal--xx` 五档）
 *
 * === 为什么需要它 ===
 * 后台有十多个弹窗，宽度原先各写各的（384 / 560 / 620 / 640 / 680 / 720 / 800 / 880）。
 * 同一类对话框宽度不一致，是用户一眼就能看出来的“不专业”，但 `vue-tsc` 看不出来、
 * 单测也测不到 —— 只能靠人记得。2026-11-22 统一成五档后加这条守卫，防止半年后
 * 又有人顺手写一个 `width: min(700px, 100%)`。
 *
 * 五档定义在 `src/assets/styles/components.css`（`.modal--xs` … `.modal--xl`），
 * 宽度变量在 `src/assets/styles/tokens.css`（`--modal-w-*`）。
 *
 * === 判据 ===
 * 只对**模板里真的存在弹窗根元素**的 `.vue` 文件生效。弹窗根元素 = class 里含有
 * 独立的 `modal` 一词（`modal-mask` / `modal__body` 不算）。
 *
 * 报错三类：
 *   1. 根元素没写档位（`.modal` 后面没有 `modal--xx`）；
 *   2. 写了未知档位（`modal--confirm` / `modal--wide` 这类历史名字）；
 *   3. 组件样式给根元素自己设了固定宽度（`width: 680px` / `max-width: min(720px, …)`），
 *      或模板上写了行内 `style="width:…"`。
 *
 * 刻意**不报**的情况：
 *   · 子元素宽度（`.user-modal .modal__body { width: … }`）—— 只判选择器最后一段；
 *   · `width: 100% / auto / fit-content` —— 自适应不是“定死宽度”；
 *   · 非弹窗浮层（右侧抽屉 `.api-panel__sheet`、命令面板）—— 它们不是 `.modal`。
 *
 * 用法：
 *   node scripts/check-modal-widths.mjs           # 默认扫 src
 *   node scripts/check-modal-widths.mjs src a/src
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** 允许的五个档位（与 components.css 逐字一致） */
const ALLOWED = new Set(['modal--xs', 'modal--sm', 'modal--md', 'modal--lg', 'modal--xl']);

/** 视为“固定宽度”的单位：百分比 / auto 不算 */
const FIXED_WIDTH = /\d+(?:\.\d+)?(?:px|rem|em|vw|vh|ch)\b/;

/** 递归收集 .vue */
function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (entry.endsWith('.vue')) out.push(full);
  }
  return out;
}

/** 行号（1 起） */
function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/**
 * 选择器最后一段（复合选择器）的类名
 *
 * `.user-modal .modal__body` 的最后一段是 `.modal__body` —— 宽度设在子元素上，
 * 与弹窗根宽度无关；只有最后一段命中才算“给弹窗自己设宽”。
 *
 * @param {string} selector 单个选择器（已按逗号拆开）
 * @returns {string[]} 类名列表
 */
function subjectClasses(selector) {
  const subject = selector.trim().split(/[\s>+~]+/).pop() || '';
  return [...subject.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map(m => m[1]);
}

/** 校验一个文件，返回问题列表 */
function checkFile(file) {
  const text = readFileSync(file, 'utf8');
  const problems = [];
  const companions = new Set();
  let hasModal = false;

  // ── 1. 模板：找弹窗根元素 ─────────────────────────────
  for (const m of text.matchAll(/<[a-zA-Z][^>]*>/gs)) {
    const tag = m[0];
    const classAttr = tag.match(/\bclass="([^"]*)"/);
    if (!classAttr) continue;

    const tokens = classAttr[1].split(/\s+/).filter(Boolean);
    if (!tokens.includes('modal')) continue; // 精确词：modal-mask / modal__body 不算

    hasModal = true;
    for (const token of tokens) if (token !== 'modal') companions.add(token);

    const line = lineOf(text, m.index);
    const mods = tokens.filter(token => token.startsWith('modal--'));
    if (mods.length === 0) {
      problems.push({ line, message: '弹窗根元素没写档位（缺 .modal--xs|sm|md|lg|xl）' });
    }
    for (const mod of mods) {
      if (!ALLOWED.has(mod)) problems.push({ line, message: `未知档位 .${mod}` });
    }

    // 行内宽度
    const styleAttr = tag.match(/\bstyle="([^"]*)"/);
    if (styleAttr && /(?:^|;)\s*(?:max-)?width\s*:\s*([^;]+)/.test(styleAttr[1])) {
      const value = styleAttr[1].match(/(?:^|;)\s*(?:max-)?width\s*:\s*([^;]+)/)[1];
      if (FIXED_WIDTH.test(value)) {
        problems.push({ line, message: `行内样式定死宽度：width: ${value.trim()}` });
      }
    }
  }

  // 文件里没有弹窗根元素 → 不检查（抽屉、命令面板、页面卡片都走这里）
  if (!hasModal) return problems;

  // ── 2. 样式块：根元素自己设固定宽 ─────────────────────
  for (const styleBlock of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    const css = styleBlock[1];
    const cssOffset = styleBlock.index + styleBlock[0].indexOf(css);

    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rule[1].trim();
      const body = rule[2];

      // 只挑固定宽度声明
      const widths = [...body.matchAll(/(?:^|;)\s*(?:max-)?width\s*:\s*([^;]+)/g)]
        .map(m => m[1].trim())
        .filter(value => FIXED_WIDTH.test(value));
      if (widths.length === 0) continue;

      const hits = selector
        .split(',')
        .map(part => subjectClasses(part))
        .some(classes => classes.includes('modal') || classes.some(c => companions.has(c)));
      if (!hits) continue;

      const line = lineOf(text, cssOffset + rule.index);
      problems.push({
        line,
        message: `组件样式给弹窗设固定宽度（${selector.split(',')[0].trim()} → ${widths[0]}）`
      });
    }
  }

  return problems;
}

// ── 入口 ──────────────────────────────────────────────
const dirs = process.argv.slice(2).filter(arg => !arg.startsWith('-'));
const targets = dirs.length > 0 ? dirs : ['src'];

let checked = 0;
let problems = 0;

for (const dir of targets) {
  let files;
  try {
    files = collect(dir);
  } catch {
    console.log(`✗ 目录不存在：${dir}`);
    process.exit(1);
  }
  for (const file of files) {
    const found = checkFile(file);
    if (found.length === 0) {
      checked += 1;
      continue;
    }
    for (const item of found) {
      console.log(`✗ ${relative(process.cwd(), file)}:${item.line}  ${item.message}`);
      problems += 1;
    }
  }
}

if (problems > 0) {
  console.log(
    `\n✗ 弹窗宽度不合规：${problems} 处。` +
      '\n  弹窗根元素只写 .modal--xs|sm|md|lg|xl（定义见 src/assets/styles/components.css），' +
      '\n  组件里不要再写 width / max-width —— 否则“统一”当场破功。'
  );
  process.exit(1);
}

console.log(`OK · 弹窗宽度检查通过（扫描 ${checked} 个 .vue，无组件私设宽度）`);
