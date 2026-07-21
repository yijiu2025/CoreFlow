/**
 * 路由配置
 *
 * @author <作者>
 * @since 2026-07-20
 */
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory('/stick'),
  routes: [
    {
      path: '/',
      redirect: '/dashboard'
    },
    {
      path: '/dashboard',
      name: 'Dashboard',
      component: () => import('../views/DashboardView.vue'),
      meta: { title: '工作台' }
    },
    {
      path: '/stocks',
      name: 'Stocks',
      component: () => import('../views/StockListView.vue'),
      meta: { title: '股票列表' }
    },
    {
      path: '/positions',
      name: 'Positions',
      component: () => import('../views/PositionView.vue'),
      meta: { title: '我的持仓' }
    },
    {
      path: '/trades',
      name: 'Trades',
      component: () => import('../views/TradeHistoryView.vue'),
      meta: { title: '交易记录' }
    },
    {
      path: '/analysis',
      name: 'Analysis',
      component: () => import('../views/AnalysisView.vue'),
      meta: { title: 'AI 分析' }
    },
    {
      path: '/journal',
      name: 'Journal',
      component: () => import('../views/JournalView.vue'),
      meta: { title: '交易日志' }
    }
  ]
})

router.beforeEach((to, _from, next) => {
  document.title = `${to.meta.title || '股票分析'} - Stick`
  next()
})

export default router
