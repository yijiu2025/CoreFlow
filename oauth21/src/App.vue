<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useThemeStore } from '@/stores/theme';
import { useParentThemeSync } from '@/composables/useParentThemeSync';
import { fetchRemoteThemeConfig } from '@/theme/remote';

const themeStore = useThemeStore();
const route = useRoute();
// iframe 嵌入时监听父应用主题同步（父切主题子跟着切）
useParentThemeSync();

/**
 * 主题 / 版式调试面板（`?debug=theme` 触发，见组件内注释）
 *
 * 用 `defineAsyncComponent` 而不是静态 import：面板是排查工具，绝大多数访问用不到它，
 * 静态引入会把它连同内部的 Tailwind 类一起并进主包（实测构建产物里原本没有独立 chunk）。
 * 改成异步后，加载器只在**首次真正渲染**时执行 —— 不带参数时既不下载也不执行。
 *
 * 下层的 `v-if` 是「要不要加载」，组件内部的 `visible` 是「要不要渲染」：
 * 前者省流量，后者保证组件被别处复用时行为自洽。
 */
const ThemeDebugPanel = defineAsyncComponent(
  () => import('@/components/dev/ThemeDebugPanel.vue')
);

const showDebugPanel = computed(() => {
  const flag = route.query.debug;
  return (typeof flag === 'string' ? flag : '') === 'theme';
});

/**
 * 后端换配色配置
 *
 * 放在 onMounted 里而不是 setup 顶层：主题请求是网络 IO，不能挡住首屏渲染。
 * 未配置 VITE_THEME_ENDPOINT 时 fetchRemoteThemeConfig 直接返回 null、不发请求，
 * 所以这份代码在后端还没提供接口时完全无副作用。
 * 拉不到就用 SCSS 内置配色继续，绝不影响登录。
 */
onMounted(async () => {
  const clientId = new URLSearchParams(window.location.search).get('client_id') || undefined;
  const config = await fetchRemoteThemeConfig(clientId);
  if (config) themeStore.applyThemeConfig(config);
});
</script>

<template>
  <div :class="{ dark: themeStore.isDark }">
    <!--
      v2.21.0：body 容器 bg/text 改用 token 化（与组件 scoped token 同源）。
      之前用 Tailwind `bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50`，
      与 `--mauth-bg` / `--mauth-text` 双重轨道：选 black 主题时 Tailwind 给出 slate-950，
      token 给出 #000000，结果 body 背景仍是 slate-950 而不是纯黑 —— "选了黑但页面底不是黑的"。

      现在统一到 token：黑/白配色文件的 `--mauth-bg` / `--mauth-text` 完全决定底色和文字色。
      html.dark 类仍保留 —— Tailwind 的 `dark:bg-slate-xxx` 类（如 StandardForgot、MiniForgot 等）
      仍依赖这个开关，不能删。

      过渡（transition-colors duration-300）：保留 —— Tailwind dark 切换的瞬间仍可能抖动，
      300ms 让其平滑（与 oauth21 token 切换同步）。
    -->
    <div
      class="min-h-screen bg-mauth text-mauth font-sans"
      style="background-color: var(--mauth-bg); color: var(--mauth-text); transition: background-color 0.3s, color 0.3s;"
    >
      <!--
        路由级淡入淡出过渡（v2.20.1 修复手机端「立即注册/立即登录」切换闪屏）

        之前 `<router-view />` 裸渲染：路由切换瞬间旧组件 unmount + 新组件异步 chunk
        还没下载好 → body 背景透出（black 配色下闪黑），用户感知为「闪一下屏幕」。
        给 router-view 套 Transition，配合各 dispatcher 的预取（goRegister/goLogin
        在 push 前先 import 目标 dispatcher chunk），切换就是连贯淡入淡出。

        不在 view/web/login/index.vue 等分发器内层用 <Transition mode="out-in"> 包
        <component :is>：分发器自己要做窄/宽屏异步组件切换，out-in 与异步组件组合
        会导致 leave 后新组件不挂载（白屏）—— 已有注释保护这条不变量。
      -->
      <router-view v-slot="{ Component }">
        <!--
          默认模式（同时 enter/leave）而非 out-in：
            leave 阶段旧组件淡出，同时 enter 阶段新组件淡入 —— 两层透明度叠加，
            wrapper 始终可见，消除「leave 完成后 enter 起始的 ~40ms 黑屏」。
            out-in 模式下 chunk 加载有延迟时会出现一个全黑窗口，看着像「闪」。
            用默认模式后即使 enter 阶段被异步组件 chunk 加载阻塞，leave 也已经在进行，
            视觉上旧组件淡出后立刻能看到新组件淡入（即使 enter 起点稍晚）。
            dispatcher 子组件已 prefetch（见 view/web/<page>/index.vue 的 onMounted），
            实际 chunk 加载延迟 ≈ 0，正常路径看不到任何空白。
          .route-stage 用 absolute 让 leave/enter 重叠渲染（旧组件脱离文档流，
            新组件覆盖在原位），避免「默认模式」下两个组件在文档流里堆叠导致
            wrapper 高度跳动 / 滚动条突现。
        -->
        <Transition name="page">
          <div class="route-stage" :key="$route.fullPath">
            <component :is="Component" />
          </div>
        </Transition>
      </router-view>
    </div>
    <!--
      与上面的 min-h-screen 容器**平级**：避免被它的布局与层叠上下文影响（面板是 fixed 浮层）。
      放在 App 层而不是某个页面内，是为了任意页面（含电脑版）都能用。
    -->
    <ThemeDebugPanel v-if="showDebugPanel" />
  </div>
</template>

<style>
/* Global resets if needed */
body {
  margin: 0;
  padding: 0;
}

/* 路由级淡入淡出（v2.20.1）
 * - leave 180ms / enter 220ms（旧出慢、新进快 —— 让人感觉响应即时）
 * - 不用 out-in：用默认模式让 leave/enter 重叠，避免 chunk 加载延迟时出现黑屏窗口
 * - 6px 上移（新组件从下方滑入）：暗示「内容轮换」但不抢眼
 * - ease-out（enter 更急促，响应快）/ ease-in（leave 更轻柔，给旧组件收尾空间）
 *
 * .route-stage 让 leave 期间旧组件绝对定位脱离文档流，与新组件重叠渲染 —
 * — 不影响父容器 .min-h-screen 的高度，也不会让两个组件堆叠导致页面跳动。
 * route-stage 的父容器（router-view）已 min-h-screen 全屏，子元素 absolute inset:0
 * 自然撑满到父级尺寸。
 */
.route-stage {
  position: absolute;
  inset: 0;
  width: 100%;
}

.page-enter-active {
  transition: opacity 0.22s ease-out, transform 0.22s ease-out;
}
.page-leave-active {
  transition: opacity 0.18s ease-in, transform 0.18s ease-in;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
