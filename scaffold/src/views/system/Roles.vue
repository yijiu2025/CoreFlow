<script setup lang="ts">
/**
 * 角色管理
 *
 * 角色是 PBAC 语义：编码 + 应用 + 职级 + 权限码（policy）+ 菜单授权。
 * 本页负责三件事：**角色 CRUD（含权限码编辑）**、**菜单授权**、删除。
 *
 * 🔴 两套授权语义不要混：
 *    - 权限码（policy）= 接口放行的依据，由 `requirePermission` 消费；
 *    - 菜单授权（sys_role_menu）= 只决定侧栏可见性，不影响接口判定。
 *
 * 🔴 内置角色（含 superadmin）：不可删除、不可改菜单授权、**不可改权限码**。
 *    最后一条是防自锁 —— 把 superadmin 的 `admin:*` 删掉，保存瞬间自己就进不去后台，
 *    且没有别的账号能救（只能直连 DB）。后端同样拒绝（403 BUILTIN_PROTECTED），
 *    前端这里只是提前把输入框禁掉，避免"填了半天点保存才被拒"。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, defineAsyncComponent, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { KeyRound, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next';
import {
  createRole,
  listRoles,
  menuTree,
  permissionCatalog,
  removeRole,
  roleMenus,
  saveRoleMenus,
  updateRole
} from '@/api/system';
import type { MenuNode, RoleRow } from '@/api/types';
import type { MatrixRole } from '@/components/business/PermissionMatrix.vue';

const route = useRoute();

/**
 * 矩阵组件异步加载
 *
 * 它连带 gsap（约 70KB）——角色页首屏是列表，不该为「可能不点的一档视图」付这个体积。
 * 类型仍从原文件 import（`import type` 不产生运行时代码）。
 */
const PermissionMatrix = defineAsyncComponent(() => import('@/components/business/PermissionMatrix.vue'));

/**
 * 溯源视图同样异步：它连带 Canvas 舞台与 gsap，只在切到该档时下载。
 */
const PermissionTrace = defineAsyncComponent(() => import('@/components/business/PermissionTrace.vue'));
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

/** 应用筛选：'' = 全部；否则是 app_id（`GLOBAL` 也是一档） */
const appFilter = ref('');

/** 应用显示名（后端下发 app_label，缺失时退回 GLOBAL → 全局） */
function appLabelOf(row: RoleRow): string {
  const key = row.app_id || 'GLOBAL';
  return row.app_label || (key === 'GLOBAL' ? '全局' : key);
}

/**
 * 应用筛选项（含各自角色数）
 *
 * 角色天生是"按应用分家"的（同一个 app 内编码唯一），平铺在一张表里时 `admin_*`
 * 和 `fw_*` 交错，找"防火墙有几个角色"要一行行数。所以先按应用分档。
 */
const appTabs = computed(() => {
  const counts = new Map<string, { label: string; count: number }>();
  for (const row of rows.value) {
    const key = row.app_id || 'GLOBAL';
    const hit = counts.get(key);
    if (hit) hit.count += 1;
    else counts.set(key, { label: appLabelOf(row), count: 1 });
  }
  return [...counts.entries()]
    .map(([id, item]) => ({ id, ...item }))
    .sort((a, b) => (a.id === 'GLOBAL' ? -1 : b.id === 'GLOBAL' ? 1 : a.label.localeCompare(b.label, 'zh-CN')));
});

/**
 * 按应用分组的可见角色
 *
 * 组内维持后端给的顺序（职级降序）—— 高权限角色始终在上面，不会因为分组被打乱。
 */
