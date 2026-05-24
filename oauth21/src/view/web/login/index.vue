<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

// 1. 初始化响应式变量并定义默认值 (以支持缺省参数的情况)
const lang = ref('zh_cn')
const appName = ref('xianyu')
const appEntrance = ref('web')
const styleType = ref('vertical')
const bizParams = ref('')
const notLoadSsoView = ref(false)
const notKeepLogin = ref(false)
const isMobile = ref(false)
const qrCodeFirst = ref(false)
const stie = ref('77')
const rnd = ref('0.7164508668310778')

// 2. 监听路由 query 变化，动态同步到变量，同时保证类型安全与空值兜底
watch(
  () => route.query,
  (query) => {
    lang.value = (query.lang as string) || 'zh_cn'
    appName.value = (query.appName as string) || 'xianyu'
    appEntrance.value = (query.appEntrance as string) || 'web'
    styleType.value = (query.styleType as string) || 'vertical'
    bizParams.value = (query.bizParams as string) || ''
    notLoadSsoView.value = query.notLoadSsoView === 'true'
    notKeepLogin.value = query.notKeepLogin === 'true'
    isMobile.value = query.isMobile === 'true'
    qrCodeFirst.value = query.qrCodeFirst === 'true'
    stie.value = (query.stie as string) || '77'
    rnd.value = (query.rnd as string) || '0.7164508668310778'
  },
  { immediate: true, deep: true }
)

// 异步按需加载不同形态的登录组件
const StandardLogin = defineAsyncComponent(() => import('./StandardLogin.vue'))
const MiniLogin = defineAsyncComponent(() => import('./MiniLogin.vue'))
const MobileLogin = defineAsyncComponent(() => import('../../app/login/index.vue'))

// 动态路由/参数分发逻辑
const activeComponent = computed(() => {
  // 1. 如果指定为移动端，或者 isMobile 参数为 true
  if (isMobile.value) {
    return MobileLogin
  }
  
  // 2. 如果是 mini 登录来源、或者是显式指定了横/纵向迷你版 styleType 或者是嵌入式 appName 登录
  if (
    route.query.from === 'mini' || 
    styleType.value === 'vertical' || 
    styleType.value === 'horizontal' ||
    route.path.includes('mini')
  ) {
    return MiniLogin
  }
  
  // 3. 默认桌面版标准 SSO 登录
  return StandardLogin
})
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
