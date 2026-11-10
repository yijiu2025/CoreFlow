/**
 * 人机挑战页入口（独立构建产物 `challenge.html`）
 *
 * 刻意极简：不加载 router / pinia / 主题状态机 / 全局布局 —— 挑战页必须在
 * "业务请求全被挡住"的前提下独立可用（主应用启动即请求 session/me，会立刻撞 428）。
 *
 * 与 `admin/`、`firewall/` 两侧同一套共享逻辑（`challenge-client`）。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { createApp } from 'vue';
import ChallengePage from './ChallengePage.vue';

createApp(ChallengePage).mount('#challenge-app');
