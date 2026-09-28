/**
 * 静态关卡：主题目录口径（**四级结构**）+ 「版式跟随主题包与设备」的实现口径
 *
 * 守护的规则（`docs/frontend/multi-theme.md` 与 `oauth21/src/theme/README.md`）：
 *
 *   结构 · 四级（主题包 → 设备 → 页面 → 配色）
 *     1. `themes/` 下一层目录 = 一个**主题包**，目录名即 id（只允许 [a-z0-9-]）
 *     2. `<包>/` 下一层目录 = **设备**，只认 `mobile` / `standard` / `mini`
 *        （写错整段跳过；2026-09-25 三值化，mini 从 web 的变体升为独立设备）
 *     3. `<设备>/` 下一层目录 = **页面**，目录名即页面名（`login` / `register` / `forgot-password`）
 *     4. 🔴 **一个主题包 = 一种版式**（2026-09-26 定案，用户：「变体版式使用新包」）：
 *          • `<页面>/` 下**只有** `index.vue` 与 `colors/`
 *          • **没有**「版式」这一层目录（旧形态 `<页面>/<版式>/colors/` 已删除）
 *          • 换一套版式 = **新建一个主题包**；注册表里配色记录的 `view` **恒等于包名**
 *     5. 包根与配色都必须有 `index.ts`，且默认导出里带 `meta`
 *     6. 只有 `theme.scss`、没有 `index.ts` → 残缺（样式会被静默忽略）
 *     7. `theme.scss` 的属性选择器必须用**该目录名**（`html[data-mauth-theme='<目录名>']`）
 *     8. 🔴 **五色完全并列**（2026-09-25 改）：
 *          • `black` / `white` 是**自带底色的独立颜色**，各写全 token，不是"基线/零 token"
 *          • 明暗档已取消（"深浅就是两种颜色配置"）→ 不为某个颜色做深/浅两档身份
 *          • 每页都应同时有 `black` 与 `white` 两个实体目录
 *
 *   结构 · 版式在包里、且按设备分区
 *     9. 版式实现住在 `<包>/<设备>/<页面>/index.vue`（唯一版式，没有名字层）
 *    10. `<设备>/` 下除页面目录外，不得有别的子目录（`colors` 已下沉到页面下）
 *    11. 版式的契约 + 注册表是 `theme/views/` 下的页面文件，不在 theme 根平铺
 *
 *   实现 ↔ 文档
 *    12. 配色注册表 glob **只有一套**（4 段：包 / 设备 / 页面 / colors / 配色）
 *        —— 旧的多一层「版式」的 6 段形态已删除，两套模式盖的是同一个层级
 *    13. 各页注册表版式 glob 是**跨包跨设备**的；工厂按**当前包 × 当前设备**过滤
 *    14. 容器静态引入**内置包 × 自身设备**的版式，且硬编码目录名 === `DEFAULT_THEME_PACKAGE`
 *    15. 容器的切换 watch 同时依赖 `themeStore.packageId`
 *    16. 容器写死 `THEME_DEVICE` 常量（设备是页面身份，不跑视口判定）
 *    17. 设备同步用 watch(router.currentRoute, {immediate:true})，由 main.ts 在 pinia 之后调用
 *
 *   抽包 · 内核与宿主解耦（2026-09-26 起，见 docs/frontend/theme-package-extraction.md）
 *    18. 🔴 内核包 `packages/theme-core` **不得知道宿主**：无 `import.meta`、无
 *        `window.` / `document.`、无 `localStorage`、无非 `import type` 的 `vue`、
 *        无 `vue-router`、无 `axios` / `fetch`、无 `@/` 别名（「〇、一条原则」的机械保障）
 *    19. 包的唯一公开出口是 `src/index.ts`，且必须**显式具名导出**（不用 `export *`）：
 *        公开面是一份承诺，加一个名字要有刻意的摩擦
 *    20. 🔴 迁移铁律「同一时刻只有一个实现」：`oauth21/src/theme/` 下的**壳文件**
 *        只允许「注释 + 从 `skinsuite` 转发」，不得有任何逻辑（否则两份真相）
 *
 * 不需要浏览器：纯文件系统 + 源码断言。
 * 退出码：0 通过 / 1 断言失败
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// 关卡所在目录 = oauth21/e2e/，oauth21 就是上一级
const ROOT = join(HERE, '..', 'src');
const THEME = join(ROOT, 'theme');
const VIEWS = join(THEME, 'views');
const PKGS = join(THEME, 'themes');

/** 目录名白名单（与 theme/index.ts 的 THEME_ID_RE 逐字一致） */
const ID_RE = /^[a-z0-9-]+$/;
/** 设备清单文件（设备维度取值集合的**唯一来源**，见 oauth21/src/theme/devices.ts） */
const DEVICES_FILE = join(THEME, 'devices.ts');
/**
 * 设备白名单 —— 从宿主设备清单 `theme/devices.ts` 派生，**不再硬编码**
 *
 * 清单里每个设备是一条 `{ id: 'mobile', … }`；本关卡读 `id:` 字段取取值集合。
 * 加一种设备 = 改 devices.ts 一条声明，本关卡自动跟上（与主题包目录的口径同源）。
 */
