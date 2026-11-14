/**
 * 启动编排器
 *
 * 按序初始化：设备 ID 同步 → createApp → 全局错误处理 → pinia → router → 主题域
 * → 等待路由就绪 → 挂载。
 *
 * 🔴 设备 ID 必须在 `createApp` / 首次请求之前同步：axios 实例创建时就会读它注入
 *    `x-device-id`，晚一步会让首个请求缺头，风控侧记为「设备缺失」。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { initDeviceSync } from 'stable-deviceid';
import type { Plugin } from 'vue';
import { theme } from 'skinsuite/vue';
import App from './App.vue';
import router from './router';
import { maskClose } from './utils/maskClose';

// 0. 设备 ID 全局同步（跨标签页 storage 监听 + 变更回调注册）
initDeviceSync();

const app = createApp(App);
const pinia = createPinia();

// 1. 全局错误处理：控制台留痕，不白屏
app.config.errorHandler = (err, _instance, info) => {
  console.error('[Console] 未捕获异常:', err, info);
};

// 2. 插件注册（顺序：pinia → router → theme）
app.use(pinia);
app.use(router);
// 遮罩关闭指令：只在"按下与松开都在遮罩上"时关闭 —— 防止拖选文字误关弹窗
app.directive('mask-close', maskClose);
// 主题域：只传 router（版式意图从 query 读）；明暗 / 配色状态机在 skinsuite 内核
// ⚠️ 必须在 `app.use(pinia)` 之后：主题 store 实例化依赖 activePinia
// 类型桥接：库的插件声明带可选 options 泛型，与 Vue 的 Plugin 重载不完全同形
app.use(theme as unknown as Plugin, { router });

// 3. 路由就绪后再挂载，避免首屏闪一个空壳
router
  .isReady()
  .then(() => app.mount('#app'))
  .catch(err => {
    console.error('[Console] 路由初始化失败，降级挂载:', err);
    app.mount('#app');
  });
