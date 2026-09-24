import { createRouter, createWebHistory, type RouteRecordRaw, type Router } from 'vue-router';
import { watch } from 'vue';
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

/**
 * 把「当前路由属于哪种设备」同步给主题 store
 *
 * 判定依据是**路由元信息**而不是视口：`/m/*` 上的 `meta.device` 明确写着 `'mobile'`，
 * 其余路由按电脑端处理。用视口判会出现"分发器把 `/login` 渲染成移动端组件、
 * 但路由说它是电脑端"的分裂 —— 展示哪种形态是分发器的决定，路由只负责回答
 * "这条 URL 是哪一端"，后者才是主题要的答案。
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
    () => router.currentRoute.value,
    route => {
      themeStore.setActiveDevice(route.meta.device === 'mobile' ? 'mobile' : 'web');
    },
    { immediate: true }
  );
}

export default router;
