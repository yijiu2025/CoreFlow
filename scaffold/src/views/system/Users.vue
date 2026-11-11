<script setup lang="ts">
/**
 * 用户管理
 *
 * 覆盖：查询 / 重置 / 分页 / 新建 / 编辑（含部门·角色·岗位）/ 启用冻结 / 授权记录 /
 * 批量授权 / 导出 CSV。所有写操作按权限码隐藏按钮，但真正的拦截在后端。
 *
 * 🔴 **没有「删除用户」和「重置密码」**：停用走冻结（可逆、留痕、会话立即失效），
 *    密码只能本人改。理由与风险见后端 `api/admin/console/v1/users.js` 文件头。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Download, Pencil, Plus, RotateCcw, Search, ShieldAlert, ShieldCheck, UserCheck, UserX } from 'lucide-vue-next';
import { createUser, exportUsers, listUsers, updateUser, updateUserStatus, userOptions } from '@/api/system';
import type { UserOptions, UserRow } from '@/api/types';
import GrantHistoryDialog from '@/components/business/GrantHistoryDialog.vue';
import BatchGrantDialog from '@/components/business/BatchGrantDialog.vue';
import UserDangerDialog from '@/components/business/UserDangerDialog.vue';
import RolePicker from '@/components/ui/RolePicker.vue';
import PostPicker from '@/components/ui/PostPicker.vue';
import { canManageUser, indexRoles } from '@/utils/scope';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const route = useRoute();

const rows = ref<UserRow[]>([]);
const total = ref(0);
const loading = ref(false);
const errorMessage = ref('');
const toast = ref('');

const query = reactive({
  pageNum: 1,
  pageSize: 20,
  keyword: '',
  deptId: null as number | null,
  status: null as number | null
});
const options = ref<UserOptions>({ depts: [], roles: [], posts: [] });

/** 角色 ID → 选项（判定"能不能改这一行"要按职级/应用看角色，不能看名字） */
const roleById = computed(() => indexRoles(options.value.roles));

/** 操作者自己的用户 ID（"改自己"与"改别人"是两套约束） */
const operatorId = computed(() => auth.me?.id);

/**
 * 行级可管理性（整页算一次，按钮共用）
 *
 * 只用于置灰按钮，服务端才是闸门：这里多灰一个按钮最坏是"多问一句管理员"，
 * 而亮着却点不动才是 bug。
 */
const verdicts = computed(() => {
  const map = new Map<number, { ok: boolean; reason: string }>();
  for (const row of rows.value) {
    map.set(row.id, canManageUser(options.value.scope, row, roleById.value, operatorId.value, '操作'));
  }
  return map;
});

/**
 * 取某一行的判定结果
 *
 * @param row 用户行
 * @returns 判定结果（缺省视为可管理，交给后端裁决）
 */
function verdictOf(row: UserRow): { ok: boolean; reason: string } {
  return verdicts.value.get(row.id) ?? { ok: true, reason: '' };
}

/**
 * 按钮提示语：可操作时用动作名，不可操作时用原因
 *
 * @param row 用户行
 * @param verb 动作名
 * @returns 提示文案
 */
function hintOf(row: UserRow, verb: string): string {
  const verdict = verdictOf(row);
  return verdict.ok ? verb : verdict.reason;
}

/** 勾选的用户 ID（批量授权用；切页时清空，避免"跨页选了但看不见"） */
const selected = ref<Set<number>>(new Set());

/** 授权记录弹窗的目标用户 */
const grantTarget = ref<{ id: number; username: string } | null>(null);

/** 批量授权弹窗开关 */
const batchOpen = ref(false);

/** 高危操作弹窗目标（null = 关闭） */
const dangerTarget = ref<{ id: number; username: string } | null>(null);

/**
 * 「删除账号」与「临时密码」只对超管开放
 *
 * 为什么按 isSuper 而不是只看权限码：本仓角色通配是 `admin:*`，`admin_admin` 持的正是它 ——
 * 想靠权限码表达"特别高"就得另造一个不在 `admin:*` 之下的命名空间，反而更难理解。
 * 服务端 `user-danger.service` 用的是同一条判据（assertSuper），前端只做隐藏。
 */
const isSuperOperator = computed(() => options.value.scope?.isSuper === true);

/** 能否删除账号（超管 + 高权限码） */
const canDeleteUser = computed(() => isSuperOperator.value && auth.hasPermission('admin:user:purge'));

/** 能否签发临时密码（超管 + 高权限码） */
const canTempPassword = computed(() => isSuperOperator.value && auth.hasPermission('admin:user:temp-password'));

/** 能否注销某用户的应用账号（应用域管理员即可） */
const canDeactivateApp = computed(() => auth.hasPermission('admin:user:deactivate'));

