/**
 * 页面版式总览 —— 「哪些页面接了可换 UI、各自有哪些版式」的可编程查询入口
 *
 * 各页面的注册表文件（`views/login.ts`、`views/register.ts`…）各自调 `createViewRegistry`，
 * 彼此独立、互不感知；本文件用 glob 汇总起来，于是**新增页面不用回来改这里**
 * （与 `@/theme` 主题注册表同一策略）。
 *
 * 消费者是调试面板 `components/dev/ThemeDebugPanel.vue`
 * —— `ViewRegistry.packages()` 的注释里写的就是这个场景。
 *
 * ⚠️ 注释里不要写出「星号紧跟斜杠」的两个字符：它会提前闭合本段块注释，
 *    症状是后面的正文被当成代码解析（`theme/types.ts` 与 `scripts/check-browser-baseline.mjs`
 *    各踩过一次）。描述 glob 模式时用「子目录通配 + 文件名」这样的说法绕开。
 *
 * @author yijiu2025
 * @since 2026-09-23
 */
import type { PackageViews, ViewRegistry } from './registry';
import { isThemePage } from './page';

/** 页面名 = 版式目录名 = 路由 path 的末段（如 register）；与主题 id 同规则 */
const PAGE_RE = /^[a-z0-9-]+$/;

/**
 * 各页面的版式模块（`./login.ts`、`./register.ts` 等）。
 *
 * 每个页面文件 = 「契约类型 + 一次 `defineThemePage` 声明」，导出名各页不同
 * （`loginPage` / `registerPage`…），所以：
 *   • 只 glob `*.ts`，不排除任何文件名（`registry.ts`/`picker.ts`/`page.ts`/本文件
 *     都不含页面对象，自然被跳过）；
 *   • 靠**运行时标记**（`isThemePage`）从模块的导出里找出页面对象，不认固定导出名。
 */
const registryModules = import.meta.glob<Record<string, unknown>>('./*.ts', {
  eager: true
});

/** 一个页面接入版式机制后的可查询信息 */
export interface PageViews {
  /** 页面名（`theme/views/<page>.ts` 里声明的 `page`） */
  page: string;
  /** 默认路由标题（设备专属标题用 `titleOf`） */
  title: string;
  /** 取某设备的标题（缺省回落 `title`）—— 加一种设备不必改这里 */
  titleOf(device: string): string;
  /** 该页的版式注册表 */
  registry: ViewRegistry;
  /**
   * 各主题包 × 设备在这页各有哪些版式（按"包/设备"排序）
   *
   * 版式住在包与设备里，所以要按两段列。⚠️ 一个主题包 = 一种版式（2026-09-26），
   * 所以每个条目的 `ids` 恒为 `[包名]`，这里保留元组形态只是为了"哪天一个包要挂
   * 多套版式"时不改调用方。
   *
   * ⚠️ 曾有 `ids` / `byDevice` 两个字段（按设备列出内置包下的变体 id），随变体
   *    子目录机制的删除一并移除 —— 它们没有任何消费点。
   */
  packages: PackageViews[];
}

/**
 * 兜底判据：一个模块直接导出了**裸注册表**（没走页面工厂）时，怎么认出它
 *
 * === 为什么这张表必须是 `Record<keyof ViewRegistry, …>` ===
 * 手抄成员名（`typeof candidate.baseId === 'string' && typeof candidate.list === 'function' && …`）
 * 的问题是**它不会随接口一起更新**，而且失败是静默的：
 *   实锤：`ViewRegistry.list()` 在 `8f6b328` 被删除（一个主题包 = 一种版式后，
 *   包内不再有"变体清单"），但那时的判据表里还留着 `candidate.list === 'function'`。
 *   于是判据**恒假** → `buildPages()` 永远返回空 → `pageFromPath()` /
 *   `viewsForPage()` 恒 `undefined` → 调试面板的「版式」区永不渲染，
 *   `activeViewId` 退化成 `packageId`（读不到 `?view=` 的真实值）。**全程零报错**，
 *   潜伏了整整一轮。
 *
 * 换成 `Record<keyof ViewRegistry, 'string' | 'function'>` 后，**穷尽性由 TS 保证**：
 * 接口加一个成员而不在这里分类，本文件直接编译失败 —— 判据再也不会"落后于接口"。
 *
 * ⚠️ 改完必须让 `Record` 的键集合真的跟着接口走（所以类型标注不能省成 `Record<string, …>`；
 *    写成 `Record<string, …>` 就退回了手抄表，只是换了个写法）。
 *
 * ⚠️ 首选判据已经是**页面工厂的运行时标记**（`isThemePage`）—— 标记不会因接口改成员而失效。
 *    这张形态表只服务"没走工厂、直接导出一个裸注册表"的模块（向后兼容 / 外部页面）。
 *
 * 不用 `instanceof`：`registry.ts` 导出的是工厂函数的返回值，没有类可言。
 * 也不认固定导出名（各页叫 `registerViews` / `loginViews`…）—— 那样每加一页都要来改这里。
 */
