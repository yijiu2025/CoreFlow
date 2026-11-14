/**
 * 用户详情页页面域声明（page: user-detail）+ 「版式契约」
 *
 * 与 oauth21 的 `views/login.ts` 同一机制：`defineThemePage({ page })` 一次声明，
 * 即把本页注册进页面域（`<ThemeView>` 的 `page` 依赖）。
 *
 * 本页只有一件事：把路由参数变成 `userId`，剩下全交给详情组件（与桌面端抽屉同一份实现）。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import type { Ref } from 'vue';
import { defineThemePage } from 'skinsuite/vue';

/** 用户详情版式上下文（版式只读它） */
export interface UserDetailViewContext {
  /** 用户 id（路由参数非法时为 null，版式走「编号无效」分支） */
  userId: Ref<number | null>;
}

/** 页面域声明（`<ThemeView page="user-detail">` 依赖它） */
defineThemePage({ page: 'user-detail' });
