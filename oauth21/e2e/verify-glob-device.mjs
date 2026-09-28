/**
 * SSR glob 探针：确认四级结构（包 → 设备 → 页面 → 配色）下，各 glob 真的扫到了文件
 *
 * 背景：`import.meta.glob` 的路径是**启动期静态扫描**，路径写错（少一层目录、
 * 用相对路径）时**静默扫不到**且不报错 —— 于是"配色永远不出现""版式永远加载不出来"
 * 这类故障没有任何信号。所以每次改动 glob 路径后都要跑一次本探针。
 *
 * 🔴 2026-09-26：**一个主题包 = 一种版式** ⇒ 配色 glob 只剩**一套**（4 段：
 * 包 / 设备 / 页面 / colors / 配色）。旧的 6 段形态（多一层「版式」）已随
 * `<页面>/<版式>/colors/` 目录形态一起删除，所以本探针也改为断言
 * "6 段模式不存在"，而不是"两套都要扫到"。
 *
 * 做法：让 Vite 以 ssr 模式 transform 目标模块，直接读回编译产物里的
 * `import.meta.glob` 展开结果（Vite 会把它替换成静态的路径 → 加载器映射）。
 *
 * 退出码：0 全部命中 / 1 有关键 glob 为空
 */
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

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

/** 从编译产物里把所有 glob 展开出来的路径抓出来 */
function extractGlobKeys(code) {
  // Vite 把 glob 编译成 `{ "path": () => import("...") }` 形式的对象字面量；
  // 键一定是 `/src/...` 或 `./...` 形态的字符串。抓所有 import 目标即可。
  const keys = new Set();
  const re = /["'](\/src\/theme\/themes\/[^"']+\.(?:vue|ts|scss))["']/g;
  let m;
  while ((m = re.exec(code))) keys.add(m[1]);
  // 也抓相对形态（若有人写错成相对路径，这里能看到它是空的）
  const re2 = /["'](\.\/themes\/[^"']+\.(?:vue|ts|scss))["']/g;
  while ((m = re2.exec(code))) keys.add(m[1]);
  return [...keys].sort();
}

/** 从源码里把 `import.meta.glob('...')` 的模式字符串抓出来（用于断言"模式本身覆盖了某层级"） */
function globPatternsOf(code) {
  const out = [];
  const re = /import\.meta\.glob(?:<[^>]*>)?\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(code))) out.push(m[1]);
  return out;
}

const server = await createServer({
  root: ROOT,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom'
});

