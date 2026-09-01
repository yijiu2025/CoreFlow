import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import BlankLayout from '@/layouts/BlankLayout.vue';
import { setupAuthGuard } from './guard';

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
      {
        path: 'login',
        name: 'login',
        component: () => import('@/view/web/login/index.vue'),
        meta: { title: '安全登录' }
      },
      {
        path: 'register',
        name: 'Register',
        component: () => import('@/view/web/register/index.vue'),
        meta: { title: '账户注册' }
      },
      {
        path: 'm/login',
        name: 'MobileLogin',
        component: () => import('@/view/app/login/index.vue'),
        meta: { title: '移动端登录', device: 'mobile' }
      },
      {
        path: 'm/register',
        name: 'MobileRegister',
        component: () => import('@/view/app/register/index.vue'),
        meta: { title: '移动端注册', device: 'mobile' }
      },
      {
        path: 'mini-login',
        name: 'MiniLogin',
        component: () => import('@/view/web/login/index.vue'),
        meta: { title: '快捷登录' }
      },
      {
        path: 'forgot-password',
        name: 'ForgotPassword',
        component: () => import('@/view/web/forgot-password/index.vue'),
        meta: { title: '忘记密码' }
      },
      {
        path: 'authorize',
        name: 'Authorize',
        component: () => import('@/view/web/auth/Authorize.vue'),
        meta: {
          title: '应用授权',
          guestOnly: false, // 需要登录才能访问
          requiresAuth: true
        }
      },
      // 404 catch-all：必须放 children 数组最末尾，未匹配的路径都进 NotFound
      {
        path: ':pathMatch(.*)*',
        name: 'NotFound',
        component: () => import('@/view/web/NotFound.vue'),
        meta: { title: '页面未找到' },
        beforeEnter: (to) => {
          // 上报 404，可用于发现死链/扫描探测行为
          console.warn('[404]', to.fullPath, document.referrer);
        }
      }
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
