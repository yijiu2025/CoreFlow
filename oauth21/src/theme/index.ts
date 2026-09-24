/**
 * 主题（配色）注册表 —— 两级结构：**主题包 → 配色**
 *
 * === 一个主题包 = 一整套呈现方案（版式 + 配色），在一个目录里一起开发 ===
 *   1. 建 `src/theme/themes/<包>/index.ts`，默认导出 `MauthThemePackage`
 *      —— 它就是该包的**定义**，同时充当该包的**默认配色**（id = 包名）。
 *   2. 同目录放该包的**版式**：`<page>/index.vue 与 <page>/<变体>/index.vue`（见 `theme/views/registry.ts`）。
 *   3. （可选）同目录放 `theme.scss`，写背景图 / 字体 / 装饰等 token 表达不了的部分。
 *   4. （可选）建 `colors/<配色>/index.ts`（+ 同名 `theme.scss` / `assets/`），
 *      给这个包再加几套配色。
 * 包与配色**都不需要动本文件、不需要动 mobile-auth.scss、不需要动 store**。
 *
 * === 为什么配色 id 是全局唯一的 ===
 *   URL `?theme=ocean` 只给一个 id，不可能同时告诉我们是哪个包 —— 所以要靠**配色反查包**：
 *   每条记录都带 `pkg`（见 `MauthThemeRecord.pkg`），版式就在那个包里找。
 *   重名的配色按路径排序**先到先得**并告警，不静默覆盖（否则哪套生效取决于文件系统顺序）。
 *   包根配色的 id 就是包名，天然唯一；实际只会出现在「不同包的 colors 用了同名配色」。
 *
 * === 加载策略（为什么分两档）===
 *   • `index.ts`（元信息 + tokens）**同步预载**：体积只有几百字节，且 URL 参数
 *     `?theme=xxx` 的合法性校验、`data-mauth-theme` 属性写入都发生在首帧前，
 *     必须能同步拿到 id → tokens 的映射，否则会先渲染默认色再跳变。
 *   • `theme.scss`（可能内含背景图 / webfont 引用）**惰性动态加载**：这是真正
 *     有体积的部分，用 `?inline` 拿到编译后的 CSS 字符串，由运行时按需插进
 *     `<style>`，切换主题时替换。避免把 N 套配色的图片与字体全塞进首屏包。
 *   Vite 会把每套配色的 theme.scss 单独切 chunk，切到才请求。
 *
 * @author yijiu2025
 */
import type { MauthThemePackage, MauthThemeMeta, MauthThemeRecord } from './types';

/** 内置默认主题（配色）id：不设 data-mauth-theme 属性，直接用 mobile-auth.scss 基线配色 */
export const DEFAULT_THEME_ID = 'default';

/**
 * 内置默认**主题包** id
 *
 * 与 `DEFAULT_THEME_ID` 含义不同，它用在版式侧：该包的基础版式由容器**静态引入**
 * （首屏零请求），其它包的基础版式才需要惰性加载。见 `theme/views/registry.ts`。
 */
export const DEFAULT_THEME_PACKAGE = 'default';

/** 各主题包根目录的入口模块（包定义 + 该包默认配色，同步预载） */
const packageModules = import.meta.glob<{ default: MauthThemePackage }>('./themes/*/index.ts', {
  eager: true
});

/** 各主题包内 `colors/` 下的附加配色（同步预载，同上） */
const colorModules = import.meta.glob<{ default: MauthThemePackage }>(
  './themes/*/colors/*/index.ts',
  { eager: true }
);

/** 包根配色的附加样式（惰性，`?inline` 取编译后 CSS 字符串） */
const packageStyles = import.meta.glob<string>('./themes/*/theme.scss', {
  query: '?inline',
  import: 'default'
});

/** 包内配色的附加样式（惰性，同上） */
const colorStyles = import.meta.glob<string>('./themes/*/colors/*/theme.scss', {
  query: '?inline',
  import: 'default'
});

/** 目录名只允许小写字母/数字/短横线：既约束了主题作者，也避免奇怪目录名进入属性选择器 */
const THEME_ID_RE = /^[a-z0-9-]+$/;

/**
 * 按路径排序后再遍历
 *
 * `import.meta.glob` 的键顺序当前是稳定的，但"重名先到先得"这类规则若依赖它，
 * 就成了隐式条件。这里显式排序，让判定结果与文件系统顺序无关。
 */
