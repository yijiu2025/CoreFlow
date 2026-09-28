/**
 * 样式基线完整性守卫（P1-3 的守卫方案，2026-09-28）
 *
 * === 为什么是"守卫"而不是"拆分" ===
 * 评估过按设备拆 `mobile-auth.scss`：三台设备（mobile/standard/mini/tablet）
 * **共用同一套 `mauth-*` 类名**，CSS 是按**类名**而非按设备隔离的；文件头也明确
 * 写了它是刻意收敛的「单一来源」（两页共用同一套视觉）。按设备拆 = 破坏单一来源
 * 且制造漂移。⇒ 结论：**不拆，只补守卫**，锁住"基线完整"这个真正的风险点。
 *
 * === 这个守卫拦什么 ===
 * `mobile-auth.scss` 的组件规则只允许引用 `--mauth-*` token（不许裸色值）。
 * 风险是：某天有人写了个 `var(--mauth-nonexistent)`，该属性在浏览器里**静默失效**
 * （整条声明被丢弃），页面看起来只是"这里没样式"，没有任何报错。
 * 这个守卫把这种"引用了未定义的 token"变成红灯。
 *
 * === 两类合法例外（豁免必须显式）===
 *   ① **带 fallback 的引用** —— `var(--mauth-font-family, inherit)`：
 *      token 缺失时退到 fallback，是刻意设计（主题可注入字体栈，基线不写死）。
 *   ② **运行时注入的引用** —— 由 JS 在运行时挂到 DOM 上（如 viewport-fix.ts 的
 *      `--mauth-vpfix-k`），SCSS 侧只需消费、不需定义。
 * ①②之外的"引用无定义"一律判失败。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
// 本文件在 src/assets/styles/__tests__/ → 上一级即 styles 目录
const SCSS = join(HERE, '..', 'mobile-auth.scss');

/** 由 JS 在运行时注入的 token —— SCSS 消费它们但不定义，属合法 */
const RUNTIME_INJECTED = new Set([
  // viewport-fix.ts 挂到 html[data-mauth-vpfix] 上的缩放系数（见 SCSS §13）
  '--mauth-vpfix-k'
]);

/** 提取 SCSS 里 `--mauth-xxx:` 形式的 token 定义（行首缩进后的声明） */
function definedTokens(css: string): Set<string> {
  const out = new Set<string>();
  for (const m of css.matchAll(/(^|\s)(--mauth-[a-z0-9-]+)\s*:/g)) out.add(m[2]);
  return out;
}

/**
 * 提取 SCSS 里 `var(--mauth-xxx)` 形式的引用
 *
 * 返回「引用名 → 是否带 fallback」。带 fallback（`var(--x, ...)`）的引用即使
 * token 未定义也不会静默失效（会退到 fallback），属合法豁免。
 */
function referencedTokens(css: string): Map<string, boolean> {
  const out = new Map<string, boolean>();
  // 匹配 var(--mauth-xxx) 或 var(--mauth-xxx, fallback)
  for (const m of css.matchAll(/var\(\s*(--mauth-[a-z0-9-]+)\s*(,)?/g)) {
    const name = m[1];
    const hasFallback = m[2] === ',';
    // 同一个 token 只要有一次带 fallback 就视作"有兜底"（宽松：宁可不报也不误报）
    out.set(name, (out.get(name) ?? false) || hasFallback);
  }
  return out;
}

describe('mobile-auth.scss 基线完整性守卫', () => {
  const css = readFileSync(SCSS, 'utf8');
  const defined = definedTokens(css);
  const referenced = referencedTokens(css);

  it('基线确实定义了 token（守卫自身有效性，防止规则写歪成空集）', () => {
    // 若某天正则失配导致 defined 为空，后面的断言会"全绿"——这里显式断言非空
    expect(defined.size).toBeGreaterThan(100);
    expect(referenced.size).toBeGreaterThan(100);
  });

  it('每个被引用的 token 都有定义 / fallback / 运行时注入三者之一', () => {
    const dangling: string[] = [];
    for (const [name, hasFallback] of referenced) {
      if (defined.has(name)) continue;
      if (hasFallback) continue;
      if (RUNTIME_INJECTED.has(name)) continue;
      dangling.push(name);
    }
    expect(
      dangling,
      `以下 token 被引用但既无定义、也无 fallback、也不在运行时注入白名单：\n${dangling.join('\n')}`
    ).toEqual([]);
  });

  it('组件规则里不出现裸十六进制色值（token 层的定义除外）', () => {
    // 去掉 token 定义行（`--mauth-xxx: ...`）与纯注释，再看残留的裸色值。
    // token 定义层（§0）是**唯一**允许出现具体色值的地方（见文件头设计）。
    const withoutTokenDefs = css
      .split('\n')
      .filter(line => !/^\s*--mauth-/.test(line)) // 剔除 token 定义行
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '') // 剔除块注释（注释里会举例色值）
      .replace(/\/\/.*$/gm, ''); // 剔除行注释

    const hexes = [...withoutTokenDefs.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]);
    expect(
      hexes,
      `组件规则里出现裸色值（应改为 token）：${hexes.join(', ')}`
    ).toEqual([]);
  });
});
