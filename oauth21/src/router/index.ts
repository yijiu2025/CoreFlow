import { createRouter, createWebHistory } from 'vue-router'
import BlankLayout from '@/layouts/BlankLayout.vue'

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
          component: () => import('@/view/web/login/MiniLogin.vue'),
          meta: { title: '快捷登录' }
        },
        {
          path: 'forgot-password',
          name: 'ForgotPassword',
          component: () => import('@/view/web/forgot-password/index.vue'),
          meta: { title: '忘记密码' }
        },
        {
          path: 'reset-password',
          name: 'ResetPassword',
          component: () => import('@/view/web/forgot-password/index.vue'),
          meta: { title: '重置密码' }
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
})

// 路由守卫
router.beforeEach((to) => {
  // 动态标题
  if (to.meta.title) {
    document.title = `${to.meta.title} | Enterprise SSO`
  }
})

export default router
