<script setup lang="ts">
/**
 * 角色选择器（按应用分组）
 *
 * 为什么要有这个组件：用户编辑与批量授权两处都要选角色，原先各写一份平铺 chips ——
 * 一屏几十个角色混在一起，`admin_*` 和 `fw_*` 交错，选错是必然的。这里由**一个**
 * 组件负责分组、排序、越权置灰，两处共用，样式与语义不会各走各的。
 *
 * === 分组口径 ===
 * 按 `role.app_id` 分组，组标题用后端给的 `app_label`（应用名由后端解析，前端不维护
 * 第二份映射表）。`GLOBAL` 是公共角色，固定排最前，不与应用混在一起。
 *
 * === 越权项 ===
 * `manageable === false` 的角色（不在操作者应用域内、或职级不低于他）**可见但不可改**：
 * 直接藏掉会让人以为"这个用户没有那个角色"，反而更危险。勾选框禁用 + 说明文字。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { computed } from 'vue';
import type { RoleOption } from '@/api/types';

const props = defineProps<{
  /** 当前选中的角色 ID */
  modelValue: number[];
  /** 可选角色（含 app_label / manageable） */
  roles: RoleOption[];
}>();

const emit = defineEmits<{ (e: 'update:modelValue', value: number[]): void }>();

/** 一组角色 */
interface RoleGroup {
  appId: string;
  label: string;
  roles: RoleOption[];
  /** 组内可管理的数量（0 = 整组锁死） */
  manageable: number;
}

/**
 * 分组（GLOBAL 置顶，其余按应用名排序）
 *
 * 组内按职级降序：高权限角色在上，符合"先看重要的"的阅读顺序。
 */
const groups = computed<RoleGroup[]>(() => {
  const buckets = new Map<string, RoleOption[]>();
  for (const role of props.roles) {
    const key = role.app_id || 'GLOBAL';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(role);
  }
  return [...buckets.entries()]
    .map(([appId, list]) => ({
      appId,
      label: list[0]?.app_label || (appId === 'GLOBAL' ? '全局' : appId),
      roles: [...list].sort((a, b) => b.rank_level - a.rank_level || a.id - b.id),
      manageable: list.filter(r => r.manageable !== false).length
    }))
    .sort((a, b) => {
      if (a.appId === 'GLOBAL') return -1;
      if (b.appId === 'GLOBAL') return 1;
      return a.label.localeCompare(b.label, 'zh-CN');
    });
});

/** 已选数量（含不可管理的已选中项） */
const pickedCount = computed(() => props.modelValue.length);

/** 不可管理的已选数量：保存时不会提交，需要明确告诉用户 */
const lockedCount = computed(() =>
  props.roles.filter(role => role.manageable === false && props.modelValue.includes(role.id)).length
);

/**
 * 勾选 / 取消
 *
 * @param id 角色 ID
 */
function toggle(id: number): void {
  const next = new Set(props.modelValue);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  emit('update:modelValue', [...next]);
}

/**
 * 组内全选 / 清空（只作用于**可管理**的角色）
 *
 * @param group 分组
 */
function toggleGroup(group: RoleGroup): void {
  const ids = group.roles.filter(r => r.manageable !== false).map(r => r.id);
  const allPicked = ids.every(id => props.modelValue.includes(id));
  const next = new Set(props.modelValue);
  for (const id of ids) {
    if (allPicked) next.delete(id);
    else next.add(id);
  }
  emit('update:modelValue', [...next]);
}
</script>

<template>
  <div class="role-picker">
    <p v-if="roles.length === 0" class="role-picker__empty">暂无可分配角色</p>

    <section v-for="group in groups" :key="group.appId" class="role-group">
      <header class="role-group__head">
        <span class="role-group__label">{{ group.label }}</span>
        <span class="role-group__count mono">{{ group.roles.length }}</span>
        <span v-if="group.manageable === 0" class="tag tag--off" title="该应用的角色不在你的管理范围内">只读</span>
        <button
          v-else
          class="role-group__all"
          type="button"
          :disabled="group.manageable === 0"
          @click="toggleGroup(group)"
        >
          全选 / 清空
        </button>
      </header>

      <div class="role-grid">
        <label
          v-for="role in group.roles"
          :key="role.id"
          :class="['role-item', { 'is-locked': role.manageable === false }]"
          :title="role.manageable === false ? '不在你的管理范围（应用域或职级限制）' : `${role.code} · 职级 ${role.rank_level}`"
        >
          <input
            type="checkbox"
            :checked="modelValue.includes(role.id)"
            :disabled="role.manageable === false"
            @change="toggle(role.id)"
          />
          <span class="role-item__name">{{ role.name }}</span>
          <span class="role-item__rank mono">{{ role.rank_level }}</span>
        </label>
      </div>
    </section>

    <p class="role-picker__foot">
      已选 <b>{{ pickedCount }}</b> 个
      <span v-if="lockedCount > 0" class="role-picker__locked">
        · 其中 {{ lockedCount }} 个不在你的管理范围，保存时不会变更
      </span>
    </p>
  </div>
</template>

<style scoped>
.role-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.role-picker__empty {
  margin: 0;
  font-size: 12px;
  color: var(--mauth-text-faint);
}

.role-group {
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  overflow: hidden;
}

.role-group__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--mauth-surface-2);
  border-bottom: 1px solid var(--mauth-border);
}

.role-group__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--mauth-text);
}

.role-group__count {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.role-group__all {
  margin-left: auto;
  padding: 2px 6px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--mauth-text-soft);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.role-group__all:hover {
  color: var(--mauth-primary);
  background: var(--mauth-hover);
}

/* 网格对齐：列宽一致，角色名长短不一也不会参差 */
.role-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 2px 8px;
  padding: 8px 10px;
}

.role-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  border-radius: 6px;
  font-size: 12.5px;
  cursor: pointer;
}

.role-item:hover {
  background: var(--mauth-hover);
}

.role-item.is-locked {
  color: var(--mauth-text-faint);
  cursor: not-allowed;
}

.role-item.is-locked:hover {
  background: none;
}

.role-item__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-item__rank {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

.role-picker__foot {
  margin: 0;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.role-picker__locked {
  color: var(--mauth-danger);
}
</style>
