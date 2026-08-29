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

// 透传 OAuth 注册上下文给子组件（appName 显示 + lang 切换 i18n + redirect 注册后回跳）
// 子组件用 inject('registerContext') 获取
import { provide, reactive } from 'vue';
const registerContext = reactive({
  appName: (route.query.appName as string) || 'Enterprise SSO',
  lang: (route.query.lang as string) || 'zh_cn',
  redirect: (route.query.redirect as string) || '',
  invite: (route.query.invite as string) || ''
});
provide('registerContext', registerContext);
</script>

<template>
  <component :is="activeComponent" />
</template>

<style scoped>
/* 页面切换平滑淡入淡出（与 login 一致） */
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
  transform: translateY(-12px) scale(1.02);
}
</style>
