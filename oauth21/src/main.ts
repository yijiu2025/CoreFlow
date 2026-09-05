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
import { initDeviceSync } from 'stable-deviceid';
import { reportError } from './composables/useErrorReporter';

// 设备 ID 全局同步初始化（跨标签页 storage 事件监听 + 变更回调注册）
initDeviceSync();

const app = createApp(App);
const pinia = createPinia();

// 1. 全局错误处理：上报到后端监控，dev 环境 console.warn 留痕（不直接 console.error 防生产堆栈泄露）
app.config.errorHandler = (err, _instance, info) => {
  // 异步上报不阻塞（fire-and-forget，fetch 失败静默）
  reportError(err, String(info || ''));
};

// 2. 插件注册
app.use(pinia);
app.use(router);
app.use(i18n);

// 3. 预发 H5 签名 Token（拿 _m_h5_tk cookie，后续请求拦截器才能算签名）
// 未登录场景（QR 生成等公开端点）也需要签名防爬，cookie 预取后所有请求都能签名
// fire-and-forget：不阻塞挂载；失败时首个请求会被后端自动下发 cookie 并放行
request.get('/auth/v1/h5-token').catch(err => {
  // 不阻塞主流程，但留痕便于排查（fire-and-forget 不上抛）
  reportError(err, '[H5Token] 预取失败（首次请求会由后端自动下发）');
});

// 4. 异步挂载 (确保路由就绪)
router.isReady()
  .then(() => {
    app.mount('#app');
  })
  .catch(err => {
    // 路由初始化失败（极少见：路由表循环、配置错误），降级直接挂载避免白屏
    reportError(err, '[Router] router.isReady 失败，降级挂载');
    app.mount('#app');
  });
