import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory('/'),
  routes: [
    {
      path: '/',
      name: 'Dashboard',
      component: () => import('@/view/dashboard/index.vue'),
      meta: { title: '权限大盘' }
    },
    {
      path: '/users',
      name: 'Users',
      component: () => import('@/view/users/index.vue'),
      meta: { title: '用户管理' }
    }
  ]
})

// 动态标题守卫
router.beforeEach((to, from, next) => {
  if (to.meta.title) {
    document.title = `${to.meta.title} - IAM Admin`
  }
  next()
})

export default router