function readDeviceIds() {
  const src = existsSync(DEVICES_FILE) ? readFileSync(DEVICES_FILE, 'utf8') : '';
  const ids = [];
  const re = /\bid\s*:\s*['"]([a-z0-9-]+)['"]/g;
  let m;
  while ((m = re.exec(src))) ids.push(m[1]);
  return ids;
}
const DEVICES = readDeviceIds();
/** 配色目录的固定名（住在页面下） */
const COLORS_DIR = 'colors';
/** 页面目录下**唯一**允许出现的子目录名（一个包 = 一种版式，没有版式层） */
const PAGE_SUBDIRS = [COLORS_DIR];
/** 每页都应有的并列配色目录名（黑白是两个独立颜色，各自一份实体目录；包可用 coverage 覆盖） */
const DEFAULT_PEER_COLORS = ['black', 'white'];

let pass = 0;
const failures = [];

/**
 * 该配色 index.ts 是否是 re-export 形态（`export { default } from '…'`）
 *
 * re-export = 该设备的这套配色复用**同包另一设备**的同名配色（如 tablet 复用
 * standard 的 black）。这种形态下 meta/tone/tokens 由目标文件承担（目标文件在同包
 * 另一设备目录，已被本关卡内联检查），所以本处跳过内联检查、只验目标路径合法。
 */
function isReexport(src) {
  return /export\s*\{\s*default\s*\}\s*from\s*['"][^'"]+['"]/.test(src);
}

function check(label, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  \u2713 ${label}`);
  } else {
    failures.push(label);
    console.log(`  \u2717 ${label}${detail ? `  \u2192 ${detail}` : ''}`);
  }
}

const isDir = p => existsSync(p) && statSync(p).isDirectory();
const subdirs = p => (existsSync(p) ? readdirSync(p).filter(n => isDir(join(p, n))) : []);
const read = p => readFileSync(p, 'utf8');

/**
 * 主题内核抽包后的**实现位置解析器**（2026-09-26 起）
 *
 * 纯内核的叶子层已抽到工作区包 `packages/theme-core/src/`，`oauth21/src/theme/`
 * 下只留同名 re-export 壳（保证 `@/theme/*` 的导入面不变）。本关卡断言要看的是
 * **实现**，不是壳，所以按「候选相对路径 × 两处根目录」把源码文本拼起来：
 * 实现还在 src 就命中 src，搬进包就命中包 —— 断言逻辑一个字都不用改。
 *
 * 容错：包目录还不存在（抽包进行中）时 `existsSync` 直接跳过，等价于旧行为。
 */
const CORE = join(HERE, '..', '..', 'packages', 'theme-core', 'src');
function implText(relPaths) {
  const chunks = [];
  for (const rel of relPaths) {
    for (const base of [THEME, CORE]) {
      const p = join(base, rel);
      if (existsSync(p)) chunks.push(read(p));
    }
  }
  return chunks.join('\n');
}

if (!isDir(THEME)) {
  console.error(`找不到主题目录：${THEME}`);
  process.exit(1);
}

/**
 * 已接入版式机制的页面：`theme/views/<page>.ts` 里**造了页面对象**的那些文件。
 * 用「是否调用 defineThemePage(」判定 —— 页面工厂 `page.ts` 内部也会调
 * createViewRegistry，所以不能用「是否含 createViewRegistry(」识别（会把工厂本身
 * 误当成一个名叫 "page" 的页面，进而去读不存在的 view/app/page/index.vue 崩溃）。
 */
const PAGES = (existsSync(VIEWS) ? readdirSync(VIEWS) : [])
  .filter(n => /^.+\.ts$/.test(n))
  .filter(n => n !== 'page.ts')
  .filter(n => n !== 'registry.ts')
  .filter(n => read(join(VIEWS, n)).includes('defineThemePage('))
  .map(n => /^(.+)\.ts$/.exec(n)?.[1])
  .filter(Boolean);

/** 主题包 */
const PACKAGES = subdirs(PKGS);

/**
 * 读某包的 `coverage` 覆盖声明（可选字段，2026-09-27 起）
 *
 * 返回归一化后的三档范围；缺省值即"全覆盖"：
 *   • devices        —— 覆盖哪些设备；缺省 = DEVICES（全部设备）
 *   • pages          —— 覆盖哪些页面；缺省 = PAGES（全部页面）
 *   • requiredColors —— 每个作用域都应具备的配色；缺省 = DEFAULT_PEER_COLORS
 *
 * 关卡据此**推导**该包应有的目录，不再写死包名（`pkg === 'compact'`）或颜色名。
 * 解析用正则（关卡本就靠正则断言 index.ts，不 import TS 源码 —— 那个文件里有
 * `import type` / `satisfies`，Node 不能直接跑）。
 */
function coverageOf(pkg) {
  const entry = join(PKGS, pkg, 'index.ts');
  const src = existsSync(entry) ? read(entry) : '';
  const arr = (key) => {
    const re = new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`);
    const m = re.exec(src);
    if (!m) return null;
    return [...m[1].matchAll(/['"]([a-z0-9-]+)['"]/g)].map(x => x[1]);
  };
  return {
    devices: arr('devices') ?? DEVICES,
    pages: arr('pages') ?? PAGES,
    requiredColors: arr('requiredColors') ?? DEFAULT_PEER_COLORS
  };
}

console.log(`\n=== 1. 目录位置 ===`);
check('theme/themes/ 存在（主题包）', isDir(PKGS));
check(
  'theme/views/ 目录存在（契约 + 注册表收在 views/）',
  isDir(VIEWS),
  '版式机制文件应收在 theme/views/，不该平铺在 theme 根'
);
check(
  'theme/themes/views/ 不存在（配色目录是 colors，且不在 themes 下）',
  !isDir(join(PKGS, 'views'))
);
check('theme/index.ts 存在（注册表在 theme 根，不在 themes 里）', existsSync(join(THEME, 'index.ts')));
check('theme/themes/index.ts 不存在', !existsSync(join(PKGS, 'index.ts')), '注册表已提到 theme 根');
check('theme/views/registry.ts 存在（版式工厂）', existsSync(join(VIEWS, 'registry.ts')));
check('theme/views/pages.ts 存在（页面版式总览）', existsSync(join(VIEWS, 'pages.ts')));
check(
  'theme/views/params.ts 存在（设备维度 URL 参数的唯一读取入口）',
  existsSync(join(VIEWS, 'params.ts')),
  '`theme.<设备>` / `view.<设备>` 的取值链只应有一份实现'
);
check(
  'theme 根不再有 view-<page>.ts 平铺文件',
  !readdirSync(THEME).some(n => /^view-.+\.ts$/.test(n)),
  '契约与注册表已收进 theme/views/'
);
check(`已接入版式的页面 ≥ 1`, PAGES.length > 0, `实际 ${PAGES.length} 个：${PAGES.join(', ')}`);

console.log(`\n=== 2. 主题包（themes/<包>/）===`);
check('发现至少一个主题包', PACKAGES.length > 0, `实际 ${PACKAGES.length} 个`);
for (const pkg of PACKAGES) {
  const dir = join(PKGS, pkg);
  const entry = join(dir, 'index.ts');
  const scss = join(dir, 'theme.scss');

  check(`「${pkg}」目录名合法（[a-z0-9-]）`, ID_RE.test(pkg), '不合规会被注册表静默跳过');
  check(`「${pkg}」有 index.ts（包定义）`, existsSync(entry), '缺了会被静默跳过，整个包不注册');
  if (existsSync(entry)) {
    const src = read(entry);
    check(`「${pkg}」index.ts 有 default 导出`, /export\s+default\s/.test(src));
    check(`「${pkg}」index.ts 含 meta`, /\bmeta\s*:/.test(src));
    check(
      `「${pkg}」包定义是 MauthThemePackage（不再兼默认配色）`,
      /satisfies\s+MauthThemePackage/.test(src),
      '包根只声明 meta/views；配色必须落到 <设备>/<页面>/colors/ 下'
    );
    check(
      `「${pkg}」包定义不含 tokens（配色才给 token）`,
      !/\btokens\s*:/.test(src),
      '包根一旦带 tokens，就会重新变成"隐式默认配色"，与实体颜色目录重复'
    );
  } else {
    check(`「${pkg}」没有残留的 theme.scss（残缺目录）`, !existsSync(scss));
  }
}

console.log(`\n=== 3. 设备层（themes/<包>/<设备>/）===`);
for (const pkg of PACKAGES) {
  const devices = subdirs(join(PKGS, pkg));
  check(
    `「${pkg}」的设备目录都在白名单内（${DEVICES.join(' / ')}）`,
    devices.every(d => DEVICES.includes(d)),
    `实际：${devices.join(', ')} —— 不在白名单的目录会被注册表整个跳过`
  );
  // 2026-09-25 起：包可只覆盖部分设备。覆盖范围由包**自述**（coverage.devices），
  // 关卡据此推导该包应有的设备目录，不再写死 `pkg === 'compact'` 这类包名。
  const cov = coverageOf(pkg);
  for (const device of DEVICES) {
    if (!cov.devices.includes(device)) continue;
    check(
      `「${pkg}」有 ${device}/ 目录（设备层是包内的一级目录）`,
      isDir(join(PKGS, pkg, device)),
      '缺一个设备目录 → 该端在该包下没有任何版式与配色'
    );
  }
}

console.log(`\n=== 4. 配色（themes/<包>/<设备>/<页面>/colors/<配色>/）===`);
/**
 * 枚举「某包某设备某页面」下的配色目录。
 *
 * 🔴 2026-09-26 起只有一处位置：`<页面>/colors/`。
 *    旧形态（`<页面>/<版式>/colors/`）已删除 —— 一个主题包 = 一种版式。
 */
function colorDirOfPage(pkgDir, device, page) {
  const dir = join(pkgDir, device, page, COLORS_DIR);
  return isDir(dir) ? dir : null;
}

/** 每套配色一条记录：{ pkg, device, page, color } */
const paletteEntries = [];

/** 版本层（旧形态）违规定位：`{ where }` */
const variantDirHits = [];

for (const pkg of PACKAGES) {
  const pkgDir = join(PKGS, pkg);
  for (const device of DEVICES) {
    for (const page of PAGES) {
      const pageDir = join(pkgDir, device, page);
      if (isDir(pageDir)) {
        // 🔴 页面下只允许 `index.vue` + `colors/`：多出来的子目录 = 旧版式层或野目录
        const extra = subdirs(pageDir).filter(n => !PAGE_SUBDIRS.includes(n));
        for (const n of extra) variantDirHits.push(`${pkg}/${device}/${page}/${n}`);
      }
      const colorsDir = colorDirOfPage(pkgDir, device, page);
      if (!colorsDir) continue;
      const where = `${pkg}/${device}/${page}`;
      for (const color of subdirs(colorsDir)) {
        paletteEntries.push({ pkg, device, page, color });
        const dir = join(colorsDir, color);
        check(`「${where}/colors/${color}」目录名合法（[a-z0-9-]）`, ID_RE.test(color));
        const entry = join(dir, 'index.ts');
        check(`「${where}/colors/${color}」有 index.ts`, existsSync(entry), '缺了这套配色不出现');
        if (existsSync(entry)) {
          const src = read(entry);
          // 🔴 re-export 形态（2026-09-27 加设备演练）：见文件头 isReexport 说明。
          //    这里只验证 re-export 目标路径合法，meta/tone/tokens 由目标文件承担。
          const reexport = /export\s*\{\s*default\s*\}\s*from\s*['"]([^'"]+)['"]/.exec(src);
          if (reexport) {
            const target = reexport[1];
            const targetRe = new RegExp(
              `themes/${pkg}/(${DEVICES.join('|')})/${page}/colors/${color}/index$`
            );
            check(
              `「${where}/${color}」re-export 目标合法（同包 × 设备 × 页面 × 配色）`,
              targetRe.test(target),
              `目标「${target}」应指向同包(${pkg})同页(${page})同配色(${color})的另一设备目录`
            );
            continue;
          }
          check(`「${where}/${color}」有 default 导出`, /export\s+default\s/.test(src));
          check(`「${where}/${color}」含 meta`, /\bmeta\s*:/.test(src));
          check(
            `「${where}/${color}」是 MauthThemeColor（不是 Package）`,
            /satisfies\s+MauthThemeColor/.test(src),
            '配色契约已从 MauthThemePackage 拆出，写错会让 tokens 语义与文档不符'
          );
          check(
            `「${where}/${color}」tokens 是扁平值（无 light/dark 两档）`,
            !/\btokens\s*:\s*\{\s*(?:\/\*[^]*?\*\/\s*)?(?:light|dark)\s*:/.test(src),
            '2026-09-25 取消明暗档：tokens 就是一组 `--mauth-*: 值`，不再有 light/dark 子对象'
          );
          check(
            `「${where}/${color}」必填 tone（明暗 ≡ 色系）`,
            /\btone\s*:\s*['"](?:light|dark)['"]/.test(src),
            '每套配色必须声明自己属于白系还是黑系，否则明暗切换无卡可落'
          );
          check(
            `「${where}/${color}」文件头不带旧口径（配色挂在版式下 / view = base）`,
            !/挂在\*\*版式\*\*下/.test(src) &&
              !/view = `base`/.test(src) &&
              !/\[<版式>\/\]colors/.test(src),
            '一个主题包 = 一种版式：配色只挂在页面下，view 恒等于包名'
          );
        }
        const scss = join(dir, 'theme.scss');
        if (existsSync(scss) && read(scss).includes('data-mauth-theme')) {
          check(
            `「${where}/${color}」theme.scss 选择器用目录名 ${color}`,
            new RegExp(`data-mauth-theme\\s*=\\s*['"]${color}['"]`).test(read(scss)),
            '属性值必须等于目录名'
          );
        }
      }
    }
  }
}
console.log(
  `  （共 ${paletteEntries.length} 套配色记录，跨 ${PACKAGES.length} 包 × ${DEVICES.length} 设备）`
);

