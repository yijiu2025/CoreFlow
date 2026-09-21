<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { useRoute } from 'vue-router';
import { useDeviceDetect } from '@/composables/useDeviceDetect';

const route = useRoute();

// 自动识别设备形态：窄视口 / 真机 UA → 手机端注册页
// URL 显式 ?isMobile=true 优先级最高，这里只在未显式指定时生效
const { isMobileDevice } = useDeviceDetect();

// 异步按需加载不同形态的注册组件（与 login 分发器架构一致）
const StandardRegister = defineAsyncComponent(() => import('./StandardRegister.vue'));
const MiniRegister = defineAsyncComponent(() => import('./MiniRegister.vue'));
const MobileRegister = defineAsyncComponent(() => import('../../app/register/index.vue'));

// 动态路由/参数分发逻辑
const activeComponent = computed(() => {
  // 1. 移动端（显式 isMobile=true 优先，不走自动识别）
  if (route.query.isMobile === 'true') {
    return MobileRegister;
  }

  // 2. mini 来源（iframe 嵌入弹窗场景）→ 紧凑版
  // 精确匹配：/mini-register 路径（避免 /administrators 等含 "mini" 字符串的路径误判）
  if (route.query.from === 'mini' || route.path.startsWith('/mini-register')) {
    return MiniRegister;
  }

  // 3. 自动识别：视口宽度 < 768px 或真机 UA → 手机端注册页
  // 手机直接打开 /register 不再挤在桌面双栏布局里
  if (isMobileDevice.value) {
    return MobileRegister;
  }

  // 4. 默认桌面版标准注册
  return StandardRegister;
});

// 透传 OAuth 注册上下文给子组件
// iframe 父应用跳注册页时通常带：appName/client_id/redirect_uri/scope/state，
// 注册后跳回 redirect_uri（同源白名单校验，防开放重定向）。
// 子组件用 inject('registerContext') 获取。
// 其他（deviceId/theme/timestamp 等）由各自的全局机制处理，不透传。
import { provide, reactive } from 'vue';
const q = route.query;
const registerContext = reactive({
  // 应用展示
  appName: String(q.appName || '') || 'Enterprise SSO',
  // 客户端（后端 OAuth 服务用）
  clientId: String(q.client_id || q.appName || ''),
  // OAuth 回跳（注册成功后跳此 URL，必须同源白名单校验）
  redirectUri: String(q.redirect_uri || q.redirect || ''),
  // 兼容旧字段名（dispatcher 之前是 redirect，新版统一用 redirect_uri 与 OAuth 规范对齐）
  redirect: String(q.redirect || q.redirect_uri || ''),
  // scope + state（OAuth 标准字段，注册成功后回跳 redirect_uri 时会带上）
  scope: String(q.scope || ''),
  state: String(q.state || ''),
  // 邀请码（父应用邀请注册场景）
  invite: String(q.invite || ''),
  // 语言
  lang: String(q.lang || '') || 'zh_cn'
});
provide('registerContext', registerContext);
</script>

<template>
  <div class="login-dispatcher-wrapper">
    <!-- 注意：不要用 <transition mode="out-in"> 包 <component :is>。
         自动识别窄屏会在页面挂载后中途切换异步组件，out-in 与异步组件/多根节点
         组合会导致 leave 后新组件不挂载（白屏）。设备切换不需要动画，直接渲染。 -->
    <component :is="activeComponent" />
  </div>
</template>

<style scoped>
.login-dispatcher-wrapper {
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 纵向允许滚动：窄窗口/短屏下子内容超出视口时可滚到，不再被裁切 */
  overflow-y: auto;
  overflow-x: hidden;
  background: transparent;
}
</style>
