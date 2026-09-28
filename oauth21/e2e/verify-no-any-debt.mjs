/**
 * 「类型逃逸」守卫：把 `any` / `@ts-ignore` 关在**单一入口**里，防止回涨
 *
 * === 背景（评审第 3 条）===
 * 二期架构评审的 P1 指出：全仓 52 处 `any` 高度集中在核心业务链路最危险处 ——
 *   `useLoginFlow.ts` 12 / `useHCaptcha.ts` 9 / `useTurnstile.ts` 6 / `Consent.vue` 4 / `useQrLogin.ts` 3
 * 且 `vue-tsc -b` 报零错误 ⇒ 严格模式**真开着**，这些 `any` 是**显式类型逃逸**。
 * 分布特征：全部发生在「外部脚本 / 第三方 SDK / 后端响应」边界上。
 *
 * === 本轮的收口做法（2026-09-28）===
 * 新建 `src/types/external.ts` 作为外部边界类型的**唯一入口**：
 *   - `declare global` 给 `window.hcaptcha` / `window.turnstile` 写窄接口（替掉 `(window as any).x`）
 *   - zod 判别联合 `loginResponseSchema` + `parseLoginResponse()` 收口后端登录响应
 *   - `pickRedirectUrl()` / `parseQrStatus()` 收口授权跳转与二维码响应
 * 业务代码（composables / views / stores）改为消费窄接口与 `kind` 分支，**不再 `as any` 读字段**。
 *
 * === 判据（由"允许清单"派生，不是手抄计数）===
 *   1. `src/`（排除生成文件）中 `any` / `@ts-ignore` / `@ts-expect-error` 的**实际代码**出现次数为 0
 *      —— 注释里提到 `as any`（说明文字）不算，故先剥离注释再统计
 *   2. 单一入口 `src/types/external.ts` 存在，且导出关键收口件（parseLoginResponse 等）
 *   3. 两个 SDK 全局已在 `declare global` 里声明（否则 `window.hcaptcha` 会退化成 any 报错）
 *
 * 退出码：0 通过 / 1 断言失败
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..'); // oauth21/
const SRC = join(ROOT, 'src');

let pass = 0;
const failures = [];

function check(label, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  \u2713 ${label}`);
  } else {
    failures.push(label);
    console.log(`  \u2717 ${label}${detail ? `  \u2192 ${detail}` : ''}`);
  }
}

/** unplugin 生成的声明文件：天然含大量 any，不是业务代码，排除 */
const GENERATED = new Set(['auto-import.d.ts', 'components.d.ts', 'vite-env.d.ts']);

function collectSources(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__') continue;
      collectSources(p, out);
    } else if (/\.(ts|vue)$/.test(entry.name) && !GENERATED.has(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * 剥离注释后再统计 —— 否则本文件/源码里"说明用"的 `as any` 字样会被误判。
 * 处理：块注释 `/* ... *\/`、行注释 `// ...`；字符串里的 // 可能误伤，但对
 * `any` 这类词而言误伤只会**放宽**（更安全的方向），不影响结论。
 */
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/** 命中类型逃逸的正则：`xxx: any`、`<any>`、`as any`、`@ts-ignore`、`@ts-expect-error` */
const ESCAPE_RE = /(:\s*any\b|<any>|\bas\s+any\b|@ts-ignore|@ts-expect-error)/g;

console.log('== 1) src/ 业务代码的类型逃逸清零（排除生成文件与注释） ==');
const files = collectSources(SRC);
console.log(`  （扫描 ${files.length} 个源文件）`);

const offenders = [];
for (const f of files) {
  const code = stripComments(readFileSync(f, 'utf8'));
  const hits = code.match(ESCAPE_RE);
  if (hits && hits.length) {
    const rel = relative(ROOT, f).replace(/\\/g, '/');
    offenders.push(`${rel} → ${hits.length} 处（${[...new Set(hits.map(h => h.trim()))].join(' / ')}）`);
  }
}
check(
  'src/ 下无 any / @ts-ignore / @ts-expect-error（业务代码零类型逃逸）',
  offenders.length === 0,
  offenders.length ? `发现 ${offenders.length} 个文件：\n      ${offenders.join('\n      ')}` : ''
);

console.log('\n== 2) 外部边界单一入口存在且导出关键收口件 ==');
const externalFile = join(SRC, 'types', 'external.ts');
check('src/types/external.ts 存在', existsSync(externalFile), externalFile);
if (existsSync(externalFile)) {
  const text = readFileSync(externalFile, 'utf8');
  const required = [
    ['parseLoginResponse', '登录响应解析入口'],
    ['loginResponseSchema', '登录响应 zod 判别联合'],
    ['declare global', 'SDK 全局窄接口声明'],
    ['HCaptchaSdk', 'hCaptcha 窄接口'],
    ['TurnstileSdk', 'Turnstile 窄接口'],
    ['pickRedirectUrl', '授权跳转地址收口'],
    ['parseQrStatus', '二维码状态收口']
  ];
  for (const [name, desc] of required) {
    check(`external.ts 导出 ${name}（${desc}）`, text.includes(name), '未找到');
  }
} else {
  // 文件不存在时，上面的 required 断言无意义，直接记失败占位
  check('external.ts 关键导出可校验', false, '文件缺失');
}

console.log('\n== 3) 两个 SDK 全局已在 declare global 中声明 ==');
if (existsSync(externalFile)) {
  const text = readFileSync(externalFile, 'utf8');
  // 只检查 declare global 块内是否有 turnstile / hcaptcha 声明
  const globalBlock = text.slice(text.indexOf('declare global'));
  check('window.hcaptcha 已声明', /\bhcaptcha\?\s*:/.test(globalBlock), 'declare global 里找不到 hcaptcha?:');
  check('window.turnstile 已声明', /\bturnstile\?\s*:/.test(globalBlock), 'declare global 里找不到 turnstile?:');
}

// ---------------------------------------------------------------- 汇总
const total = pass + failures.length;
console.log(`\n===== ${failures.length === 0 ? '全绿' : '有失败'}：${pass}/${total} 通过 =====`);
if (failures.length) {
  console.log('失败项：');
  for (const f of failures) console.log(`  - ${f}`);
  console.log('\n提示：新增外部边界（SDK / 后端接口）时，类型与校验进 `src/types/external.ts`，');
  console.log('      业务代码消费窄接口与判别联合，不要再写 `as any` / `@ts-ignore`。');
  process.exit(1);
}
process.exit(0);
