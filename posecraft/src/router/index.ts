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
      component: () => import('@/views/HomeView.vue'),
      children: [
        {
          path: '',
          name: 'home-featured',
          component: () => import('@/views/home/FeaturedView.vue'),
          meta: { title: '精选姿势' }
        },
        {
          path: 'recommend',
          name: 'home-recommend',
          component: () => import('@/views/home/RecommendView.vue'),
          meta: { title: '推荐内容' }
        },
        {
          path: 'nearby',
          name: 'home-nearby',
          component: () => import('@/views/home/NearbyView.vue'),
          meta: { title: '附近创作者' }
        },
        {
          path: 'following',
          name: 'home-following',
          component: () => import('@/views/home/FollowingView.vue'),
          meta: { title: '我的关注', requiresAuth: true }
        },
        {
          path: 'friends',
          name: 'home-friends',
          component: () => import('@/views/home/FriendsView.vue'),
          meta: { title: '朋友动态', requiresAuth: true }
        },
        {
          path: 'mine',
          name: 'home-mine',
          component: () => import('@/views/home/MineView.vue'),
          meta: { title: '我的空间', requiresAuth: true }
        }
      ]
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
      component: () => import('@/views/WorkDetail.vue'),
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
