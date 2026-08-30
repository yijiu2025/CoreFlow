import { createRouter, createWebHistory } from 'vue-router';
import BlankLayout from '@/layouts/BlankLayout.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: BlankLayout,
      children: [
        {
          path: '',
          name: 'Login',
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
          meta: { title: '移动端登录' }
        },
        {
          path: 'm/register',
          name: 'MobileRegister',
          component: () => import('@/view/app/register/index.vue'),
          meta: { title: '移动端注册' }
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
          meta: { title: '应用授权' }
        }
      ]
    }
  ]
});

/**
 * 路由守卫
 *
 * 当前 oauth21 所有路由都是公开的（SSO 登录/注册中心），未登录来用才合理。
 * 预留 requiresAuth 守卫：未来加内部管理页面（如 /admin/user）时，
 * 路由 meta 加 `requiresAuth: true` 即可，未登录自动跳 /mini-login 并保留 redirect。
 */
router.beforeEach((to, _from, next) => {
  // 动态标题
  if (to.meta.title) {
    document.title = `${to.meta.title} | Enterprise SSO`;
  }
  if (to.meta.requiresAuth) {
    // 未来内部页面的鉴权点：检查 pinia auth store / cookie
    // 当前 oauth21 不需要（无内部页面），先放行；以后接 posecraft/firewall 的内部 SPA 时启用
    // const isAuthed = !!document.cookie.match(/(^| )sid=/);
    // if (!isAuthed) return next({ path: '/mini-login', query: { redirect: to.fullPath, from: to.path } });
  }
  next();
});

export default router;
