<script setup lang="ts">
/**
 * 权限矩阵：行 = 菜单树（目录可折叠），列 = 角色
 *
 * 交互约定（与参考项目一致）：
 * - 悬停格子时十字高亮整行整列；点格子切换授权
 * - 勾选子项会连带勾上祖先（菜单可见需要父级）；点目录/菜单行整枝开关
 * - 内置角色列只读；有改动时底部升起「未保存 N 项」浮条，一次提交
 *
 * 🔴 这里管的是 **菜单可见性**（sys_role_menu），不是接口权限码（PBAC policy）。
 *    两套语义在界面上必须分开展示，否则运维会以为勾了菜单就放开了接口。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { computed, nextTick, ref, watch } from 'vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { floatBarEnter, floatBarLeave, revealRows } from '@/composables/motion';
import type { MenuNode } from '@/api/types';

/** 矩阵列（角色）需要的字段 */
export interface MatrixRole {
  id: number;
  name: string;
  builtin?: boolean;
  status?: number;
}

const props = defineProps<{
  menus: MenuNode[];
  roles: MatrixRole[];
  /** roleId → 已授权菜单 ID 数组 */
  grants: Record<number, number[]>;
  editable: boolean;
  saving?: boolean;
}>();

const emit = defineEmits<{ (e: 'save', changes: Array<{ roleId: number; menuIds: number[] }>): void }>();

const draft = ref<Record<number, Set<number>>>({});
const collapsed = ref<Set<number>>(new Set());
const hoverRow = ref<number | null>(null);
const hoverCol = ref<number | null>(null);
const body = ref<HTMLElement | null>(null);

watch(
  () => props.grants,
  grants => {
    const next: Record<number, Set<number>> = {};
    props.roles.forEach(r => {
      next[r.id] = new Set(grants[r.id] ?? []);
    });
    draft.value = next;
  },
  { immediate: true }
);

/** 菜单树展平后的行：记录父子关系，供级联与折叠 */
interface Row {
  menu: MenuNode;
  depth: number;
  parents: number[];
  descendants: number[];
}

const index = computed(() => {
  const rows: Row[] = [];
  const walk = (nodes: MenuNode[], depth: number, parents: number[]): number[] => {
    const ids: number[] = [];
    nodes.forEach(menu => {
      const row: Row = { menu, depth, parents, descendants: [] };
      rows.push(row);
      row.descendants = walk(menu.children ?? [], depth + 1, [...parents, menu.id]);
      ids.push(menu.id, ...row.descendants);
    });
    return ids;
  };
  walk(props.menus, 0, []);
  return rows;
});

const visibleRows = computed(() => index.value.filter(r => !r.parents.some(id => collapsed.value.has(id))));

/**
 * 单元格状态
 *
 * @param roleId 角色 ID
 * @param row 菜单行
 * @returns on 全选 / partial 部分 / off 未选
 */
function state(roleId: number, row: Row): 'on' | 'off' | 'partial' {
  const set = draft.value[roleId];
  if (!set) return 'off';
  if (!row.descendants.length) return set.has(row.menu.id) ? 'on' : 'off';
  const onCount = row.descendants.filter(id => set.has(id)).length;
  if (set.has(row.menu.id) && onCount === row.descendants.length) return 'on';
  return set.has(row.menu.id) || onCount ? 'partial' : 'off';
}

/**
 * 切换一格（含级联：选中带祖先，取消带整枝）
 *
 * @param role 角色
 * @param row 菜单行
 */
function toggle(role: MatrixRole, row: Row): void {
  if (!props.editable || role.builtin) return;
  const set = new Set(draft.value[role.id] ?? []);
  const current = state(role.id, row);
  const ids = [row.menu.id, ...row.descendants];
  if (current === 'on') {
    ids.forEach(id => set.delete(id));
  } else {
    ids.forEach(id => set.add(id));
    row.parents.forEach(id => set.add(id));
  }
  draft.value = { ...draft.value, [role.id]: set };
}

/**
 * 折叠 / 展开目录行
 *
 * @param id 菜单 ID
 */
