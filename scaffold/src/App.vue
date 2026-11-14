<script setup lang="ts">
/**
 * 应用根组件 —— 只负责路由器舞台 + 主题外壳
 *
 * 主题的一切（`.dark` 类、body 底色、调试面板）在 `ThemeRoot` 里；
 * 这里不出现任何主题判断逻辑，避免与状态机形成两套真相。
 *
 * @author yijiu2025
 */
import { nextTick, watch } from 'vue';
import { ThemeRoot } from 'skinsuite/vue';
import { useThemeStore } from '@/stores/theme';
import { useAccentStore } from '@/stores/accent';

/** <ThemeRoot> 的 props 类型（库未导出 ThemeStoreLike，从其 props 反推最稳妥） */
type ThemeRootProps = InstanceType<typeof ThemeRoot>['$props'];

/**
 * Pinia store → 库结构契约的一次类型适配
 *
 * `createThemeState` 返回的是 ref/computed，Pinia 包一层后对外**自动解包**成标量，
 * 运行时正是契约期望的形态；但 TS 推断出的是 store 的解包类型，与
 * `ThemeStoreLike` 的只读标量声明不完全一致（`packageId` 被推断成 ComputedRef）。
 * 这里只做类型桥接，不改运行时行为。
 */
const themeStore = useThemeStore() as unknown as ThemeRootProps['themeStore'];

/**
 * 主题色的写入时机
 *
 * 主题包把 `--mauth-*` 写成 `document.documentElement` 的 inline 变量，我们覆盖主色是
 * **同一层、后写者胜**。所以不能只在启动时写一次：换明暗或换主题包时，ThemeRoot 会整批
 * 重写，主色会被主题默认值顶回去。
 *
 * `flush: 'post'` 保证在 DOM 更新（也就是 ThemeRoot 写入变量）之后执行，再加一个
 * `nextTick` 兜住「子组件 onMounted 里才注入」的情况。
 */
const accentStore = useAccentStore();
watch(
  () => [themeStore.mode, themeStore.packageId].join('|'),
  async () => {
    await nextTick();
    accentStore.sync();
  },
  { immediate: true, flush: 'post' }
);
</script>

<template>
  <ThemeRoot :theme-store="themeStore">
    <router-view />
  </ThemeRoot>
</template>
