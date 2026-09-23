/**
 * 版式（view）注册表工厂 —— 「业务容器 + 可换 UI」的通用机制
 *
 * === 这一层解决什么 ===
 * 页面拆成两半：
 *   • **业务容器**（如 `view/app/register/index.vue`）—— 状态、校验、请求、路由跳转，
 *     以及所有「点了会发生什么」。**只此一份**，任何版式都不复制它。
 *   • **版式（UI）**（如 `themes/app/register/base/index.vue`）—— 只负责「长什么样」，
 *     通过 props 拿到容器给的 `ctx`（状态 + 操作函数）来渲染与回调。
 * 于是「换一套 UI」= 加一个目录，不用碰业务代码，也不会出现两份校验逻辑各自漂移。
 *
 * === 目录与 naming ===
 * ```
 * themes/app/<page>/            <page> 与路由/页面同名，如 register
 * ├── registry.ts               该页的注册表（调本文件工厂）
 * ├── types.ts                  该页的版式契约（纯类型）
 * ├── base/index.vue            **基础版式**（缺省用；被容器同步引入，保证首屏零请求）
 * └── <variant>/index.vue       特殊版式（惰性加载，切成独立 chunk）
 * ```
 *
 * === 为什么 base 不进这张表 ===
 * 基础版式是绝大多数访问的默认路径，让它在关键路径上多等一个网络往返不划算，
 * 所以由容器**静态引入**（`import Base from './base/index.vue'`）；本表只装"变体"，
 * 用 `import.meta.glob` 惰性加载。这样默认路径零额外请求，变体才真正按需切 chunk。
 *
 * === 安全边界 ===
 * 版式 id 来自 URL / 主题包 / 环境变量，都属**外部输入**：这里只做「已登记」白名单匹配
 * （id 限 `[a-z0-9-]`），不做模糊匹配、不拼路径 —— 未登记一律返回 null，
 * 由调用方回退基础版式。这与 `@/themes` 主题 id 的校验口径一致。
 *
 * @author yijiu2025
 * @since 2026-09-23
 */
import type { Component } from 'vue';

/** 基础版式的目录名（约定值，各页一致） */
export const BASE_VIEW_ID = 'base';

/** 版式 id 白名单：与主题 id 同规则（它会出现在 data-* 与日志里） */
const VIEW_ID_RE = /^[a-z0-9-]+$/;

/** `import.meta.glob` 的结果形态：路径 → 惰性加载器 */
export type ViewModuleMap = Record<string, () => Promise<{ default: Component }>>;

export interface ViewRegistry {
  /** 基础版式 id（调用方用它判断"要不要去加载变体"） */
  readonly baseId: string;
  /** 已登记的变体 id（不含基础版式），已排序；供调试面板 / 后台列出版式用 */
  list(): string[];
  /** 外部输入是否解析得出可用版式 */
  has(raw: unknown): boolean;
  /**
   * 解析外部输入 → 可用 id
   * 返回 `baseId` 表示显式指定了基础版式；返回 null 表示「非法 / 未登记 / 非字符串」
   * —— 两种情况调用方都该用基础版式渲染，区别只在显式指定时**不再往下回退**
   * （否则 `?view=base` 会被主题包声明的变体顶掉，显式意图失效）。
   */
  resolve(raw: unknown): string | null;
  /**
   * 加载变体组件；基础版式与未登记 id 返回 null（调用方用同步引入的基础版式兜底）。
   * 加载失败**不抛错**：少一套 UI 不该让整页打不开，返回 null 即可。
   */
  load(id: string | null): Promise<Component | null>;
}

/**
 * @param loaders `import.meta.glob` 的结果（键形如 `./compact/index.vue`）
 * @param options.baseId 基础版式目录名，默认 `base`；base 目录会被排除出变体表
 */
export function createViewRegistry(loaders: ViewModuleMap, options: { baseId?: string } = {}): ViewRegistry {
  const baseId = options.baseId ?? BASE_VIEW_ID;
  const variants = new Map<string, () => Promise<{ default: Component }>>();

  for (const [key, loader] of Object.entries(loaders)) {
    const m = /^\.\/([^/]+)\/index\.vue$/.exec(key);
    const id = m?.[1];
    // 目录名不合规 / 就是 base / 层级不对，都跳过而不是抛错：一个写坏的目录
    // 不该让整页起不来（与 @/themes 注册表同一策略）。
    if (!id || id === baseId || !VIEW_ID_RE.test(id)) continue;
    variants.set(id, loader);
  }

  const resolve = (raw: unknown): string | null => {
    if (typeof raw !== 'string') return null;
    const id = raw.trim().toLowerCase();
    if (!id || !VIEW_ID_RE.test(id)) return null;
    if (id === baseId) return baseId;
    return variants.has(id) ? id : null;
  };

  return {
    baseId,
    list: () => [...variants.keys()].sort(),
    has: raw => resolve(raw) !== null,
    resolve,
    async load(id) {
      if (!id || id === baseId) return null;
      const loader = variants.get(id);
      if (!loader) return null;
      try {
        return (await loader()).default ?? null;
      } catch (err) {
        console.warn(`[view] 版式「${id}」加载失败，已回退基础版式`, err);
        return null;
      }
    }
  };
}