console.log(`\n=== 4b. 🔴 页面下没有「版式层」目录（一个主题包 = 一种版式）===`);
check(
  `页面目录下不存在多余子目录（只允许 ${PAGE_SUBDIRS.join(' / ')}）`,
  variantDirHits.length === 0,
  `${variantDirHits.slice(0, 5).join(', ')}${variantDirHits.length > 5 ? ` 等 ${variantDirHits.length} 处` : ''}` +
    ' —— 变体版式必须**新建主题包**（`themes/<新包>/<设备>/<页面>/`），不要建 `<页面>/<变体>/`'
);
for (const pkg of PACKAGES) {
  for (const device of DEVICES) {
    for (const page of PAGES) {
      const pageDir = join(PKGS, pkg, device, page);
      if (!isDir(pageDir)) continue;
      const entries = readdirSync(pageDir);
      check(
        `「${pkg}/${device}/${page}」只有 index.vue 与 ${COLORS_DIR}/`,
        entries.sort().join(',') === ['colors', 'index.vue'].sort().join(','),
        `实际：${entries.sort().join(', ')}`
      );
      break; // 每设备只抽第一页做条目级断言，全量由 4b 目录断言覆盖
    }
  }
}

console.log(`\n=== 5. 黑白是并列的实体颜色（自带底色，非"零 token 基线"）===`);
/**
 * 🔴 2026-09-25 改：`mono` 拆成 `black` / `white` 两个**独立**颜色，各写全 token
 * （自带底色，与明暗偏好无关）。这里断言：
 *   • 每个「包 × 设备 × 页面」下都同时有 black 与 white 两个实体目录
 *   • 两者都**不是**零 token（自带底色是本次改动的语义核心）
 *   • 两者 meta.id 与目录名字面一致
 */