function sortedEntries<T>(mods: Record<string, T>): [string, T][] {
  return Object.entries(mods).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** 从包根入口的键里取出包名；不合法返回 null */
function packageFromKey(key: string): string | null {
  const id = /^\.\/themes\/([^/]+)\/index\.ts$/.exec(key)?.[1];
  return id && THEME_ID_RE.test(id) ? id : null;
}

/** 从包内配色的键里取出 `{ 包名, 配色 id }`；不合法返回 null */
function colorFromKey(key: string): { pkg: string; colorId: string } | null {
  const m = /^\.\/themes\/([^/]+)\/colors\/([^/]+)\/index\.ts$/.exec(key);
  const pkg = m?.[1];
  const colorId = m?.[2];
  if (!pkg || !colorId || !THEME_ID_RE.test(pkg) || !THEME_ID_RE.test(colorId)) return null;
  return { pkg, colorId };
}

/** 样式键 → 配色 id（包根样式给包名，包内样式给配色名） */
function paletteFromStyleKey(key: string): string | null {
  const color = /^\.\/themes\/[^/]+\/colors\/([^/]+)\/theme\.scss$/.exec(key)?.[1];
  if (color) return THEME_ID_RE.test(color) ? color : null;
  const pkg = /^\.\/themes\/([^/]+)\/theme\.scss$/.exec(key)?.[1];
  return pkg && THEME_ID_RE.test(pkg) ? pkg : null;
}

function buildRegistry(): Map<string, MauthThemeRecord> {
  const registry = new Map<string, MauthThemeRecord>();
  /** 包名 → 包根的版式声明（包内配色未自带声明时继承它） */
  const packageViews = new Map<string, Record<string, string> | undefined>();

  // ① 包根：既是包定义，也是该包的默认配色
  for (const [key, mod] of sortedEntries(packageModules)) {
    const pkg = packageFromKey(key);
    const def = mod?.default;
    // 目录名不合规、或忘了 `export default`，都跳过而不是抛错：
    // 一个写坏的包不该让整个认证页起不来。
    if (!pkg || !def || typeof def !== 'object' || !def.meta) continue;
    packageViews.set(pkg, def.views);
    registry.set(pkg, {
      pkg,
      // id 以目录名为准（防止包内 meta.id 与目录名不一致时属性选择器对不上）
      meta: { ...def.meta, id: pkg },
      tokens: def.tokens,
      views: def.views,
      loadStyle: undefined
    });
  }

  // ② 包内附加配色
  for (const [key, mod] of sortedEntries(colorModules)) {
    const parsed = colorFromKey(key);
    const def = mod?.default;
    if (!parsed || !def || typeof def !== 'object' || !def.meta) continue;
    const { pkg, colorId } = parsed;
    // 包根缺失（包本身写坏）：该配色无处可依，跳过
    if (!packageViews.has(pkg)) continue;
    if (registry.has(colorId)) {
      console.warn(
        `[theme] 配色 id「${colorId}」重复（${key} 已忽略）：配色 id 必须全局唯一，` +
          '因为 URL 只给一个 id，要靠它反查所属主题包。'
      );
      continue;
    }
    registry.set(colorId, {
      pkg,
      meta: { ...def.meta, id: colorId },
      tokens: def.tokens,
      // 配色自己声明了就用自己的，否则继承包根 —— 包根写一次，全包配色共用
      views: def.views ?? packageViews.get(pkg),
      loadStyle: undefined
    });
  }

  // ③ 附加样式：按配色 id 挂上去
  for (const [key, loader] of [...sortedEntries(packageStyles), ...sortedEntries(colorStyles)]) {
    const id = paletteFromStyleKey(key);
    if (!id) continue;
    const record = registry.get(id);
    // 有 theme.scss 但没 index.ts 的目录视为残缺，忽略其样式
    if (record) record.loadStyle = loader;
  }

  return registry;
}

const registry = buildRegistry();

/** 注册表为空时给一个空主题兜底，保证 store 侧不必到处判空 */
const EMPTY_RECORD: MauthThemeRecord = {
  pkg: DEFAULT_THEME_PACKAGE,
  meta: { id: DEFAULT_THEME_ID, name: '默认' },
  tokens: undefined,
  views: undefined,
  loadStyle: undefined
};

/** 当前有哪些配色（供后台预览 / 调试面板列出） */
export function listThemes(): MauthThemeMeta[] {
  return [...registry.values()].map(r => r.meta);
}

/** 当前有哪些主题包（去重，已排序）；包内含哪几套配色由调试面板自行归类 */
export function listThemePackages(): string[] {
  return [...new Set([...registry.values()].map(r => r.pkg))].sort();
}

/** 调试面板用的一组：一个主题包 + 它名下的配色（按包名、再按 id 排序） */
export function listThemeGroups(): { pkg: string; themes: MauthThemeMeta[] }[] {
  const groups = new Map<string, MauthThemeMeta[]>();
  for (const record of registry.values()) {
    const bucket = groups.get(record.pkg);
    if (bucket) bucket.push(record.meta);
    else groups.set(record.pkg, [record.meta]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([pkg, themes]) => ({
      pkg,
      themes: [...themes].sort((a, b) => a.id.localeCompare(b.id))
    }));
}

/**
 * 归一化并校验外部传入的配色 id
 *
 * 用于 URL 参数 / 后端下发这类不可信输入：非法字符、未登记 id 一律返回 null，
 * 由调用方决定回退（通常回默认配色）。不做「模糊匹配」，避免 `../` 一类路径
 * 拼装值绕过校验。
 */
export function resolveThemeId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim().toLowerCase();
  if (!id || !THEME_ID_RE.test(id)) return null;
  return registry.has(id) ? id : null;
}

/** 取配色记录；传默认 id 时返回空记录（默认配色刻意无 token，直接吃 SCSS 基线） */
export function getThemeRecord(id: string): MauthThemeRecord {
  if (id === DEFAULT_THEME_ID) return registry.get(DEFAULT_THEME_ID) ?? EMPTY_RECORD;
  return registry.get(id) ?? registry.get(DEFAULT_THEME_ID) ?? EMPTY_RECORD;
}

/**
 * 这套配色属于哪个主题包 —— **版式的查找范围由它决定**（版式跟随主题包）
 *
 * 未知 / 非法配色返回 `DEFAULT_THEME_PACKAGE`：与 `getThemeRecord` 的回退口径一致，
 * 调用方不必先判空再取。
 */
export function getThemePackage(id: string): string {
  return getThemeRecord(id).pkg;
}

/** 该配色是否登记过 */
export function isKnownTheme(id: unknown): boolean {
  return resolveThemeId(id) !== null;
}
