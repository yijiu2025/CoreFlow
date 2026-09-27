<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAntiCache } from '@/composables/useAntiCache';
import { useDeviceDetect } from '@/composables/useDeviceDetect';
import AntiCacheDebugPanel from '@/components/common/AntiCacheDebugPanel.vue';
import { postToParent } from '@/utils/parent';
import { useThemeStore } from '@/stores/theme';
import { DEFAULT_THEME_PACKAGE, type ThemeDevice } from '@/theme';
import { pickDeviceId, deviceContext, THEME_DEVICES, resolveContainerOf } from '@/theme/devices';

const route = useRoute();

// 1. 初始化响应式变量并定义默认值 (以支持缺省参数的情况)
const lang = ref('zh_cn');
const theme = ref('light');
const appName = ref('posecraft');
const appEntrance = ref('web');
const bizParams = ref(''); // 业务透传占位（父应用用，未启用下游使用）
const notLoadSsoView = ref(false);
const notKeepLogin = ref(false);
const qrCodeFirst = ref(false);
// 使用防缓存功能
const {
  rnd,
  debugInfo
} = useAntiCache({
  autoRefresh: true,
  refreshInterval: 5 * 60 * 1000, // 5分钟刷新一次
  enableDebug: false
});

// 调试面板显示状态：由 enableDebug 间接控制（debugInfo 为 undefined 时不显示）
const showDebugPanel = ref(!!debugInfo);

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
    qrCodeFirst.value = query.qrCodeFirst === 'true';
    stie.value = (query.stie as string) || '02';
    rnd.value = (query.rnd as string) || '0.7164508668310778';
    // sign 语义 = 后端 H5 签名校验的 query.sign（见 utils/sign.ts），
    // 此前误读成 query.rnd（复制粘贴错），字段一旦启用即错 —— 改回 query.sign
    sign.value = (query.sign as string) || '';
  },
  { immediate: true, deep: true }
);

// 组件生命周期管理

// 自动识别设备形态：窄视口 / 真机 UA → 手机端登录页
// URL 显式 ?isMobile=true 优先级最高，这里只在未显式指定时生效
const { isMobileDevice } = useDeviceDetect();

// 异步按需加载不同形态的登录组件
// 🔴 数据化（2026-09-27）：设备 id → 该页容器 的映射从设备清单派生，不再写死
//    「mobile ? MobileLogin : mini ? MiniLogin : StandardLogin」的三选一 —— 那是加
//    一种设备（如 tablet）时的静默半生效根因（pickDeviceId 返回新设备、映射却落到
//    Standard 分支）。现在清单加一条 + 写容器，这里自动认。
const deviceComponents = new Map(
  THEME_DEVICES.map(id => [id, defineAsyncComponent(resolveContainerOf(id, 'login'))])
);

// 组件挂载后执行
onMounted(() => {
  // SSO_READY 统一在此发送（dispatcher 入口），子组件 StandardLogin/MiniLogin 不再重复发。
  // 父窗口收到后关 loading + 同步主题（见 posecraft/firewall LoginModal handleMessage）。
  if (shouldSendSSOMessage.value) {
    postToParent({ type: 'SSO_READY' });
    console.warn('[SSO] 发送 SSO_READY 消息到父窗口');
  }
  // v2.20.1：dispatcher 挂载后立即预热所有设备的登录容器，避免「切换闪屏」。
  // 遍历设备清单（含将来新增的设备），不再手写三个 import()。
  for (const id of THEME_DEVICES) {
    void resolveContainerOf(id, 'login')().catch(() => {});
  }
});

// 调试面板关闭事件处理
const onDebugPanelClose = () => {
  showDebugPanel.value = false;
  console.warn('防缓存调试面板已关闭');
};

// 动态路由/参数分发逻辑
// 🔴 形态判定**单一来源**：activeForm 既决定渲染哪个组件，也决定主题的设备作用域
//    —— 两件事必须同源，否则会出现"渲染的是手机端、主题却是电脑端那套"。
// 判定本身也收敛到设备清单（theme/devices.ts 的 pickDeviceId）：三个分发器不再各写
// 一份 if-链，mini 来源（from/fromLogin/路径）与显式 isMobile 的优先级只有一份实现。
const activeForm = computed(() =>
  pickDeviceId(deviceContext(route.query, route.path, isMobileDevice.value))
);

const activeComponent = computed(() =>
  deviceComponents.get(activeForm.value) ?? deviceComponents.get('standard')!
);

/**
 * 🔴 主题作用域跟随**实际渲染的形态**，而不是路由（2026-09-25 用户定夺）
 *
 * `/login` 是电脑端路由，但窄视口下本分发器渲染的是手机端容器 —— 此时 token
 * 注入与调试面板的颜色清单都必须按 mobile 作用域走，否则：
 *   • 手机端页面吃到电脑端那套配色（电脑端只有黑/白两种）；
 *   • 调试面板切手机端主题"无效"（themeId 改了，渲染却按电脑端作用域回落）。
 * 三种形态各自映射到独立设备（2026-09-25 三值化）：
 *   • mobile   → 'mobile'（手机端）
 *   • mini     → 'mini'（iframe 紧凑版，独立设备）
 *   • standard → 'standard'（桌面主窗口）
 * mini 不再是 web 的子变体：iframe 列宽造成的"窄"不是手机（见 activeForm 分支 2），
 * 但它与 standard 是**并列**的设备形态，各有各的配色目录。
 */
const themeStore = useThemeStore();
// activeForm 现在直接是 ThemeDevice（pickDeviceId 的返回值），无需再做一次映射
const renderedDevice = computed<ThemeDevice>(() => activeForm.value);
watch(
  renderedDevice,
  device => {
    themeStore.setActiveDevice(device);
    // 桌面形态没有容器来声明 page/view（那是 view/app/<page>/ 容器的职责），
    // 这里把版式归位到当前包（standard/mini 端走默认包），避免上一形态（如手机端
    // compact）残留影响桌面作用域 —— 新版式下 view ≡ pkg，归位到 DEFAULT_THEME_PACKAGE 即可。
    // 手机形态下随后挂载的容器会自己声明并覆盖，两方不冲突。
    if (device !== 'mobile') themeStore.setActivePageView('login', DEFAULT_THEME_PACKAGE);
  },
  { immediate: true }
);

// 是否发送 SSO 消息给父窗口
const shouldSendSSOMessage = computed(() => {
  return !notLoadSsoView.value && window.parent && window.parent !== window;
});
</script>

<template>
  <div class="login-dispatcher-wrapper">
    <!-- 调试信息面板 -->
    <AntiCacheDebugPanel
      :visible="showDebugPanel"
      :refresh-interval="5 * 60 * 1000"
      @update:visible="onDebugPanelClose"
    />

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
