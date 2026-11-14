<script setup lang="ts">
/**
 * 权限矩阵：行 = 菜单树（目录可折叠），列 = 角色
 *
 * 交互约定（与参考项目一致）：
 * - 悬停格子时十字高亮整行整列；点格子切换授权
 * - 勾选子项会连带勾上祖先（菜单可见需要父级）；点目录/菜单行整枝开关
 * - `menuLocked` 的角色（只有超级管理员）列恒为全选且不可点：它本来就该全有；
 *   `builtin` 只表示"由代码声明"，不再限制勾选 —— 菜单可见性是运行期数据
 * - 有改动时底部升起「未保存 N 项」浮条，一次提交
 * - 「菜单授权」与「角色权限码」对不上时（勾着却缺码 / 有码却没勾）**只用 hover 提示**
 *   说明这一格是空转的，不做红框、不做顶部横幅 —— 见 `mismatchOf` 的注释
 *
 * 🔴 这里管的是 **菜单可见性**（sys_role_menu），不是接口权限码（PBAC policy）。
 *    两套语义要分开摆，否则运维会以为勾了菜单就放开了接口。
 *
 *    "分开"不等于"无关"：按钮码要**两者都有**才成立 —— 前端 `hasPermission` 二级判定，
 *    后端 `checkPermission` 也会查这条菜单授权（见 `framework/.../button-grant.js`）。
 *    对不上时格子是"空转"的（勾了/没勾都不产生效果），信息放在 title 里，不喧哗。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { computed, nextTick, ref, watch } from 'vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { floatBarEnter, floatBarLeave, revealRows } from '@/composables/motion';
import { matchPermission } from '@/utils/permission';
import type { MenuNode } from '@/api/types';

/** 矩阵列（角色）需要的字段 */
export interface MatrixRole {
  id: number;
  name: string;
  /** 由代码声明（只影响列表里的"内置"标记，不再锁矩阵） */
  builtin?: boolean;
  /** 菜单授权锁定（超级管理员）：该列恒为全选、不可点 */
  menuLocked?: boolean;
  /**
   * 该角色 policy 里的权限码（`RoleRow.permissions`）
   *
   * 用来核对"这一格勾的菜单"与"角色到底有没有这个能力"是否一致：
   * 矩阵管的是**菜单可见性**（sys_role_menu），按钮能不能出现还要过 policy 那道闸，
   * 两处不齐时这一格是空转的 —— 悬停时说明原因（见 `mismatchOf`）。
   */
  codes?: string[];
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

const emit = defineEmits<{
  (e: 'save', changes: Array<{ roleId: number; menuIds: number[] }>): void;
  /** 点了"角色没有这个码"的格子：把原因抛给宿主去提示（矩阵自己不弹 toast） */
  (e: 'blocked', message: string): void;
}>();

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

/* ── 筛选：行太多时按名称 / 类型 / 应用缩小范围 ──────────────────
 *
 * 🔴 筛选必须保留**祖先链**：只留下命中的子节点，父级没了，树就是一排孤儿缩进，
 *    既看不出层级，也无法折叠。所以命中节点连同它的父级一起留下。
 *
 * 状态由**宿主**持有（`v-model:*`）：角色页把"视图切换 + 名称/编码 + 应用分档 +
 * 菜单筛选"压在同一行筛选条里，控件不能各在各的组件里各画一排。
 */
const keyword = defineModel<string>('keyword', { default: '' });
const typeFilter = defineModel<'' | MenuNode['type']>('typeFilter', { default: '' });

/** 是否有生效的筛选 */
const filtering = computed(() => keyword.value.trim() !== '' || typeFilter.value !== '');

/** 按筛选条件裁剪后的树（命中节点带**整枝**，祖先只作上下文） */
const filteredMenus = computed<MenuNode[]>(() => {
  if (!filtering.value) return props.menus;
  const kw = keyword.value.trim().toLowerCase();
  const matches = (node: MenuNode): boolean => {
    if (typeFilter.value && node.type !== typeFilter.value) return false;
    if (!kw) return true;
    return (
      node.name.toLowerCase().includes(kw) ||
      String(node.permission || '')
        .toLowerCase()
        .includes(kw)
    );
  };
  /**
   * 只按**类型**裁剪（不看关键词）
   *
   * 命中的节点要连子菜单一起带出来 —— 否则搜「系统管理」只剩一个目录行，
   * 它下面的页面/按钮全都消失，而授权恰恰是在这些子项上点的（用户实测：
   * "搜索没显示子菜单"）。但"带整枝"不能把类型筛选也绕过：筛「按钮」时
   * 仍然只应出现按钮。
   */
  const pruneByType = (nodes: MenuNode[]): MenuNode[] => {
    if (!typeFilter.value) return nodes;
    const out: MenuNode[] = [];
    for (const node of nodes) {
      const children = pruneByType(node.children ?? []);
      if (node.type === typeFilter.value || children.length > 0) out.push({ ...node, children });
    }
    return out;
  };
  const walk = (nodes: MenuNode[]): MenuNode[] => {
    const out: MenuNode[] = [];
    for (const node of nodes) {
      const hit = matches(node);
      // 命中 → 整枝带出（按类型裁剪）；未命中 → 只在子孙里有命中时保留作上下文
      const children = hit ? pruneByType(node.children ?? []) : walk(node.children ?? []);
      if (hit || children.length > 0) out.push({ ...node, children });
    }
    return out;
  };
  return walk(props.menus);
});

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
  walk(filteredMenus.value, 0, []);
  return rows;
});

