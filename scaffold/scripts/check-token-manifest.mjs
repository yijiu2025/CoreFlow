/**
 * 校验「令牌清单」与配色表一致
 *
 * 为什么要有这道关卡：`theme/token-manifest.ts` 是可视化外观编辑器的唯一数据源。
 * 它一旦和配色表错开，编辑器就会写出**不存在的变量** —— 用户点了没反应，还不报错。
 * 两个方向都查：
 *   · 表里有、配色表没有 → 编辑器写了个空气
 *   · 配色表有、表里没有 → 用户看不到、改不了（悄无声息的"漏配"）
 *
 * 用法：node scripts/check-token-manifest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, 'src/theme/token-manifest.ts');
/** 基准配色：取珍珠白桌面端后台壳那一份（全仓 token 最全） */
const BASELINE = path.join(
  ROOT,
  'src/theme/themes/default/standard/console/colors/white/index.ts'
);

/**
 * 从一个 TS 文件里抠出 `--mauth-*` 名
 *
 * 两种写法都要认：配色表里是**键**（`'--mauth-x': '#fff'`），
 * 清单里是**值**（`key: '--mauth-x'`）。正则放宽到"出现即算"，
 * 因为这两个文件里 `--mauth-` 只会出现在有意义的位置。
 *
 * @param file 文件路径
 * @returns 名字集合
 */
function keysOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  return new Set([...text.matchAll(/'(--mauth-[a-z0-9-]+)'/g)].map(m => m[1]));
}

for (const file of [MANIFEST, BASELINE]) {
  if (!fs.existsSync(file)) {
    console.error(`✗ 找不到文件：${path.relative(ROOT, file)}`);
    process.exit(1);
  }
}

const manifest = keysOf(MANIFEST);
const baseline = keysOf(BASELINE);

/*
 * 「仅覆盖型」令牌：清单里有、配色表里**故意不写**
 *
 * 典型是 `--mauth-pulse-*`（登录脉搏卡的三层背景）。它们的**默认值是一个表达式**
 * （`color-mix(tint, surface)`），写不成配色表里的单值；而 CSS 侧是
 * `var(--mauth-pulse-bg, color-mix(…))` —— 没有覆盖时走 color-mix，于是**跟着主色变**，
 * 与改造前完全一致；用户在「自定义」里改了才走覆盖。
 *
 * 如果把它们写进配色表，默认值就被钉死成静态色，换主色时卡片不跟着变（视觉回归）。
 *
 * 这条口子只对"默认值必须是表达式"的令牌开 —— 新增一项要写理由。
 */
const OVERRIDE_ONLY = new Set([
  '--mauth-pulse-glow',
  '--mauth-pulse-bg',
  '--mauth-pulse-bg-2'
]);

const missingInColors = [...manifest].filter(k => !baseline.has(k) && !OVERRIDE_ONLY.has(k));
const missingInManifest = [...baseline].filter(k => !manifest.has(k));

if (missingInColors.length === 0 && missingInManifest.length === 0) {
  console.log(`OK · 令牌清单与配色表一致（${manifest.size} 个）`);
  process.exit(0);
}

console.error('✗ 令牌清单与配色表不一致：');
if (missingInColors.length) {
  console.error(`  清单里有、配色表里没有（编辑器会写出空变量）：\n    ${missingInColors.join('\n    ')}`);
}
if (missingInManifest.length) {
  console.error(`  配色表里有、清单里没有（用户看不到这一项）：\n    ${missingInManifest.join('\n    ')}`);
}
process.exit(1);
