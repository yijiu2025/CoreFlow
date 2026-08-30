<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

// 异步按需加载不同形态的注册组件（与 login 分发器架构一致）
const StandardRegister = defineAsyncComponent(() => import('./StandardRegister.vue'));
const MiniRegister = defineAsyncComponent(() => import('./MiniRegister.vue'));
const MobileRegister = defineAsyncComponent(() => import('../../app/register/index.vue'));

// 动态路由/参数分发逻辑
const activeComponent = computed(() => {
  // 1. 移动端
  if (route.query.isMobile === 'true') {
    return MobileRegister;
  }

  // 2. mini 来源（iframe 嵌入弹窗场景）→ 紧凑版
  // 精确匹配：/mini-register 路径（避免 /administrators 等含 "mini" 字符串的路径误判）
  if (route.query.from === 'mini' || route.path.startsWith('/mini-register')) {
    return MiniRegister;
  }

  // 3. 默认桌面版标准注册
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
