<script setup lang="ts">
/**
 * 用户详情页（手机端的「进新页面看完整信息」）
 *
 * 桌面上这份内容是右侧抽屉（`UserProfileDrawer`）。手机上抽屉不合适：
 * 390px 宽里它盖住半屏、退出只能点遮罩，而且不在历史栈里 —— 返回键会直接跳出这个页面。
 *
 * 所以这里只做三件事：**读路由参数 → 把抽屉切成整页档 → 交出内容**。
 * 五个页签（概览 / 应用 / 权限 / 设备 / 记录）、设备会话与踢下线全部复用同一份实现，
 * 不在这里抄第二遍 —— 否则详情字段一改就得改两处，两处迟早会不一致。
 *
 * 返回由外壳负责（路由 `meta.stack` ⇒ 顶栏把汉堡换成返回箭头）。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useRenderDevice } from '@/views/device/useRenderDevice';
import { ThemeView } from 'skinsuite/vue';
import type { UserDetailViewContext } from '@/theme/views/user-detail';

const route = useRoute();
const device = useRenderDevice();

/**
 * 路由参数 → 用户 id
 *
 * 路径本身已被 `:id(\\d+)` 约束，但地址栏是可以手改的：非法值给 null，
 * 让组件走「空」分支，而不是拿 NaN 去打接口（那会变成 400，把页面报成红色错误）。
 *
 * @returns 正整数 id，非法时为 null
 */
const userId = computed<number | null>(() => {
  const id = Number(route.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
});

/**
 * 版式上下文
 *
 * 字段分两类：容器算好的结论（`*` 布尔、格式化后的文案）与容器持有的状态/动作。
 * 版式只读它们，不再自己判权限、不再自己取数。
 */
const ctx: UserDetailViewContext = {
  userId
};
</script>

<template>
  <!-- 页面长什么样在主题包里（`themes/<包>/<设备>/user-detail/`），容器只准备 ctx -->
  <ThemeView page="user-detail" :device="device" :ctx="ctx" />
</template>
