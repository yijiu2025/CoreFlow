/**
 * PoseCraft 启动编排器
 * 按序初始化：状态管理 → 路由 → 国际化 → 指令 → 挂载
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import './assets/styles/main.css'

const app = createApp(App)
const pinia = createPinia()

// 1. 全局错误处理
app.config.errorHandler = (err, instance, info) => {
  console.error('[Global Exception]', err, info)
}

// 2. 插件注册
app.use(pinia)
app.use(router)
app.use(i18n)

// 3. 等待路由就绪后挂载
router.isReady().then(() => {
  app.mount('#app')
})
