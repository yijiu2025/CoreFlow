<script setup lang="ts">
/**
 * 部门管理
 *
 * 上级链 ancestors 由后端维护，前端只传 parentId（不自行拼接）。
 * 有下级部门或仍有成员时，删除会被后端拒绝。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next';
import { createDept, deptTree, removeDept, updateDept } from '@/api/system';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

interface DeptNode {
  id: number;
  parent_id: number;
  ancestors: string;
  name: string;
  leader: string | null;
  phone: string | null;
  email: string | null;
  sort: number;
  status: number;
  user_count: number;
  children: DeptNode[];
}

const trees = ref<DeptNode[]>([]);
const loading = ref(false);
const errorMessage = ref('');
const toast = ref('');
const dialogOpen = ref(false);
const editingId = ref<number | null>(null);
const form = reactive({ parentId: 0, name: '', leader: '', phone: '', email: '', sort: 0, status: 1 });

const flat = computed(() => {
  const out: Array<{ node: DeptNode; depth: number }> = [];
  const walk = (nodes: DeptNode[], depth: number): void => {
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

/** 加载 */
async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    trees.value = (await deptTree()) as unknown as DeptNode[];
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

/** 打开新建 */
function openCreate(): void {
  editingId.value = null;
  Object.assign(form, { parentId: 0, name: '', leader: '', phone: '', email: '', sort: 0, status: 1 });
  dialogOpen.value = true;
}

/**
 * 打开编辑
 *
 * @param node 部门节点
 */
function openEdit(node: DeptNode): void {
  editingId.value = node.id;
  Object.assign(form, {
    parentId: node.parent_id,
    name: node.name,
    leader: node.leader || '',
    phone: node.phone || '',
    email: node.email || '',
    sort: node.sort,
    status: node.status
  });
  dialogOpen.value = true;
}

/** 保存 */
async function submit(): Promise<void> {
  if (!form.name.trim()) {
    notify('请填写部门名称');
    return;
  }
  try {
    if (editingId.value) {
      await updateDept(editingId.value, form);
      notify('已保存');
    } else {
      await createDept(form);
      notify('已创建');
    }
    dialogOpen.value = false;
    await load();
  } catch (err) {
    notify(err instanceof Error ? err.message : '保存失败');
  }
}

/**
 * 删除
 *
 * @param node 部门节点
 */
async function remove(node: DeptNode): Promise<void> {
  if (!window.confirm(`确认删除部门「${node.name}」？`)) return;
  try {
    await removeDept(node.id);
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
      <h2 class="page__title">部门管理</h2>
      <span class="page__sub">共 {{ flat.length }} 个部门</span>
    </div>

    <div class="toolbar">
      <button class="btn btn--sm" type="button" :disabled="loading" @click="load"><RefreshCw :size="15" /> 刷新</button>
      <span class="toolbar__spacer"></span>
      <button v-if="auth.hasPermission('admin:dept:create')" class="btn btn--primary btn--sm" type="button" @click="openCreate">
        <Plus :size="15" /> 新建部门
      </button>
    </div>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <section class="panel">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>名称</th>
              <th>负责人</th>
              <th>电话</th>
              <th>成员</th>
              <th>状态</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in flat" :key="item.node.id">
              <td :style="{ paddingLeft: `${16 + item.depth * 18}px` }">{{ item.node.name }}</td>
              <td>{{ item.node.leader || '—' }}</td>
              <td class="mono">{{ item.node.phone || '—' }}</td>
              <td class="mono">{{ item.node.user_count }}</td>
              <td>
                <span class="tag" :class="item.node.status === 1 ? 'tag--ok' : 'tag--off'">
                  {{ item.node.status === 1 ? '启用' : '停用' }}
                </span>
              </td>
              <td class="col-actions">
                <button v-if="auth.hasPermission('admin:dept:update')" class="btn btn--ghost btn--sm" type="button" @click="openEdit(item.node)">
                  <Pencil :size="14" /> 编辑
                </button>
                <button v-if="auth.hasPermission('admin:dept:delete')" class="btn btn--danger btn--sm" type="button" @click="remove(item.node)">
                  <Trash2 :size="14" /> 删除
                </button>
              </td>
            </tr>
            <tr v-if="!loading && flat.length === 0">
              <td colspan="6"><div class="empty">暂无部门</div></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div v-if="dialogOpen" class="modal-mask" @click.self="dialogOpen = false">
      <div class="modal">
        <header class="modal__head"><span class="modal__title">{{ editingId ? '编辑部门' : '新建部门' }}</span></header>
        <div class="modal__body">
          <label class="field">
            <span class="field__label">上级部门 ID（0 为根）</span>
            <input v-model.number="form.parentId" class="input" type="number" min="0" />
          </label>
          <label class="field">
            <span class="field__label">名称</span>
            <input v-model="form.name" class="input" maxlength="50" />
          </label>
          <label class="field">
            <span class="field__label">负责人</span>
            <input v-model="form.leader" class="input" maxlength="50" />
          </label>
          <label class="field">
            <span class="field__label">电话</span>
            <input v-model="form.phone" class="input" maxlength="20" />
          </label>
          <label class="field">
            <span class="field__label">邮箱</span>
            <input v-model="form.email" class="input" maxlength="100" />
          </label>
          <label class="field">
            <span class="field__label">排序</span>
            <input v-model.number="form.sort" class="input" type="number" min="0" />
          </label>
          <label class="field">
            <span class="field__label">状态</span>
            <select v-model.number="form.status" class="select">
              <option :value="1">启用</option>
              <option :value="0">停用</option>
            </select>
          </label>
        </div>
        <footer class="modal__foot">
          <button class="btn btn--ghost" type="button" @click="dialogOpen = false">取消</button>
          <button class="btn btn--primary" type="button" @click="submit">保存</button>
        </footer>
      </div>
    </div>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>
