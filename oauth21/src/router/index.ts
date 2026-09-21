import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import BlankLayout from '@/layouts/BlankLayout.vue';
import { setupAuthGuard } from './guard';
import {
  authRoutes,
  mobileRoutes,
  authFlowRoutes,
  errorRoutes,
  resolveDesktopRedirectTarget
} from './routes';
import { DESKTOP_MIN_WIDTH } from '@/utils/device';

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
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;          // 浏览器前进/后退
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    return { top: 0 };                                 // 新导航回顶部
  }
});

// 设置路由守卫
setupAuthGuard(router);

/**
 * 视口跨进"够用电脑版"的宽度时，把当前停留的移动端路由迁到电脑版
 *
 * 为什么必须单独做一次：路由守卫**只在导航时执行一次**。
 * 用户已经打开 `/m/login` 再手动拉宽窗口（或手机转横屏、折叠屏展开、桌面浏览器
 * 从窄拉到宽）时，并没有发生任何导航，`beforeEnter` 不会被重新调用 ——
 * 实测 375px 进 `/m/login` 后拉到 1200px，页面仍是移动端版式且满宽拉伸。
 *
 * 判定复用 `resolveDesktopRedirectTarget`（与 beforeEnter 同一份规则），
 * 因此显式 `?isMobile=true`、非移动端路由等情况在这里同样被排除，行为完全一致。
 *
 * 刻意只做"移动端 → 电脑版"单向：反向（窄视口把 `/login` 改写成 `/m/login`）
 * 会改变现有 URL 语义（桌面分发器本就能在窄屏渲染移动端组件），
 * 且两边都监听容易来回跳，故不做。
 */
function redirectMobileRouteOnWideViewport(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

  const desktopMq = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);
  const handleChange = () => {
    // 只在"跨进宽视口"的那一刻动作；离开宽视口不做任何事
    if (!desktopMq.matches) return;

    const current = router.currentRoute.value;
    const target = resolveDesktopRedirectTarget(current);
    if (!target) return;

    // query / hash 原样带过去，否则登录页拿不到 client_id 等授权上下文
    void router
      .replace({ name: target, query: current.query, hash: current.hash })
      .catch(() => {
        /* 导航被取消（如用户同时点了别的链接）时无需处理 */
      });
  };

  if (typeof desktopMq.addEventListener === 'function') {
    desktopMq.addEventListener('change', handleChange);
  } else {
    // Safari < 14 旧 API 兜底
    (desktopMq as unknown as { addListener: (cb: () => void) => void }).addListener(handleChange);
  }
}

redirectMobileRouteOnWideViewport();

router.afterEach((to, failure) => {
  if (!failure && to.meta.title) {
    document.title = `${to.meta.title} | Enterprise SSO`;
  }
});

export default router;
