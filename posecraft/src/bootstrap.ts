/**
 * PoseCraft 启动编排器
 * 按序初始化：状态管理 → 路由 → 国际化 → 指令 → 挂载
 */
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import i18n from './i18n';
import { setupDirectives } from './directives';
import { useUserSettings } from './stores/userSettings';
import { initDeviceSync } from 'deviceid';
import './assets/styles/main.css';

// 设备 ID 全局同步初始化（跨标签页 storage 事件监听 + 变更回调注册）
initDeviceSync();

const app = createApp(App);
const pinia = createPinia();

// 1. 全局错误处理
app.config.errorHandler = (err, instance, info) => {
  console.error('[Global Exception]', err, info);
};

// 2. 插件及全局指令注册
app.use(pinia);
app.use(router);
app.use(i18n);
setupDirectives(app);

// 3. 用户个性设置初始化（缓存恢复 + 监听登录状态自动同步）
useUserSettings().init();

// 4. 等待路由就绪后挂载
router.isReady().then(() => {
  app.mount('#app');
});