let peerScopes = 0;
for (const pkg of PACKAGES) {
  const pkgDir = join(PKGS, pkg);
  const cov = coverageOf(pkg);
  for (const device of DEVICES) {
    for (const page of PAGES) {
      const colorsDir = colorDirOfPage(pkgDir, device, page);
      if (!colorsDir) continue;
      peerScopes += 1;
      const where = `${pkg}/${device}/${page}`;
      for (const color of cov.requiredColors) {
        const dir = join(colorsDir, color);
        check(
          `「${where}」有 colors/${color}/（黑白是与蓝青并列的实体颜色）`,
          isDir(dir),
          '黑白必须是实体目录且与彩色并列，否则它无法被显式选中、也不出现在列表里'
        );
        const entry = join(dir, 'index.ts');
        if (!existsSync(entry)) continue;
        const src = read(entry);
        // re-export 形态：底色 token 与 meta.id 由目标文件承担（见文件头 isReexport）
        if (isReexport(src)) continue;
        check(
          `「${where}/${color}」自带底色 token（不再是零 token 基线）`,
          /tokens\s*:\s*\{[\s\S]{0,240}?'--mauth-/.test(src),
          '自带底色是"选黑就是黑、选白就是白，与明暗偏好无关"的实现基础'
        );
        check(
          `「${where}/${color}」meta.id 为 ${color}`,
          new RegExp(`id:\\s*['"]${color}['"]`).test(src),
          'id 以目录名为准，写错会被目录名覆盖（但本关卡要求字面一致，便于阅读）'
        );
      }
    }
  }
}
console.log(`  （校验了 ${peerScopes} 个「包×设备×页面」作用域）`);

console.log(`\n=== 6. 配色 id 的唯一性作用域 = 同包同设备同页 ===`);
/*
 * ⚠️ 注册表用的 id 是**目录名**（`colorFromKey` 解析出的 `colorId`），不是 `meta.id`
 *    —— `meta.id` 只是被目录名覆盖掉的展示字段。所以唯一性必须按**目录名**判。
 * 唯一性作用域是「同包 × 同设备 × 同页」（2026-09-26 收窄：版式段消失，因为 view ≡ pkg）：
 * 跨页面 / 跨设备 / 跨包都可以同名（`black` 在每个作用域下各有一份是正常且必要的）。
 */
const scopeCounts = new Map();
for (const e of paletteEntries) {
  const key = `${e.pkg}/${e.device}/${e.page}`;
  if (!scopeCounts.has(key)) scopeCounts.set(key, []);
  scopeCounts.get(key).push(e.color);
}
let dupScopes = 0;
for (const [scope, colors] of scopeCounts) {
  const seen = new Set();
  const dups = colors.filter(c => (seen.has(c) ? true : (seen.add(c), false)));
  if (dups.length) {
    dupScopes += 1;
    check(
      `「${scope}」内配色 id 唯一`,
      false,
      `重复：${[...new Set(dups)].join(', ')} —— 同一页同名是真冲突（取值只给一个 id）`
    );
  }
}
check(
  '没有任何作用域内出现配色 id 重复',
  dupScopes === 0,
  `${dupScopes} 个作用域有重复`
);
const totalScopes = scopeCounts.size;
check(
  `每个作用域至少有一套配色`,
  [...scopeCounts.values()].every(list => list.length > 0),
  `共 ${totalScopes} 个作用域`
);

console.log(`\n=== 6b. 目录名与 meta.id 必须一致（id 以目录名为准）===`);
/*
 * 注册表把 `meta.id` 覆盖成目录名，所以两者不一致时：
 *   • 页面显示的名与 URL 里能用的 id 不是一个（`?theme=<meta.id>` 会解析失败）
 *   • `theme.scss` 的选择器若按 meta.id 写就永远落空
 * 两条都是静默故障，因此在关卡里要求字面一致。
 */
for (const e of paletteEntries) {
  const where = `${e.pkg}/${e.device}/${e.page}`;
  const entry = join(PKGS, e.pkg, e.device, e.page, COLORS_DIR, e.color, 'index.ts');
  if (!existsSync(entry)) continue;
  const entrySrc = read(entry);
  // re-export 形态：meta.id 由目标文件承担（见文件头 isReexport），跳过字面一致性检查
  if (isReexport(entrySrc)) continue;
  const declared = /id:\s*['"]([a-z0-9-]+)['"]/.exec(entrySrc)?.[1];
  check(
    `「${where}/${e.color}」meta.id 与目录名一致`,
    declared === e.color,
    declared === e.color
      ? ''
      : `文件里写的是 '${declared ?? '(缺)'}'，目录名是 '${e.color}' —— 注册表会以后者覆盖`
  );
}

console.log(`\n=== 7. 版式实现住在包内、按设备分区 ===`);
for (const pkg of PACKAGES) {
  const cov = coverageOf(pkg);
  for (const device of DEVICES) {
    const deviceDir = join(PKGS, pkg, device);
    if (!isDir(deviceDir)) continue;
    for (const page of PAGES) {
      // 2026-09-25 起：包可只覆盖部分页面。覆盖范围由包**自述**（coverage.pages），
      // 缺页面目录不算违规 —— 跨包路由由其它包或该端自带版式兜底。
      if (!cov.pages.includes(page)) continue;
      check(
        `「${pkg}/${device}」有 ${page}/index.vue（该包该设备的唯一版式）`,
        existsSync(join(deviceDir, page, 'index.vue')),
        '没有版式的包/设备在该页只能回落到容器的静态兜底'
      );
      check(
        `「${pkg}/${device}」${page}/base/index.vue 已不存在（去掉 base 层）`,
        !existsSync(join(deviceDir, page, 'base', 'index.vue')),
        '基础版式应直接是 <page>/index.vue，不应再有 base/ 目录'
      );
      // 🔴 2026-09-26：连"版式层目录"本身都不该存在
      const extra = subdirs(join(deviceDir, page)).filter(n => !PAGE_SUBDIRS.includes(n));
      check(
        `「${pkg}/${device}/${page}」下没有版式层目录`,
        extra.length === 0,
        `${extra.join(', ')} —— 换版式要新建主题包，不要建 <页面>/<变体>/`
      );
    }
    // 配色已下沉到页面下 → 设备层只允许出现页面目录
    const strays = subdirs(deviceDir).filter(n => !PAGES.includes(n));
    check(
      `「${pkg}/${device}」没有非法子目录`,
      strays.length === 0,
      `${strays.join(', ')} —— 配色住在 <页面>/colors/ 下，设备层不该再有其它目录`
    );
  }
}

console.log(`\n=== 7b. 每个版式都声明身份：data-mauth-view === 包名 ===`);
{
  // 版式根上的这个属性是**关卡与排查的唯一取值口**（Playwright 侧拿不到 store，
  // 只能从 DOM 读"现在渲染的是哪套 UI"）。规则文档要求**三端版式都带**它。
  // 🔴 值必须是**包名**：一个主题包 = 一种版式 ⇒ 版式 id ≡ 包名。
  //    写 'base' 是 2026-09-26 之前的旧口径 —— 那个名字在注册表里已经不存在了。
  for (const pkg of PACKAGES) {
    for (const device of DEVICES) {
      for (const page of PAGES) {
        const file = join(PKGS, pkg, device, page, 'index.vue');
        if (!existsSync(file)) continue;
        const src = read(file);
        // 🔴 版式 re-export（2026-09-27 加设备演练）：`import X from '…'; export default X;`
        //    （无 <template>）—— 该设备版式复用同包另一设备的版式（如 tablet 复用 standard），
        //    `data-mauth-view` 由目标版式承担（目标在同包另一设备目录，已被本段检查）。
        //    身份一致（都是 default 包），故放行，避免「加设备」时复制整份版式。
        if (!/<template>/.test(src) && /export\s+default\s+[A-Za-z_$][\w$]*\s*;?\s*<\/script>/.test(src)) {
          continue;
        }
        const m = /data-mauth-view="([^"]*)"/.exec(src);
        check(
          `「${pkg}/${device}/${page}」版式声明 data-mauth-view="${pkg}"`,
          Boolean(m) && m[1] === pkg,
          m ? `实际写了 "${m[1]}"` : '整份版式没有 data-mauth-view（关卡读不到身份）'
        );
      }
    }
  }
}