const roleGroups = computed(() => {
  const source = appFilter.value ? rows.value.filter(row => (row.app_id || 'GLOBAL') === appFilter.value) : rows.value;
  const buckets = new Map<string, { appId: string; label: string; rows: RoleRow[] }>();
  for (const row of source) {
    const key = row.app_id || 'GLOBAL';
    if (!buckets.has(key)) buckets.set(key, { appId: key, label: appLabelOf(row), rows: [] });
    buckets.get(key)!.rows.push(row);
  }
  return [...buckets.values()].sort((a, b) =>
    a.appId === 'GLOBAL' ? -1 : b.appId === 'GLOBAL' ? 1 : a.label.localeCompare(b.label, 'zh-CN')
  );
});

/** 权限码目录项（`GET /permissions/catalog` 的返回形状） */
interface PermItem {
  domain: string;
  domainName: string;
  code: string;
  label: string;
}

/**
 * 视图档位：列表 / 权限矩阵
 *
 * 矩阵读的是**同一份 rows**（列表接口已返回 menu_ids），所以切档不额外请求角色，
 * 只在首次进入矩阵时补一次菜单树。
 */
const altView = ref<'table' | 'matrix' | 'trace'>('table');

/**
 * 溯源视图的聚焦实体（`role:7` 这类）
 *
 * 星图 / 其他页跳过来时带 `?trace=role:<id>`，这里接住直接落到实体层，
 * 省掉用户自己再点两层的功夫。
 */
const traceFocus = ref<string | null>(null);
const matrixSaving = ref(false);

const rows = ref<RoleRow[]>([]);
const total = ref(0);
const loading = ref(false);
const errorMessage = ref('');
const toast = ref('');
const keyword = ref('');

/* ── 菜单授权弹窗 ───────────────────────────────────────────── */
const trees = ref<MenuNode[]>([]);
const dialogOpen = ref(false);
const activeRole = ref<RoleRow | null>(null);
const checked = ref<number[]>([]);
const saving = ref(false);

/* ── 角色表单弹窗（新建 / 编辑）─────────────────────────────── */
const formOpen = ref(false);
const formBuiltin = ref(false);
const formError = ref('');
const submitting = ref(false);
const form = reactive({
  id: 0,
  code: '',
  name: '',
  appId: 'GLOBAL',
  rankLevel: 1,
  description: '',
  permissions: [] as string[]
});

/* ── 权限码目录 ─────────────────────────────────────────────── */
const catalog = ref<PermItem[]>([]);
const catalogLoading = ref(false);
const permKeyword = ref('');

const isEditing = computed(() => form.id > 0);

/** 扁平化菜单树（带层级，便于缩进展示） */
const flatMenus = computed(() => {
  const out: Array<{ node: MenuNode; depth: number }> = [];
  const walk = (nodes: MenuNode[], depth: number): void => {
    for (const node of nodes) {
      out.push({ node, depth });
      if (node.children?.length) walk(node.children, depth + 1);
    }
  };
  walk(trees.value, 0);
  return out;
});

/** 按关键词过滤后的权限码 */
const filteredCatalog = computed(() => {
  const kw = permKeyword.value.trim().toLowerCase();
  if (!kw) return catalog.value;
  return catalog.value.filter(
    p => p.code.toLowerCase().includes(kw) || (p.label || '').toLowerCase().includes(kw)
  );
});

/** 权限码按 domain 分组（保持后端返回顺序，不在前端排序 —— 顺序本身是设计） */
const catalogGroups = computed(() => {
  const map = new Map<string, { domain: string; domainName: string; items: PermItem[] }>();
  for (const item of filteredCatalog.value) {
    const key = item.domain || 'other';
    let group = map.get(key);
    if (!group) {
      group = { domain: key, domainName: item.domainName || key, items: [] };
      map.set(key, group);
    }
    group.items.push(item);
  }
  return Array.from(map.values());
});

/**
 * 提示条
 *
 * @param message 文案
 */
function notify(message: string): void {
  toast.value = message;
  window.setTimeout(() => (toast.value = ''), 2600);
}

/** 加载角色列表 */
async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await listRoles({ pageNum: 1, pageSize: 100, keyword: keyword.value || undefined });
    rows.value = result.rows;
    total.value = result.total;
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

