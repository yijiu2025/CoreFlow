<script setup lang="ts">
/**
 * 用户管理
 *
 * 覆盖：查询 / 重置 / 分页 / 新建 / 编辑（含部门·角色·岗位）/ 启用冻结 / 重置密码 /
 * 删除 / 导出 CSV。所有写操作按权限码隐藏按钮，但真正的拦截在后端。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { Download, Pencil, Plus, RotateCcw, Search, Trash2, UserCheck, UserX } from 'lucide-vue-next';
import {
  createUser,
  exportUsers,
  listUsers,
  removeUser,
  resetUserPassword,
  updateUser,
  updateUserStatus,
  userOptions
} from '@/api/system';
import type { UserOptions, UserRow } from '@/api/types';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

const rows = ref<UserRow[]>([]);
const total = ref(0);
const loading = ref(false);
const errorMessage = ref('');
const toast = ref('');

const query = reactive({ pageNum: 1, pageSize: 20, keyword: '', deptId: null as number | null, status: null as number | null });
const options = ref<UserOptions>({ depts: [], roles: [], posts: [] });

const dialogOpen = ref(false);
const submitting = ref(false);
const editingId = ref<number | null>(null);
const form = reactive({
  username: '',
  email: '',
  password: '',
  deptId: null as number | null,
  status: 1,
  roleIds: [] as number[],
  postIds: [] as number[]
});

const pwdDialogOpen = ref(false);
const pwdTarget = ref<UserRow | null>(null);
const newPassword = ref('');

/** 总页数 */
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / query.pageSize)));

/**
 * 提示条（3 秒自动消失）
 *
 * @param message 提示文案
 */
function notify(message: string): void {
  toast.value = message;
  window.setTimeout(() => (toast.value = ''), 2600);
}

/**
 * 拉取列表
 *
 * @returns 无
 */
async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await listUsers({
      pageNum: query.pageNum,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      deptId: query.deptId ?? undefined,
      status: query.status ?? undefined
    });
    rows.value = result.rows;
    total.value = result.total;
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

/** 查询（回到第一页） */
function search(): void {
  query.pageNum = 1;
  load();
}

/** 重置查询条件 */
function resetQuery(): void {
  query.keyword = '';
  query.deptId = null;
  query.status = null;
  query.pageNum = 1;
  load();
}

/**
 * 翻页
 *
 * @param delta 页码增量（-1 / 1）
 */
function turnPage(delta: number): void {
  const next = query.pageNum + delta;
  if (next < 1 || next > pageCount.value) return;
  query.pageNum = next;
  load();
}

/** 打开「新建」表单 */
function openCreate(): void {
  editingId.value = null;
  Object.assign(form, { username: '', email: '', password: '', deptId: null, status: 1, roleIds: [], postIds: [] });
  dialogOpen.value = true;
}

/**
 * 打开「编辑」表单
 *
 * @param row 用户行
 */
function openEdit(row: UserRow): void {
  editingId.value = row.id;
  Object.assign(form, {
    username: row.username,
    email: row.email || '',
    password: '',
    deptId: row.dept_id,
    status: row.status,
    roleIds: options.value.roles.filter(r => (row.role_names || '').split(',').includes(r.name)).map(r => r.id),
    postIds: options.value.posts.filter(p => (row.post_names || '').split(',').includes(p.post_name)).map(p => p.id)
  });
  dialogOpen.value = true;
}

/** 提交表单（新建 / 编辑） */
async function submit(): Promise<void> {
  if (!form.username.trim()) {
    notify('请填写账号');
    return;
  }
  submitting.value = true;
  try {
    if (editingId.value) {
      await updateUser(editingId.value, {
        username: form.username,
        email: form.email,
        deptId: form.deptId,
        status: form.status,
        roleIds: form.roleIds,
        postIds: form.postIds
      });
      notify('已保存');
    } else {
      await createUser({
        username: form.username,
        email: form.email,
        password: form.password,
        deptId: form.deptId,
        status: form.status,
        roleIds: form.roleIds,
        postIds: form.postIds
      });
      notify('已创建');
    }
    dialogOpen.value = false;
    await load();
  } catch (err) {
    notify(err instanceof Error ? err.message : '保存失败');
  } finally {
    submitting.value = false;
  }
}