function toggleCollapse(id: number): void {
  const next = new Set(collapsed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed.value = next;
}

/** 改动：按角色与原始授权做差集 */
const changes = computed(() =>
  props.roles
    .filter(r => !r.builtin)
    .map(r => {
      const before = new Set(props.grants[r.id] ?? []);
      const after = draft.value[r.id] ?? new Set<number>();
      let diff = 0;
      after.forEach(id => {
        if (!before.has(id)) diff += 1;
      });
      before.forEach(id => {
        if (!after.has(id)) diff += 1;
      });
      return { role: r, diff, menuIds: [...after] };
    })
    .filter(c => c.diff > 0)
);

const changeCount = computed(() => changes.value.reduce((a, c) => a + c.diff, 0));

/** 撤销全部改动 */
function reset(): void {
  const next: Record<number, Set<number>> = {};
  props.roles.forEach(r => {
    next[r.id] = new Set(props.grants[r.id] ?? []);
  });
  draft.value = next;
}

/** 提交改动（只提交有变化的角色） */
function save(): void {
  emit(
    'save',
    changes.value.map(c => ({ roleId: c.role.id, menuIds: c.menuIds }))
  );
}

const TYPE_LABEL: Record<string, string> = { dir: '目录', menu: '菜单', btn: '按钮' };

/**
 * 某角色已勾选数量
 *
 * @param roleId 角色 ID
 * @returns 数量
 */
const grantCount = (roleId: number): number => draft.value[roleId]?.size ?? 0;

watch(
  () => props.menus.length,
  async n => {
    if (!n) return;
    await nextTick();
    if (body.value) revealRows(body.value.querySelectorAll('.mx-row'));
  },
  { immediate: true }
);

defineExpose({ dirty: computed(() => changeCount.value > 0), reset });
</script>

<template>
  <div class="matrix" :style="{ '--mx-cols': roles.length }" @pointerleave="hoverRow = hoverCol = null">
    <div class="mx-scroll">
      <div class="mx-grid" role="grid" :aria-rowcount="visibleRows.length + 1" :aria-colcount="roles.length + 1">
        <div class="mx-head" role="row">
          <div class="mx-corner" role="columnheader">
            <span class="eyebrow">菜单 × 角色</span>
          </div>
          <div
            v-for="r in roles"
            :key="r.id"
            role="columnheader"
            :class="['mx-role', { 'is-hover': hoverCol === r.id, 'is-locked': r.builtin, 'is-off': r.status === 0 }]"
          >
            <span class="mx-role-name">{{ r.name }}</span>
            <span class="mx-role-meta tnum">{{ r.builtin ? '内置 · 只读' : `${grantCount(r.id)} 项` }}</span>
          </div>
        </div>
        <div ref="body" class="mx-body">
          <div
            v-for="row in visibleRows"
            :key="row.menu.id"
            role="row"
            :class="['mx-row', `is-${row.menu.type}`, { 'is-hover': hoverRow === row.menu.id }]"
          >
            <div class="mx-label" role="rowheader" :style="{ paddingLeft: `${14 + row.depth * 18}px` }">
              <button
                v-if="row.descendants.length"
                type="button"
                :class="['tree-toggle', { 'is-open': !collapsed.has(row.menu.id) }]"
                :aria-label="collapsed.has(row.menu.id) ? '展开' : '收起'"
                @click="toggleCollapse(row.menu.id)"
              >
                <AppIcon name="chevronRight" :size="14" />
              </button>
              <span v-else class="tree-toggle is-leaf" />
              <AppIcon v-if="row.menu.icon && row.menu.type !== 'btn'" :name="row.menu.icon" :size="15" class="mx-ico" />
              <span class="mx-name ellipsis">{{ row.menu.name }}</span>
              <span class="mx-type">{{ TYPE_LABEL[row.menu.type] }}</span>
            </div>
            <button
              v-for="r in roles"
              :key="r.id"
              type="button"
              role="gridcell"
              :class="['mx-cell', `is-${state(r.id, row)}`, { 'is-col-hover': hoverCol === r.id, 'is-locked': !editable || r.builtin }]"
              :aria-pressed="state(r.id, row) === 'on' ? 'true' : state(r.id, row) === 'partial' ? 'mixed' : 'false'"
              :aria-label="`${r.name} · ${row.menu.name}`"
              :disabled="!editable || r.builtin"
              @pointerenter="
                hoverRow = row.menu.id;
                hoverCol = r.id;
              "
              @focus="
                hoverRow = row.menu.id;
                hoverCol = r.id;
              "
              @click="toggle(r, row)"
            >
              <span class="mx-mark" aria-hidden="true"><AppIcon v-if="state(r.id, row) === 'on'" name="check" :size="12" /></span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <Transition :css="false" @enter="floatBarEnter" @leave="floatBarLeave">
        <div v-if="changeCount" class="float-bar" role="region" aria-label="未保存的权限变更">
          <span class="float-bar-count">未保存 <b class="tnum">{{ changeCount }}</b> 项 · {{ changes.length }} 个角色</span>
          <span class="float-bar-sep" aria-hidden="true" />
          <button class="btn btn--ghost btn--sm float-bar-clear" type="button" :disabled="saving" @click="reset">撤销</button>
          <button class="btn btn--primary btn--sm" type="button" :disabled="saving" @click="save">
            {{ saving ? '保存中…' : '保存变更' }}
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