/** 矩阵列：角色（内置标记决定该列只读） */
const matrixRoles = computed<MatrixRole[]>(() =>
  // 只把「能改的」角色放进矩阵：矩阵是一键保存，把别家应用的角色也列进去只会
  // 让整次保存被后端拒绝（而用户以为自己只是改了自己应用的那几个）
  rows.value
    .filter(r => r.manageable !== false)
    .map(r => ({ id: r.id, name: r.name, builtin: r.builtin, status: 1 }))
);

/** 矩阵授权：roleId → menuIds，直接取列表接口返回的 menu_ids */
const matrixGrants = computed<Record<number, number[]>>(() => {
  const out: Record<number, number[]> = {};
  for (const r of rows.value) out[r.id] = r.menu_ids ?? [];
  return out;
});

/**
 * 提交矩阵改动
 *
 * 后端只有单角色授权接口，所以按角色并发提交；任一失败即整体报错
 * （已成功的不会回滚，但下次打开矩阵会读到真实状态，不会出现假成功）。
 *
 * @param changes 需要保存的角色与菜单集合
 */
async function saveMatrix(changes: Array<{ roleId: number; menuIds: number[] }>): Promise<void> {
  if (changes.length === 0) return;
  matrixSaving.value = true;
  try {
    await Promise.all(changes.map(c => saveRoleMenus(c.roleId, c.menuIds)));
    notify(`已保存 ${changes.length} 个角色的菜单授权`);
    await load();
  } catch (err) {
    notify(err instanceof Error ? err.message : '保存失败');
  } finally {
    matrixSaving.value = false;
  }
}

/** 进入矩阵前确保菜单树已加载 */
watch(altView, v => {
  if (v === 'matrix') void ensureTrees();
});

/** 懒加载权限码目录（首次打开表单才拉，135 条不算大但没必要每页都取） */
async function ensureCatalog(): Promise<void> {
  if (catalog.value.length > 0) return;
  catalogLoading.value = true;
  try {
    catalog.value = await permissionCatalog();
  } catch (err) {
    formError.value = err instanceof Error ? err.message : '权限码目录加载失败';
  } finally {
    catalogLoading.value = false;
  }
}

/**
 * 确保菜单树已加载（矩阵与授权弹窗共用）
 *
 * @returns 加载完成
 */
async function ensureTrees(): Promise<void> {
  if (trees.value.length > 0) return;
  try {
    trees.value = await menuTree();
  } catch (err) {
    notify(err instanceof Error ? err.message : '菜单树加载失败');
  }
}

/** 打开「新建角色」 */
function openCreate(): void {
  form.id = 0;
  form.code = '';
  form.name = '';
  form.appId = 'GLOBAL';
  form.rankLevel = 1;
  form.description = '';
  form.permissions = [];
  formBuiltin.value = false;
  formError.value = '';
  permKeyword.value = '';
  formOpen.value = true;
  void ensureCatalog();
}

/**
 * 打开「编辑角色」
 *
 * 权限码直接取 `row.permissions`（后端已从 policy 解出，是真实值），
 * 不要按菜单或名字反推 —— 那两处语义与 policy 无关。
 *
 * @param row 角色行
 */
function openFormEdit(row: RoleRow): void {
  form.id = row.id;
  form.code = row.code;
  form.name = row.name;
  form.appId = row.app_id;
  form.rankLevel = row.rank_level;
  form.description = row.description || '';
  form.permissions = [...row.permissions];
  formBuiltin.value = !!row.builtin;
  formError.value = '';
  permKeyword.value = '';
  formOpen.value = true;
  void ensureCatalog();
}

/**
 * 该组权限码是否已全选
 *
 * @param items 组内权限项
 * @returns 是否全选
 */
function allChecked(items: PermItem[]): boolean {
  return items.length > 0 && items.every(i => form.permissions.includes(i.code));
}

/**
 * 组内全选 / 清空
 *
 * @param items 组内权限项
 * @param on true=全选，false=清空
 */
