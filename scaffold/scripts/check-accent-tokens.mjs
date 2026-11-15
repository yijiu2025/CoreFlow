/**
 * 校验「主色派生令牌」在配色表里没有漏项
 *
 * === 为什么要有 ===
 * 换主色是**运行期**的 inline 覆盖（`theme/accent.ts`），而配色表是**构建期**的静态值。
 * 只要某个令牌的值其实等于主色（或主色浅底），却没人把它列进主色组，换主色时它就会
 * 留在配色表里的原色上 —— 页面不报错、类型也检查不出来，只有肉眼能看见。
 *
 * 真实事故（2026-11-15）：主色选了琥珀，按钮/侧栏文字变琥珀了，但表格里的「页面」
 * 「管理后台」徽标和侧栏选中底的底色还是海蓝。原因是 `--mauth-tag-info-bg/ink` 与
 * `--mauth-nav-active-bg` 这三个"换个用法的主色"没被覆盖。
 *
 * 判据不靠人列白名单，而是**反查配色表**：
 *   对每份配色，凡是值等于 `--mauth-primary` 或 `--mauth-primary-soft` 的令牌，
 *   都必须在 `ACCENT_TOKEN_KEYS` 里。
 *
 * 配色表是 `.ts` 且只用 `import type`，Node 的类型剥离能直接加载（同 check-color.mjs）。
 *
 * 用法：node scripts/check-accent-tokens.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ACCENT_TOKEN_KEYS, accentVarsOf } from '../src/theme/accent-tokens.ts';

/*
 * 允许"值恰好等于主色浅底、但不进主色组"的令牌
 *
 * `--mauth-pulse-glow`（登录脉搏卡的左上暖光）派生自 **`--mauth-tint`（主色鲜档）**，
 * 不是 primary：leaf 的 tint 是 `#82dd2d`、primary 是 `#2c8500`，两者光色差很远。
 * 但 `star` 配色的 tint 与 primary 恰好同值，0.18 混出来正好撞上 primary-soft 的 RGB ——
 * 那是**巧合**，不是漏登记。若把它并进主色组，换主色时会用 primary 算光（发闷），
 * 反而破坏"暖光取鲜档"的设计。
 *
 * 这个口子只对**派生自 tint 的令牌**开，且必须写明理由。
 */
const OUTSIDE_ACCENT = new Set(['--mauth-pulse-glow']);

const ROOT = resolve(import.meta.dirname, '..');
const THEMES = join(ROOT, 'src/theme/themes');

let failed = 0;
let total = 0;

/**
 * 断言
 *
 * @param {boolean} ok 条件
 * @param {string} message 描述
 */
function check(ok, message) {
  total += 1;
  if (ok) return;
  failed += 1;
  console.error(`✗ ${message}`);
}

/**
 * 递归找出所有配色壳（`<包>/<设备>/<页面>/colors/<id>/index.ts`）
 *
 * 遇到 `colors/` 就收一层然后停 —— 配色壳只在那一层，不必把整棵子树走完。
 *
 * @param {string} dir 起始目录
 * @returns {Promise<string[]>} 绝对路径
 */
async function findShells(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    const p = join(dir, entry.name);
    if (entry.name === 'colors') {
      for (const color of await readdir(p, { withFileTypes: true })) {
        if (!color.isDirectory()) continue;
        const file = join(p, color.name, 'index.ts');
        try {
          await readFile(file);
          out.push(file);
        } catch {
          /* 只有 theme.scss 的配色目录（没有 token 表）跳过 */
        }
      }
      continue;
    }
    out.push(...(await findShells(p)));
  }
  return out;
}

/* ── ① 写入函数的产物必须与清单一致 ─────────────────────── */
const sample = accentVarsOf({
  primary: '#123456',
  hover: '#112233',
  soft: 'rgba(18, 52, 86, 0.1)',
  tint: '#123456',
  focus: 'rgba(18, 52, 86, 0.8)',
  onPrimary: '#fff'
});
for (const key of ACCENT_TOKEN_KEYS) {
  check(key in sample, `accentVarsOf 应产出 ${key}（清单里有它，写入函数却没给值）`);
}
for (const key of Object.keys(sample)) {
  check(ACCENT_TOKEN_KEYS.includes(key), `accentVarsOf 产出了清单外的 ${key}（关卡看不到它）`);
}
/*
 * 派生关系本身也要钉：浅底两处必须等于 soft，徽标字必须等于 primary。
 * 否则"清单齐了但值写错"照样是错的色。
 */
check(sample['--mauth-nav-active-bg'] === sample['--mauth-primary-soft'], '侧栏选中底应等于主色浅底');
check(sample['--mauth-tag-info-bg'] === sample['--mauth-primary-soft'], '信息徽标底应等于主色浅底');
check(sample['--mauth-tag-info-ink'] === sample['--mauth-primary'], '信息徽标字应等于主色');

/* ── ② 配色表反查：值与主色相同的令牌必须在清单里 ────────── */
const shells = await findShells(THEMES);
check(shells.length > 0, '没扫到任何配色壳（路径规则改了？）');

for (const file of shells) {
  const mod = await import(pathToFileURL(file).href);
  const tokens = mod.default?.tokens;
  const label = file.slice(ROOT.length + 1).replace(/\\/g, '/');
  if (!tokens) {
    check(false, `${label} 没有导出 tokens`);
    continue;
  }
  const primary = tokens['--mauth-primary'];
  const soft = tokens['--mauth-primary-soft'];
  /*
   * 这两个键是"定义"，不是"派生"：hover 是主色的深一档，每个配色手调过明度，
   * 不会等于 primary，所以不需要排除它 —— 只排除自己。
   */
  for (const [key, value] of Object.entries(tokens)) {
    if (key === '--mauth-primary') continue;
    const derivedFromPrimary = value === primary;
    /* soft 自己也是基准值，比它没意义 */
    const derivedFromSoft = soft && key !== '--mauth-primary-soft' && value === soft;
    if (!derivedFromPrimary && !derivedFromSoft) continue;
    if (OUTSIDE_ACCENT.has(key)) continue;
    check(
      ACCENT_TOKEN_KEYS.includes(key),
      `${label} 的 ${key} = ${value}（就是主色${derivedFromPrimary ? '' : '浅底'}），但不在主色组里 ⇒ 换主色时它不会跟着变`
    );
  }
}

if (failed) {
  console.error(`\n✗ 主色派生令牌关卡失败：${failed}/${total}`);
  process.exit(1);
}
console.log(`OK · 主色派生令牌 ${total} 项通过（${shells.length} 份配色）`);
