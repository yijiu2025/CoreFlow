<script setup lang="ts">
/**
 * 忘记密码/重置密码 分发器（/forgot-password）
 *
 * 路由：authRoutes。窄视口 / 真机 / 显式 `?isMobile=true` → 渲染移动端全屏页，
 * 否则渲染桌面卡片版。分发规则与 login / register 两个分发器保持一致
 * （显式参数 ＞ 自动识别 ＞ 桌面默认）。
 *
 * 为什么要分发：「忘记密码」的入口在三处都能点到 —— 电脑版登录页、手机端登录页、
 * 以及用户邮箱里的重置链接。手机端登录页的按钮已直连 `/m/forgot-password`；
 * 而邮件链接指向 `/reset-password?token=…`，那条路径重定向到本路由（见 router/routes.ts），
 * 用户在手机上点邮件时靠这里兜住，否则会看到桌面双栏卡片被塞进手机屏。
 *
 * @author yijiu2025
 */
import { computed, defineAsyncComponent } from 'vue';
import { useRoute } from 'vue-router';
import { useDeviceDetect } from '@/composables/useDeviceDetect';

const route = useRoute();

// 自动识别设备形态：窄视口 / 真机 UA → 手机端重置密码页
// URL 显式 ?isMobile=true 优先级最高，这里只在未显式指定时生效
const { isMobileDevice } = useDeviceDetect();

// 异步按需加载两种形态（与 login / register 分发器同一架构）
const DesktopForgot = defineAsyncComponent(() => import('./DesktopForgot.vue'));
const MobileForgot = defineAsyncComponent(() => import('../../app/forgot-password/index.vue'));

const activeComponent = computed(() => {
  // 1. 显式指定移动端（不走自动识别）
  if (route.query.isMobile === 'true') {
    return MobileForgot;
  }

  // 2. 自动识别：视口宽度 < 768px 或真机 UA
  if (isMobileDevice.value) {
    return MobileForgot;
  }

  // 3. 默认桌面版
  return DesktopForgot;
});
</script>

<template>
  <div class="forgot-dispatcher-wrapper">
    <!-- 注意：不要用 <transition mode="out-in"> 包 <component :is>。
         自动识别窄屏会在页面挂载后中途切换异步组件，out-in 与异步组件/多根节点
         组合会导致 leave 后新组件不挂载（白屏）。设备切换不需要动画，直接渲染。 -->
    <component :is="activeComponent" />
  </div>
</template>

<style scoped>
.forgot-dispatcher-wrapper {
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
