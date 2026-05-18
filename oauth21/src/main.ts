/**
 * 应用入口文件
 * 按顺序注册：全局错误处理 → 状态管理 → 路由 → 国际化 → 异步挂载
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import i18n from './i18n' // 如果有国际化配置
import './assets/styles/main.scss'

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

// 3. 异步挂载 (确保路由就绪)
router.isReady().then(() => {
  app.mount('#app')
})