const VIEW_REGISTRY_SHAPE: Record<keyof ViewRegistry, 'string' | 'function'> = {
  baseId: 'string',
  builtinPackage: 'string',
  packages: 'function',
  has: 'function',
  resolve: 'function',
  load: 'function'
};

/** 键集合来自接口；逐项核形态。一个模块里只要有一个对象满足就认它是注册表实例 */
function isViewRegistryShape(value: unknown): value is ViewRegistry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (Object.keys(VIEW_REGISTRY_SHAPE) as (keyof ViewRegistry)[]).every(
    key => typeof candidate[key] === VIEW_REGISTRY_SHAPE[key]
  );
}

function buildPages(): Map<string, PageViews> {
  const pages = new Map<string, PageViews>();

  for (const [key, mod] of Object.entries(registryModules)) {
    // 从文件名切出页面名：`./register.ts` → `register`；`./forgot-password.ts` → `forgot-password`。
    // 工厂/本文件等不含页面对象的模块会被下面两道判定自然跳过。
    const filePage = /^\.\/(.+)\.ts$/.exec(key)?.[1];
    if (!filePage || !PAGE_RE.test(filePage)) continue;

    // ① 首选：页面工厂的产物（带运行时标记 —— 判据不会随接口漂移）
    const page = Object.values(mod).find(isThemePage);
    if (page) {
      // 三处必须字面一致（目录名 / 文件名 / 路由末段）；不一致只告警不抛错：
      // 一个名字写歪的页面不该让整个面板起不来，但也不该静默。
      if (page.page !== filePage) {
        console.warn(
          `[view] ${key} 里声明的 page 是「${page.page}」，与文件名「${filePage}」不一致：` +
            '主题目录名 / 页面文件名 / 路由末段三处必须字面一致。'
        );
      }
      pages.set(filePage, {
        page: page.page,
        title: page.title,
        titleOf: page.titleOf,
        registry: page.views,
        packages: page.views.packages()
      });
      continue;
    }

    // ② 兼容：模块里直接导出了一个裸注册表（未走工厂的页面）。
    //    判据是**由接口派生**的形态表（见上方 `VIEW_REGISTRY_SHAPE`），不是手抄成员名。
    const registry = Object.values(mod).find(isViewRegistryShape);
    if (!registry) continue;
    pages.set(filePage, {
      page: filePage,
      title: filePage,
      titleOf: () => filePage,
      registry,
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
 *
 * 🔴 `mini-` 前缀路由（2026-09-25 起 mini 是独立设备）：`/mini-login` 这类独立路由
 *    的页面仍是 `login`（同一条页面的 mini 设备形态）。不剥前缀的话，调试面板在
 *    /mini-login 上推断不出页面 → 版式/颜色区全部回落 base + 0 种。
 */
export function pageFromPath(path: string): string | undefined {
  const segment = path
    .split(/[?#]/)[0]
    .split('/')
    .filter(Boolean)
    .pop();
  if (!segment) return undefined;
  if (pages.has(segment)) return segment;
  const stripped = segment.replace(/^mini-/, '');
  return stripped && pages.has(stripped) ? stripped : undefined;
}
