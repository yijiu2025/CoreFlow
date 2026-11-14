<script setup lang="ts">
/**
 * 只读标记
 *
 * 观察者进到管理页时看到的是一片「没有按钮」—— 不写原因，那画面会被当成加载失败
 * 或者权限出错。这里把「你缺这个写权限」直接标在页头，和那排消失的按钮一一对应。
 *
 * 🔴 判据是**写权限码**，不是"有没有按钮"：页面上的新增/编辑/删除各自挂同一个码，
 *    所以标记与按钮永远同时出现、同时消失，不会出现"标着只读却还能点"的错位。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { computed } from 'vue';
import { LockKeyhole } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';

const props = defineProps<{
  /** 该页的写权限码，如 `admin:menu:update`（与页面按钮上的 `v-if` 同一个码） */
  code: string;
  /** 页面名，用于提示文案（「只能查看菜单，不能修改」） */
  scope?: string;
}>();

const auth = useAuthStore();

/** 缺写权限即只读（读权限本身由路由守卫保证，这里不重复判） */
const readOnly = computed(() => !auth.hasPermission(props.code));
</script>

<template>
  <span
    v-if="readOnly"
    class="tag tag--info"
    :title="scope ? `当前账号只能查看${scope}，不能修改` : '当前账号只有查看权限，不能修改'"
  >
    <LockKeyhole :size="12" /> 只读
  </span>
</template>
