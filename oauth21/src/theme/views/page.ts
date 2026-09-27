/**
 * 页面工厂 —— 「这一页接入可换 UI 机制」的**唯一写法**
 *
 * === 它收掉的是什么 ===
 * 三个页面文件（`views/{login,register,forgot-password}.ts`）原先各自抄了一遍同样的机制：
 * 声明 glob → `createViewRegistry` → `createViewPicker` → 两个转发函数
 * （`pick*ViewId` / `preload*View`），连注释都是复制过来的。三份的**契约类型**确实各不相同
 * （那是页面自己的事），但机制逐字相同 —— 改一条口径要改三处，漏一处就是"三页不同形"。
 *
 * 现在：机制只在本文件里写一次，页面文件退化成"一份契约 + 一次声明"。
 *
 * === 为什么 glob 还要写在页面文件里 ===
 * `import.meta.glob` 的入参**必须是字符串字面量**（Vite 在编译期静态分析它，不能是变量），
 * 所以「主题包目录通配 + 页面名 + `index.vue`」这个模式没法由工厂拼出来。于是模式随
 * `loaders` 一起从页面文件传进来 —— 这是框架约束，不是设计妥协。
 *
 * ⚠️ 描述 glob 模式时**不要写出「星号紧跟斜杠」的字符组合**：在块注释里它会提前闭合注释，
 *    症状是后面的正文被当成代码解析（本目录的 `registry.ts` 与 `theme/types.ts` 各踩过一次）。
 *    所以下面一律用「子目录通配」这样的措辞。
 *
 * === 页面名从哪来 ===
 * 页面名同时是：目录名（`themes/<包>/<设备>/<页面>/`）、`theme/views/<页面>.ts` 的文件名、
 * 路由 path 的末段。**三处必须字面一致**，工厂里的 `page` 是它的唯一声明处
 * （关卡会核文件名字段是否与它一致）。
 *
 * @author yijiu2025
 * @since 2026-09-27
 */
import type { ViewModuleMap, ViewRegistry } from './registry';
import { createViewRegistry } from './registry';
import { createViewPicker, type ViewPickerSource } from './picker';

/**
 * 页面对象的运行时标记（`Symbol.for` = 跨模块实例也同一个键）
 *
 * ⚠️ 用标记而不是"鸭子类型"识别页面对象：鸭子类型的判据**会悄悄落后于接口**
 *    （实锤：`ViewRegistry.list()` 删除后判据还留着它，导致页面汇总恒为空、
 *    调试面板的版式区永久不渲染，且零报错）。标记不会因为接口加成员而失效。
 */
const PAGE_BRAND = Symbol.for('mauth.themePage');

export interface ThemePageOptions {
  /** 页面名（目录名 / 文件名 / 路由末段三处一致） */
  page: string;
  /** 默认路由标题（`document.title` 用；设备专属标题在 `titles` 里覆盖） */
  title: string;
  /** 设备专属路由标题（key = 设备 id；缺省回落 `title`） */
  titles?: Partial<Record<string, string>>;
  /**
   * 部署级默认版式（`import.meta.env.VITE_<PAGE>_VIEW`）
   *
   * ⚠️ 必须在页面文件里读并传进来：`import.meta.env` 靠构建期静态替换，
   *    包进工厂内部拿不到这个能力（会被当成普通对象属性访问、恒为 undefined）。
   */
  envView?: unknown;
  /** `import.meta.glob` 的结果（模式必须是字面量，所以只能由页面文件提供） */
  loaders: ViewModuleMap;
}

/** 一个页面接入版式机制后的全部能力（页面文件的公开面就长这样） */
export interface ThemePage {
  /** 页面名 */
  readonly page: string;
  /** 默认路由标题 */
  readonly title: string;
  /** 取某设备的标题（缺省回落 `title`） */
  titleOf(device: string): string;
  /** 本页版式注册表（容器与面板都要用它取版式组件） */
  readonly views: ViewRegistry;
  /** 按优先级挑出版式 id（永远返回可用 id，最差是当前包名） */
  pick(source?: ViewPickerSource): string;
  /** 提前把版式 chunk 拉下来（路由守卫调用，不 await） */
  preload(source?: ViewPickerSource): void;
}

/**
 * 声明一个页面
 *
 * 用法（页面文件里就这么多）：
 * ```ts
 * export const loginPage = defineThemePage({
 *   page: 'login',
 *   title: '安全登录',
 *   titles: { mobile: '移动端登录', mini: '快捷登录' },
 *   envView: import.meta.env.VITE_LOGIN_VIEW,
 *   loaders: import.meta.glob<{ default: Component }>('（主题包目录通配）/login/index.vue')
 * });
 * ```
 */
export function defineThemePage(options: ThemePageOptions): ThemePage {
  const { page, title, titles, envView, loaders } = options;
  const views = createViewRegistry(loaders, { page });
  const picker = createViewPicker({ registry: views, envView });

  const result: ThemePage = {
    page,
    title,
    titleOf: (device: string) => titles?.[device] ?? title,
    views,
    pick: (source: ViewPickerSource = {}) => picker.pick(source),
    preload: (source: ViewPickerSource = {}) => picker.preload(source)
  };
  // 标记不可枚举：它只是个身份戳，不该出现在日志 / 序列化里
  Object.defineProperty(result, PAGE_BRAND, { value: true, enumerable: false });
  return result;
}

/** 这个值是不是 `defineThemePage` 的产物 */
export function isThemePage(value: unknown): value is ThemePage {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as Record<PropertyKey, unknown>)[PAGE_BRAND] === true
  );
}
