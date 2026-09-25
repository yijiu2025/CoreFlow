import { createRouter, createWebHistory, type RouteRecordRaw, type Router } from 'vue-router';
import { watch } from 'vue';
import BlankLayout from '@/layouts/BlankLayout.vue';
import { setupAuthGuard } from './guard';
import { authRoutes, mobileRoutes, authFlowRoutes, errorRoutes } from './routes';
import { useThemeStore } from '@/stores/theme';

// 扩展 RouteMeta 类型
declare module 'vue-router' {
  interface RouteMeta {
    /** 页面标题（必填） */
    title: string;
    /** 是否需要登录，默认 false */
    requiresAuth?: boolean;
    /** 仅限已认证用户（如 authorize），未登录跳转 */
    guestOnly?: boolean;
    /** 缓存组件名，配合 <keep-alive include> */
    keepAlive?: string;
    /** 设备端标识 */
    device?: 'mobile' | 'desktop' | 'all';
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: { name: 'login' }
  },
  {
    path: '/',
    component: BlankLayout,
    children: [
      ...authRoutes,
      ...mobileRoutes,
      ...authFlowRoutes,
      ...errorRoutes
    ]
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition;          // 浏览器前进/后退
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    return { top: 0 };                                 // 新导航回顶部
  }
});

// 设置路由守卫
setupAuthGuard(router);

router.afterEach((to, failure) => {
  if (!failure && to.meta.title) {
    document.title = `${to.meta.title} | Enterprise SSO`;
  }
});

/**
 * 把「当前路由属于哪种设备」同步给主题 store —— 这是**基线**，不是终值
 *
 * 判定依据是**路由元信息**：`/m/*` 上的 `meta.device` 写着 `'mobile'`，其余按电脑端。
 *
 * 🔴 基线会被桌面分发器**按实际渲染的形态纠正**（2026-09-25 用户定夺：
 *    「主题应该跟随 vue，而不是路由」）：`view/web/<page>/index.vue` 各自 watch
 *    渲染形态并调用 `setActiveDevice` —— `/login` 窄视口渲染手机端容器时，
 *    主题作用域必须是 mobile。路由侧保留这条同步的意义：
 *   • 首屏分发器挂载前的空窗（切路由瞬间）有一个确定的基线值；
 *   • 非 `/m/*` 且非三页分发器的路由（如 authorize / consent / 404）没有分发器纠正，
 *     设备身份就由路由 meta 给定。
 *
 * === 关键：只听 meta.device 变化，不听整个路由对象 ===
 * 早期实现 watch `router.currentRoute.value` 整个对象 —— 任何 query / hash 变化
 * 都会触发 `setActiveDevice`（`/register` 没设 `meta.device='mobile'` → 误判成 web）。
 * 视觉上窄视口切个 `?view=` 时视图没换、设备却被刷成 web，随后**不再纠正回来**
 * （mobile 容器的 watch 不会重跑 —— `renderedDevice` 由视口派生、没变化），
 * 表现为"切换版式后版式只剩 1 个 / 蓝青色卡切换无效"。
 * 现在 watch 的是「meta.device 解析出来的取值」（'mobile' / 'standard'），只在真实跨
 * 设备路由（`/login` ↔ `/m/login`）时触发；同路由 query / hash 变化跳过。
 *
 * === 为什么是"在 app setup 里 watch 路由"，而不是写在 afterEach 里 ===
 * 早先的实现把 `setActiveDevice` 放在 `router.afterEach` 里，结果是**首次导航静默失效**：
 * `main.ts` 的顺序是 `app.use(pinia)` → `app.use(router)`，而**首次导航由
 * `app.use(router)` 触发**、且 `afterEach` 是在导航流程结束处同步调用的 ——
 * 那一刻 Pinia 的 activeInstance 还没建立（或正在建立），`useThemeStore()` 抛错，
 * 被 `try/catch` 吞掉 → 设备永远停在默认的 `'mobile'`。
 * 症状是"电脑端页面上，面板/注入全部按手机端走"，且**没有任何报错**。
 *
 * 改成 `watch(router.currentRoute)` 后：
 *   • **首次**导航也覆盖得到 —— watch 带 `immediate`，在 app setup 时读一次当前路由；
 *   • 后续每一次导航（含重定向、replace）都由路由对象自身的变化驱动，不必依赖钩子时序；
 *   • 不依赖"调用时 Pinia 已就绪"这个脆弱前提（此时 app 已 use(pinia) 且 store 已实例化）。
 *
 * @param router 应用路由实例（调用方保证已 `use(pinia)`）
 */
export function setupThemeDeviceSync(router: Router): void {
  const themeStore = useThemeStore();
  watch(
    () => (router.currentRoute.value.meta.device === 'mobile' ? 'mobile' : 'standard'),
    device => {
      themeStore.setActiveDevice(device);
    },
    { immediate: true }
  );
}

export default router;
