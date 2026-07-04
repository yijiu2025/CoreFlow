import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory('/poseadmin/'),
  routes: [
    {
      path: '/',
      component: () => import('../layout/BaseLayout.vue'),
      redirect: '/works',
      children: [
        {
          path: 'works',
          name: 'WorksAudit',
          component: () => import('../views/WorksAudit.vue'),
          meta: { title: '作品审核' }
        },
        {
          path: 'templates',
          name: 'TemplatesAudit',
          component: () => import('../views/TemplatesAudit.vue'),
          meta: { title: '模板审核' }
        }
      ]
    }
  ]
})

// 全局路由守卫
router.beforeEach((to, from, next) => {
  document.title = `${to.meta.title || '管理后台'} - PoseCraft`
  next()
})

export default router
