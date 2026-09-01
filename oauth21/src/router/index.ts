import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import BlankLayout from '@/layouts/BlankLayout.vue';
import { setupAuthGuard } from './guard';
import { authRoutes, mobileRoutes, authFlowRoutes, errorRoutes } from './routes';

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

router.afterEach((to, failure) => {
  if (!failure && to.meta.title) {
    document.title = `${to.meta.title} | Enterprise SSO`;
  }
});

export default router;
