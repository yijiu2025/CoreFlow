<script setup lang="ts">
/**
 * 珍珠玻璃 · 404 版式
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { Compass } from 'lucide-vue-next';
import type { NotFoundViewContext } from '@/theme/views/not-found';

const props = defineProps<{ ctx: NotFoundViewContext }>();

/*
 * 把 ctx 平铺回模板原来的名字 —— 搬迁前模板用的是这些名字，逐字保留就不用逐行改。
 * 解构出来的是**同一个 Ref**（不是快照），响应性与 `.value` 写法都不变。
 */
const {
  goDashboard
} = props.ctx;
</script>

<template>
  <div class="empty" style="padding: 100px 16px; min-height: 100vh">
    <Compass :size="28" />
    <strong>页面不存在</strong>
    <span>地址可能已变更，或该页面尚未交付。</span>
    <button class="btn btn--sm" type="button" style="margin-top: 8px" @click="goDashboard">返回工作台</button>
  </div>
</template>

