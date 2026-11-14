<script setup lang="ts">
/**
 * 珍珠玻璃 · 用户详情版式
 *
 * 版式本身几乎没有 DOM：详情内容与抽屉共用 `UserProfileDrawer`（`mode="page"`），
 * 这里只决定"参数非法时显示什么"。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import UserProfileDrawer from '@/components/business/UserProfileDrawer.vue';
import type { UserDetailViewContext } from '@/theme/views/user-detail';

const props = defineProps<{ ctx: UserDetailViewContext }>();

/*
 * 把 ctx 平铺回模板原来的名字 —— 搬迁前模板用的是这些名字，逐字保留就不用逐行改。
 * 解构出来的是**同一个 Ref**（不是快照），响应性与 `.value` 写法都不变。
 */
const {
  userId
} = props.ctx;
</script>

<template>
  <UserProfileDrawer v-if="userId !== null" :user-id="userId" mode="page" />
  <p v-else class="tag tag--off">用户编号无效，请从列表重新进入</p>
</template>

