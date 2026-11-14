/**
 * 无访问权限页面域声明（page: no-access）+ 「版式契约」
 *
 * 与 oauth21 的 `views/login.ts` 同一机制：`defineThemePage({ page })` 一次声明，
 * 即把本页注册进页面域（`<ThemeView>` 的 `page` 依赖）。
 *
 * 与 `access-denied` 分工：本页是**已进后台、只差某个权限码**（挂在 AppShell 里、侧栏还在）；
 * `access-denied` 是连后台都进不去（`/session/me` 403，没有侧栏）。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { defineThemePage } from 'skinsuite/vue';

/** 无权限页版式上下文（版式只读它） */
export interface NoAccessViewContext {
  /** 回工作台 */
  goDashboard: () => void;
}

/** 页面域声明（`<ThemeView page="no-access">` 依赖它） */
defineThemePage({ page: 'no-access' });
