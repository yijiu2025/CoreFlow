/**
 * 应用启动编排器
 * 按序初始化：状态管理 → 路由 → 国际化 → 指令 → 全局错误处理 → 等待路由就绪 → 挂载
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { authDirective } from './directives/auth'
import { roleDirective } from './directives/role'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

// 1. 全局错误处理
app.config.errorHandler = (err, instance, info) => {
  console.error('[Global Exception]', err, info)
}

// 2. 插件注册（顺序：pinia → router → i18n）
app.use(pinia)
app.use(router)
app.use(i18n)

// 3. 注册全局指令
app.directive('auth', authDirective)
app.directive('role', roleDirective)

// 4. 等待路由就绪后挂载（避免白屏闪烁）
router.isReady().then(() => {
  app.mount('#app')
})