/**
 * 切换启用 / 冻结
 *
 * @param row 用户行
 */
async function toggleStatus(row: UserRow): Promise<void> {
  const next = row.status === 1 ? 0 : 1;
  try {
    await updateUserStatus(row.id, next);
    row.status = next;
    notify(next === 1 ? '已启用' : '已冻结');
  } catch (err) {
    notify(err instanceof Error ? err.message : '操作失败');
  }
}

/**
 * 打开重置密码弹窗
 *
 * @param row 用户行
 */
function openReset(row: UserRow): void {
  pwdTarget.value = row;
  newPassword.value = '';
  pwdDialogOpen.value = true;
}

/** 提交重置密码 */
async function submitReset(): Promise<void> {
  if (!pwdTarget.value) return;
  try {
    await resetUserPassword(pwdTarget.value.id, newPassword.value);
    pwdDialogOpen.value = false;
    notify('密码已重置');
  } catch (err) {
    notify(err instanceof Error ? err.message : '重置失败');
  }
}

/**
 * 删除用户
 *
 * @param row 用户行
 */
async function remove(row: UserRow): Promise<void> {
  if (!window.confirm(`确认删除用户「${row.username}」？该操作会记入审计日志。`)) return;
  try {
    await removeUser(row.id);
    notify('已删除');
    await load();
  } catch (err) {
    notify(err instanceof Error ? err.message : '删除失败');
  }
}

/** 导出当前筛选结果 */
async function exportCsv(): Promise<void> {
  try {
    await exportUsers({ keyword: query.keyword || undefined, deptId: query.deptId ?? undefined, status: query.status ?? undefined });
  } catch (err) {
    notify(err instanceof Error ? err.message : '导出失败');
  }
}

