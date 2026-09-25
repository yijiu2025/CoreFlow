/**
 * 版式（view）注册表工厂 —— 「业务容器 + 可换 UI」的通用机制
 *
 * === 这一层解决什么 ===
 * 页面拆成两半：
 *   • **业务容器**（如 `view/app/register/index.vue`）—— 状态、校验、请求、路由跳转，
 *     以及所有「点了会发生什么」。**只此一份**，任何版式都不复制它。
 *   • **版式（UI）**（如 `theme/themes/default/register/index.vue`）—— 只负责
 *     「长什么样」，通过 props 拿到容器给的 `ctx`（状态 + 操作函数）来渲染与回调。
 * 于是「换一套 UI」= 加一个目录，不用碰业务代码，也不会出现两份校验逻辑各自漂移。
 *
 * === 版式跟随主题包与设备（本文件最关键的一条）===
 * 版式实现住在**主题包里、且按设备分区**（`theme/themes/<包>/<设备>/<page>/<id>.vue`），
 * 查找范围就是**当前主题包 × 当前设备**：换一套设计 = 换一个包，手机端与电脑端各看各的。
 * 契约与注册表是**每页一份**的页面文件（`theme/views/<page>.ts`），留在**架构层**
 * （`theme/views/` 目录），所有包共用一份 —— 跟着进包就会变成 N 份副本，必然漂移。
 *
 * === 目录与 naming ===
 * ```
 * theme/views/registry.ts              架构层：版式注册表工厂（本文件）
 * theme/views/<page>.ts                架构层：某页的契约 + 注册表（每页一份，与包无关）
 * theme/themes/<包>/<设备>/<page>/      主题包内：某设备下的版式实现（目录名即版式 id）
 * ├── index.vue                        **基础版式**（缺省用；内置包的那份被容器同步引入）
 * └── compact/index.vue                变体（惰性加载，切成独立 chunk）
 * ```
 * 版式实现是「包内 `<设备>/<page>/` 下的一层目录」：`<page>/index.vue` 是基础版式，
 * `<page>/<变体>/index.vue` 是变体。**不再有 `base/` 这层** —— 基础版式直接落在
 * 页面目录下，与变体平级（`base` 只是一个逻辑 id，不是目录名）。
 *
 * ⚠️ 描述 glob 模式时别写出「星号紧跟斜杠」的字符组合：它会**提前闭合块注释**。
 * 用「子目录通配 + 文件名」这样的措辞绕开。
 *
 * === 为什么内置包的 base 不进惰性表 ===
 * 基础版式是绝大多数访问的默认路径，让它在关键路径上多等一个网络往返不划算，
 * 所以**内置包**（`DEFAULT_THEME_PACKAGE`）的 base 由容器**静态引入**；本表
 * 对「内置包 + base」直接返回 null，表示"用你静态引入的那份"。
 * 非内置包的 base 只能惰性加载（包是运行时才定的，静态 import 钉不住），
 * 由路由守卫提前预热，容器首帧先渲染静态兜底、chunk 到了再接管。
 *
 * === 安全边界 ===
 * 版式 id 来自 URL / 主题包 / 环境变量，都属**外部输入**：这里只做「当前包当前设备内
 * 已登记」白名单匹配（id、包名、设备名都限登记过的取值），不做模糊匹配、不拼路径
 * —— 未登记一律返回 null，由调用方回退基础版式。这与 `@/theme` 配色 id 的校验口径一致。
 *
 * @author yijiu2025
 * @since 2026-09-23
 */
import type { Component } from 'vue';
import { DEFAULT_THEME_PACKAGE, DEFAULT_THEME_DEVICE, THEME_DEVICES, type ThemeDevice } from '../index';

/** 基础版式的目录名（约定值，各页一致） */
export const BASE_VIEW_ID = 'base';

/** 版式 id / 主题包 id 白名单：与配色 id 同规则（它会出现在 data-* 与日志里） */
const VIEW_ID_RE = /^[a-z0-9-]+$/;

/** `import.meta.glob` 的结果形态：路径 → 惰性加载器 */
export type ViewModuleMap = Record<string, () => Promise<{ default: Component }>>;

export interface ViewRegistryOptions {
  /**
   * 页面名
   *
   * 与 `theme/views/<page>.ts` 的页面名、以及包内 `themes/<包>/<设备>/<page>/` 的
   * 目录名一致。用来从 glob 键里切出「哪个包、什么设备、哪套版式」三段。
   */
  page: string;
  /** 基础版式的逻辑 id，默认 `base`（它不再是目录名，基础版式落在 `<page>/index.vue`） */
  baseId?: string;
  /** 内置包 id，默认 `DEFAULT_THEME_PACKAGE`；见文件头「为什么内置包的 base 不进惰性表」 */
  builtinPackage?: string;
}

