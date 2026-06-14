/**
 * Vue Router 路由配置
 *
 * 特性：
 * - NProgress 进度条
 * - Token 权限校验（meta.requiresAuth）
 * - 动态标题更新
 * - MainLayout 作为父布局包裹所有页面
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

// NProgress 配置
NProgress.configure({ showSpinner: false, speed: 400 })

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('@/views/DashboardView.vue'),
        meta: { title: '仪表盘', requiresAuth: false }
      },
      {
        path: 'firewall',
        name: 'Firewall',
        component: () => import('@/views/FirewallView.vue'),
        meta: { title: '防火墙', requiresAuth: true }
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/SettingsView.vue'),
        meta: { title: '设置', requiresAuth: true }
      },
      {
        path: 'console',
        name: 'Console',
        component: () => import('@/views/ConsoleView.vue'),
        meta: { title: '安全控制台', requiresAuth: true }
      },
      {
        path: 'logs',
        name: 'Logs',
        component: () => import('@/views/LogsView.vue'),
        meta: { title: '日志', requiresAuth: true }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory('/firewall/'),
  routes
})

// 路由前置守卫
router.beforeEach(async (to) => {
  NProgress.start()

  // 动态标题
  document.title = `${(to.meta as any).title || 'Firewall'} - CoreFlow`

  // 权限校验
  if (to.meta.requiresAuth) {
    const token = localStorage.getItem('fw_token')
    if (!token) {
      // 未登录，允许进入（由页面组件处理登录弹窗）
      // 如果需要强制跳转登录页，取消下面注释
      // return { path: '/', query: { redirect: to.fullPath } }
    }
  }
})

// 路由后置守卫
router.afterEach(() => {
  NProgress.done()
})

export default router
