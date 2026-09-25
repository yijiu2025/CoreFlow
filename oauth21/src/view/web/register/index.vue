<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useDeviceDetect } from '@/composables/useDeviceDetect';
import { useThemeStore } from '@/stores/theme';
import { DEFAULT_THEME_PACKAGE, type ThemeDevice } from '@/theme';

const route = useRoute();

// 自动识别设备形态：窄视口 / 真机 UA → 手机端注册页
// URL 显式 ?isMobile=true 优先级最高，这里只在未显式指定时生效
const { isMobileDevice } = useDeviceDetect();

// 异步按需加载不同形态的注册组件（与 login 分发器架构一致）
const StandardRegister = defineAsyncComponent(() => import('./StandardRegister.vue'));
const MiniRegister = defineAsyncComponent(() => import('./MiniRegister.vue'));
const MobileRegister = defineAsyncComponent(() => import('../../app/register/index.vue'));

// 动态路由/参数分发逻辑
// 🔴 形态判定**单一来源**：activeForm 既决定渲染哪个组件，也决定主题的设备作用域
//    —— 两件事必须同源，否则会出现"渲染的是手机端、主题却是电脑端那套"。
const activeForm = computed(() => {
  // 1. 移动端（显式 isMobile=true 优先，不走自动识别）
  if (route.query.isMobile === 'true') {
    return 'mobile' as const;
  }

  // 2. mini 来源（iframe 嵌入弹窗场景）→ 紧凑版
  // 精确匹配：/mini-register 路径（避免 /administrators 等含 "mini" 字符串的路径误判）
  if (route.query.from === 'mini' || route.path.startsWith('/mini-register')) {
    return 'mini' as const;
  }

  // 3. 自动识别：视口宽度 < 768px 或真机 UA → 手机端注册页
  // 手机直接打开 /register 不再挤在桌面双栏布局里
  if (isMobileDevice.value) {
    return 'mobile' as const;
  }

  // 4. 默认桌面版标准注册
  return 'standard' as const;
});

const activeComponent = computed(() =>
  activeForm.value === 'mobile' ? MobileRegister
  : activeForm.value === 'mini' ? MiniRegister
  : StandardRegister
);

/**
 * 🔴 主题作用域跟随**实际渲染的形态**，而不是路由（2026-09-25 用户定夺）
 *
 * `/register` 是电脑端路由，但窄视口下本分发器渲染的是手机端容器 —— token 注入、
 * 调试面板的颜色清单都必须按 mobile 作用域走，否则手机端页面吃到电脑端那套配色、
 * 面板切手机端主题"无效"。mini 来源恒为 web：iframe 列宽造成的"窄"不是手机。
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
    // 归位到当前包（web 端走默认包 = DEFAULT_THEME_PACKAGE）—— 新版式下 view ≡ pkg，
    // 用包名作 view 段能让 findRecord 命中默认包对应配色；手机形态由随后挂载的容器覆盖。
    if (device === 'web') themeStore.setActivePageView('register', DEFAULT_THEME_PACKAGE);
  },
  { immediate: true }
);

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

/**
 * v2.20.1：dispatcher 挂载后立即 import() 三个形态的注册组件 —— activeForm
 * 在运行时才能确定（视口/UA/iframe 来源），dispatcher 自身 prefetch 之后，
 * 它内部 defineAsyncComponent 还要再走一次 chunk 下载。这是「注册页切换
 * 42ms 空白窗口」的根因（dispatcher 自身已 cached，但子组件还要下载）。
 * 三个形态全部预热：chunk 总量 < 30KB，并行下载几乎瞬时；用户切换任意形态都不闪。
 */
onMounted(() => {
  void import('./StandardRegister.vue').catch(() => {});
  void import('./MiniRegister.vue').catch(() => {});
  void import('../../app/register/index.vue').catch(() => {});
});
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
