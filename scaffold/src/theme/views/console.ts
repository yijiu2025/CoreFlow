/**
 * 后台壳页面域声明（page: console）
 *
 * 与 oauth21 的 `views/login.ts` 同一机制：`defineThemePage({ page })` 一次声明，
 * 即把本页注册进页面域（`<ThemeView>` / `<ThemeScope>` 的 `page` 依赖）。
 *
 * === 为什么本页没有「版式契约」类型 ===
 * oauth21 的登录页要按设备换一整套 DOM（web 卡片 / mobile 全屏 / iframe 紧凑），
 * 所以 `views/login.ts` 里写了几百行 `ctx` 契约。console 只有**一套版式**
 * （侧栏 + 顶栏 + 内容区），页面之间换的是业务内容而不是 DOM 结构 ——
 * 因此壳层用 `<ThemeScope page="console" device>` 只取 token，
 * 不需要版式组件，也就没有可契约化的 ctx。
 *
 * 🔴 将来真要「同一壳换一套 DOM」（例如另做一版横向导航），正确做法是新建主题包
 *    并在包定义里声明 `views.console`，**不要**在 AppShell 里写 `if (pkg === ...)`。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { defineThemePage } from 'skinsuite/vue';

defineThemePage({ page: 'console' });
