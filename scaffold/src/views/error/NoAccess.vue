<script setup lang="ts">
/**
 * 无访问权限（登录了但缺权限码）
 *
 * @author yijiu2025
 */
import { useRouter } from 'vue-router';
import { ShieldAlert } from 'lucide-vue-next';

const router = useRouter();
</script>

<template>
  <div class="empty" style="padding: 80px 16px">
    <ShieldAlert :size="28" />
    <strong>没有访问该页面的权限</strong>
    <span>当前账号缺少所需权限码，请联系管理员在「角色管理」里授权。</span>
    <button class="btn btn--sm" type="button" style="margin-top: 8px" @click="router.replace('/dashboard')">返回工作台</button>
  </div>
</template>