try {
  const targets = [
    { file: 'src/theme/registry.ts', label: '主题注册表' },
    { file: 'src/theme/views/login.ts', label: 'login 版式注册表' },
    { file: 'src/theme/views/register.ts', label: 'register 版式注册表' },
    { file: 'src/theme/views/forgot-password.ts', label: 'forgot-password 版式注册表' }
  ];

  const results = {};
  for (const t of targets) {
    const res = await server.transformRequest('/' + t.file, { ssr: true });
    results[t.file] = extractGlobKeys(res?.code ?? '');
    console.log(`\n=== ${t.label}（${t.file}）扫到 ${results[t.file].length} 条 ===`);
    for (const k of results[t.file]) console.log(`    ${k}`);
  }

  console.log('\n=== 断言 ===');

  const themeKeys = results['src/theme/registry.ts'];
  check(
    '主题注册表扫到包定义 themes/*/index.ts',
    themeKeys.includes('/src/theme/themes/default/index.ts'),
    '包定义没扫到 → 整个包不注册'
  );
  check(
    '主题注册表扫到「包/设备/页面/colors/配色」四段的配色 index.ts',
    themeKeys.some(k =>
      /^\/src\/theme\/themes\/default\/(mobile|standard|mini)\/[^/]+\/colors\/[^/]+\/index\.ts$/.test(k)
    ),
    `实际：${themeKeys.filter(k => k.includes('/colors/')).join(', ') || '(空)'}`
  );
  // 2026-09-25 起：变体版式配色不再挂在 default 包下，而是迁到独立主题包 compact/
  // 这里改为验证 compact 主题包内的 register 配色被正确扫到
  check(
    'compact 主题包的 register 配色被扫到（themes/compact/mobile/register/colors/*/index.ts）',
    themeKeys.some(k =>
      /^\/src\/theme\/themes\/compact\/mobile\/register\/colors\/[^/]+\/index\.ts$/.test(k)
    ),
    `实际：${themeKeys.filter(k => k.includes('/compact/mobile/register/colors/')).join(', ') || '(空)'}`
  );
  const mobileColors = themeKeys.filter(k => k.includes('/mobile/'));
  const standardColors = themeKeys.filter(k => k.includes('/standard/'));
  const miniColors = themeKeys.filter(k => k.includes('/mini/'));
  check(
    '移动端配色库非空（black/white/blue/cyan/rainbow）',
    mobileColors.filter(k => /\/colors\/[^/]+\/index\.ts$/.test(k)).length >= 8,
    `实际 ${mobileColors.filter(k => /\/colors\/[^/]+\/index\.ts$/.test(k)).length} 套`
  );
  check(
    '桌面端(standard)配色库非空（骨架 black/white）',
    standardColors.filter(k => /\/colors\/[^/]+\/index\.ts$/.test(k)).length >= 6,
    `实际 ${standardColors.filter(k => /\/colors\/[^/]+\/index\.ts$/.test(k)).length} 套`
  );
  check(
    '紧凑版(mini)配色库非空（login/register/forgot-password 三页 black/white）',
    miniColors.filter(k => /\/colors\/[^/]+\/index\.ts$/.test(k)).length >= 6,
    `实际 ${miniColors.filter(k => /\/colors\/[^/]+\/index\.ts$/.test(k)).length} 套`
  );
  check(
    '配色样式 glob 扫到 page 下的 theme.scss',
    themeKeys.some(k => /\/themes\/default\/mobile\/[^/]+\/colors\/[^/]+\/theme\.scss$/.test(k)),
    '样式没扫到 → 配色只有 token 没有背景图'
  );
  // 🔴 2026-09-26：一个主题包 = 一种版式 → 配色路径里**没有**「版式」这一层。
  //    断言"6 段模式不存在"，而不是"两套模式都要扫到"。
  {
    const patterns = globPatternsOf(readFileSync(join(ROOT, 'src/theme/registry.ts'), 'utf8'));
    const colorPatterns = patterns.filter(p => p.includes('/colors/'));
    // ⚠️ 反面断言要按"`colors` 前恰好 3 个通配段"写：`*/` 在 4 段路径里本来就出现 3 次，
    //    用"出现 2 次即违规"这类写法会把正确路径也判成违规。
    check(
      '配色 glob 只有一套（4 段：包/设备/页面/colors/配色）',
      colorPatterns.length === 2 &&
        colorPatterns.every(p => /themes\/(?:\*\/){3}colors\//.test(p)),
      `实际模式：${colorPatterns.join(' | ') || '(空)'}`
    );
    check(
      '无 6 段配色 glob 残留（配色路径里没有「版式」这一层）',
      colorPatterns.every(p => !/themes\/(?:\*\/){4}colors\//.test(p)),
      '一个主题包 = 一种版式；6 段模式会扫到 0 个文件且静默不报错'
    );
  }

  for (const page of ['login', 'register', 'forgot-password']) {
    const keys = results[`src/theme/views/${page}.ts`];
    const mobileBase = keys.filter(k =>
      new RegExp(`/themes/default/mobile/${page}/index\\.vue$`).test(k)
    );
    const standardBase = keys.filter(k =>
      new RegExp(`/themes/default/standard/${page}/index\\.vue$`).test(k)
    );
    check(
      `${page}：移动端基础版式被扫到`,
      mobileBase.length === 1,
      `实际 ${mobileBase.length} 条（应当 1）`
    );
    check(
      `${page}：桌面端(standard)基础版式骨架被扫到`,
      standardBase.length === 1,
      `实际 ${standardBase.length} 条（应当 1）`
    );
    const miniBase = keys.filter(k =>
      new RegExp(`/themes/default/mini/${page}/index\\.vue$`).test(k)
    );
    check(
      `${page}：紧凑版(mini)版式被扫到`,
      miniBase.length === 1,
      `实际 ${miniBase.length} 条（应当 1）`
    );
    check(
      `${page}：版式 glob 不吞「版式层」目录（无 <页面>/<变体>/index.vue 形态）`,
      keys.every(k => !new RegExp(`/${page}/[^/]+/index\\.vue$`).test(k)),
      '一个主题包 = 一种版式：多一层的形态不该再被任何 glob 匹配'
    );
  }
  // 2026-09-25 起：register 不再有变体形态 —— 改为扫描主题包粒度的版式
  {
    const regKeys = results['src/theme/views/register.ts'];
    check(
      'register 主题包粒度的 compact 版式被扫到（themes/compact/mobile/register/index.vue）',
      regKeys.some(k => /\/themes\/compact\/mobile\/register\/index\.vue$/.test(k)),
      `实际：${regKeys.filter(k => k.includes('compact')).join(', ') || '(空)'}`
    );
    check(
      'register 主题包粒度的 default 版式被扫到（themes/default/mobile/register/index.vue）',
      regKeys.some(k => /\/themes\/default\/mobile\/register\/index\.vue$/.test(k)),
      `实际：${regKeys.filter(k => k.includes('default/mobile/register/index')).join(', ') || '(空)'}`
    );
  }
  // 2026-09-25 起：mini 是独立设备（与 standard 并列，不再是 web 下的变体）
  {
    const loginKeys = results['src/theme/views/login.ts'];
    check(
      'mini 设备 login 版式被扫到（themes/default/mini/login/index.vue）',
      loginKeys.some(k => /\/themes\/default\/mini\/login\/index\.vue$/.test(k)),
      `实际：${loginKeys.filter(k => k.includes('/mini/')).join(', ') || '(空)'}`
    );
    const regKeys = results['src/theme/views/register.ts'];
    check(
      'mini 设备 register 版式被扫到（themes/default/mini/register/index.vue）',
      regKeys.some(k => /\/themes\/default\/mini\/register\/index\.vue$/.test(k)),
      `实际：${regKeys.filter(k => k.includes('/mini/')).join(', ') || '(空)'}`
    );
    const forgotKeys = results['src/theme/views/forgot-password.ts'];
    check(
      'mini 设备 forgot-password 版式被扫到（themes/default/mini/forgot-password/index.vue）',
      forgotKeys.some(k => /\/themes\/default\/mini\/forgot-password\/index\.vue$/.test(k)),
      `实际：${forgotKeys.filter(k => k.includes('/mini/')).join(', ') || '(空)'}`
    );
  }
} finally {
  await server.close();
}

const total = pass + failures.length;
console.log(`\n===== ${failures.length === 0 ? '全绿' : '有失败'}：${pass}/${total} 通过 =====`);
if (failures.length) {
  console.log('失败项：');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
