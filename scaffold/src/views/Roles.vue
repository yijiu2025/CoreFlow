<script setup lang="ts">
/**
 * 角色管理
 *
 * 角色是 PBAC 语义：编码 + 应用 + 职级 + 权限码（policy）+ 菜单授权。
 * 本页只做「列表 + 菜单授权 + 删除」；权限码编辑在角色表单里（下一步接入）。
 *
 * 🔴 菜单授权只决定侧栏可见性；接口放行仍看 policy。内置角色（含 superadmin）
 *    不可删除、不可改菜单授权 —— 后端同样会拒绝，前端只是提前告知。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, onMounted, ref } from 'vue';
import { KeyRound, RefreshCw, Trash2 } from 'lucide-vue-next';
import { listRoles, menuTree, removeRole, roleMenus, saveRoleMenus } from '@/api/system';
import type { MenuNode, RoleRow } from '@/api/types';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

const rows = ref<RoleRow[]>([]);
const total = ref(0);
const loading = ref(false);
const errorMessage = ref('');
const toast = ref('');
const keyword = ref('');

const trees = ref<MenuNode[]>([]);
const dialogOpen = ref(false);
const activeRole = ref<RoleRow | null>(null);
const checked = ref<number[]>([]);
const saving = ref(false);

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
      <span class="page__sub">共 {{ total }} 个角色 · 菜单只决定可见性，接口放行看权限码</span>
    </div>

    <div class="toolbar">
      <input v-model="keyword" class="input" style="width: 220px" placeholder="名称 / 编码" @keyup.enter="load" />
      <button class="btn btn--sm" type="button" :disabled="loading" @click="load"><RefreshCw :size="15" /> 刷新</button>
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
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface-soft);
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
  background: var(--hover-bg);
}
</style>
