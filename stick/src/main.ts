/**
 * 应用入口
 *
 * @author <作者>
 * @since 2026-07-20
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './style.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