/** 是否显示「高危操作」入口（三种能力任一可用） */
const canOpenDanger = computed(() => canDeleteUser.value || canTempPassword.value || canDeactivateApp.value);

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

/**
 * 可提交的角色 ID
 *
 * 只提交自己**能管**的角色：越权的 id 后端会整单拒绝（而不是静默忽略），
 * 表单里那些置灰勾选表示"他本来就有这个角色"，不该由这次保存去动它 ——
 * 后端也会把这些角色原样保留，两端口径一致。
 *
 * 🔴 选项没加载出来（`roles` 为空）时**原样提交**：否则一次拉取失败就会把用户的
 *    角色全清空，而清空是可写进授权流水的"真实操作"，事后只能靠流水解释。
 */
const submittableRoleIds = computed(() => {
  if (options.value.roles.length === 0) return form.roleIds;
  return form.roleIds.filter(id => {
    const role = roleById.value.get(id);
    if (!role) return false;
    return role.manageable !== false;
  });
});

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
  // 换页 / 刷新后清空勾选：否则「已选 N 人」与眼前的行对不上
  selected.value = new Set();
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

/* ── 勾选与授权 ── */

/** 全选状态：本页是否全被选中 */
const allSelected = computed(() => rows.value.length > 0 && rows.value.every(r => selected.value.has(r.id)));

/** 半选：选了一部分 */
const someSelected = computed(() => !allSelected.value && rows.value.some(r => selected.value.has(r.id)));

/** 已选用户（给批量授权弹窗） */
const selectedUsers = computed(() =>
  rows.value.filter(r => selected.value.has(r.id)).map(r => ({ id: r.id, username: r.username }))
);

/**
 * 勾选 / 取消单个
 *
 * @param id 用户 ID
 */
function toggleSelect(id: number): void {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}

/** 全选 / 取消全选本页 */
function toggleSelectAll(): void {
  selected.value = allSelected.value ? new Set() : new Set(rows.value.map(r => r.id));
}

/**
 * 打开某用户的授权记录
 *
 * @param row 用户行
 */
function openGrants(row: UserRow): void {
  grantTarget.value = { id: row.id, username: row.username };
}

/**
 * 打开高危操作弹窗
 *
 * @param row 用户行
 */
function openDanger(row: UserRow): void {
  dangerTarget.value = { id: row.id, username: row.username };
}

/**
 * 高危操作完成后的刷新
 *
 * 只刷列表：弹窗自己会重拉它那三个区块，一起刷会把弹窗内容闪一下。
 */
async function refreshAfterDanger(): Promise<void> {
  await load();
}

/**
 * 待执行删除的剩余时间文案
 *
 * @param iso 到期时间
 * @returns 形如「还剩 6 天」
 */
function deletionHint(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(diff)) return '待注销';
  if (diff <= 0) return '待执行';
  const days = Math.ceil(diff / 86400000);
  return days >= 1 ? `还剩 ${days} 天` : '今天执行';
}

/**
 * 授权记录里是否有「去调整」入口
 *
 * 与行内编辑按钮同一判据：改不了的人，别在弹窗里给一个点了必然 403 的入口。
 */
const grantAdjustable = computed(() => {
  const row = rows.value.find(item => item.id === grantTarget.value?.id);
  return row ? verdictOf(row).ok : false;
});

/**
 * 从授权记录跳到用户编辑
 *
 * 先关掉授权记录再开编辑：两个 modal 同时挂载会叠在一起，遮罩层也会互相压住。
 */
function adjustFromGrants(): void {
  const row = rows.value.find(item => item.id === grantTarget.value?.id);
  grantTarget.value = null;
  if (row) openEdit(row);
}

/** 批量授权完成 */
function onBatchDone(): void {
  batchOpen.value = false;
  const count = selected.value.size;
  selected.value = new Set();
  notify(`已更新 ${count} 个用户的角色`);
  void load();
}

/** 打开「新建」表单 */
function openCreate(): void {
  editingId.value = null;
  Object.assign(form, { username: '', email: '', password: '', deptId: null, status: 1, roleIds: [], postIds: [] });
  dialogOpen.value = true;
}

/**
 * 解析 GROUP_CONCAT 出来的 ID 串
 *
 * 后端列表返回 `role_ids` / `post_ids`（逗号分隔），编辑弹窗据此回填。
 * 空串 / null（用户没有任何角色）返回空数组，不要产生 `[0]` 这类脏值。
 *
 * @param raw 逗号串
 * @returns ID 数组（number）
 */
function parseIds(raw: string | null | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(v => Number(v.trim()))
    .filter(n => Number.isInteger(n) && n > 0);
}