function toggleGroup(items: PermItem[], on: boolean): void {
  const codes = items.map(i => i.code);
  if (on) {
    form.permissions = Array.from(new Set([...form.permissions, ...codes]));
  } else {
    form.permissions = form.permissions.filter(c => !codes.includes(c));
  }
}

/** 提交角色表单 */
async function submitForm(): Promise<void> {
  formError.value = '';
  if (!form.name.trim()) {
    formError.value = '请填写角色名称';
    return;
  }
  if (!isEditing.value && !form.code.trim()) {
    formError.value = '请填写角色编码';
    return;
  }
  submitting.value = true;
  try {
    if (isEditing.value) {
      await updateRole(form.id, {
        name: form.name,
        rankLevel: form.rankLevel,
        description: form.description,
        // 内置角色不提交 permissions：后端对内置角色明确拒绝改权限码，
        // 传了只会 403；不传则 name/职级仍可维护。
        ...(formBuiltin.value ? {} : { permissions: form.permissions })
      });
      notify('已保存');
    } else {
      await createRole({
        code: form.code.trim(),
        name: form.name,
        appId: form.appId.trim() || 'GLOBAL',
        rankLevel: form.rankLevel,
        description: form.description,
        permissions: form.permissions
      });
      notify('已创建');
    }
    formOpen.value = false;
    await load();
  } catch (err) {
    formError.value = err instanceof Error ? err.message : '保存失败';
  } finally {
    submitting.value = false;
  }
}

/**
 * 打开菜单授权
 *
 * @param row 角色行
 */
async function openMenus(row: RoleRow): Promise<void> {
  activeRole.value = row;
  dialogOpen.value = true;
  try {
    if (trees.value.length === 0) trees.value = await menuTree();
    const result = await roleMenus(row.id);
    checked.value = result.menuIds;
  } catch (err) {
    notify(err instanceof Error ? err.message : '读取授权失败');
  }
}

