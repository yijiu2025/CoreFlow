/**
 * Vue Router 路由配置
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { title: '仪表盘' }
  },
  {
    path: '/firewall',
    name: 'Firewall',
    component: () => import('@/views/FirewallView.vue'),
    meta: { title: '防火墙' }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: '设置' }
  },
  {
    path: '/console',
    name: 'Console',
    component: () => import('@/views/ConsoleView.vue'),
    meta: { title: '安全控制台' }
  },
  {
    path: '/logs',
    name: 'Logs',
    component: () => import('@/views/LogsView.vue'),
    meta: { title: '日志' }
  }
]

const router = createRouter({
  history: createWebHistory('/firewall/'),
  routes
})

router.beforeEach((to) => {
  document.title = `${(to.meta as any).title || 'Firewall'} - Antigravity`
})

export default router