onMounted(async () => {
  await load();
  try {
    options.value = await userOptions();
  } catch {
    /* 选项拉取失败不阻塞列表：表单里对应下拉为空即可 */
  }
});
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">用户管理</h2>
      <span class="page__sub">共 {{ total }} 人</span>
    </div>

    <div class="toolbar">
      <input v-model="query.keyword" class="input" style="width: 220px" placeholder="账号 / 邮箱" @keyup.enter="search" />
      <select v-model.number="query.status" class="select" style="width: 130px">
        <option :value="null">全部状态</option>
        <option :value="1">正常</option>
        <option :value="0">冻结</option>
        <option :value="-1">注销</option>
      </select>
      <button class="btn btn--sm" type="button" @click="search"><Search :size="15" /> 查询</button>
      <button class="btn btn--ghost btn--sm" type="button" @click="resetQuery"><RotateCcw :size="15" /> 重置</button>

      <span class="toolbar__spacer"></span>

      <button class="btn btn--sm" type="button" @click="exportCsv"><Download :size="15" /> 导出</button>
      <button v-if="auth.hasPermission('admin:user:create')" class="btn btn--primary btn--sm" type="button" @click="openCreate">
        <Plus :size="15" /> 新建用户
      </button>
    </div>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <section class="panel">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>账号</th>
              <th>邮箱</th>
              <th>部门</th>
              <th>角色</th>
              <th>岗位</th>
              <th>状态</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>{{ row.username }}</td>
              <td>{{ row.email || '—' }}</td>
              <td>{{ row.dept_name || '—' }}</td>
              <td>{{ row.role_names || '—' }}</td>
              <td>{{ row.post_names || '—' }}</td>
              <td>
                <span class="tag" :class="row.status === 1 ? 'tag--ok' : 'tag--off'">
                  {{ row.status === 1 ? '正常' : row.status === 0 ? '冻结' : '注销' }}
                </span>
              </td>
              <td class="col-actions">
                <button v-if="auth.hasPermission('admin:user:update')" class="btn btn--ghost btn--sm" type="button" @click="openEdit(row)">
                  <Pencil :size="14" /> 编辑
                </button>
                <button v-if="auth.hasPermission('admin:user:update')" class="btn btn--ghost btn--sm" type="button" @click="toggleStatus(row)">
                  <UserX v-if="row.status === 1" :size="14" />
                  <UserCheck v-else :size="14" />
                  {{ row.status === 1 ? '冻结' : '启用' }}
                </button>
                <button
                  v-if="auth.hasPermission('admin:user:update')"
                  class="btn btn--ghost btn--sm"
                  type="button"
                  @click="openReset(row)"
                >
                  重置密码
                </button>
                <button v-if="auth.hasPermission('admin:user:delete')" class="btn btn--danger btn--sm" type="button" @click="remove(row)">
                  <Trash2 :size="14" /> 删除
                </button>
              </td>
            </tr>
            <tr v-if="!loading && rows.length === 0">
              <td colspan="7">
                <div class="empty">没有符合条件的用户</div>
              </td>
            </tr>
            <tr v-if="loading">
              <td colspan="7"><div class="empty">加载中…</div></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pager">
        <span class="mono">第 {{ query.pageNum }} / {{ pageCount }} 页</span>
        <button class="btn btn--sm" type="button" :disabled="query.pageNum <= 1" @click="turnPage(-1)">上一页</button>
        <button class="btn btn--sm" type="button" :disabled="query.pageNum >= pageCount" @click="turnPage(1)">下一页</button>
      </div>
    </section>

    <!-- 用户表单 -->
    <div v-if="dialogOpen" class="modal-mask" @click.self="dialogOpen = false">
      <div class="modal">
        <header class="modal__head">
          <span class="modal__title">{{ editingId ? '编辑用户' : '新建用户' }}</span>
        </header>
        <div class="modal__body">
          <label class="field">
            <span class="field__label">账号</span>
            <input v-model="form.username" class="input" maxlength="50" />
          </label>
          <label class="field">
            <span class="field__label">邮箱</span>
            <input v-model="form.email" class="input" maxlength="100" />
          </label>
          <label v-if="!editingId" class="field">
            <span class="field__label">初始密码（至少 8 位）</span>
            <input v-model="form.password" class="input" type="password" maxlength="128" />
          </label>
          <label class="field">
            <span class="field__label">部门</span>
            <select v-model.number="form.deptId" class="select">
              <option :value="null">未分配</option>
              <option v-for="dept in options.depts" :key="dept.id" :value="dept.id">{{ dept.name }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">状态</span>
            <select v-model.number="form.status" class="select">
              <option :value="1">正常</option>
              <option :value="0">冻结</option>
            </select>
          </label>
          <div class="field">
            <span class="field__label">角色</span>
            <div class="chips">
              <label v-for="role in options.roles" :key="role.id" class="chip">
                <input v-model="form.roleIds" type="checkbox" :value="role.id" />
                {{ role.name }}
              </label>
              <span v-if="options.roles.length === 0" class="field__label">暂无可分配角色</span>
            </div>
          </div>
          <div class="field">
            <span class="field__label">岗位</span>
            <div class="chips">
              <label v-for="post in options.posts" :key="post.id" class="chip">
                <input v-model="form.postIds" type="checkbox" :value="post.id" />
                {{ post.post_name }}
              </label>
              <span v-if="options.posts.length === 0" class="field__label">暂无岗位（先在岗位管理里创建）</span>
            </div>
          </div>
        </div>
        <footer class="modal__foot">
          <button class="btn btn--ghost" type="button" @click="dialogOpen = false">取消</button>
          <button class="btn btn--primary" type="button" :disabled="submitting" @click="submit">
            {{ submitting ? '保存中…' : '保存' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- 重置密码 -->
    <div v-if="pwdDialogOpen" class="modal-mask" @click.self="pwdDialogOpen = false">
      <div class="modal" style="width: min(420px, 100%)">
        <header class="modal__head"><span class="modal__title">重置密码</span></header>
        <div class="modal__body">
          <p class="field__label">账号：{{ pwdTarget?.username }}</p>
          <label class="field">
            <span class="field__label">新密码（至少 8 位）</span>
            <input v-model="newPassword" class="input" type="password" maxlength="128" />
          </label>
        </div>
        <footer class="modal__foot">
          <button class="btn btn--ghost" type="button" @click="pwdDialogOpen = false">取消</button>
          <button class="btn btn--primary" type="button" @click="submitReset">确认重置</button>
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
  border-top: 1px solid var(--line);
  color: var(--ink-soft);
  font-size: 12px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
}
</style>
