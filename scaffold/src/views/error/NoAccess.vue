<script setup lang="ts">
/**
 * 无访问权限（登录了但缺权限码）
 *
 * @author yijiu2025
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useRenderDevice } from '@/views/device/useRenderDevice';
import { ThemeView } from 'skinsuite/vue';
import type { NoAccessViewContext } from '@/theme/views/no-access';

const router = useRouter();
const route = useRoute();

/** 被拦下的页面名（守卫带过来的 `?page=`），用于把提示说得具体一点 */
const pageLabel = computed(() => {
  const raw = route.query.page;
  return typeof raw === 'string' ? raw : '';
});

/** 当前渲染设备（版式目录按设备查；本页只靠 CSS 适配） */
const device = useRenderDevice();

/** 回工作台：本页唯一的出口 */
function goDashboard(): void {
  void router.replace('/dashboard');
}

/**
 * 版式上下文
 *
 * 字段分两类：容器算好的结论（`*` 布尔、格式化后的文案）与容器持有的状态/动作。
 * 版式只读它们，不再自己判权限、不再自己取数。
 */
const ctx: NoAccessViewContext = {
  goDashboard,
  pageLabel
};
</script>

<template>
  <!-- 页面长什么样在主题包里（`themes/<包>/<设备>/no-access/`），容器只准备 ctx -->
  <ThemeView page="no-access" :device="device" :ctx="ctx" scope="inherit" />
</template>
