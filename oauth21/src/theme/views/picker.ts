/**
 * 版式选择器工厂 —— 「这次访问用哪套版式」的**唯一实现**
 *
 * === 为什么要有它 ===
 * login / register / forgot-password 三页各有一份页面文件（契约 + 注册表），但
 * "从外部输入挑出一个版式 id"这件事**与页面无关** —— 三页的取值链、回退口径、
 * 非法值规则逐字相同。之前是三份逐字重复的实现（连 `asText` / `asPackage` /
 * `asDevice` 都各抄一份），改一条口径要改三处，漏一处就是"三页不同形"。
 * 收口后：**链只有一份，各页只声明自己的页面名与环境变量**。
 *
 * === 选择优先级（高 → 低，三页同形）===
 *   1. URL `?view=<id>`        —— 本次访问的显式意图
 *   2. 主题包 / 配色记录的声明   —— `views.<page>`（由 store 的 `viewFor(page)` 取出）
 *   3. `VITE_<PAGE>_VIEW`      —— 部署级默认（整站换 UI，不动代码）
 *   4. 当前**包名**             —— 一个主题包 = 一种版式 ⇒ 版式 id ≡ 包名
 *
 * 🔴 **第 1 档命中后不再回退到 2/3 档**：`?view=typo` 落到**当前包**，而不是被声明或
 *    环境变量接管。显式参数写错时静默换用另一套 UI，比看到当前包的版式难排查得多。
 * 🔴 **非法值一律落当前包名，绝不落 `'base'`**：配色注册表里的 view 段恒等于包名，
 *    把 `'base'` 传下去会让配色键全链落空 → **tokens 静默全丢、只剩余 SCSS 基线**
 *    （症状是"页面配色无声变回基线"，没有任何报错）。
 * 🔴 `?view.<设备>` 这一档在**进入本工厂之前**就已解决（容器用
 *    `readDeviceParam(route.query, 'view', THEME_DEVICE)` 取值）—— 本工厂拿到的是
 *    "这台设备最终该用哪个原始值"，所以它自己不需要、也拿不到设备名。
 *
 * === 设备名是外部输入 ===
 * `source.device` 来自调用方（容器常量或路由守卫），仍然过**白名单**（复用
 * `params.ts` 的 `asThemeDevice`），不认识的值落默认设备 —— 判断口径只此一处。
 *
 * @author yijiu2025
 * @since 2026-09-26
 */
import { DEFAULT_THEME_DEVICE, type ThemeDevice } from '../index';
import { asThemeDevice } from './params';
import type { ViewRegistry } from './registry';

/** 选择器的输入：四个都是外部值，全部未校验 */
export interface ViewPickerSource {
  /** `?view=`（设备维度解析**之后**）的原始值，可以是数组 / undefined 等任意形态 */
  url?: unknown;
  /** 当前配色记录声明的版式 id（`store.viewFor(page)` 取出），未声明时为 undefined */
  theme?: unknown;
  /** 当前主题包 id —— 查找范围的包那一段 */
  pkg?: unknown;
  /** 当前设备（`'mobile' | 'standard' | 'mini'`）—— 查找范围的设备那一段 */
  device?: unknown;
}

export interface ViewPicker {
  /** 挑出版式 id —— **永远返回可用 id**，最差是当前包名 */
  pick(source?: ViewPickerSource): string;
  /** 提前把版式 chunk 拉下来（**不 await**）；零请求组合直接短路 */
  preload(source?: ViewPickerSource): void;
}

export interface ViewPickerOptions {
  /** 本页的版式注册表 */
  registry: ViewRegistry;
  /** 部署级默认版式（`import.meta.env.VITE_<PAGE>_VIEW`），未配置时为 undefined */
  envView?: unknown;
}

/** 只把"非空字符串"当作有效外部输入（空串 / 非字符串都算"没给"） */
function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function createViewPicker(options: ViewPickerOptions): ViewPicker {
  const { registry, envView } = options;

  /** 取当前主题包；未传则落内置包（与 `@/theme` 的回退口径一致） */
  function asPackage(value: unknown): string {
    return asText(value) ?? registry.builtinPackage;
  }

  /** 取当前设备；未传 / 不认识都落默认设备（白名单只此一处） */
  function asDevice(value: unknown): ThemeDevice {
    return asThemeDevice(value) ?? DEFAULT_THEME_DEVICE;
  }

  function pick(source: ViewPickerSource = {}): string {
    const pkg = asPackage(source.pkg);
    const device = asDevice(source.device);
    const url = asText(source.url);
    // 第 1 档：URL 显式意图 —— 非法值也**不回退**到下面的档（见文件头 🔴）
    if (url) return registry.resolve(url, pkg, device) ?? pkg;

    // 第 2/3 档 → 第 4 档：声明 → 部署级默认 → 当前包
    const env = asText(envView);
    return (
      registry.resolve(source.theme, pkg, device) ??
      (env ? registry.resolve(env, pkg, device) : null) ??
      pkg
    );
  }

  function preload(source: ViewPickerSource = {}): void {
    const pkg = asPackage(source.pkg);
    const device = asDevice(source.device);
    // ⚠️ 必须把 source 原样交给 pick：漏掉 `theme`（声明档）会让预取算出一个
    //    与容器**不同**的 id —— 白拉一个用不上的 chunk，而真正要用的那个仍得现场等。
    const id = pick(source);
    // 内置包的版式由容器静态引入 → 零请求，不必预热（`load()` 对内包也返回 null）
    if (id === pkg && pkg === registry.builtinPackage) return;
    void registry.load(id, pkg, device);
  }

  return { pick, preload };
}