/** 未筛选时的总行数（用于"显示 X / Y"） */
const totalRowCount = computed(() => {
  let count = 0;
  const walk = (nodes: MenuNode[]): void => {
    for (const node of nodes) {
      count += 1;
      walk(node.children ?? []);
    }
  };
  walk(props.menus);
  return count;
});

/**
 * 折叠之后真正可见的行
 *
 * 🔴 筛选期间**忽略折叠**：搜出来的结果如果落在之前折叠过的分支里，用户会看到
 *    "搜到了但下面一片空白"——和"搜索没显示子菜单"是同一个观感。筛选态一律展开。
 */
const visibleRows = computed(() =>
  filtering.value ? index.value : index.value.filter(r => !r.parents.some(id => collapsed.value.has(id)))
);

/** 锁定的角色（超管）：恒显示为全选，且不接受点击 */
const lockedIds = computed(() => new Set(props.roles.filter(r => r.menuLocked).map(r => r.id)));

/**
 * 角色 policy 里是否有这个权限码
 *
 * 走共享的 `matchPermission`（`utils/permission.ts`）—— 判据必须与运行期放行、
 * 与 `stores/auth.ts` 同一套，否则"矩阵允许勾选"和"按钮真的出现"会各说各的。
 *
 * @param role 角色
 * @param code 权限码（菜单节点上的 `permission`）
 * @returns 是否命中
 */
function policyHas(role: MatrixRole, code: string): boolean {
  return matchPermission(role.codes ?? [], code);
}

/** 是否具备核对条件（角色数据没带 policy 时说不了对错，就不拦） */
const canCheckPolicy = computed(() => props.roles.every(role => Array.isArray(role.codes)));

/** menuId → 该行的权限码（无码的行如目录不在表里） */
const codeByMenuId = computed(() => {
  const map = new Map<number, string>();
  for (const row of index.value) {
    if (row.menu.permission) map.set(row.menu.id, row.menu.permission);
  }
  return map;
});

/** roleId → 角色（`state` 要按角色判"有没有这个码"，只拿 id 不够） */
const roleById = computed(() => new Map(props.roles.map(role => [role.id, role])));

/**
 * 这一行对这个角色是否**没有能力**（有码但角色不带）
 *
 * 语义：菜单授权是开关，policy 是能力上限。关掉一个有的能力 → 立刻失效（这是开关）；
 * 打开一个没有的能力 → 什么都不会发生。后者不该被静默允许 —— 那个勾看着像"给了权限"，
 * 实际两边都没变，是矩阵里最容易骗人的格子。
 *
 * @param role 角色
 * @param menuId 菜单行 ID
 * @returns 缺的权限码；`''` 表示这一格可用
 */
function blockedCode(role: MatrixRole, menuId: number): string {
  const code = codeByMenuId.value.get(menuId);
  if (!code || !canCheckPolicy.value) return '';
  return policyHas(role, code) ? '' : code;
}