/** 某个主题包在**某设备**该页登记了哪些版式 */
export interface PackageViews {
  pkg: string;
  device: ThemeDevice;
  /** 该包该设备内的版式 id：`base` 在最前，其余为已登记变体（已排序） */
  ids: string[];
}

export interface ViewRegistry {
  /** 基础版式 id（调用方用它判断"要不要去加载变体"） */
  readonly baseId: string;
  /** 内置包 id（它的基础版式由容器静态引入） */
  readonly builtinPackage: string;
  /** 某个包在**某设备**下该页登记的变体 id（不含基础版式），已排序 */
  list(pkg: string, device: ThemeDevice): string[];
  /** 所有包 × 设备在该页的版式总览（供调试面板按"包 + 设备"展示） */
  packages(): PackageViews[];
  /** 外部输入在**指定包、指定设备内**是否解析得出可用版式 */
  has(raw: unknown, pkg: string, device: ThemeDevice): boolean;
  /**
   * 解析外部输入 → 可用 id（**查找范围是 `pkg` 包 × `device` 设备**）
   * 返回 `baseId` 表示显式指定了基础版式；返回 null 表示「非法 / 该范围内未登记 / 非字符串」
   * —— 两种情况调用方都该用基础版式渲染，区别只在显式指定时**不再往下回退**
   * （否则 `?view=base` 会被主题包声明的变体顶掉，显式意图失效）。
   */
  resolve(raw: unknown, pkg: string, device: ThemeDevice): string | null;
  /**
   * 加载版式组件
   *
   * 返回 null 表示"**用容器静态引入的那份**"（内置包 + 基础设备下的 base，或该范围内
   * 确实什么都没有）。该范围内缺这套版式时会自动退到**同包同设备**的基础版式，
   * 再不行才交回容器。加载失败**不抛错**：少一套 UI 不该让整页打不开，返回 null 即可。
   */
  load(id: string | null, pkg: string, device: ThemeDevice): Promise<Component | null>;
}

/** 设备名先归一化：外部传入的任意值都必须落在白名单里 */
function normalizeDevice(raw: unknown): ThemeDevice {
  return typeof raw === 'string' && (THEME_DEVICES as readonly string[]).includes(raw)
    ? (raw as ThemeDevice)
    : DEFAULT_THEME_DEVICE;
}

/**
 * @param loaders `import.meta.glob` 的结果，键形如
 *                `/src/theme/themes/default/mobile/register/compact/index.vue`
 *                （基础版式则是 `.../mobile/register/index.vue`）
 * @param options 见 `ViewRegistryOptions`
 */