/**
 * 打开「编辑」表单
 *
 * 🔴 回填用 `role_ids` / `post_ids`，**不能用名字反查**：角色可能重名（不同 app
 *    有同名角色）、可改名、名字里还可能有逗号（GROUP_CONCAT 的分隔符）——
 *    任何一条都会静默选错角色，且保存后把用户的真实角色覆盖掉。
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
    roleIds: parseIds(row.role_ids),
    postIds: parseIds(row.post_ids)
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
        roleIds: submittableRoleIds.value,
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
        roleIds: submittableRoleIds.value,
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
  // 待注销是系统状态，不该用"冻结/启用"去改它（要走撤销注销）
  if (row.status === -2) {
    notify('该账号处于待注销状态，请先在「高危操作」里撤销注销');
    return;
  }
  const next = row.status === 1 ? 0 : 1;
  try {
    await updateUserStatus(row.id, next);
    row.status = next;
    notify(next === 1 ? '已启用' : '已冻结');
  } catch (err) {
    notify(err instanceof Error ? err.message : '操作失败');
  }
}

/** 导出当前筛选结果 */
async function exportCsv(): Promise<void> {
  try {
    await exportUsers({
      keyword: query.keyword || undefined,
      deptId: query.deptId ?? undefined,
      status: query.status ?? undefined
    });
  } catch (err) {
    notify(err instanceof Error ? err.message : '导出失败');
  }
}