/**
 * 缺码时的完整提示
 *
 * 修法分两种，必须说清 —— 内置角色的码由代码声明，在角色编辑里根本改不了：
 * 自定义角色去「角色编辑 → 权限码」补；内置角色要去 app 的 roles.js 改并重启。
 *
 * @param role 角色
 * @param code 缺的权限码
 * @returns 提示文案
 */
function blockedMessage(role: MatrixRole, code: string): string {
  if (role.builtin) {
    return `「${role.name}」没有权限码 ${code}：内置角色的码由代码声明（src/app/*/permission/roles.js），改完重启后端，这个勾才会生效`;
  }
  return `「${role.name}」没有权限码 ${code}：先去「角色编辑 → 权限码」补上，这个勾才会生效`;
}

/**
 * 单元格提示文本（缺码时）
 *
 * @param role 角色
 * @param row 菜单行
 * @returns 提示；可用时不设，交给浏览器默认
 */
function blockedHint(role: MatrixRole, row: Row): string | undefined {
  const code = blockedCode(role, row.menu.id);
  return code ? blockedMessage(role, code) : undefined;
}

/**
 * 单元格状态
 *
 * 🔴 只反映**生效状态**：角色没有这个码的行，即使库里还存着旧授权，也一律显示未勾 ——
 *    那 21 个"勾着却没码"的格子就是这么消失的（数据留着，但不再骗人；等角色补上码，
 *    它才会真的亮起来）。
 *
 * @param roleId 角色 ID
 * @param row 菜单行
 * @returns on 全选 / partial 部分 / off 未选
 */
function state(roleId: number, row: Row): 'on' | 'off' | 'partial' {
  // 超管默认全有：它的权限是 `admin:*`，菜单不该（也不需要）靠勾选获得
  if (lockedIds.value.has(roleId)) return 'on';
  const role = roleById.value.get(roleId);
  if (!role) return 'off';
  // 自己没有这个码：勾了也不生效，显示为未勾且不接受勾选（点击给提示）
  if (blockedCode(role, row.menu.id)) return 'off';
  const set = draft.value[roleId];
  if (!set) return 'off';
  const kids = row.descendants.filter(id => !blockedCode(role, id));
  if (!kids.length) return set.has(row.menu.id) ? 'on' : 'off';
  const onCount = kids.filter(id => set.has(id)).length;
  if (set.has(row.menu.id) && onCount === kids.length) return 'on';
  return set.has(row.menu.id) || onCount ? 'partial' : 'off';
}

/**
 * 切换一格（含级联：选中带祖先，取消带整枝）
 *
 * 没能力的格子不参与：点它只弹提示（去哪补码），不写授权 —— 否则又会造出
 * "勾了但什么都没发生"的格子。
 *
 * @param role 角色
 * @param row 菜单行
 */
