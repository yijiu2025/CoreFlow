/**
 * PoseCraft 路由配置
 */
import { createRouter, createWebHistory } from 'vue-router'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'
import { useAuthStore } from '@/stores/auth'

NProgress.configure({ showSpinner: false })

const router = createRouter({
  history: createWebHistory('/posecraft/'),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      meta: { title: '首页' }
    },
    {
      path: '/editor',
      name: 'editor',
      component: () => import('@/views/EditorView.vue'),
      meta: { title: '编辑器', requiresAuth: true }
    },
    {
      path: '/camera',
      name: 'camera',
      component: () => import('@/views/CameraView.vue'),
      meta: { title: '相机', requiresAuth: true }
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
      meta: { title: '我的', requiresAuth: true }
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { title: '登录' }
    },
    {
      path: '/callback',
      name: 'callback',
      component: () => import('@/views/CallbackView.vue'),
      meta: { title: '登录中...' }
    },
    {
      path: '/template/:id',
      name: 'template-detail',
      component: () => import('@/views/TemplateDetail.vue'),
      meta: { title: '模板详情' }
    },
    {
      path: '/work/:id',
      name: 'work-detail',
      component: () => import('@/views/WorkDetail.vue'),
      meta: { title: '作品详情' }
    }
  ]
})

router.beforeEach(async (to) => {
  NProgress.start()
  document.title = `${to.meta.title || 'PoseCraft'} - CoreFlow`

  if (to.meta.requiresAuth) {
    const authStore = useAuthStore()

    // 首次访问时验证 Session（Cookie 模式）
    if (!authStore.initialized) {
      const valid = await authStore.checkSession()
      if (!valid) {
        return { name: 'login', query: { redirect: to.fullPath } }
      }
    }

    // 已初始化但未登录
    if (!authStore.isLoggedIn) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
  }
})

router.afterEach(() => NProgress.done())

export default router
