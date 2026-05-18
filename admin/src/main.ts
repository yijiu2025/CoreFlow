/**
 * Admin Panel 入口文件
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
// import i18n from './i18n' // 预留多语言
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

// 3. 异步挂载
router.isReady().then(() => {
  app.mount('#app')
})
