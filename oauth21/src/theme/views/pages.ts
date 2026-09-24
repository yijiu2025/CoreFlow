/**
 * 页面版式总览 —— 「哪些页面接了可换 UI、各自有哪些版式」的可编程查询入口
 *
 * 各页面的注册表文件（`views/login.ts`、`views/register.ts`…）各自调 `createViewRegistry`，
 * 彼此独立、互不感知；本文件用 glob 汇总起来，于是**新增页面不用回来改这里**
 * （与 `@/theme` 主题注册表同一策略）。
 *
 * 消费者是调试面板 `components/dev/ThemeDebugPanel.vue`
 * —— `ViewRegistry.list()` 的注释里写的就是这个场景。
 *
 * ⚠️ 注释里不要写出「星号紧跟斜杠」的两个字符：它会提前闭合本段块注释，
 *    症状是后面的正文被当成代码解析（`theme/types.ts` 与 `scripts/check-browser-baseline.mjs`
 *    各踩过一次）。描述 glob 模式时用「子目录通配 + 文件名」这样的说法绕开。
 *
 * @author yijiu2025
 * @since 2026-09-23
 */
import type { PackageViews, ViewRegistry } from './registry';

/** 页面名 = 版式目录名 = 路由 path 的末段（如 register）；与主题 id 同规则 */
const PAGE_RE = /^[a-z0-9-]+$/;

/**
 * 各页面的版式注册表模块（`./login.ts`、`./register.ts` 等）。
 *
 * 每个页面文件里同时装了「契约类型 + 注册表」，且注册表导出名各页不同
 * （`loginViews` / `registerViews` / `forgotPasswordViews`…），所以：
 *   • 只 glob `*.ts`，用负向断言排除本文件（`pages.ts`）与工厂（`registry.ts`）；
 *   • 靠鸭子类型从模块的所有导出里找出注册表实例，不认固定导出名。
 */
const registryModules = import.meta.glob<Record<string, unknown>>('./*.ts', {
  eager: true
});

/** 一个页面接入版式机制后的可查询信息 */
export interface PageViews {
  /** 页面名（`theme/views/<page>.ts` 里的页面名） */
  page: string;
  /** 该页的版式注册表 */
  registry: ViewRegistry;
  /**
   * **内置包**的可选版式 id：`base` 在最前，其余为已登记变体（已排序）
   *
   * 取内置包是因为面板默认这么展示（内置包 = 基础版式被容器静态引入的那份）；
   * 跨包全貌见 `packages`。
   */
  ids: string[];
  /** 各主题包在这页各有哪些版式（按包名排序）—— 版式住在包里，所以要按包列 */
  packages: PackageViews[];
}

/**
 * 鸭子类型识别注册表实例
 *
 * 不用 `instanceof`：`registry.ts` 导出的是工厂函数的返回值，没有类可言。
 * 也不认固定导出名（各页叫 `registerViews` / `loginViews`…）—— 那样每加一页都要来改这里。
 * 判据只取「长得像 ViewRegistry」：一个模块里只要有一个对象满足就认它。
 */
function isViewRegistry(value: unknown): value is ViewRegistry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.baseId === 'string' &&
    typeof candidate.list === 'function' &&
    typeof candidate.resolve === 'function' &&
    typeof candidate.load === 'function'
  );
}

function buildPages(): Map<string, PageViews> {
  const pages = new Map<string, PageViews>();

  for (const [key, mod] of Object.entries(registryModules)) {
    // 从文件名切出页面名：`./register.ts` → `register`；`./forgot-password.ts` → `forgot-password`。
    // 工厂（`registry.ts`）与本文件（`pages.ts`）会被下面这行排除：它们不含注册表实例。
    const page = /^\.\/(.+)\.ts$/.exec(key)?.[1];
    if (!page || !PAGE_RE.test(page)) continue;
    const registry = Object.values(mod).find(isViewRegistry);
    // 模块里没有注册表实例（写坏了，或就是工厂/本文件）：跳过而不是抛错 —— 一个页面接错，不该让面板起不来
    if (!registry) continue;
    pages.set(page, {
      page,
      registry,
      ids: [registry.baseId, ...registry.list(registry.builtinPackage)],
      packages: registry.packages()
    });
  }

  return pages;
}

const pages = buildPages();

/** 所有接了可换 UI 的页面（按页面名排序，保证面板里的顺序稳定） */
export function listPageViews(): PageViews[] {
  return [...pages.values()].sort((a, b) => a.page.localeCompare(b.page));
}

/** 按页面名取；该页面未接入版式机制时返回 undefined */
export function viewsForPage(page: string | undefined): PageViews | undefined {
  return page ? pages.get(page) : undefined;
}

/**
 * 从路由 path 猜出页面名（取末段）
 *
 * 不做完整路由表匹配：`/m/register` 与 `/register` 都要落到 `register`，而路由名
 * （`MobileRegister`）与页面名并不同名。「末段 + 该页面确实已接入版式」双重判定
 * 足够准，且新增页面无需登记。
 */
export function pageFromPath(path: string): string | undefined {
  const segment = path
    .split(/[?#]/)[0]
    .split('/')
    .filter(Boolean)
    .pop();
  return segment && pages.has(segment) ? segment : undefined;
}
