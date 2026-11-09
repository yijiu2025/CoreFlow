<script setup lang="ts">
/**
 * 404
 *
 * @author yijiu2025
 */
import { useRouter } from 'vue-router';
import { Compass } from 'lucide-vue-next';

const router = useRouter();
</script>

<template>
  <div class="empty" style="padding: 100px 16px; min-height: 100vh">
    <Compass :size="28" />
    <strong>页面不存在</strong>
    <span>地址可能已变更，或该页面尚未交付。</span>
    <button class="btn btn--sm" type="button" style="margin-top: 8px" @click="router.replace('/dashboard')">返回工作台</button>
  </div>
</template>