/** 保存菜单授权 */
async function submitMenus(): Promise<void> {
  if (!activeRole.value) return;
  saving.value = true;
  try {
    await saveRoleMenus(activeRole.value.id, checked.value);
    dialogOpen.value = false;
    notify('授权已保存');
    await load();
  } catch (err) {
    notify(err instanceof Error ? err.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

/**
 * 删除角色
 *
 * @param row 角色行
 */
async function remove(row: RoleRow): Promise<void> {
  if (!window.confirm(`确认删除角色「${row.name}」？`)) return;
  try {
    await removeRole(row.id);
    notify('已删除');
    await load();
  } catch (err) {
    notify(err instanceof Error ? err.message : '删除失败');
  }
}

onMounted(() => {
  const incoming = route.query.trace;
  if (typeof incoming === 'string' && /^(user|role|menu):\d+$/.test(incoming)) {
    altView.value = 'trace';
    traceFocus.value = incoming;
  }
  void load();
});
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">角色管理</h2>
      <span class="page__sub">共 {{ total }} 个角色 · 权限码决定接口放行，菜单只决定侧栏可见</span>
    </div>

    <div class="tabbar" role="tablist" aria-label="视图">
      <button type="button" role="tab" :aria-selected="altView === 'table'" :class="['tab', { 'is-on': altView === 'table' }]" @click="altView = 'table'">列表</button>
      <button type="button" role="tab" :aria-selected="altView === 'matrix'" :class="['tab', { 'is-on': altView === 'matrix' }]" @click="altView = 'matrix'">权限矩阵</button>
      <button type="button" role="tab" :aria-selected="altView === 'trace'" :class="['tab', { 'is-on': altView === 'trace' }]" @click="altView = 'trace'">授权溯源</button>
    </div>

    <div v-show="altView === 'table'" class="toolbar">
      <input v-model="keyword" class="input" style="width: 220px" placeholder="名称 / 编码" @keyup.enter="load" />
      <button class="btn btn--sm" type="button" :disabled="loading" @click="load"><RefreshCw :size="15" /> 刷新</button>
      <button v-if="auth.hasPermission('admin:role:create')" class="btn btn--primary btn--sm" type="button" @click="openCreate">
        <Plus :size="15" /> 新建角色
      </button>
    </div>

    <!-- 应用分档：角色是"按应用分家"的，先分档再找比逐行扫快得多 -->
    <div v-show="altView === 'table'" class="role-tabs" role="group" aria-label="按应用筛选">
      <button
        type="button"
        :class="['role-tab', { 'is-on': appFilter === '' }]"
        :aria-pressed="appFilter === ''"
        @click="appFilter = ''"
      >
        全部
        <span class="role-tab__count mono">{{ rows.length }}</span>
      </button>
      <button
        v-for="tab in appTabs"
        :key="tab.id"
        type="button"
        :class="['role-tab', { 'is-on': appFilter === tab.id }]"
        :aria-pressed="appFilter === tab.id"
        @click="appFilter = tab.id"
      >
        {{ tab.label }}
        <span class="role-tab__count mono">{{ tab.count }}</span>
      </button>
    </div>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <section v-if="altView === 'table'" class="panel">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>名称</th>
              <th>编码</th>
              <th>应用</th>
              <th>职级</th>
              <th>成员</th>
              <th>权限码</th>
              <th>菜单</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in roleGroups" :key="group.appId">
              <!-- 分组标题行：应用名 + 角色数，扫视时先定位"哪个应用" -->
              <tr class="role-group-row">
                <td colspan="8">
                  <span class="role-group-row__label">{{ group.label }}</span>
                  <span class="role-group-row__count mono">{{ group.rows.length }}</span>
                  <span class="role-group-row__hint">{{ group.appId }}</span>
                </td>
              </tr>
              <tr v-for="row in group.rows" :key="row.id">
                <td>
                  {{ row.name }}
                  <span v-if="row.builtin" class="tag tag--info" style="margin-left: 6px">内置</span>
                </td>
                <td class="mono">{{ row.code }}</td>
                <td>{{ row.app_label || row.app_id }}</td>
                <td class="mono">{{ row.rank_level }}</td>
                <td class="mono">{{ row.user_count }}</td>
                <td class="mono">{{ row.permissions.length }}</td>
                <td class="mono">{{ row.menu_ids.length }}</td>
                <td class="col-actions">
                  <button
                    v-if="auth.hasPermission('admin:role:update')"
                    class="btn btn--ghost btn--sm"
                    type="button"
                    :disabled="row.manageable === false"
                    :title="row.manageable === false ? '不在你的管理范围（应用域或职级限制）' : '编辑角色'"
                    @click="openFormEdit(row)"
                  >
                    <Pencil :size="14" /> 编辑
                  </button>
                  <button
                    class="btn btn--ghost btn--sm"
                    type="button"
                    :disabled="row.manageable === false"
                    :title="row.manageable === false ? '不在你的管理范围（应用域或职级限制）' : '菜单授权'"
                    @click="openMenus(row)"
                  >
                    <KeyRound :size="14" /> 授权
                  </button>
                  <button
                    v-if="!row.builtin && auth.hasPermission('admin:role:delete')"
                    class="btn btn--danger btn--sm"
                    type="button"
                    :disabled="row.manageable === false"
                    :title="row.manageable === false ? '不在你的管理范围（应用域或职级限制）' : '删除角色'"
                    @click="remove(row)"
                  >
                    <Trash2 :size="14" /> 删除
                  </button>
                </td>
              </tr>
            </template>
            <tr v-if="!loading && rows.length === 0">
              <td colspan="8"><div class="empty">暂无角色</div></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 权限矩阵：菜单 × 角色，勾选即菜单可见性（接口权限看权限码） -->
    <section v-if="altView === 'matrix'">
      <PermissionMatrix
        :menus="trees"
        :roles="matrixRoles"
        :grants="matrixGrants"
        :editable="auth.hasPermission('admin:role:update')"
        :saving="matrixSaving"
        @save="saveMatrix"
      />
    </section>

    <!-- 授权溯源：用户 → 角色 → 菜单 三层下钻（图谱舞台） -->
    <section v-if="altView === 'trace'">
      <PermissionTrace v-model:focus="traceFocus" />
    </section>

    <!-- 角色表单（新建 / 编辑，含权限码） -->
    <div v-if="formOpen" class="modal-mask" @click.self="formOpen = false">
      <div class="modal modal--wide">
        <header class="modal__head">
          <span class="modal__title">{{ isEditing ? `编辑角色 · ${form.name}` : '新建角色' }}</span>
        </header>
        <div class="modal__body">
          <label class="field">
            <span class="field__label">角色名称</span>
            <input v-model="form.name" class="input" maxlength="50" />
          </label>
          <label class="field">
            <span class="field__label">角色编码{{ isEditing ? '（不可修改）' : '' }}</span>
            <input v-model="form.code" class="input mono" :disabled="isEditing" maxlength="50" placeholder="如 ops_admin" />
          </label>
          <label class="field">
            <span class="field__label">所属应用{{ isEditing ? '（不可修改）' : '' }}</span>
            <input v-model="form.appId" class="input mono" :disabled="isEditing" maxlength="64" placeholder="GLOBAL = 全局" />
          </label>
          <label class="field">
            <span class="field__label">职级（0–99，不能高于你自己的最高职级）</span>
            <input v-model.number="form.rankLevel" class="input" type="number" min="0" max="99" />
          </label>
          <label class="field">
            <span class="field__label">说明</span>
            <input v-model="form.description" class="input" maxlength="255" />
          </label>

          <div class="field">
            <span class="field__label">
              权限码（接口放行依据）· 已选 <span class="mono">{{ form.permissions.length }}</span>
            </span>
            <p v-if="formBuiltin" class="form-hint">
              内置角色的权限码由代码声明，不可在此修改；名称、职级、说明仍可维护。
            </p>
            <input v-model="permKeyword" class="input" style="margin-bottom: 8px" placeholder="搜索权限码 / 名称" />
            <div class="perm-panel">
              <div v-if="catalogLoading" class="empty">权限码加载中…</div>
              <section v-for="group in catalogGroups" :key="group.domain" class="perm-group">
                <header class="perm-group__head">
                  <span class="perm-group__title">
                    {{ group.domainName }}
                    <span class="mono perm-group__count">{{ group.items.length }}</span>
                  </span>
                  <button
                    v-if="!formBuiltin"
                    class="btn btn--ghost btn--sm"
                    type="button"
                    @click="toggleGroup(group.items, !allChecked(group.items))"
                  >
                    {{ allChecked(group.items) ? '清空' : '全选' }}
                  </button>
                </header>
                <div class="perm-items">
                  <label
                    v-for="perm in group.items"
                    :key="perm.code"
                    class="perm-item"
                    :class="{ 'is-on': form.permissions.includes(perm.code), 'is-disabled': formBuiltin }"
                  >
                    <input v-model="form.permissions" type="checkbox" :value="perm.code" :disabled="formBuiltin" />
                    <span class="perm-item__label">{{ perm.label }}</span>
                    <code class="perm-item__code">{{ perm.code }}</code>
                  </label>
                </div>
              </section>
              <div v-if="!catalogLoading && catalogGroups.length === 0" class="empty">没有匹配的权限码</div>
            </div>
          </div>

          <p v-if="formError" class="tag tag--off">{{ formError }}</p>
        </div>
        <footer class="modal__foot">
          <button class="btn btn--ghost" type="button" @click="formOpen = false">取消</button>
          <button class="btn btn--primary" type="button" :disabled="submitting" @click="submitForm">
            {{ submitting ? '保存中…' : '保存' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- 菜单授权 -->
    <div v-if="dialogOpen" class="modal-mask" @click.self="dialogOpen = false">
      <div class="modal">
        <header class="modal__head">
          <span class="modal__title">菜单授权 · {{ activeRole?.name }}</span>
        </header>
        <div class="modal__body">
          <p class="field__label">勾选后该角色在侧栏能看到对应菜单；接口权限不由此决定。</p>
          <div class="menu-list">
            <label v-for="item in flatMenus" :key="item.node.id" class="menu-item" :style="{ paddingLeft: `${item.depth * 16}px` }">
              <input v-model="checked" type="checkbox" :value="item.node.id" />
              <span>{{ item.node.name }}</span>
              <span class="tag" style="margin-left: 6px">{{ item.node.type === 'dir' ? '目录' : item.node.type === 'btn' ? '按钮' : '页面' }}</span>
            </label>
            <div v-if="flatMenus.length === 0" class="empty">菜单树为空，请先在菜单管理里创建</div>
          </div>
        </div>
        <footer class="modal__foot">
          <button class="btn btn--ghost" type="button" @click="dialogOpen = false">取消</button>
          <button class="btn btn--primary" type="button" :disabled="saving" @click="submitMenus">
            {{ saving ? '保存中…' : '保存授权' }}
          </button>
        </footer>
      </div>
    </div>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.menu-list {
  max-height: 320px;
  overflow-y: auto;
  display: grid;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface-2);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--mauth-radius-xs);
  font-size: 13px;
  cursor: pointer;
}

.menu-item:hover {
  background: var(--mauth-hover);
}

/* 角色表单：权限码面板 */
.modal--wide {
  max-width: 720px;
}

.form-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--mauth-text-mid);
}

.perm-panel {
  max-height: 320px;
  overflow-y: auto;
  display: grid;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface-2);
}