export function createViewRegistry(
  loaders: ViewModuleMap,
  options: ViewRegistryOptions
): ViewRegistry {
  const baseId = options.baseId ?? BASE_VIEW_ID;
  const builtinPackage = options.builtinPackage ?? DEFAULT_THEME_PACKAGE;
  const { page } = options;
  if (!VIEW_ID_RE.test(page)) {
    throw new Error(`[view] page 名「${page}」不合规：只允许小写字母/数字/短横线`);
  }

  /** 各包各设备的基础版式：`包/设备` → 加载器 */
  const bases = new Map<string, () => Promise<{ default: Component }>>();
  /** 各包各设备的变体版式：`包/设备/版式` → 加载器 */
  const variants = new Map<string, () => Promise<{ default: Component }>>();

  /** 二段键：把「包 + 设备」拼成一个 Map 键，避免嵌套 Map 的取值样板代码 */
  const scopeKey = (pkg: string, device: ThemeDevice): string => `${pkg}/${device}`;

  // 键里不含固定的前缀层数（glob 模式写法不同，`../` 个数会变），所以不锚定开头，
  // 只匹配「themes / 包 / 设备 / 页面」这一段。两种形态都收：
  //   • 基础版式：`themes/<包>/<设备>/<page>/index.vue`          —— 归入 base
  //   • 变体版式：`themes/<包>/<设备>/<page>/<变体>/index.vue`    —— 归入变体表
  const baseKeyRe = new RegExp(`(?:^|/)themes/([^/]+)/([^/]+)/${page}/index\\.vue$`);
  const variantKeyRe = new RegExp(`(?:^|/)themes/([^/]+)/([^/]+)/${page}/([^/]+)/index\\.vue$`);

  for (const [key, loader] of Object.entries(loaders)) {
    // 目录名不合规 / 设备名不认识 / 层级不对，都跳过而不是抛错：一个写坏的目录
    // 不该让整页起不来（与 @/theme 注册表同一策略）。
    const base = baseKeyRe.exec(key);
    if (base?.[1]) {
      const device = normalizeDevice(base[2]);
      if (VIEW_ID_RE.test(base[1]) && device === base[2]) {
        bases.set(scopeKey(base[1], device), loader);
        continue;
      }
    }
    const m = variantKeyRe.exec(key);
    const pkg = m?.[1];
    const device = m?.[2];
    const id = m?.[3];
    if (!pkg || !device || !id) continue;
    if (!VIEW_ID_RE.test(pkg) || !VIEW_ID_RE.test(id)) continue;
    if (normalizeDevice(device) !== device) continue;
    if (id === baseId) bases.set(scopeKey(pkg, device), loader);
    else variants.set(`${pkg}/${device}/${id}`, loader);
  }

  const variantIdsOf = (pkg: string, device: ThemeDevice): string[] =>
    [...variants.keys()]
      .filter(k => k.startsWith(`${pkg}/${device}/`))
      .map(k => k.slice(`${pkg}/${device}/`.length))
      .sort();

  const resolve = (raw: unknown, pkg: string, device: ThemeDevice): string | null => {
    if (typeof raw !== 'string') return null;
    const id = raw.trim().toLowerCase();
    if (!id || !VIEW_ID_RE.test(id)) return null;
    if (id === baseId) return baseId;
    // 跨包引用（2026-09-25 register 起）：id 与 pkg 不同时，id 也可能是目标包名。
    // 该目标包在当前设备有基础版式登记 → 把 id 视作目标包名，命中即返回。
    if (id !== pkg && bases.has(scopeKey(id, device))) return id;
    return variants.has(`${pkg}/${device}/${id}`) ? id : null;
  };

  return {
    baseId,
    builtinPackage,
    list: variantIdsOf,
    packages() {
      const scopes = new Set<string>();
      for (const k of bases.keys()) scopes.add(`${k}/${baseId}`);
      for (const k of variants.keys()) scopes.add(k);
      return [...scopes]
        .map(s => {
          const first = s.indexOf('/');
          const second = s.indexOf('/', first + 1);
          return { pkg: s.slice(0, first), device: s.slice(first + 1, second) as ThemeDevice };
        })
        .sort((a, b) => `${a.pkg}/${a.device}`.localeCompare(`${b.pkg}/${b.device}`))
        .map(({ pkg, device }) => ({ pkg, device, ids: [baseId, ...variantIdsOf(pkg, device)] }));
    },
    has: (raw, pkg, device) => resolve(raw, pkg, device) !== null,
    resolve,
    async load(id, pkg, device) {
      if (!id || !VIEW_ID_RE.test(pkg)) return null;
      // 内置包 + 基础设备 + 包名版式：容器已经静态引入，这里直接说"用它"，一个请求都不发
      // （新版式下 view ≡ pkg；'base' 不再是合法 view 名 —— 见文件头「主题包粒度的版式」）
      if (pkg === builtinPackage && device === DEFAULT_THEME_DEVICE && id === pkg) return null;
      // 跨包加载（2026-09-25 register 起）：id 是另一主题包的名字（≠ 当前 pkg）。
      // 把 id 当目标包名找该包的基础版式。
      if (id !== pkg) {
        const cross = bases.get(scopeKey(id, device));
        if (cross) {
          try {
            return (await cross()).default ?? null;
          } catch (err) {
            console.warn(`[view] 主题包「${id}」${device} 端版式加载失败，已回退`, err);
            return null;
          }
        }
      }
      // 该范围内连基础版式都没有 → 交回容器的静态兜底
      if (!bases.has(scopeKey(pkg, device)) && !variants.has(`${pkg}/${device}/${id}`)) return null;

      let target = id;
      if (!variants.has(`${pkg}/${device}/${target}`)) {
        // 该范围内没有这套变体 → 退到**同包同设备**的基础版式
        // （新版式下基础版式 id = 包名）
        target = pkg;
        if (pkg === builtinPackage && device === DEFAULT_THEME_DEVICE) return null;
      }

      // 新版式下「基础版式」总是落在 bases（路径形态：themes/<包>/<设备>/<页面>/index.vue，
      // 被 baseKeyRe 捕获并登记到 bases）。变体形态才会落到 variants —— 但新版式架构
      // （一个主题包 = 一种版式）下没有变体子目录，所以 variants 始终为空，旧 path 仍兼容
      // 旧机制（login 等页面）。这里 loader 优先看 variants（兼容旧机制），否则取 bases。
      const loader =
        variants.has(`${pkg}/${device}/${target}`)
          ? variants.get(`${pkg}/${device}/${target}`)
          : bases.get(scopeKey(pkg, device));
      if (!loader) return null;
      try {
        return (await loader()).default ?? null;
      } catch (err) {
        console.warn(
          `[view] 主题包「${pkg}」${device} 端的版式「${target}」加载失败，已回退`,
          err
        );
        return null;
      }
    }
  };
}
