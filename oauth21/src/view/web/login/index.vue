<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAntiCache } from '@/composables/useAntiCache';

const route = useRoute();

// 1. 初始化响应式变量并定义默认值 (以支持缺省参数的情况)
const lang = ref('zh_cn');
const theme = ref('light');
const appName = ref('posecraft');
const appEntrance = ref('web');
const bizParams = ref(''); // 业务透传占位（父应用用，未启用下游使用）
const notLoadSsoView = ref(false);
const notKeepLogin = ref(false);
const isMobile = ref(false);
const qrCodeFirst = ref(false);
// 使用防缓存功能
const {
  rnd,
  refresh: refreshRnd,
  formattedLastRefreshed,
  debugInfo
} = useAntiCache({
  autoRefresh: true,
  refreshInterval: 5 * 60 * 1000, // 5分钟刷新一次
  enableDebug: true
});

const stie = ref('02'); // 站点标识占位
const sign = ref(''); // 签名占位（当前未启用）

// 刷新方法（供模板使用）
const generateNewRandom = refreshRnd;
// theme: 子组件（MiniLogin）自己用 useRoute().query.theme 读，
//        dispatcher 和子组件共享 vue-router，query 自动可用，无需此处透传

// 2. 监听路由 query 变化，动态同步到变量，同时保证类型安全与空值兜底
watch(
  () => route.query,
  query => {
    lang.value = (query.lang as string) || 'zh_cn';
    theme.value = (query.theme as string) || 'light';
    appName.value = (query.appName as string) || 'posecraft';
    appEntrance.value = (query.appEntrance as string) || 'web';
    bizParams.value = (query.bizParams as string) || '';
    notLoadSsoView.value = query.notLoadSsoView === 'true';
    notKeepLogin.value = query.notKeepLogin === 'true';
    isMobile.value = query.isMobile === 'true';
    qrCodeFirst.value = query.qrCodeFirst === 'true';
    stie.value = (query.stie as string) || '02';
    rnd.value = (query.rnd as string) || '0.7164508668310778';
    sign.value = (query.rnd as string) || '';
  },
  { immediate: true, deep: true }
);

// 组件生命周期管理

// 异步按需加载不同形态的登录组件
const StandardLogin = defineAsyncComponent(() => import('./StandardLogin.vue'));
const MiniLogin = defineAsyncComponent(() => import('./MiniLogin.vue'));
const MobileLogin = defineAsyncComponent(() => import('../../app/login/index.vue'));

// 动态路由/参数分发逻辑
const activeComponent = computed(() => {
  // 1. 如果指定为移动端，或者 isMobile 参数为 true
  if (isMobile.value) {
    return MobileLogin;
  }

  // 2. mini 登录来源（iframe 嵌入弹窗场景）→ 紧凑版
  //    仅当显式 from=mini 或路径含 mini 时走 MiniLogin；
  //    styleType 的 vertical/horizontal/split 都是 StandardLogin 的布局变体，不应误判为 mini
  if (route.query.from === 'mini' || route.path.includes('/mini-login')) {
    return MiniLogin;
  }

  // 3. 默认桌面版标准 SSO 登录
  return StandardLogin;
});
</script>

<template>
  <div class="login-dispatcher-wrapper">
    <!-- 调试信息面板（仅在开发环境显示） -->
    <div v-if="debugInfo" class="debug-panel">
      <div class="debug-item">
        <strong>防缓存戳:</strong>
        <code>{{ rnd }}</code>
        <button @click="generateNewRandom" class="refresh-btn">
          刷新
        </button>
      </div>
      <div class="debug-item">
        <strong>最后刷新:</strong>
        <code>{{ formattedLastRefreshed }}</code>
      </div>
      <div class="debug-item">
        <strong>刷新次数:</strong>
        <code>{{ debugInfo.refreshCount }}</code>
      </div>
      <div class="debug-item">
        <strong>自动刷新:</strong>
        <code>{{ debugInfo.autoRefresh ? '开启' : '关闭' }}</code>
      </div>
    </div>

    <transition name="fade-slide" mode="out-in">
      <component :is="activeComponent" />
    </transition>
  </div>
</template>

<style scoped>
.login-dispatcher-wrapper {
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: transparent;
}

/* 调试面板样式 */
.debug-panel {
  position: fixed;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 15px;
  border-radius: 8px;
  font-family: monospace;
  font-size: 12px;
  z-index: 9999;
  max-width: 300px;
}

.debug-item {
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.debug-item:last-child {
  margin-bottom: 0;
}

.debug-item strong {
  margin-right: 10px;
  color: #67c23a;
}

.debug-item code {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  flex: 1;
  margin-right: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.refresh-btn {
  background: #409eff;
  color: white;
  border: none;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: background-color 0.3s;
}

.refresh-btn:hover {
  background: #66b1ff;
}

.refresh-btn:active {
  background: #3a8ee6;
}

/* 页面切换平滑淡入淡出动画 */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-12px) scale(0.98);
}
</style>