function toggle(role: MatrixRole, row: Row): void {
  if (!props.editable || role.menuLocked) return;
  const blocked = blockedCode(role, row.menu.id);
  if (blocked) {
    emit('blocked', blockedMessage(role, blocked));
    return;
  }
  const set = new Set(draft.value[role.id] ?? []);
  const current = state(role.id, row);
  // 级联时跳过角色没有码的子孙：勾了也不生效，顺手别写进授权表
  const ids = [row.menu.id, ...row.descendants].filter(id => !blockedCode(role, id));
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

/** 改动：按角色与原始授权做差集（锁定列不参与，避免"改了超管却保存不上去"） */
const changes = computed(() =>
  props.roles
    .filter(r => !r.menuLocked)
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
 * 某角色**生效中**的授权数量
 *
 * 只数"这个角色有码"的节点：库里可能还留着没有码的旧授权（渲染时按未勾处理），
 * 把它们算进来会让列头写着「22 项」而图上一个勾都看不见。
 *
 * @param roleId 角色 ID
 * @returns 数量
 */
const grantCount = (roleId: number): number => {
  const role = roleById.value.get(roleId);
  const set = draft.value[roleId];
  if (!role || !set) return 0;
  let count = 0;
  set.forEach(id => {
    if (!blockedCode(role, id)) count += 1;
  });
  return count;
};

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
    <!-- 筛选控件在宿主页的筛选条里（与视图切换、角色搜索同一行），这里不再重复一排 -->
    <div v-if="index.length === 0" class="mx-empty">当前筛选下没有菜单，清空筛选条件或换个关键词。</div>
    <div class="mx-scroll">
      <div class="mx-grid" role="grid" :aria-rowcount="visibleRows.length + 1" :aria-colcount="roles.length + 1">
        <div class="mx-head" role="row">
          <div class="mx-corner" role="columnheader">
            <span class="eyebrow">菜单 × 角色</span>
            <!-- 行数放在表头角落：它属于这张表，不该占筛选条那一行的宽度 -->
            <span class="mx-corner__count tnum">{{ index.length }}/{{ totalRowCount }}</span>
          </div>
          <div
            v-for="r in roles"
            :key="r.id"
            role="columnheader"
            :class="['mx-role', { 'is-hover': hoverCol === r.id, 'is-locked': r.menuLocked, 'is-off': r.status === 0 }]"
          >
            <span class="mx-role-name">{{ r.name }}</span>
            <span class="mx-role-meta tnum">{{
              r.menuLocked
                ? '全部 · 不可改'
                : r.builtin
                  ? editable
                    ? '内置 · 菜单可调'
                    : '内置'
                  : `${grantCount(r.id)} 项`
            }}</span>
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
              <AppIcon
                v-if="row.menu.icon && row.menu.type !== 'btn'"
                :name="row.menu.icon"
                :size="15"
                class="mx-ico"
              />
              <span class="mx-name ellipsis">{{ row.menu.name }}</span>
              <span class="mx-type">{{ TYPE_LABEL[row.menu.type] }}</span>
            </div>
            <button
              v-for="r in roles"
              :key="r.id"
              type="button"
              role="gridcell"
              :class="[
                'mx-cell',
                `is-${state(r.id, row)}`,
                {
                  'is-col-hover': hoverCol === r.id,
                  'is-locked': r.menuLocked,
                  'is-readonly': !editable
                }
              ]"
              :aria-pressed="state(r.id, row) === 'on' ? 'true' : state(r.id, row) === 'partial' ? 'mixed' : 'false'"
              :aria-label="`${r.name} · ${row.menu.name}`"
              :title="blockedHint(r, row)"
              :aria-disabled="blockedCode(r, row.menu.id) ? 'true' : undefined"
              :disabled="!editable || r.menuLocked"
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
              <span class="mx-mark" aria-hidden="true"
                ><AppIcon v-if="state(r.id, row) === 'on'" name="check" :size="12"
              /></span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <Transition :css="false" @enter="floatBarEnter" @leave="floatBarLeave">
        <div v-if="changeCount" class="float-bar" role="region" aria-label="未保存的权限变更">
          <span class="float-bar-count"
            >未保存 <b class="tnum">{{ changeCount }}</b> 项 · {{ changes.length }} 个角色</span
          >
          <span class="float-bar-sep" aria-hidden="true" />
          <button class="btn btn--ghost btn--sm float-bar-clear" type="button" :disabled="saving" @click="reset">
            撤销
          </button>
          <button class="btn btn--primary btn--sm" type="button" :disabled="saving" @click="save">
            {{ saving ? '保存中…' : '保存变更' }}
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/*
 * 锁定列（超管）恒为"全选且不可点"：勾标不能被 `.is-locked` 的 0.55 淡成"没有"，
 * 那会让人以为超管没权限。保持可读的 0.85，同时用 not-allowed 光标表达不可点。
 */
.mx-cell.is-locked.is-on .mx-mark {
  opacity: 0.85;
}

/*
 * 只读视角（观察者）：整张图只是给人看的，勾选状态必须原样可读。
 * 不做淡出 —— 淡成半透明读起来像"这些权限没有生效"，而它们确实生效着。
 */
.mx-cell.is-readonly .mx-mark {
  opacity: 1;
}

/*
 * 表头左上角：标签 + 行数上下排
 *
 * 全局 `.mx-corner` 是 flex-end 单行；这里加一行小字后改成纵向，否则会把第一列
 * 撑宽（第一列宽度就是菜单树缩进的基准）。
 */
.mx-corner {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.mx-corner__count {
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

/* 筛选条在宿主页（见 `Roles.vue` 的 `.filterbar`），这里只保留"筛空"的提示 */
.mx-empty {
  padding: 22px 12px;
  text-align: center;
  font-size: 12.5px;
  color: var(--mauth-text-soft);
  border: 1px dashed var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
}
</style>
