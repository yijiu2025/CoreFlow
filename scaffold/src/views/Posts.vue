<script setup lang="ts">
/**
 * 岗位管理
 *
 * 岗位编码唯一且创建后不建议修改（历史审计按编码回溯可读性依赖它）。
 * 有在岗成员时删除会被后端拒绝。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { onMounted, reactive, ref } from 'vue';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next';
import { createPost, listPosts, removePost, updatePost } from '@/api/system';
import { useListPage } from '@/composables/useListPage';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

interface PostRow {
  id: number;
  post_code: string;
  post_name: string;
  sort: number;
  status: number;
  remark: string | null;
  user_count: number;
}

const list = useListPage<PostRow>(query => listPosts<PostRow>(query), { keyword: '' });

const dialogOpen = ref(false);
const editingId = ref<number | null>(null);
const form = reactive({ postCode: '', postName: '', sort: 0, status: 1, remark: '' });
const toast = ref('');

/**
 * 提示条
 *
 * @param message 文案
 */
function notify(message: string): void {
  toast.value = message;
  window.setTimeout(() => (toast.value = ''), 2600);
}

/** 打开新建 */
function openCreate(): void {
  editingId.value = null;
  Object.assign(form, { postCode: '', postName: '', sort: 0, status: 1, remark: '' });
  dialogOpen.value = true;
}

/**
 * 打开编辑
 *
 * @param row 岗位行
 */
function openEdit(row: PostRow): void {
  editingId.value = row.id;
  Object.assign(form, {
    postCode: row.post_code,
    postName: row.post_name,
    sort: row.sort,
    status: row.status,
    remark: row.remark || ''
  });
  dialogOpen.value = true;
}

/** 保存 */
async function submit(): Promise<void> {
  if (!form.postCode.trim() || !form.postName.trim()) {
    notify('编码与名称都要填');
    return;
  }
  try {
    if (editingId.value) {
      await updatePost(editingId.value, { ...form });
      notify('已保存');
    } else {
      await createPost({ ...form });
      notify('已创建');
    }
    dialogOpen.value = false;
    await list.load();
  } catch (err) {
    notify(err instanceof Error ? err.message : '保存失败');
  }
}

/**
 * 删除岗位
 *
 * @param row 岗位行
 */
async function remove(row: PostRow): Promise<void> {
  if (!window.confirm(`确认删除岗位「${row.post_name}」？`)) return;
  try {
    await removePost(row.id);
    notify('已删除');
    await list.load();
  } catch (err) {
    notify(err instanceof Error ? err.message : '删除失败');
  }
}

onMounted(list.load);
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">岗位管理</h2>
      <span class="page__sub">共 {{ list.total.value }} 个岗位</span>
    </div>

    <div class="toolbar">
      <input v-model="list.query.keyword" class="input" style="width: 200px" placeholder="编码 / 名称" @keyup.enter="list.search" />
      <button class="btn btn--sm" type="button" @click="list.search">查询</button>
      <button class="btn btn--ghost btn--sm" type="button" :disabled="list.loading.value" @click="list.load">
        <RefreshCw :size="15" /> 刷新
      </button>
      <span class="toolbar__spacer"></span>
      <button v-if="auth.hasPermission('admin:post:create')" class="btn btn--primary btn--sm" type="button" @click="openCreate">
        <Plus :size="15" /> 新建岗位
      </button>
    </div>

    <p v-if="list.errorMessage.value" class="tag tag--off">{{ list.errorMessage.value }}</p>

    <section class="panel">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>名称</th>
              <th>编码</th>
              <th>在岗</th>
              <th>排序</th>
              <th>状态</th>
              <th>备注</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in list.rows.value" :key="row.id">
              <td>{{ row.post_name }}</td>
              <td class="mono">{{ row.post_code }}</td>
              <td class="mono">{{ row.user_count }}</td>
              <td class="mono">{{ row.sort }}</td>
              <td>
                <span class="tag" :class="row.status === 1 ? 'tag--ok' : 'tag--off'">{{ row.status === 1 ? '启用' : '停用' }}</span>
              </td>
              <td>{{ row.remark || '—' }}</td>
              <td class="col-actions">
                <button v-if="auth.hasPermission('admin:post:update')" class="btn btn--ghost btn--sm" type="button" @click="openEdit(row)">
                  <Pencil :size="14" /> 编辑
                </button>
                <button v-if="auth.hasPermission('admin:post:delete')" class="btn btn--danger btn--sm" type="button" @click="remove(row)">
                  <Trash2 :size="14" /> 删除
                </button>
              </td>
            </tr>
            <tr v-if="!list.loading.value && list.rows.value.length === 0">
              <td colspan="7"><div class="empty">暂无岗位</div></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pager">
        <span class="mono">第 {{ list.query.pageNum }} / {{ list.pageCount.value }} 页</span>
        <button class="btn btn--sm" type="button" :disabled="list.query.pageNum <= 1" @click="list.turnPage(-1)">上一页</button>
        <button class="btn btn--sm" type="button" :disabled="list.query.pageNum >= list.pageCount.value" @click="list.turnPage(1)">
          下一页
        </button>
      </div>
    </section>

    <div v-if="dialogOpen" class="modal-mask" @click.self="dialogOpen = false">
      <div class="modal">
        <header class="modal__head"><span class="modal__title">{{ editingId ? '编辑岗位' : '新建岗位' }}</span></header>
        <div class="modal__body">
          <label class="field">
            <span class="field__label">岗位编码</span>
            <input v-model="form.postCode" class="input" maxlength="50" :disabled="!!editingId" />
          </label>
          <label class="field">
            <span class="field__label">岗位名称</span>
            <input v-model="form.postName" class="input" maxlength="50" />
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
          <label class="field">
            <span class="field__label">备注</span>
            <input v-model="form.remark" class="input" maxlength="255" />
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

<style scoped>
.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--mauth-border);
  color: var(--mauth-text-soft);
  font-size: 12px;
}
</style>
