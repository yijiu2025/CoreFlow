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
 * theme/themes/<包>/<设备>/<page>/      主题包内：某设备下的版式实现
 * └── index.vue                        该包在该设备该页的**唯一**版式
 * ```
 * 🔴 **一个主题包 = 一种版式**（2026-09-26 定案，用户：「变体版式使用新包」）：
 *    `<page>/` 下**没有**版式层目录，所以「换一套版式」= 「换一个包」。
 *    跨包引用靠 `resolve` 的「把 id 当目标包名」那条分支（`?view=compact` 即切包）。
 *    曾支持过的 `<page>/<变体>/index.vue` 形态**已删除**（守卫：
 *    `.tmp-probe/verify-theme-dirs.mjs`）—— 它要求换版式时复制整套配色与业务契约，
 *    两套必然漂移。
 *
 * ⚠️ 描述 glob 模式时别写出「星号紧跟斜杠」的字符组合：它会**提前闭合块注释**。
 * 用「子目录通配 + 文件名」这样的措辞绕开。
 *
 * === 为什么内置包的版式不进惰性表 ===
 * 内置包（`DEFAULT_THEME_PACKAGE`）的版式是绝大多数访问的默认路径，让它在关键路径上
 * 多等一个网络往返不划算 —— 每个容器**静态 import 自己设备的那一份**
 * （`view/app/<page>/` 引 mobile、`Standard*` 引 standard、`Mini*` 引 mini）。
 * 本表对「内置包」直接返回 null，表示"用你静态引入的那份"。
 * 非内置包只能惰性加载（包是运行时才定的，静态 import 钉不住），
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
  /** 该包该设备可选的版式 id —— **恒为 `[包名]`**（一个主题包 = 一种版式） */
  ids: string[];
}

export interface ViewRegistry {
  /**
   * 「基础版式」的历史逻辑 id（默认 `'base'`）
   *
   * ⚠️ 它**不是**合法的版式返回值，也不是配色注册表里的 view 值：一个主题包 = 一种
   *    版式，所以某包在某设备下的版式 id 就是**包名**。保留它只为让 `resolve` 认得
   *    `?view=base` 这个别名（归一到当前包名），别拿它当"默认版式"用。
   */
  readonly baseId: string;
  /** 内置包 id（它的版式由容器静态引入，不走惰性加载） */
  readonly builtinPackage: string;
  /** 所有包 × 设备在该页的版式总览（供调试面板按"包 + 设备"展示） */
  packages(): PackageViews[];
  /** 外部输入在**指定包、指定设备内**是否解析得出可用版式 */
  has(raw: unknown, pkg: string, device: ThemeDevice): boolean;
  /**
   * 解析外部输入 → 可用 id（**查找范围是 `pkg` 包 × `device` 设备**）
   *
   * 返回值只有两种：**当前包名**（用它自己的版式）或**另一个包名**（跨包切版式），
   * 也就是「版式 id ≡ 包名」。返回 null 表示「非法 / 该范围内未登记 / 非字符串」
   * —— 调用方应回退当前包。`base` 作为别名会归一到当前包名。
   */
  resolve(raw: unknown, pkg: string, device: ThemeDevice): string | null;
  /**
   * 加载版式组件
   *
   * 返回 null 表示"**用容器静态引入的那份**"：内置包（容器必然静态引了它自己设备
   * 的那份），或该范围内确实什么都没有。非内置包 + 该设备有登记时才真的动态 import。
   * 加载失败**不抛错**：少一套 UI 不该让整页打不开，返回 null 即可。
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

  /** 各包各设备在该页的版式：`包/设备` → 加载器（一个包一种版式，所以只有一层） */
  const bases = new Map<string, () => Promise<{ default: Component }>>();

  /** 二段键：把「包 + 设备」拼成一个 Map 键，避免嵌套 Map 的取值样板代码 */
  const scopeKey = (pkg: string, device: ThemeDevice): string => `${pkg}/${device}`;

  // 只收**一种**形态（见文件头「目录与 naming」）：
  //   `themes/<包>/<设备>/<page>/index.vue`
  // 键里不含固定的前缀层数（glob 模式写法不同，`../` 个数会变），所以不锚定开头，
  // 只匹配「themes / 包 / 设备 / 页面」这一段。
  const baseKeyRe = new RegExp(`(?:^|/)themes/([^/]+)/([^/]+)/${page}/index\\.vue$`);

  for (const [key, loader] of Object.entries(loaders)) {
    // 目录名不合规 / 设备名不认识 / 层级不对，都跳过而不是抛错：一个写坏的目录
    // 不该让整页起不来（与 @/theme 注册表同一策略）。
    const m = baseKeyRe.exec(key);
    const pkg = m?.[1];
    const device = m?.[2];
    if (!pkg || !device) continue;
    if (!VIEW_ID_RE.test(pkg)) continue;
    if (normalizeDevice(device) !== device) continue;
    bases.set(scopeKey(pkg, device), loader);
  }

  const resolve = (raw: unknown, pkg: string, device: ThemeDevice): string | null => {
    if (typeof raw !== 'string') return null;
    const id = raw.trim().toLowerCase();
    if (!id || !VIEW_ID_RE.test(id)) return null;
    // `base` 是「当前包的基础版式」的历史别名 —— 一个主题包 = 一种版式，所以它**就是
    // 包名**。归一到 pkg，绝不能把 'base' 当合法 id 返回下去：配色注册表里的 view 段
    // 恒等于包名，传 'base' 会让配色键全链落空 → tokens 静默丢失、只剩余 SCSS 基线。
    if (id === baseId) return pkg;
    // 跨包引用：id 与 pkg 不同时，id 也可能是**目标包名**（`?view=compact` = 切到
    // compact 包）。该目标包在当前设备登记了版式 → 命中即返回。
    if (bases.has(scopeKey(id, device))) return id;
    // 当前包自己的名字（`?view=<当前包>`）：等价于"用当前包"，也不算非法
    if (id === pkg && bases.has(scopeKey(pkg, device))) return pkg;
    return null;
  };

  return {
    baseId,
    builtinPackage,
    packages() {
      return [...bases.keys()]
        .map(k => {
          const cut = k.indexOf('/');
          return { pkg: k.slice(0, cut), device: k.slice(cut + 1) as ThemeDevice };
        })
        .sort((a, b) => `${a.pkg}/${a.device}`.localeCompare(`${b.pkg}/${b.device}`))
        // 一个主题包 = 一种版式 ⇒ 该包该设备可选的版式 id 就是包名本身
        .map(({ pkg, device }) => ({ pkg, device, ids: [pkg] }));
    },
    has: (raw, pkg, device) => resolve(raw, pkg, device) !== null,
    resolve,
    async load(id, pkg, device) {
      if (!id || !VIEW_ID_RE.test(pkg)) return null;
      // 目标包：id 不是当前包名时（`?view=<其它包>` 的跨包形态）以该包为目标，
      // 否则就是当前包自己的版式（`view ≡ pkg`）。
      const target = id !== pkg && bases.has(scopeKey(id, device)) ? id : pkg;
      // 🔴 内置包 = **容器静态引入**的那份（每个容器 import 自己设备的那一份版式）
      //    → 在这里直接说"用它"，一个请求都不发。
      //    非内置包才真惰性加载：包是运行时才定的，静态 import 钉不住，
      //    由路由守卫（`router/routes.ts` 的 withViewPreload）提前预热。
      if (target === builtinPackage) return null;
      const loader = bases.get(scopeKey(target, device));
      // 该范围内没有登记版式 → 交回容器的静态兜底（少一套 UI 不该让整页打不开）
      if (!loader) return null;
      try {
        return (await loader()).default ?? null;
      } catch (err) {
        console.warn(
          `[view] 主题包「${target}」${device} 端的版式加载失败，已回退`,
          err
        );
        return null;
      }
    }
  };
}
