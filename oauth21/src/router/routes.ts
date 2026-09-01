import type { RouteRecordRaw } from 'vue-router';

export const authRoutes: RouteRecordRaw[] = [
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
    path: 'forgot-password',
    name: 'ForgotPassword',
    component: () => import('@/view/web/forgot-password/index.vue'),
    meta: { title: '忘记密码' }
  },
  {
    path: 'mini-login',
    name: 'MiniLogin',
    component: () => import('@/view/web/login/index.vue'),
    meta: { title: '快捷登录' }
  }
];

export const mobileRoutes: RouteRecordRaw[] = [
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
  }
];

export const authFlowRoutes: RouteRecordRaw[] = [
  {
    path: 'authorize',
    name: 'Authorize',
    component: () => import('@/view/web/auth/Authorize.vue'),
    meta: {
      title: '应用授权',
      guestOnly: false, // 需要登录才能访问
      requiresAuth: true
    }
  }
];

export const errorRoutes: RouteRecordRaw[] = [
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
];