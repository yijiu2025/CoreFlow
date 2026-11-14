/**
 * 后台准入被拒页面域声明（page: access-denied）+ 「版式契约」
 *
 * 与 oauth21 的 `views/login.ts` 同一机制：`defineThemePage({ page })` 一次声明，
 * 即把本页注册进页面域（`<ThemeView>` 的 `page` 依赖）。
 *
 * 本页的 token 仍借用登录页那套（版式里 `<ThemeScope page="login">`）：它本来就住在
 * 应用外壳之外，没有侧栏也有没后台的配色记录 —— 用登录页的视觉语言，"被挡在门外"这件事
 * 才和前面那一屏连贯。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import type { Ref } from 'vue';
import { defineThemePage } from 'skinsuite/vue';

/** 准入被拒版式上下文（版式只读它） */
export interface AccessDeniedViewContext {
  /** 当前渲染设备（版式内 `ThemeScope` 取 token 用） */
  device: Ref<string>;
  /** 后端给的说明（空串时版式用默认文案） */
  message: string;
  /** 退出并换账号 */
  switchAccount: () => Promise<void>;
}

/** 页面域声明（`<ThemeView page="access-denied">` 依赖它） */
defineThemePage({ page: 'access-denied' });
