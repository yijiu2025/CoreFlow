/**
 * 404 页面域声明（page: not-found）+ 「版式契约」
 *
 * 与 oauth21 的 `views/login.ts` 同一机制：`defineThemePage({ page })` 一次声明，
 * 即把本页注册进页面域（`<ThemeView>` 的 `page` 依赖）。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { defineThemePage } from 'skinsuite/vue';

/** 404 版式上下文（版式只读它） */
export interface NotFoundViewContext {
  /** 回工作台 */
  goDashboard: () => void;
}

/** 页面域声明（`<ThemeView page="not-found">` 依赖它） */
defineThemePage({ page: 'not-found' });
