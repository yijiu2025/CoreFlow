<script setup lang="ts">
/**
 * 忘记密码/重置密码 分发器（/forgot-password）
 *
 * 路由：authRoutes。窄视口 / 真机 / 显式 `?isMobile=true` → 渲染移动端全屏页，
 * 否则渲染桌面卡片版。分发规则与 login / register 两个分发器保持一致
 * （显式参数 ＞ mini 来源 ＞ 自动识别 ＞ 桌面默认）。
 *
 * 为什么要分发：「忘记密码」的入口在三处都能点到 —— 电脑版登录页、手机端登录页、
 * 以及用户邮箱里的重置链接。手机端登录页的按钮已直连 `/m/forgot-password`；
 * 而邮件链接指向 `/reset-password?token=…`，那条路径重定向到本路由（见 router/routes.ts），
 * 用户在手机上点邮件时靠这里兜住，否则会看到桌面双栏卡片被塞进手机屏。
 *
 * @author yijiu2025
 */
import { computed, defineAsyncComponent, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useDeviceDetect } from '@/composables/useDeviceDetect';
import { useThemeStore } from '@/stores/theme';
import { BASE_VIEW_ID, type ThemeDevice } from '@/theme';

const route = useRoute();

// 自动识别设备形态：窄视口 / 真机 UA → 手机端重置密码页
// URL 显式 ?isMobile=true 优先级最高，这里只在未显式指定时生效
const { isMobileDevice } = useDeviceDetect();

// 异步按需加载两种形态（与 login / register 分发器同一架构）
const DesktopForgot = defineAsyncComponent(() => import('./DesktopForgot.vue'));
const MobileForgot = defineAsyncComponent(() => import('../../app/forgot-password/index.vue'));

// 🔴 形态判定**单一来源**：activeForm 既决定渲染哪个组件，也决定主题的设备作用域
//    —— 两件事必须同源，否则会出现"渲染的是手机端、主题却是电脑端那套"。
const activeForm = computed(() => {
  // 1. 显式指定移动端（不走自动识别）
  if (route.query.isMobile === 'true') {
    return 'mobile' as const;
  }

  // 2. mini 来源（iframe 嵌入弹窗场景）→ 保持桌面卡片版，**不按宽度自动切移动端**
  //
  //    🔴 2026-09-24 修复：此前漏了这条分支，导致 iframe 场景下重置密码页会"自己跳成手机端"。
  //    成因：mini 登录页（/mini-login）被嵌在宿主弹窗里，弹窗内列宽很窄（实测宿主 1440px 时
  //    iframe 宽 854px，宿主收窄到 ≤800px 时 iframe 内宽度就掉到 768px 以下）→ 自动识别判定为
  //    移动端 → 渲染 MobileForgot（全屏手机版），而同一 iframe 里的 mini 登录页却仍是桌面卡片，
  //    两页视觉因此割裂。
  //    mini 登录页的"忘记密码"链接已带上 `fromLogin=mini`（见 MiniLogin.vue），语义就是
  //    "从 iframe 紧凑版点进来的" —— 与登录/注册分发器的 `from=mini` / `mini-login` 分支对齐：
  //    只要有这个显式来源信号，就一律保持桌面/紧凑版式，宽度不再说话。
  //    （对比：注册分发器是 `route.query.from === 'mini'`；本页复用既有参数名 fromLogin。）
  if (route.query.fromLogin === 'mini') {
    return 'desktop' as const;
  }

  // 3. 自动识别：视口宽度 < 768px 或真机 UA
  if (isMobileDevice.value) {
    return 'mobile' as const;
  }

  // 4. 默认桌面版
  return 'desktop' as const;
});

const activeComponent = computed(() => (activeForm.value === 'mobile' ? MobileForgot : DesktopForgot));

/**
 * 🔴 主题作用域跟随**实际渲染的形态**，而不是路由（2026-09-25 用户定夺）
 *
 * `/forgot-password` 是电脑端路由，但窄视口下本分发器渲染的是手机端容器 —— token 注入、
 * 调试面板的颜色清单都必须按 mobile 作用域走，否则手机端页面吃到电脑端那套配色、
 * 面板切手机端主题"无效"。mini 来源恒为 web：iframe 列宽造成的"窄"不是手机
 *（正是上面分支 2 修掉的那类问题，主题侧同样不能说话）。
 */
const themeStore = useThemeStore();
const renderedDevice = computed<ThemeDevice>(() =>
  activeForm.value === 'mobile' ? 'mobile' : 'web'
);
watch(
  renderedDevice,
  device => {
    themeStore.setActiveDevice(device);
    // 桌面形态没有容器声明 page/view（那是 view/app/<page>/ 容器的职责），
    // 归位到基础版式，避免上一形态残留；手机形态由随后挂载的容器覆盖。
    if (device === 'web') themeStore.setActivePageView('forgot-password', BASE_VIEW_ID);
  },
  { immediate: true }
);
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