console.log(`\n=== 8. 版式跟随「主题包 × 设备」（实现口径）===`);
for (const page of PAGES) {
  const src = read(join(VIEWS, `${page}.ts`));
  check(
    `${page} 注册表版式 glob 跨全部主题包与设备`,
    src.includes(`themes/*/*/${page}/index.vue`),
    '版式在 <包>/<设备>/<页面>/index.vue，glob 必须带设备段'
  );
  check(
    `${page} 注册表**没有**旧的「变体版式」glob（多一层目录）`,
    !src.includes(`themes/*/*/${page}/*/index.vue`),
    '一个主题包 = 一种版式：多一层目录的 glob 会扫到 0 个文件，留着只会误导'
  );
  check(
    `${page} 注册表 glob 用 /src/ 根绝对路径（相对路径会静默扫不到）`,
    src.includes(`'/src/theme/themes/*/*/${page}/index.vue'`),
    '相对路径（../）在当前 Vite 版本下扫不到任何文件且不报错，必须用 /src/ 绝对路径'
  );
  check(
    `${page} 页面文件带上 page 名（defineThemePage 声明）`,
    new RegExp(`defineThemePage\\(\\{[\\s\\S]*?page:\\s*'${page}'`).test(src),
    '工厂靠 page 名从 glob 键里切出「包 / 设备」两段'
  );
  check(
    `${page} 页面文件声明 envView（部署级默认，工厂拿不到 import.meta.env）`,
    /envView:\s*import\.meta\.env\./.test(src),
    '取值链只有一份实现（views/picker.ts）；各页只声明自己的页面名与环境变量'
  );
  check(
    `${page} 选择器**不再**自己实现 asText / asPackage / asDevice`,
    !/function\s+asText/.test(src) && !/function\s+asPackage/.test(src) && !/function\s+asDevice/.test(src),
    '这三段曾是三页逐字重复的实现，漏改一处就是"三页不同形"'
  );
  check(
    `${page} 容器用 readDeviceParam 读设备维度参数（不从 route.query 直接取 view）`,
    read(join(ROOT, 'view', 'app', page, 'index.vue')).includes('readDeviceParam'),
    '`view.<设备>` / `view` 的取值链只应有一份实现（theme/views/params.ts）'
  );
}
{
  // 版式**选择器**（取值链）——三页共用一份，所以这些都只断言一次
  const pickerSrc = implText(['views/picker.ts']);
  check(
    '选择器工厂存在且导出 createViewPicker',
    /export\s+function\s+createViewPicker\(/.test(pickerSrc),
    '三页的取值链唯一实现（views/picker.ts）'
  );
  check(
    '选择器的输入含 device（第三段查找范围）',
    /device\?:\s*unknown/.test(pickerSrc),
    '设备是查找范围的第二段，不传就没法按端取版式'
  );
  check(
    '选择器有设备白名单归一（复用 params 的 asThemeDevice）',
    /asThemeDevice\(/.test(pickerSrc),
    '设备名是外部输入，必须落白名单；口径只此一处'
  );
  check(
    '选择器把 source.theme 交给 registry.resolve（声明档，不自己判合法性）',
    /resolve\(\s*source\.theme,\s*pkg,\s*device\s*\)/.test(pickerSrc),
    '合法性只由注册表判：白名单、包 × 设备两段范围都在 resolve 里'
  );
  check(
    '选择器的 URL 分支：resolve(url,…) ?? pkg（非法值不回退到声明/环境变量档）',
    /if\s*\(url\)\s*return\s+registry\.resolve\(url,\s*pkg,\s*device\)\s*\?\?\s*pkg/.test(pickerSrc),
    'URL 显式给了值就不再回退；非法值落**当前包**（不是别的版式，更不是已废弃的 base）'
  );
  check(
    '选择器的 preload 把 source 原样交给 pick（声明档不会被漏掉）',
    /const\s+id\s*=\s*pick\(source\)/.test(pickerSrc),
    '漏掉 theme 会让预取算出与容器不同的 id —— 白拉一个用不上的 chunk'
  );
  check(
    '选择器的 preload 有「内置包零请求」短路',
    /if\s*\(id\s*===\s*pkg\s*&&\s*pkg\s*===\s*registry\.builtinPackage\)\s*return/.test(pickerSrc),
    '内置包版式由容器静态引入，预取它等于白拉一个请求'
  );
  check(
    '选择器不再是「把 url 当包名再试一次」的重复分支',
    !/has\(url,\s*url,\s*device\)/.test(pickerSrc),
    'resolve 的跨包分支已覆盖 `?view=compact`；重复一遍会让 `?view=base` 漏出已废弃的 id'
  );
  check(
    '选择器不再声称支持 `?pkg=` 参数（从未实现过）',
    !/\?pkg=/.test(pickerSrc),
    '真的切换包用 `?view=<目标包名>`，全仓没有任何地方读 query.pkg'
  );

  // 预取守卫必须与容器同源地传声明档（否则预取等于白拉）
  const routesSrc = read(join(ROOT, 'router', 'routes.ts'));
  check(
    '路由预取守卫把 viewFor(page) 的声明档一起传下去',
    /theme:\s*readDeclaredView\(/.test(routesSrc) && /viewFor\(page,\s*device\)/.test(routesSrc),
    '容器传了 theme 而守卫不传 ⇒ 预取算出的 id 与容器不同（白拉一个用不上的 chunk）'
  );
  check(
    '移动端路由由页面注册表生成（listPageViews 派生，加页面不改路由）',
    /listPageViews\(\)/.test(routesSrc) && /withViewPreload\(pv\.preload,\s*pv\.page\)/.test(routesSrc),
    '路由数据化：/m/<page> 由页面清单 + 页面对象的 preload 自动生成，不再手写每页一条'
  );
}
{
  const factory = implText(['views/registry.ts']);
  check(
    '工厂只有一套键正则（无 variantKeyRe 残留）',
    factory.includes('baseKeyRe') && !factory.includes('variantKeyRe'),
    '一包一版式后没有"变体键"这种形态，留着就是死代码'
  );
  check(
    '工厂键正则含设备段',
    /themes\/\(\[\^\/\]\+\)\/\(\[\^\/\]\+\)\/\$\{page\}/.test(factory),
    '键正则必须有「包 / 设备」两段，否则设备维度会丢'
  );
  check('工厂按「包/设备」两段建表', factory.includes('${pkg}/${device}'), '不按两段分表就没法只查当前包当前设备');
  check(
    '工厂有 normalizeDevice 白名单',
    /function\s+normalizeDevice/.test(factory),
    '设备名来自外部，必须归一'
  );
  check(
    '工厂只保留 bases 一张表（无 variants 残留）',
    /const\s+bases\s*=\s*new Map/.test(factory) && !/\bvariants\b/.test(factory),
    '一包一版式后"变体表"没有来源也没有消费者'
  );
  check(
    '工厂在内置包 + 默认设备时直接返回 null（交给容器静态引入）',
    /const\s+target\s*=\s*id\s*!==\s*pkg\s*&&\s*bases\.has\(scopeKey\(id,\s*device\)\)\s*\?\s*id\s*:\s*pkg/.test(
      factory
    ) && /if\s*\(target\s*===\s*builtinPackage\)\s*return\s+null/.test(factory),
    '这条是"默认路径零请求"的实现：不带 view 参数时 target === pkg === builtinPackage'
  );
  check(
    '工厂 resolve 把 `base` 归一成包名',
    /if\s*\(id\s*===\s*baseId\)\s*return\s+pkg/.test(factory),
    '`base` 现在只是逻辑 id，不是配色注册表的 view 取值：传 `base` 下去会让配色键全链落空'
  );
}

const themeIndexSrc = implText(['index.ts', 'registry.ts', 'constants.ts']);
const builtinPkg = /DEFAULT_THEME_PACKAGE\s*=\s*'([a-z0-9-]+)'/.exec(themeIndexSrc)?.[1];
check('theme/index.ts 导出了 DEFAULT_THEME_PACKAGE', Boolean(builtinPkg), `值 = ${builtinPkg}`);
check(
  'theme/devices.ts 是设备取值集合的唯一来源（不再写死在常量里）',
  existsSync(DEVICES_FILE) && DEVICES.length > 0,
  `本关卡从 ${DEVICES_FILE} 读到设备：${DEVICES.join(' / ')}`
);
check(
  'theme/index.ts 把设备维度转发出去（THEME_DEVICES / ThemeDevice / DEFAULT_THEME_DEVICE）',
  /THEME_DEVICES/.test(themeIndexSrc) &&
    /ThemeDevice/.test(themeIndexSrc) &&
    /DEFAULT_THEME_DEVICE/.test(themeIndexSrc),
  '设备维度的公共出口（值在 devices.ts，这里只转发，导入面不变）'
);

// ---- 默认版式 / 默认配色（2026-09-26 用户定：default + white）----
const defaultColor = /DEFAULT_THEME_COLOR\s*=\s*'([a-z0-9-]+)'/.exec(themeIndexSrc)?.[1];
const defaultDarkColor = /DEFAULT_THEME_DARK_COLOR\s*=\s*'([a-z0-9-]+)'/.exec(themeIndexSrc)?.[1];
check(
  '默认配色是**显式常量**（不再靠"字母序第一"）',
  Boolean(defaultColor),
  'export const DEFAULT_THEME_COLOR = …；靠字母序时"默认外观"是命名巧合的副产品'
);
check(
  `默认配色就是 ${DEFAULT_PEER_COLORS[1]}（用户口径：默认版式 default + 默认配色 white）`,
  defaultColor === DEFAULT_PEER_COLORS[1],
  `值 = ${defaultColor}`
);
check(
  '暗系兜底是它的配对色（white ↔ black）',
  defaultDarkColor === DEFAULT_PEER_COLORS[0],
  `DEFAULT_THEME_DARK_COLOR = ${defaultDarkColor}`
);
check(
  'defaultColorIdOf 先取显式默认色，该范围没有才退回字母序第一',
  /if\s*\(ids\.includes\(DEFAULT_THEME_COLOR\)\)\s*return\s+DEFAULT_THEME_COLOR/.test(themeIndexSrc),
  '否则新增一个字母序更靠前的配色 id（如 amber）会静默改掉默认外观'
);
if (defaultColor) {
  const missingDefault = [];
  for (const pkg of PACKAGES) {
    for (const device of DEVICES) {
      for (const page of PAGES) {
        const colorsDir = colorDirOfPage(join(PKGS, pkg), device, page);
        if (!colorsDir) continue;
        if (!isDir(join(colorsDir, defaultColor))) missingDefault.push(`${pkg}/${device}/${page}`);
      }
    }
  }
  check(
    `每个「包 × 设备 × 页面」都有默认配色 colors/${defaultColor}/（默认色必须是处处可用的实体）`,
    missingDefault.length === 0,
    missingDefault.slice(0, 6).join(', ')
  );
}

for (const page of PAGES) {
  const container = read(join(ROOT, 'view', 'app', page, 'index.vue'));
  const imported = new RegExp(
    `@/theme/themes/([a-z0-9-]+)/mobile/${page}/index\\.vue`
  ).exec(container)?.[1];
  check(
    `${page} 容器静态引入内置包 × mobile 的版式`,
    Boolean(imported),
    '内置包的版式必须静态引入（首屏零请求）'
  );
  check(
    `${page} 容器引入的包 === DEFAULT_THEME_PACKAGE（${builtinPkg}）`,
    imported === builtinPkg,
    `容器写的是 ${imported}，两边不一致时"零请求"那条路径就断了`
  );
  check(
    `${page} 容器写死 THEME_DEVICE = 'mobile'（设备是页面身份）`,
    /const\s+THEME_DEVICE\s*=\s*'mobile'\s+as\s+const/.test(container),
    '移动端容器不跑视口判定，身份由文件位置决定'
  );
  check(
    `${page} 容器的切换 watch 依赖 themeStore.packageId`,
    /watch\(\s*\[viewId,\s*\(\)\s*=>\s*themeStore\.packageId\]/.test(container),
    '换包但 viewId 字符串没变时必须重新取组件'
  );
  check(
    `${page} 容器调 load 时传了 THEME_DEVICE`,
    new RegExp(`Views\\.load\\([^)]*THEME_DEVICE\\)`).test(container),
    '不传设备就查不到版式'
  );
}

console.log(`\n=== 8b. 三设备容器各自静态引入自己设备的版式（首屏零请求）===`);
{
  /** 每个设备在 `view/` 下的容器文件（设备三值化的落地形态） */
  const DEVICE_CONTAINERS = [
    ['mobile', p => join(ROOT, 'view', 'app', p, 'index.vue'), 'mobile'],
    ['standard', p => join(ROOT, 'view', 'web', p, 'Standard.vue'), 'standard'],
    ['mini', p => join(ROOT, 'view', 'web', p, 'Mini.vue'), 'mini']
  ];
  for (const [label, pathOf, deviceName] of DEVICE_CONTAINERS) {
    for (const page of PAGES) {
      const p = pathOf(page);
      if (!existsSync(p)) continue;
      const src = read(p);
      check(
        `${label}/${page} 容器静态引入 themes/${builtinPkg}/${deviceName}/${page}/index.vue`,
        src.includes(`@/theme/themes/${builtinPkg}/${deviceName}/${page}/index.vue`),
        `三个设备各自静态引入自己那份，load() 返回 null 才对所有设备都成立`
      );
      check(
        `${label}/${page} 容器写死 THEME_DEVICE = '${deviceName}'`,
        new RegExp(`const\\s+THEME_DEVICE\\s*=\\s*'${deviceName}'\\s+as\\s+const`).test(src),
        '容器身份取常量，不跑视口判定'
      );
    }
  }
}

console.log(`\n=== 9. store / 路由的设备接线 ===`);
{
  const store = read(join(ROOT, 'stores', 'theme.ts'));
  check('store 有 activeDevice', /const\s+activeDevice\s*=\s*ref<ThemeDevice>/.test(store));
  check('store 有 setActiveDevice', /function\s+setActiveDevice/.test(store));
  check(
    'token 注入 watch 依赖 activeDevice',
    /watch\(\s*\[\s*themeTokens,\s*externalTokens,\s*activeDevice,\s*isDark\s*\]/.test(store),
    '不依赖设备 → 从 /login 跳到 /m/login 时 token 不会重算'
  );
  check(
    'token 注入不再按明暗取档（tokens 已扁平化）',
    /applyThemeLayers\(\{\s*theme:\s*themeTokens\.value,\s*external:\s*externalTokens\.value\s*\}\)/.test(
      store
    ),
    '2026-09-25 取消 tokens 的 light/dark 两档 → applyThemeLayers 不再接收 isDark'
  );
  check(
    'runtime 的 tokens 是扁平 Record（无 light/dark 档）',
    /export\s+type\s+ThemeTokenOverrides\s*=\s*Record<string,\s*string>/.test(
      implText(['runtime.ts', 'tokens.ts'])
    ),
    'tokens 应是一组扁平值：`{ "--mauth-x": "…" }`'
  );
  check(
    '明暗标配对复用默认色常量（store 里不再硬编码 white / black）',
    /target\s*===\s*'dark'\s*\?\s*DEFAULT_THEME_DARK_COLOR\s*:\s*DEFAULT_THEME_COLOR/.test(store),
    '硬编码会让「默认色」出现两个真相源：改常量改不动明暗联动'
  );
  check(
    'data-mauth-theme watch 依赖 deviceTheme / activeDevice / activePage / activeView',
    /watch\(\s*\[\s*themeId,\s*deviceTheme,\s*activeDevice,\s*activePage,\s*activeView\s*\]/.test(store),
    '同一个 themeId 在四段归属不同的地方解析出的记录可能不同（不匹配时回落），' +
      '漏掉 deviceTheme 就漏掉"某设备单独指定了配色"这一类切换'
  );
  check(
    '回落档不写 data-mauth-theme 属性',
    /if\s*\(record\.meta\.id\s*===\s*id\)\s*root\.dataset\.mauthTheme\s*=\s*id/.test(store),
    '跑了回落档还写属性会让 theme.scss 选择器挂到一套没生效的配色上'
  );
  check(
    'themeRecordFor 按 pkg/device/page/view 解析（view ≡ pkg）',
    /function\s+themeRecordFor\(\s*pkg:\s*string\s*=\s*DEFAULT_THEME_PACKAGE/.test(store)
  );
  check(
    'store 有设备维度的 URL 意图（deviceTheme）',
    /deviceTheme\s*=\s*ref<DeviceThemeIntent>/.test(store),
    '`?theme.<设备>=` 的落点；没有它就只能全局一个 id'
  );
  check(
    'store 有按设备的 URL 锁（urlLockedThemeOf）',
    /function\s+urlLockedThemeOf/.test(store),
    'URL 锁必须按设备分开，否则手机端钉了配色会把电脑端的手动选择也锁死'
  );
  check(
    'themeRecordFor 取"设备专属 id 优先，否则全局 id"',
    /deviceTheme\.value\[device\]\s*\?\?\s*themeId\.value/.test(store),
    '这是"同一主题不同设备不同配色"与"三端共用同一主题"两条场景的唯一合流点'
  );
  check(
    '显式选色会清掉本设备的 URL 覆盖（URL 不压过用户操作）',
    /clearDeviceThemeOverride\(/.test(store),
    'setTheme / cycleMode / toggleTheme 清锁；setMode 不清（后端与父应用要留在 URL 之下）'
  );
}
{
  const router = read(join(ROOT, 'router', 'index.ts'));
  const main = read(join(ROOT, 'main.ts'));

  check(
    '导出了 setupThemeDeviceSync（设备同步的唯一入口）',
    /export\s+function\s+setupThemeDeviceSync/.test(router),
    '把设备同步从 afterEach 搬出来后，必须有一个明确的入口供 main.ts 调用'
  );
  check(
    '设备由 RouteMeta.device 判定（不是视口）',
    /currentRoute\.value\.meta\.device\s*===\s*'mobile'\s*\?\s*'mobile'\s*:\s*'standard'/.test(router),
    '用视口判会出现"分发器渲染移动端组件、路由说电脑端"的分裂'
  );
  check(
    '设备同步用 watch(router.currentRoute) 而不是 afterEach',
    /watch\(\s*\(\)\s*=>\s*\(?router\.currentRoute\.value\.meta\.device/.test(router),
    '⚠️ 写在 afterEach 里会让**首次**导航静默失效：app.use(router) 触发首导航时 ' +
      'Pinia 的 activeInstance 尚未建立，useThemeStore() 抛错被吞 → 电脑端永远按手机端渲染'
  );
  check(
    '设备同步 watch 带 immediate（覆盖首次导航）',
    /\{\s*immediate:\s*true\s*\}/.test(router.slice(router.indexOf('setupThemeDeviceSync'))),
    '没有 immediate 就漏掉首屏那一次'
  );
  check(
    'main.ts 在 app.use(pinia) 之后调用 setupThemeDeviceSync',
    (() => {
      const piniaAt = main.indexOf('app.use(pinia)');
      const syncAt = main.indexOf('setupThemeDeviceSync(');
      return piniaAt !== -1 && syncAt !== -1 && syncAt > piniaAt;
    })(),
    '函数内部会 useThemeStore()，必须在 Pinia activeInstance 建立之后调用'
  );
  check(
    '路由守卫预取用 readDeviceParam 取版式（与容器同一取值链）',
    read(join(ROOT, 'router', 'routes.ts')).includes('readDeviceParam'),
    '守卫与容器各写一套取值链必然漂移（预取 `view.standard=compact` 会预取错包）'
  );
}

console.log(`\n=== 10. 注册表实现与文档口径一致 ===`);
{
  const src = themeIndexSrc;
  const globs = [
    ['包定义：themes 一层 + index.ts', './themes/*/index.ts'],
    ['配色：包 / 设备 / 页面 / colors / 配色', './themes/*/*/*/colors/*/index.ts'],
    ['配色样式（同形态，theme.scss）', './themes/*/*/*/colors/*/theme.scss']
  ];
  for (const [label, pattern] of globs) {
    check(`glob 仍为「${label}」`, src.includes(`'${pattern}'`), '改了就要同步本文档与 README');
  }
  check(
    '🔴 不再有「6 段配色」glob（配色 glob 只有一套）',
    !src.includes("'./themes/*/*/*/*/colors/*/index.ts'") &&
      !src.includes("'./themes/*/*/*/*/colors/*/theme.scss'") &&
      !src.includes("'./themes/*/*/*/*/colors/*/"),
    '一个主题包 = 一种版式：路径里没有「版式」这一层，6 段 glob 会扫到 0 个文件'
  );
  check(
    '不再有「设备级配色」glob（配色在页面下，不在设备下）',
    !src.includes("'./themes/*/*/colors/*/index.ts'"),
    '配色住在 <页面>/colors/ 下，设备下直接挂 colors 已是过时位置'
  );
  check(
    '不再有「包根样式」glob（样式只属于配色）',
    !src.includes("'./themes/*/theme.scss'"),
    '包根样式会让"包"与"配色"的样式来源含糊不清'
  );
  check(
    '目录名覆盖配色 meta.id',
    /meta:\s*\{\s*\.\.\.def\.meta,\s*id:\s*parsed\.colorId\s*\}/.test(src),
    '文档承诺「以目录名为准」'
  );
  check('id 白名单仍在', /\/\^\[a-z0-9-\]\+\$\//.test(src), '文档承诺「只允许 [a-z0-9-]」');
  check(
    'colorFromKey 只解析 4 段，返回无 view 字段（view ≡ pkg 已并入包段）',
    /function\s+colorFromKey/.test(src) &&
      /const\s+pkg\s*=\s*m\[1\]/.test(src) &&
      /const\s+colorId\s*=\s*m\[4\]/.test(src) &&
      /return\s*\{\s*pkg,\s*device,\s*page,\s*colorId\s*\}/.test(src) &&
      !/variantRe/.test(src),
    '一包一版式：配色归属只到包段，不再派生 view 字段；旧的分支正则必须删干净'
  );
  check(
    'colorFromKey 的键正则只有一套（无 6 段模式）',
    (() => {
      // 键正则里「包 / 设备 / 页面 / colors / 配色」只应有一处捕获组形态
      const captures = (src.match(/\/colors\/\(\[\^\/\]\+\)/g) || []).length;
      const has4Seg = src.includes('([^/]+)/([^/]+)/([^/]+)/colors/([^/]+)');
      const has5Seg = src.includes('([^/]+)/([^/]+)/([^/]+)/([^/]+)/colors/');
      return captures === 1 && has4Seg && !has5Seg;
    })(),
    '第二个模式若还在，"变体配色"这条死路径就没删干净（它会匹配 0 个文件）'
  );
  check('导出了 getThemePackage（配色 → 包）', /export\s+function\s+getThemePackage/.test(src));
  check(
    'getDefaultThemeId 按「设备 × 页面 × 包」取（不再写死 DEFAULT_THEME_ID）',
    /export\s+function\s+getDefaultThemeId\(\s*device/.test(src),
    '每个作用域各有一套兜底配色'
  );
  check(
    '同作用域内配色重名会告警而不是静默覆盖',
    /console\.warn/.test(src) && /内重复/.test(src),
    '唯一性作用域是「同包同设备同页」'
  );
  check(
    'findRecord 按「包」匹配（view 段已并入 pkg，无 BASE_VIEW_ID 反语义分支）',
    /function\s+findRecord\(/.test(src) &&
      /r\.device\s*===\s*device\s*&&\s*r\.page\s*===\s*page\s*&&\s*r\.pkg\s*===\s*pkg/.test(src) &&
      !/view\s*!==\s*BASE_VIEW_ID\s*&&/.test(src) &&
      !/r\.view\s*===/.test(src),
    '⚠️ 记录里已无 view 字段（B5 四段键），兜底匹配必须按 r.pkg === pkg；残留 r.view 引用会编译报错'
  );
  check(
    'listColorsOf 按「包」过滤（无 record.view 残留）',
    /export\s+function\s+listColorsOf/.test(src) &&
      /record\.pkg\s*!==\s*pkg/.test(src) &&
      !/record\.view/.test(src),
    'B5 四段键后 listColorsOf 按 pkg 过滤；残留 record.view 是旧口径的死代码'
  );
  check(
    '注册表按「包/设备/页面/配色」四段复合键存（无 view 段）',
    /const\s+keyOf\s*=\s*\(info:\s*ColorKeyInfo\)/.test(src) &&
      /registry\.set\(keyOf\(/.test(src) &&
      /\$\{info\.pkg\}\/\$\{info\.device\}\/\$\{info\.page\}\/\$\{info\.colorId\}/.test(src),
    '⚠️ 只以配色 id 作键会把不同页的 black 判成重名而丢弃；五段键里的 view 段是纯冗余（view ≡ pkg）'
  );
  check(
    '五色并列：listColorsOf 只按 id 字母序，不给黑白特权',
    /export\s+function\s+listColorsOf/.test(src) &&
      /\.sort\(\(a,\s*b\)\s*=>\s*a\.id\.localeCompare\(b\.id\)\)/.test(src),
    '排序上的特权就是"黑白更特殊"的暗示，与「五色完全并列」相悖'
  );
}

console.log('\n=== 11. 设备维度 URL 参数（theme.<设备> / view.<设备>）===');
{
  const params = implText(['views/params.ts']);
  check(
    'params.ts 导出 readDeviceParam',
    /export\s+function\s+readDeviceParam/.test(params),
    '版式侧的设备维度取值入口'
  );
  check(
    'params.ts 先取 `<名>.<设备>`，再回退通用 `<名>`',
    /query\?\.\[\s*`\$\{name\}\.\$\{device\}`\s*\]/.test(params) && /return\s+query\?\.\[name\]/.test(params),
    '顺序反了会让设备专属参数永远不生效'
  );
  check(
    'params.ts 把空串当"未指定"（不吞掉回退链）',
    /function\s+isPresent/.test(params),
    '`?view.mobile=&view=compact` 里 mobile 侧应回退到通用的 compact'
  );

  const store = read(join(ROOT, 'stores', 'theme.ts'));
  check(
    '配色侧按设备读 `theme.<设备>` / `skin.<设备>`',
    /params\.get\(\s*`theme\.\$\{device\}`\s*\)/.test(store) &&
      /params\.get\(\s*`skin\.\$\{device\}`\s*\)/.test(store),
    '「分别配置」那条场景的落点：每个设备各自一个 id'
  );
  check(
    '设备维度参数不写 localStorage（它是访问意图，不是用户选择）',
    !/setItem\(\s*`theme[-.]\$\{?device/.test(store),
    '把"这次访问的意图"持久化会让下一次访问莫名带着上次的 URL 指派'
  );
  check(
    '配色侧也把空串当"未指定"（与 readDeviceParam 同形）',
    /function\s+present|const\s+present\s*=\s*\(/.test(store) &&
      /present\(\s*params\.get\(\s*`theme\.\$\{device\}`\s*\)/.test(store) &&
      /present\(\s*params\.get\(\s*'theme'\s*\)/.test(store),
    'URLSearchParams.get() 对 `?theme.mobile=` 返回空串（不是 null），' +
      '`\'\' ?? anyScope` 仍是空串 → 通用键也一起失效，与"留空 = 不特殊指定"相反'
  );
}

console.log('\n=== 12. 版式优先级：三页同形（URL > 声明 > 环境变量 > 包名）===');
{
  /**
   * 页面名 → [契约文件名, 选择函数名, 预取函数名, 环境变量名]
   *
   * ⚠️ 取值链本身**只断言一次**（见上一节的 picker 块）：2026-09-26 起三页共用
   *    `views/picker.ts` 一份实现，这里只验"每页有没有把本页的注册表与环境变量接进去"。
   */
  const PAGE_FILES = [
    ['login', 'login.ts', 'loginPage', 'pickLoginViewId', 'preloadLoginView', 'VITE_LOGIN_VIEW'],
    [
      'register',
      'register.ts',
      'registerPage',
      'pickRegisterViewId',
      'preloadRegisterView',
      'VITE_REGISTER_VIEW'
    ],
    [
      'forgot-password',
      'forgot-password.ts',
      'forgotPasswordPage',
      'pickForgotPasswordViewId',
      'preloadForgotPasswordView',
      'VITE_FORGOT_PASSWORD_VIEW'
    ]
  ];
  for (const [page, file, pageObj, picker, preload, envName] of PAGE_FILES) {
    const src = read(join(VIEWS, file));
    check(
      `${file} 用页面工厂声明（defineThemePage，含 envView）`,
      new RegExp(
        `defineThemePage\\(\\{[\\s\\S]{0,400}?envView:\\s*import\\.meta\\.env\\.`
      ).test(src),
      '机制统一在 views/page.ts；页面文件只声明 page / title / envView / loaders'
    );
    check(
      `${file} 导出 ${picker}，且委托给页面工厂（loginPage.pick）`,
      new RegExp(`export\\s+const\\s+${picker}\\s*=\\s*${pageObj}\\.pick`).test(src),
      '导入面必须保持（容器与关卡都按这个名字取），实现则统一到工厂的 picker'
    );
    check(
      `${file} 导出 ${preload}，且委托给页面工厂（${pageObj}.preload）`,
      new RegExp(`export\\s+const\\s+${preload}\\s*=\\s*${pageObj}\\.preload`).test(src),
      '路由守卫按这个名字调预取'
    );
    check(
      `${file} 引用部署级环境变量 ${envName}`,
      src.includes(envName),
      '部署级默认（整站换 UI，不动代码）；必须在页面文件里读，工厂拿不到 import.meta.env 的静态替换'
    );

    const container = read(join(ROOT, 'view', 'app', page, 'index.vue'));
    check(
      `${page} 容器把 themeStore.viewFor('${page}') 传进 ${picker}`,
      new RegExp(`theme:\\s*themeStore\\.viewFor\\(\\s*'${page}'\\s*\\)`).test(container),
      '声明档的**真源**是配色记录（包定义或配色自带），容器不传这一项就等于没这档'
    );
  }
}

console.log('\n=== 13. theme-core 包契约（依赖方向 + 公开面 + 壳无逻辑）===');
{
  /**
   * 为什么要有这一节：抽包把"内核"从进程内的一块目录变成了**可被别的宿主消费的包**，
   * 于是「内核不知道宿主」这条原则（立项文档 §〇）必须从口头约定变成机械断言 ——
   * 否则三个月后必然出现"包内偷偷 import 宿主"，那时包再也拿不出去，只能回滚。
   *
   * ⚠️ 源码里的**块注释与整行注释先剔掉再看**：注释是给人读的，提到 DOM 不等于用了 DOM。
   *    行尾 `//` 注释保留（它们是正则的注解，本身也不含禁用词）。
   */
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  if (!isDir(CORE)) {
    check(
      '内核包 packages/theme-core/src 存在',
      false,
      `未找到 ${CORE} —— 抽包后退化成"没有内核包"，本节的其余断言失去意义`
    );
  } else {
    const coreFiles = [];
    (function walk(dir) {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (isDir(p)) walk(p);
        else if (/\.ts$/.test(n)) coreFiles.push(p);
      }
    })(CORE);
    check('内核包有源码文件', coreFiles.length > 0, `${coreFiles.length} 个 .ts`);

    const banned = [
      ['import.meta（构建器耦合）', /\bimport\.meta\b/],
      ['window / document（DOM）', /\b(?:window|document)\s*\./],
      ['localStorage（存储）', /\blocalStorage\b/],
      ['非 import type 的 vue（框架耦合）', /import\s+(?!type\b)[^;\n]*from\s+['"]vue['"]/],
      ['vue-router（应用世界观）', /from\s+['"]vue-router['"]/],
      ['axios / fetch（网络）', /\baxios\b|\bfetch\s*\(/],
      ['@/ 别名（宿主路径）', /from\s+['"]@\//]
    ];
    for (const [label, re] of banned) {
      const hits = coreFiles
        .filter(f => re.test(strip(read(f))))
        .map(f => f.slice(CORE.length + 1).replace(/\\/g, '/'));
      check(`内核不依赖：${label}`, hits.length === 0, hits.join(', '));
    }

    const barrel = read(join(CORE, 'index.ts'));
    const REQUIRED = [
      'DEFAULT_THEME_COLOR',
      'DEFAULT_THEME_DARK_COLOR',
      'readDeviceParam',
      'normalizeTone',
      'normalizeMode',
      'isSafeTokenEntry',
      'sanitizeOverrides'
    ];
    // 设备取值集合已下沉到宿主（2026-09-27）：内核**不该**导出 THEME_DEVICES /
    // DEFAULT_THEME_DEVICE / asThemeDevice —— 那是应用的词汇表，不是机制。
    const MUST_NOT_EXPORT = ['THEME_DEVICES', 'DEFAULT_THEME_DEVICE', 'asThemeDevice'];
    const leaked = MUST_NOT_EXPORT.filter(n => new RegExp(`\\b${n}\\b`).test(barrel));
    check(
      '内核不再导出设备取值集合（THEME_DEVICES / DEFAULT_THEME_DEVICE / asThemeDevice）',
      leaked.length === 0,
      `泄漏：${leaked.join(', ')} —— 设备清单随应用走（oauth21/src/theme/devices.ts），内核只认"设备名是个字符串"这条形态`
    );
    const missing = REQUIRED.filter(n => !new RegExp(`\\b${n}\\b`).test(barrel));
    check(
      '内核公开面（src/index.ts）含全部关键导出',
      missing.length === 0,
      `缺：${missing.join(', ')}`
    );
    check(
      '内核公开面用显式具名导出（不用 `export *`）',
      !/export\s+\*\s+from/.test(barrel),
      '`export *` 会把"包承诺了什么"变成隐式清单：加一个内部导出就悄悄扩大了对外承诺'
    );
  }

  /**
   * 壳：`@/theme/*` 的导入面靠它们保持不变，所以壳本身**不许有实现**。
   * 判定方式：先剔注释，再把**整条** `export {…} from '…';` 语句删掉
   * （⚠️ 按行判会误伤多行花括号导出 —— 续行不以 `export` 开头），剩下的必须是空。
   */
  const SHELLS = ['tone.ts', 'mode.ts', 'types.ts', join('views', 'params.ts')];
  for (const rel of SHELLS) {
    const p = join(THEME, rel);
    const label = rel.replace(/\\/g, '/');
    if (!existsSync(p)) {
      check(`壳 ${label} 存在`, false, '抽包后应用侧应留同名转发壳，导入面才不变');
      continue;
    }
    const logic = strip(read(p))
      .replace(/export\s+(?:type\s+)?\{[\s\S]*?\}\s*from\s*['"][^'"]+['"]\s*;/g, '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    check(`壳 ${label} 里只有转发（无逻辑）`, logic.length === 0, logic.slice(0, 2).join(' | '));
    check(
      `壳 ${label} 从内核包转发`,
      /from\s+['"]skinsuite['"]/.test(read(p)),
      '转发源必须是包名（而不是相对路径指回包内源码），否则 alias/paths 一改就静默错位'
    );
  }
}

const total = pass + failures.length;
console.log(`\n===== ${failures.length === 0 ? '全绿' : '有失败'}：${pass}/${total} 通过 =====`);
if (failures.length) {
  console.log('失败项：');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