.perm-group__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.perm-group__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--mauth-text-mid);
}

.perm-group__count {
  font-weight: 400;
  opacity: 0.7;
}

.perm-items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 4px;
}

.perm-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: var(--mauth-radius-xs);
  font-size: 12px;
  cursor: pointer;
  border: 1px solid transparent;
}

.perm-item:hover {
  background: var(--mauth-hover);
}

.perm-item.is-on {
  border-color: var(--mauth-primary);
  background: var(--mauth-primary-soft);
}

.perm-item.is-disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.perm-item__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.perm-item__code {
  font-family: var(--font-mono);
  font-size: 11px;
  opacity: 0.6;
  flex-shrink: 0;
}

/* ── 应用分档 ─────────────────────────────────────────────── */
.role-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 2px;
}

.role-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--mauth-border-strong);
  border-radius: 999px;
  background: var(--mauth-surface);
  color: var(--mauth-text-mid);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}

.role-tab:hover {
  color: var(--mauth-primary);
  border-color: var(--mauth-primary);
}

/* 选中态用主色描边而不是实心：分档是筛选器，不该抢表格的视觉重量 */
.role-tab.is-on {
  border-color: var(--mauth-primary);
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
}

.role-tab__count {
  padding: 0 5px;
  border-radius: 999px;
  background: var(--mauth-hover);
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.role-tab.is-on .role-tab__count {
  background: color-mix(in srgb, var(--mauth-primary) 14%, transparent);
  color: var(--mauth-primary);
}

/* 分组标题行：贴着表格走，比单独一张卡片更紧凑 */
.role-group-row td {
  padding: 6px 12px;
  background: var(--mauth-surface-2);
  border-bottom: 1px solid var(--mauth-border);
}

.role-group-row__label {
  font-size: 12px;
  font-weight: 620;
  color: var(--mauth-text);
}

.role-group-row__count {
  margin-left: 6px;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.role-group-row__hint {
  margin-left: 8px;
  font-size: 10.5px;
  color: var(--mauth-text-faint);
  opacity: 0.8;
}
</style>
