/**
 * 主题注册表
 *
 * === 加一个主题要做的事 ===
 *   1. 新建 `src/themes/<id>/index.ts`，默认导出 `MauthThemePackage`
 *   2. （可选）同目录放 `theme.scss`，写背景图 / 字体 / 装饰等 token 表达不了的部分
 *   3. （可选）同目录放 `assets/`，在 theme.scss 里用相对路径引用
 *   就这么三步，**不需要动本文件、不需要动 mobile-auth.scss、不需要动 store**。
 *
 * === 加载策略（为什么分两档）===
 *   • `index.ts`（元信息 + tokens）**同步预载**：体积只有几百字节，且 URL 参数
 *     `?theme=xxx` 的合法性校验、`data-mauth-theme` 属性写入都发生在首帧前，
 *     必须能同步拿到 id → tokens 的映射，否则会先渲染默认色再跳变。
 *   • `theme.scss`（可能内含背景图 / webfont 引用）**惰性动态加载**：这是真正
 *     有体积的部分，用 `?inline` 拿到编译后的 CSS 字符串，由运行时按需插进
 *     `<style>`，切换主题时替换。避免把 N 个主题的图片与字体全塞进首屏包。
 *   Vite 会把每个主题的 theme.scss 单独切 chunk，切到才请求。
 *
 * @author yijiu2025
 */
import type { MauthThemePackage, MauthThemeMeta, MauthThemeRecord } from './types';

/** 内置默认主题 id：不设 data-mauth-theme 属性，直接用 mobile-auth.scss 基线配色 */
export const DEFAULT_THEME_ID = 'default';

/** 各主题文件夹下的入口模块（同步预载，只含元信息与 token） */
const themeModules = import.meta.glob<{ default: MauthThemePackage }>('./*/index.ts', {
  eager: true
});

/** 各主题文件夹下的附加样式（惰性，`?inline` 取编译后 CSS 字符串） */
const themeStyleLoaders = import.meta.glob<string>('./*/theme.scss', {
  query: '?inline',
  import: 'default'
});

/** 目录名只允许小写字母/数字/短横线：既约束了主题作者，也避免奇怪目录名进入属性选择器 */
const THEME_ID_RE = /^[a-z0-9-]+$/;

/** 从 `./ocean/index.ts` 里取出 `ocean`；不合法返回 null */
function idFromModuleKey(key: string): string | null {
  const m = /^\.\/([^/]+)\/index\.ts$/.exec(key);
  const id = m?.[1];
  return id && THEME_ID_RE.test(id) ? id : null;
}

function idFromStyleKey(key: string): string | null {
  const m = /^\.\/([^/]+)\/theme\.scss$/.exec(key);
  const id = m?.[1];
  return id && THEME_ID_RE.test(id) ? id : null;
}

function buildRegistry(): Map<string, MauthThemeRecord> {
  const registry = new Map<string, MauthThemeRecord>();

  for (const [key, mod] of Object.entries(themeModules)) {
    const id = idFromModuleKey(key);
    const pkg = mod?.default;
    // 目录名不合规、或忘了 `export default`，都跳过而不是抛错：
    // 一个写坏的主题不该让整个认证页起不来。
    if (!id || !pkg || typeof pkg !== 'object' || !pkg.meta) continue;
    registry.set(id, {
      // id 以目录名为准（防止包内 meta.id 与目录名不一致时属性选择器对不上）
      meta: { ...pkg.meta, id },
      tokens: pkg.tokens,
      // 版式声明原样带上：合法性由各页的版式注册表判定（themes/app/<page>/registry.ts）
      views: pkg.views,
      loadStyle: undefined
    });
  }

  for (const [key, loader] of Object.entries(themeStyleLoaders)) {
    const id = idFromStyleKey(key);
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
  meta: { id: DEFAULT_THEME_ID, name: '默认' },
  tokens: undefined,
  views: undefined,
  loadStyle: undefined
};

/** 当前有哪些主题（供后台预览 / 调试面板列出） */
export function listThemes(): MauthThemeMeta[] {
  return [...registry.values()].map(r => r.meta);
}

/**
 * 归一化并校验外部传入的主题 id
 *
 * 用于 URL 参数 / 后端下发这类不可信输入：非法字符、未登记 id 一律返回 null，
 * 由调用方决定回退（通常回默认主题）。不做「模糊匹配」，避免 `../` 一类路径
 * 拼装值绕过校验。
 */
export function resolveThemeId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim().toLowerCase();
  if (!id || !THEME_ID_RE.test(id)) return null;
  return registry.has(id) ? id : null;
}

/** 取主题记录；传默认 id 时返回空记录（默认主题刻意无 token，直接吃 SCSS 基线） */
export function getThemeRecord(id: string): MauthThemeRecord {
  if (id === DEFAULT_THEME_ID) return registry.get(DEFAULT_THEME_ID) ?? EMPTY_RECORD;
  return registry.get(id) ?? registry.get(DEFAULT_THEME_ID) ?? EMPTY_RECORD;
}

/** 该主题是否登记过 */
export function isKnownTheme(id: unknown): boolean {
  return resolveThemeId(id) !== null;
}
