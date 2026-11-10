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
import { computed, onMounted, reactive, ref } from 'vue';
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
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

/** 权限码目录项（`GET /permissions/catalog` 的返回形状） */
interface PermItem {
  domain: string;
  domainName: string;
  code: string;
  label: string;
}

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

onMounted(load);
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">角色管理</h2>
      <span class="page__sub">共 {{ total }} 个角色 · 权限码决定接口放行，菜单只决定侧栏可见</span>
    </div>

    <div class="toolbar">
      <input v-model="keyword" class="input" style="width: 220px" placeholder="名称 / 编码" @keyup.enter="load" />
      <button class="btn btn--sm" type="button" :disabled="loading" @click="load"><RefreshCw :size="15" /> 刷新</button>
      <button v-if="auth.hasPermission('admin:role:create')" class="btn btn--primary btn--sm" type="button" @click="openCreate">
        <Plus :size="15" /> 新建角色
      </button>
    </div>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <section class="panel">
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
            <tr v-for="row in rows" :key="row.id">
              <td>
                {{ row.name }}
                <span v-if="row.builtin" class="tag tag--info" style="margin-left: 6px">内置</span>
              </td>
              <td class="mono">{{ row.code }}</td>
              <td>{{ row.app_id }}</td>
              <td class="mono">{{ row.rank_level }}</td>
              <td class="mono">{{ row.user_count }}</td>
              <td class="mono">{{ row.permissions.length }}</td>
              <td class="mono">{{ row.menu_ids.length }}</td>
              <td class="col-actions">
                <button
                  v-if="auth.hasPermission('admin:role:update')"
                  class="btn btn--ghost btn--sm"
                  type="button"
                  @click="openFormEdit(row)"
                >
                  <Pencil :size="14" /> 编辑
                </button>
                <button class="btn btn--ghost btn--sm" type="button" @click="openMenus(row)"><KeyRound :size="14" /> 授权</button>
                <button
                  v-if="!row.builtin && auth.hasPermission('admin:role:delete')"
                  class="btn btn--danger btn--sm"
                  type="button"
                  @click="remove(row)"
                >
                  <Trash2 :size="14" /> 删除
                </button>
              </td>
            </tr>
            <tr v-if="!loading && rows.length === 0">
              <td colspan="8"><div class="empty">暂无角色</div></td>
            </tr>
          </tbody>
        </table>
      </div>
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
  border-radius: var(--r-sm);
  background: var(--mauth-surface-2);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--r-xs);
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
  border-radius: var(--r-sm);
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
  border-radius: var(--r-xs);
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
</style>
