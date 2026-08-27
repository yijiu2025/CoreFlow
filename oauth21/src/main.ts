/**
 * 应用入口文件
 * 按顺序注册：全局错误处理 → 状态管理 → 路由 → 国际化 → 异步挂载
 */
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import i18n from './i18n'; // 如果有国际化配置
import './assets/styles/main.scss';
import request from './utils/request';

const app = createApp(App);
const pinia = createPinia();

// 1. 全局错误处理
app.config.errorHandler = (err, _instance, info) => {
  console.error('[Global Exception]', err, info);
};

// 2. 插件注册
app.use(pinia);
app.use(router);
app.use(i18n);

// 3. 预发 H5 签名 Token（拿 _m_h5_tk cookie，后续请求拦截器才能算签名）
// 未登录场景（QR 生成等公开端点）也需要签名防爬，cookie 预取后所有请求都能签名
// fire-and-forget：不阻塞挂载；失败时首个请求会被后端自动下发 cookie 并放行
request.get('/auth/v1/h5-token').catch(() => {});

// 4. 异步挂载 (确保路由就绪)
router.isReady().then(() => {
  app.mount('#app');
});
