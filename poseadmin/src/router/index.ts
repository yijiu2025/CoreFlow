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
        },
        {
          path: 'banner',
          name: 'BannerManage',
          component: () => import('../views/BannerManage.vue'),
          meta: { title: 'Banner 管理' }
        },
        {
          path: 'channels',
          name: 'ChannelManage',
          component: () => import('../views/ChannelManage.vue'),
          meta: { title: '频道管理' }
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
