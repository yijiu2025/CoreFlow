<script setup lang="ts">
/**
 * 珍珠玻璃 · 无访问权限版式
 *
 * 一句话 + 一个出口。文案与出口都在容器（`views/error/NoAccess.vue`），
 * 这里只管把它摆好看。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { ShieldAlert } from 'lucide-vue-next';
import type { NoAccessViewContext } from '@/theme/views/no-access';

const props = defineProps<{ ctx: NoAccessViewContext }>();

/*
 * 把 ctx 平铺回模板原来的名字 —— 搬迁前模板用的是这些名字，逐字保留就不用逐行改。
 * 解构出来的是**同一个 Ref**（不是快照），响应性与 `.value` 写法都不变。
 */
const {
  goDashboard,
  pageLabel
} = props.ctx;
</script>

<template>
  <div class="empty" style="padding: 80px 16px">
    <ShieldAlert :size="28" />
    <strong>{{ pageLabel ? `没有访问「${pageLabel}」的权限` : '没有访问该页面的权限' }}</strong>
    <span>当前账号缺少所需权限码，请联系管理员在「角色管理」里授权。</span>
    <button class="btn btn--sm" type="button" style="margin-top: 8px" @click="goDashboard">返回工作台</button>
  </div>
</template>