onMounted(async () => {
  // 从岗位阶梯 / 其他页跳过来时带 `?keyword=`：预填并只查一次
  const incoming = route.query.keyword;
  if (typeof incoming === 'string' && incoming) query.keyword = incoming;
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
      <input
        v-model="query.keyword"
        class="input"
        style="width: 220px"
        placeholder="账号 / 邮箱"
        @keyup.enter="search"
      />
      <select v-model.number="query.status" class="select" style="width: 130px">
        <option :value="null">全部状态</option>
        <option :value="1">正常</option>
        <option :value="0">冻结</option>
        <option :value="-2">待注销</option>
        <option :value="-1">注销</option>
      </select>
      <button class="btn btn--sm" type="button" @click="search"><Search :size="15" /> 查询</button>
      <button class="btn btn--ghost btn--sm" type="button" @click="resetQuery"><RotateCcw :size="15" /> 重置</button>

      <span class="toolbar__spacer"></span>

      <button
        v-if="auth.hasPermission('admin:user:update') && selected.size > 0"
        class="btn btn--primary btn--sm"
        type="button"
        @click="batchOpen = true"
      >
        <ShieldCheck :size="15" /> 批量授权（{{ selected.size }}）
      </button>
      <button class="btn btn--sm" type="button" @click="exportCsv"><Download :size="15" /> 导出</button>
      <button
        v-if="auth.hasPermission('admin:user:create')"
        class="btn btn--primary btn--sm"
        type="button"
        @click="openCreate"
      >
        <Plus :size="15" /> 新建用户
      </button>
    </div>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <section class="panel">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th class="col-check">
                <input
                  type="checkbox"
                  :checked="allSelected"
                  :indeterminate.prop="someSelected"
                  aria-label="全选本页"
                  @change="toggleSelectAll"
                />
              </th>
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
            <tr v-for="row in rows" :key="row.id" :class="{ 'is-picked': selected.has(row.id) }">
              <td class="col-check">
                <input
                  type="checkbox"
                  :checked="selected.has(row.id)"
                  :aria-label="`选择 ${row.username}`"
                  @change="toggleSelect(row.id)"
                />
              </td>
              <td>{{ row.username }}</td>
              <td>{{ row.email || '—' }}</td>
              <td>{{ row.dept_name || '—' }}</td>
              <td>{{ row.role_names || '—' }}</td>
              <td>{{ row.post_names || '—' }}</td>
              <td>
                <!-- 待执行删除：必须在列表里看得见，否则管理员会以为没删成功又点一次 -->
                <span
                  v-if="row.deletion"
                  class="tag tag--warn"
                  :title="`${row.deletion.scope === 'all' ? '账号删除' : row.deletion.app_id + ' 注销'} · 到期 ${row.deletion.scheduled_at}`"
                >
                  待注销 · {{ deletionHint(row.deletion.scheduled_at) }}
                </span>
                <span v-else-if="row.status === -2" class="tag tag--warn">待注销</span>
                <span v-else class="tag" :class="row.status === 1 ? 'tag--ok' : 'tag--off'">
                  {{ row.status === 1 ? '正常' : row.status === 0 ? '冻结' : '注销' }}
                </span>
              </td>
              <td class="col-actions">
                <button
                  class="btn btn--ghost btn--sm btn--icon"
                  type="button"
                  title="授权记录"
                  aria-label="授权记录"
                  @click="openGrants(row)"
                >
                  <ShieldCheck :size="14" />
                </button>
                <!--
                  高危入口：删除账号 / 注销应用账号 / 临时密码。
                  按 isSuper + 权限码隐藏（普通管理员不显示），服务端才是闸门。
                -->
                <button
                  v-if="canOpenDanger && !row.deletion"
                  class="btn btn--ghost btn--sm btn--icon danger-trigger"
                  type="button"
                  :disabled="!verdictOf(row).ok"
                  :title="verdictOf(row).ok ? '账号高危操作（删除 / 应用注销 / 临时密码）' : hintOf(row, '高危操作')"
                  aria-label="高危操作"
                  @click="openDanger(row)"
                >
                  <ShieldAlert :size="14" />
                </button>
                <button
                  v-else-if="canOpenDanger && row.deletion"
                  class="btn btn--ghost btn--sm btn--icon danger-trigger"
                  type="button"
                  title="查看/撤销待执行的注销"
                  aria-label="查看待执行注销"
                  @click="openDanger(row)"
                >
                  <ShieldAlert :size="14" />
                </button>
                <button
                  v-if="auth.hasPermission('admin:user:update')"
                  class="btn btn--ghost btn--sm btn--icon"
                  type="button"
                  :disabled="!verdictOf(row).ok"
                  :title="hintOf(row, '编辑')"
                  aria-label="编辑"
                  @click="openEdit(row)"
                >
                  <Pencil :size="14" />
                </button>
                <button
                  v-if="auth.hasPermission('admin:user:update')"
                  class="btn btn--ghost btn--sm btn--icon"
                  type="button"
                  :disabled="!verdictOf(row).ok"
                  :title="hintOf(row, row.status === 1 ? '冻结' : '启用')"
                  :aria-label="row.status === 1 ? '冻结' : '启用'"
                  @click="toggleStatus(row)"
                >
                  <UserX v-if="row.status === 1" :size="14" />
                  <UserCheck v-else :size="14" />
                </button>
              </td>
            </tr>
            <tr v-if="!loading && rows.length === 0">
              <td colspan="8">
                <div class="empty">没有符合条件的用户</div>
              </td>
            </tr>
            <tr v-if="loading">
              <td colspan="8"><div class="empty">加载中…</div></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pager">
        <span class="mono">第 {{ query.pageNum }} / {{ pageCount }} 页</span>
        <button class="btn btn--sm" type="button" :disabled="query.pageNum <= 1" @click="turnPage(-1)">上一页</button>
        <button class="btn btn--sm" type="button" :disabled="query.pageNum >= pageCount" @click="turnPage(1)">
          下一页
        </button>
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
            <RolePicker v-model="form.roleIds" :roles="options.roles" />
          </div>
          <div class="field">
            <span class="field__label">岗位</span>
            <PostPicker v-model="form.postIds" :posts="options.posts" />
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

    <!-- 授权记录：单个用户的时间线 -->
    <GrantHistoryDialog
      :user-id="grantTarget?.id ?? null"
      :username="grantTarget?.username ?? ''"
      :adjustable="grantAdjustable"
      @close="grantTarget = null"
      @adjust="adjustFromGrants"
    />

    <!-- 账号高危操作：删除（缓冲期）/ 应用注销 / 临时密码 -->
    <UserDangerDialog
      :user-id="dangerTarget?.id ?? null"
      :username="dangerTarget?.username ?? ''"
      :can-delete="canDeleteUser"
      :can-deactivate-app="canDeactivateApp"
      :can-temp="canTempPassword"
      @close="dangerTarget = null"
      @changed="refreshAfterDanger"
    />

    <!-- 批量授权：追加 / 移除同一组角色 -->
    <BatchGrantDialog
      v-if="batchOpen"
      :users="selectedUsers"
      :roles="options.roles"
      @close="batchOpen = false"
      @done="onBatchDone"
    />

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
/* 勾选列：只放下复选框，宽度收到最小 */
.col-check {
  width: 36px;
  padding-right: 0;
}

.col-check input {
  accent-color: var(--mauth-primary);
  cursor: pointer;
}

/* 选中行：左侧一条主色提示，便于在长列表里找回自己勾了哪几行 */
.table tbody tr.is-picked {
  background: var(--mauth-primary-soft);
}

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

/* 高危入口：常态低调，只在悬停时泛红 —— 常红会让人对红色麻木 */
.danger-trigger:hover:not(:disabled) {
  color: #b91c1c;
  border-color: color-mix(in srgb, #ef4444 45%, var(--mauth-border-strong));
}
</style>
