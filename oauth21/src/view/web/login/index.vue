<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAntiCache } from '@/composables/useAntiCache';
import AntiCacheDebugPanel from '@/components/common/AntiCacheDebugPanel.vue';

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
  debugInfo
} = useAntiCache({
  autoRefresh: true,
  refreshInterval: 5 * 60 * 1000, // 5分钟刷新一次
  enableDebug: true
});

const stie = ref('02'); // 站点标识占位
const sign = ref(''); // 签名占位（当前未启用）
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

// 调试面板关闭事件处理
const onDebugPanelClose = () => {
  // 当调试面板关闭时，我们可以在这里添加额外的逻辑
  // 比如停止防缓存的自定义刷新逻辑等
  console.warn('防缓存调试面板已关闭');
};

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
    <!-- 调试信息面板 -->
    <AntiCacheDebugPanel
      :visible="debugInfo !== undefined"
      :refresh-interval="5 * 60 * 1000"
      @update:visible="onDebugPanelClose"
    />

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
