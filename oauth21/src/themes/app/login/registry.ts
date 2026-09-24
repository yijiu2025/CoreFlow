/**
 * 登录页版式注册表 —— 谁来决定"用哪套 UI"
 *
 * === 选择优先级（高 → 低）===
 *   1. URL `?view=<id>`        —— 本次访问的显式意图（联调 / 灰度 / 单页预览都用它）
 *   2. 主题包声明               —— `themes/<id>/index.ts` 的 `views.login`
 *                                 （皮肤与版式成对下发，如 sky 配一套轻版式）
 *   3. `VITE_LOGIN_VIEW`       —— 部署级默认（整站换 UI，不动代码）
 *   4. `base`                  —— 基础版式（缺省）
 *
 * ⚠️ 第 1 档里**非法值不回退**：`?view=typo` 直接落基础版式，而不是被第 2/3 档接管。
 * 显式参数写错时静默换用另一套 UI，比看到默认版式更难排查。
 *
 * ⚠️ 变体是**惰性加载**的（`import.meta.glob` → 独立 chunk），基础版式由容器静态引入。
 * 新增变体目录后要**重启 dev server**（glob 在启动时静态扫描，热更新发现不了新目录）。
 *
 * 与注册页 `themes/app/register/registry.ts` 是同一个机制的两份实例：
 * 各页独立、互不感知，加页面不必改公共工厂（见 `../app/registry.ts` 的说明）。
 *
 * @author yijiu2025
 * @since 2026-09-24
 */
import type { Component } from 'vue';
import { createViewRegistry } from '../registry';

/** 变体目录（排除 base：它是默认路径，由容器同步引入，不进惰性表） */
const variantLoaders = import.meta.glob<{ default: Component }>(['./*/index.vue', '!./base/index.vue']);

/** 本页版式注册表 */
export const loginViews = createViewRegistry(variantLoaders);

/** 部署级默认版式（构建期注入；未配置为 undefined） */
const ENV_VIEW: unknown = import.meta.env.VITE_LOGIN_VIEW;

/** 只把"非空字符串"当作有效外部输入 */
function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * 按优先级挑出版式 id（永远返回可用 id：最差也是 `loginViews.baseId`）
 *
 * @param source.url   `?view=` 的原始值（未校验，可以是数组/undefined 等任意形态）
 * @param source.theme 主题包声明的版式 id（见 `themes/<id>/index.ts` 的 `views.login`）
 */
export function pickLoginViewId(source: { url?: unknown; theme?: unknown } = {}): string {
  const url = asText(source.url);
  if (url) return loginViews.resolve(url) ?? loginViews.baseId;

  const env = asText(ENV_VIEW);
  return loginViews.resolve(source.theme) ?? (env ? loginViews.resolve(env) : null) ?? loginViews.baseId;
}

/**
 * 提前把变体 chunk 拉下来（路由器守卫里调用，**不 await**）
 *
 * 变体是动态 import，容器首帧只能先渲染基础版式、等 chunk 到了再接管。
 * 在导航阶段就把请求发出去（与路由组件自身的 chunk 并行），绝大多数情况下
 * 容器挂载时已在模块缓存里 → 第二次赋值发生在同一 tick 内，用户看不到切换。
 */
export function preloadLoginView(source: { url?: unknown; theme?: unknown } = {}): void {
  const id = pickLoginViewId(source);
  if (id === loginViews.baseId) return;
  void loginViews.load(id);
}
