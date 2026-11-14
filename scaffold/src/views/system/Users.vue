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
import { Download, Pencil, Plus, RotateCcw, Search, ShieldAlert, ShieldCheck, Upload, UserCheck, UserX, X } from 'lucide-vue-next';
import {
  createUser,
  deptTree,
  exportUsers,
  listUsers,
  permissionCatalog,
  setUserPermission,
  updateUser,
  updateUserStatus,
  userOptions,
  userProfile
} from '@/api/system';
import type { DeptNode, UserOptions, UserRow } from '@/api/types';
import GrantHistoryDialog from '@/components/business/GrantHistoryDialog.vue';
import BatchGrantDialog from '@/components/business/BatchGrantDialog.vue';
import UserDangerDialog from '@/components/business/UserDangerDialog.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import UserProfileDrawer from '@/components/business/UserProfileDrawer.vue';
import UserImportDialog from '@/components/business/UserImportDialog.vue';
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
  /** 子应用筛选（null = 全部应用） */
  appId: null as string | null,
  status: null as number | null
});
const options = ref<UserOptions>({ depts: [], roles: [], posts: [] });

/** 部门树（左侧筛选栏） */
const deptTrees = ref<DeptNode[]>([]);
/** 筛选方式：全部 / 按部门（只有按部门才显示左侧树） */
const filterMode = ref<'all' | 'dept'>('all');
/** 收起的部门（默认全展开） */
const collapsedDept = ref<Set<number>>(new Set());
/** 详情抽屉当前展示的用户（null = 关闭） */
const profileId = ref<number | null>(null);

/**
 * 部门树扁平化（带缩进层级）
 *
 * 树只有两三层，扁平渲染比递归组件省事，也不用担心展开状态同步。
 */
const deptFlat = computed(() => {
  const out: Array<{ node: DeptNode; depth: number; hasChildren: boolean }> = [];
  const walk = (nodes: DeptNode[], depth: number): void => {
    for (const node of nodes) {
      const hasChildren = Boolean(node.children?.length);
      out.push({ node, depth, hasChildren });
      // 收起的节点不展开子树：只跳过渲染，数据仍在，展开即恢复
      if (hasChildren && !collapsedDept.value.has(node.id)) walk(node.children ?? [], depth + 1);
    }
  };
  walk(deptTrees.value, 0);
  return out;
});

/**
 * 展开 / 收起部门
 *
 * @param id 部门 ID
 */
function toggleDept(id: number): void {
  const next = new Set(collapsedDept.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsedDept.value = next;
}

/**
 * 切换筛选方式
 *
 * 切回「全部」时必须清掉 deptId —— 否则界面显示"全部"但列表还在按部门过滤，
 * 是最容易让人误判"数据丢了"的那种 bug。
 *
 * @param mode 目标方式
 */
function switchFilterMode(mode: 'all' | 'dept'): void {
  if (filterMode.value === mode) return;
  filterMode.value = mode;
  if (mode === 'all') pickDept(null);
  else void loadDeptTree();
}

/** 当前筛选的部门名（标题右侧提示，避免"只在树上高亮"看不出来在看谁） */
const currentDeptName = computed(() => deptFlat.value.find(item => item.node.id === query.deptId)?.node.name || '');

/**
 * 点部门节点筛选
 *
 * @param deptId 部门 ID（null = 全部）
 */
function pickDept(deptId: number | null): void {
  query.deptId = deptId;
  query.pageNum = 1;
  load();
}

/**
 * 打开用户详情
 *
 * @param row 用户行
 */
function openProfile(row: UserRow): void {
  profileId.value = row.id;
}

/**
 * 拉部门树
 *
 * 没 `admin:dept:read` 的账号会 403 —— 这时左侧栏留空而不是报错整页红。
 */
async function loadDeptTree(): Promise<void> {
  try {
    deptTrees.value = await deptTree();
  } catch {
    deptTrees.value = [];
  }
}

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
/** 批量导入弹窗开关 */
const importOpen = ref(false);
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

/* ── 权限例外（角色之外单独允许 / 拒绝） ──────────────────────
 *
 * 🔴 这块**只在编辑弹窗**里，不在详情抽屉：详情页是"看"的地方，放无保存步骤的
 *    写控件会误触即生效（抽屉里原来那版就是这个毛病，已移除）。
 *
 * 提交方式是**差量**的：只有真正改过的那几条才发请求。个人策略通常 0~3 条，
 * 逐条 PUT 足够；一次事务批量的接口后端没有，也不值得为它加。
 */
interface PermissionException {
  code: string;
  effect: 'allow' | 'deny';
  /** 落库分区键：与权限码的 domain 一致（`admin:*` → `admin`） */
  appId: string;
  appLabel: string;
}

const formExceptions = ref<PermissionException[]>([]);
/** 打开弹窗时的快照（JSON），保存时用来算差量 */
const exceptionsBaseline = ref('');
const exceptionsLoading = ref(false);
const exceptionsError = ref('');
/** 新增例外的输入 */
const excCode = ref('');
const excEffect = ref<'allow' | 'deny'>('allow');
/** 权限码目录（提供 domain，用来推出 appId） */
const excCatalog = ref<Array<{ domain: string; domainName: string; code: string; label: string }>>([]);

/**
 * 例外列表的快照
 *
 * 排序后再序列化：{@code formExceptions} 的顺序会随增删变动，
 * 不排序就会把"顺序变了"当成"改过了"，凭空多发几条请求。
 *
 * @param list 例外列表
 * @returns 快照字符串
 */
function snapshotExceptions(list: PermissionException[]): string {
  return JSON.stringify([...list].sort((a, b) => `${a.appId}|${a.code}`.localeCompare(`${b.appId}|${b.code}`)));
}

/** 加载例外与权限码目录 */
async function loadExceptions(id: number): Promise<void> {
  exceptionsLoading.value = true;
  exceptionsError.value = '';
  try {
    const [profile, catalog] = await Promise.all([
      userProfile(id),
      excCatalog.value.length ? Promise.resolve(excCatalog.value) : permissionCatalog()
    ]);
    excCatalog.value = catalog;
    const list: PermissionException[] = [];
    for (const item of profile.inline ?? []) {
      item.allow.forEach(code => list.push({ code, effect: 'allow', appId: item.appId, appLabel: item.appLabel }));
      item.deny.forEach(code => list.push({ code, effect: 'deny', appId: item.appId, appLabel: item.appLabel }));
    }
    formExceptions.value = list;
    exceptionsBaseline.value = snapshotExceptions(list);
  } catch (err) {
    // 读不到不该挡住改资料：例外区降级成"不可读"，其他字段照常保存
    exceptionsError.value = err instanceof Error ? err.message : '权限例外读取失败';
    formExceptions.value = [];
    exceptionsBaseline.value = '[]';
  } finally {
    exceptionsLoading.value = false;
  }
}

/** 加一条例外（appId 从权限码的 domain 推出来） */
function addException(): void {
  const code = excCode.value.trim();
  if (!code) return;
  const hit = excCatalog.value.find(item => item.code === code);
  if (!hit) {
    exceptionsError.value = `「${code}」不在权限码目录里，请从候选中选择`;
    return;
  }
  if (formExceptions.value.some(e => e.code === code && e.appId === hit.domain)) {
    exceptionsError.value = `「${code}」已经在例外列表里`;
    return;
  }
  formExceptions.value.push({
    code,
    effect: excEffect.value,
    appId: hit.domain,
    appLabel: hit.domainName
  });
  excCode.value = '';
  exceptionsError.value = '';
}

/**
 * 提交例外差量
 *
 * @param id 用户 ID
 * @returns 实际提交的条数
 */
async function saveExceptions(id: number): Promise<number> {
  const before = JSON.parse(exceptionsBaseline.value || '[]') as PermissionException[];
  const beforeMap = new Map(before.map(e => [`${e.appId}|${e.code}`, e.effect]));
  const afterMap = new Map(formExceptions.value.map(e => [`${e.appId}|${e.code}`, e.effect]));

  const tasks: Array<{ appId: string; code: string; effect: 'allow' | 'deny' | 'inherit' }> = [];
  for (const item of formExceptions.value) {
    const key = `${item.appId}|${item.code}`;
    if (beforeMap.get(key) !== item.effect) tasks.push({ appId: item.appId, code: item.code, effect: item.effect });
  }
  // 从列表里移除 = 恢复继承（摘掉这条个人策略）
  for (const item of before) {
    if (!afterMap.has(`${item.appId}|${item.code}`)) {
      tasks.push({ appId: item.appId, code: item.code, effect: 'inherit' });
    }
  }

  for (const task of tasks) await setUserPermission(id, task);
  return tasks.length;
}

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
      appId: query.appId || undefined,
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
  query.appId = null;
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
 * 批量导入完成
 *
 * @param created 成功创建的条数
 */
async function onImported(created: number): Promise<void> {
  if (created > 0) notify(`已导入 ${created} 个用户`);
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
  // 新建时还没有 user id，例外区不显示；状态也要清干净，免得带上一个人的残留
  formExceptions.value = [];
  exceptionsBaseline.value = '[]';
  exceptionsError.value = '';
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
  formExceptions.value = [];
  exceptionsBaseline.value = '[]';
  exceptionsError.value = '';
  dialogOpen.value = true;
  void loadExceptions(row.id);
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
      const targetId = editingId.value;
      await updateUser(targetId, {
        username: form.username,
        email: form.email,
        deptId: form.deptId,
        status: form.status,
        roleIds: submittableRoleIds.value,
        postIds: form.postIds
      });
      /*
       * 例外是**独立接口**（一次一条），不像资料那样能整单回滚。
       * 所以这里分开报：资料已经落库，例外失败时要如实说"一半成功"，
       * 否则用户会以为整个保存都没生效，重新点一次又把资料覆盖一遍。
       */
      let changed = 0;
      try {
        changed = await saveExceptions(targetId);
      } catch (err) {
        dialogOpen.value = false;
        await load();
        notify(`资料已保存，但权限例外未全部生效：${err instanceof Error ? err.message : '未知错误'}`);
        return;
      }
      notify(changed ? `已保存（含 ${changed} 项权限例外）` : '已保存');
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
      appId: query.appId || undefined,
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
  loadDeptTree();
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

    <!--
      工具栏通栏（100% 宽），**不放在右侧主列里**：部门树只在「按部门」时出现，
      若工具栏与它同列，切模式时整行会横向平移；放在这里则宽度恒定、位置恒定，
      部门树出现时只在下方让出左侧一列。
    -->
    <div class="toolbar">
      <div class="mode" role="group" aria-label="筛选方式">
        <button
          type="button"
          :aria-pressed="filterMode === 'all'"
          :class="['mode__btn', { 'is-on': filterMode === 'all' }]"
          @click="switchFilterMode('all')"
        >
          全部用户
        </button>
        <button
          type="button"
          :aria-pressed="filterMode === 'dept'"
          :class="['mode__btn', { 'is-on': filterMode === 'dept' }]"
          @click="switchFilterMode('dept')"
        >
          按部门
        </button>
      </div>
      <input
        v-model="query.keyword"
        class="input"
        style="width: 220px"
        placeholder="账号 / 邮箱"
        @keyup.enter="search"
      />
      <!--
        子应用筛选：候选来自 userOptions().apps（后端按角色上的 app_id 去重并翻译成
        中文名）。没有候选时整块不渲染 —— 一个只有"全部应用"的下拉没有信息量。
      -->
      <select v-if="options.apps?.length" v-model="query.appId" class="select" style="width: 150px">
        <option :value="null">全部应用</option>
        <option v-for="app in options.apps" :key="app.id" :value="app.id">{{ app.label }}</option>
      </select>
      <select v-model.number="query.status" class="select" style="width: 130px">
        <option :value="null">全部状态</option>
        <option :value="1">正常</option>
        <option :value="0">冻结</option>
        <option :value="-2">待注销</option>
        <option :value="-1">注销</option>
      </select>
      <button class="btn btn--sm" type="button" @click="search"><Search :size="15" /> 查询</button>
      <button class="btn btn--ghost btn--sm" type="button" @click="resetQuery">
        <RotateCcw :size="15" /> 重置
      </button>

      <!--
        操作组整块靠右。不用 `toolbar__spacer` 撑开：换行时撑开的空白会把
        下一个按钮顶到**行首**（实测「新建用户」会孤零零落到左侧），
        而整组带 `margin-left:auto` 换行后依然贴右，视觉上始终是一组操作。
      -->
      <div class="toolbar__actions">
        <button
          v-if="auth.hasPermission('admin:user:update') && selected.size > 0"
          class="btn btn--primary btn--sm"
          type="button"
          @click="batchOpen = true"
        >
          <ShieldCheck :size="15" /> 批量授权（{{ selected.size }}）
        </button>
        <button
          v-if="auth.hasPermission('admin:user:import')"
          class="btn btn--sm"
          type="button"
          title="按 CSV 批量创建账号"
          @click="importOpen = true"
        >
          <Upload :size="15" /> 导入
        </button>
        <button
          v-if="auth.hasPermission('admin:user:export')"
          class="btn btn--sm"
          type="button"
          title="按当前筛选条件导出 CSV"
          @click="exportCsv"
        >
          <Download :size="15" /> 导出
        </button>
        <button
          v-if="auth.hasPermission('admin:user:create')"
          class="btn btn--primary btn--sm"
          type="button"
          @click="openCreate"
        >
          <Plus :size="15" /> 新建用户
        </button>
      </div>
    </div>

    <div class="users-body">
      <!-- 部门树：只有「按部门」模式才出现（不占工具栏的位置，工具栏在它上方通栏） -->
      <aside v-if="filterMode === 'dept'" class="dept" aria-label="部门筛选">
        <header class="dept__head">
          <span class="dept__title">部门</span>
          <span v-if="query.deptId !== null" class="dept__current">{{ currentDeptName }}</span>
        </header>
        <div class="dept__list" role="tree">
          <button
            type="button"
            role="treeitem"
            :aria-selected="query.deptId === null"
            :class="['dept__item', { 'is-on': query.deptId === null }]"
            @click="pickDept(null)"
          >
            <span class="dept__name">全部用户</span>
          </button>
          <div v-for="item in deptFlat" :key="item.node.id" class="dept__row">
            <button
              v-if="item.hasChildren"
              type="button"
              class="dept__twist"
              :aria-label="collapsedDept.has(item.node.id) ? '展开' : '收起'"
              :aria-expanded="!collapsedDept.has(item.node.id)"
              :style="{ marginLeft: `${2 + item.depth * 14}px` }"
              @click.stop="toggleDept(item.node.id)"
            >
              <AppIcon name="chevronRight" :size="12" :class="{ 'is-open': !collapsedDept.has(item.node.id) }" />
            </button>
            <span v-else class="dept__twist is-leaf" :style="{ marginLeft: `${2 + item.depth * 14}px` }" />
            <button
              type="button"
              role="treeitem"
              :aria-selected="query.deptId === item.node.id"
              :class="['dept__item', { 'is-on': query.deptId === item.node.id }]"
              @click="pickDept(item.node.id)"
            >
              <span class="dept__name">{{ item.node.name }}</span>
            </button>
          </div>
          <p v-if="deptFlat.length === 0" class="dept__empty">暂无部门</p>
        </div>
      </aside>

      <div class="users-body__main">
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
                <tr
                  v-for="row in rows"
                  :key="row.id"
                  :class="{ 'is-picked': selected.has(row.id) }"
                  class="row-clickable"
                  @click="openProfile(row)"
                >
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
                  <td class="col-actions" @click.stop>
                    <button
                      v-if="auth.hasPermission('admin:user:grants')"
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
                      :title="
                        verdictOf(row).ok ? '账号高危操作（删除 / 应用注销 / 临时密码）' : hintOf(row, '高危操作')
                      "
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
            <button class="btn btn--sm" type="button" :disabled="query.pageNum <= 1" @click="turnPage(-1)">
              上一页
            </button>
            <button class="btn btn--sm" type="button" :disabled="query.pageNum >= pageCount" @click="turnPage(1)">
              下一页
            </button>
          </div>
        </section>
      </div>
    </div>

    <!-- 用户详情：点行打开，职级可见性由后端判 -->
    <UserProfileDrawer :user-id="profileId" @close="profileId = null" @changed="load" />

    <!-- 用户表单 -->
    <div v-if="dialogOpen" class="modal-mask" v-mask-close="() => (dialogOpen = false)">
      <div class="modal user-modal" :class="{ 'is-compact': !editingId }">
        <header class="modal__head">
          <div class="modal__heading">
            <span class="modal__title">{{ editingId ? '编辑用户' : '新建用户' }}</span>
            <span v-if="editingId" class="modal__sub mono">{{ form.username }}</span>
          </div>
          <button class="modal__close" type="button" aria-label="关闭" @click="dialogOpen = false">
            <X :size="16" />
          </button>
        </header>

        <div class="modal__body user-form-body" :class="{ 'is-single': !editingId }">
          <div class="user-form-col">
          <section class="form-section">
            <h3 class="form-section__title">基本信息</h3>
            <div class="form-grid">
              <label class="field">
                <span class="field__label">账号</span>
                <input v-model="form.username" class="input" maxlength="50" />
              </label>
              <label class="field">
                <span class="field__label">邮箱</span>
                <input v-model="form.email" class="input" maxlength="100" />
              </label>
              <label v-if="!editingId" class="field is-wide">
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
            </div>
          </section>

          <section class="form-section">
            <h3 class="form-section__title">角色与岗位</h3>
            <div class="field">
              <span class="field__label">角色</span>
              <RolePicker v-model="form.roleIds" :roles="options.roles" />
            </div>
            <div class="field">
              <span class="field__label">岗位</span>
              <PostPicker v-model="form.postIds" :posts="options.posts" />
            </div>
          </section>

          </div>

          <div v-if="editingId" class="user-form-col">
            <!-- 权限例外（仅编辑）：角色之外的单独允许 / 拒绝。
                 放在这里而不是详情抽屉，是因为它必须随「保存」一起提交。 -->
            <section class="form-section">
            <header class="form-section__head">
              <h3 class="form-section__title">权限例外</h3>
              <span class="form-section__note">{{ formExceptions.length }} 条 · 角色之外</span>
            </header>
            <p class="form-hint">
              日常授权请改角色；这里只放必须的例外。「拒绝」优先于角色授予，用来临时收回某个权限。
            </p>

            <div v-if="exceptionsLoading" class="empty">权限例外加载中…</div>
            <template v-else>
              <p v-if="!formExceptions.length" class="exc-empty">
                没有例外 —— 该账号的权限完全来自角色。
              </p>
              <ul v-else class="exc-list">
                <li
                  v-for="(item, i) in formExceptions"
                  :key="`${item.appId}-${item.code}`"
                  class="exc"
                  :data-effect="item.effect"
                >
                  <span class="exc__dot" aria-hidden="true"></span>
                  <span class="mono exc__code">{{ item.code }}</span>
                  <span class="exc__app">{{ item.appLabel }}</span>
                  <!-- 处置用分段按钮而不是下拉：一眼能看到「允许/拒绝」，点一下就换，少一次展开 -->
                  <div class="exc-toggle" role="group" :aria-label="`${item.code} 的处置`">
                    <button
                      type="button"
                      :class="['exc-toggle__btn', { 'is-on': item.effect === 'allow' }]"
                      @click="item.effect = 'allow'"
                    >
                      允许
                    </button>
                    <button
                      type="button"
                      :class="['exc-toggle__btn', 'is-deny', { 'is-on': item.effect === 'deny' }]"
                      @click="item.effect = 'deny'"
                    >
                      拒绝
                    </button>
                  </div>
                  <button
                    class="exc__remove"
                    type="button"
                    title="移除这条例外"
                    aria-label="移除"
                    @click="formExceptions.splice(i, 1)"
                  >
                    <X :size="14" />
                  </button>
                </li>
              </ul>

              <div class="exc-add">
                <input
                  v-model="excCode"
                  class="input"
                  list="exc-catalog"
                  placeholder="权限码，如 admin:user:delete"
                  @keyup.enter="addException"
                />
                <datalist id="exc-catalog">
                  <option v-for="item in excCatalog" :key="item.code" :value="item.code">{{ item.label }}</option>
                </datalist>
                <div class="exc-toggle" role="group" aria-label="新增例外的处置">
                  <button
                    type="button"
                    :class="['exc-toggle__btn', { 'is-on': excEffect === 'allow' }]"
                    @click="excEffect = 'allow'"
                  >
                    允许
                  </button>
                  <button
                    type="button"
                    :class="['exc-toggle__btn', 'is-deny', { 'is-on': excEffect === 'deny' }]"
                    @click="excEffect = 'deny'"
                  >
                    拒绝
                  </button>
                </div>
                <button class="btn btn--sm" type="button" :disabled="!excCode.trim()" @click="addException">
                  添加
                </button>
              </div>
            </template>

            <p v-if="exceptionsError" class="field__error">{{ exceptionsError }}</p>
            </section>
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

    <!-- 批量导入：CSV 在浏览器解析成行，逐行结果回显 -->
    <UserImportDialog :open="importOpen" @close="importOpen = false" @done="onImported" />

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
/* 表单里的灰色说明（与 Roles.vue 同款：各页 scoped 一份，不进全局） */
.form-hint {
  margin: 4px 0 8px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--mauth-text-faint);
}

/* ── 用户表单弹窗 ─────────────────────────────────────────────
 *
 * 宽一档（920）+ 左右两栏：左栏是"这个人是谁、有哪些角色"，右栏是"角色之外的例外"。
 * 单列 560 时角色分组 + 例外列表要滚两屏，优先看的例外永远在折线以下。
 */
.user-modal {
  width: min(920px, 100%);
}

/* 新建没有"例外"这一栏，按原宽度收窄 —— 920 的单列表单每条输入都拉成一条长缝 */
.user-modal.is-compact {
  width: min(600px, 100%);
}

/* 左栏装基本信息与角色岗位，右栏装例外；新建时右栏不存在，退回单列 */
.user-form-body {
  grid-template-columns: minmax(0, 1.12fr) minmax(0, 0.88fr);
  align-items: start;
  gap: 18px;
}

.user-form-body.is-single {
  grid-template-columns: minmax(0, 1fr);
}

.user-form-col {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

/* 窄屏回单列：两栏挤到 400px 以下时输入框会短到没法用 */
@media (max-width: 820px) {
  .user-form-body {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* 标题 + 账号副标题：编辑时要能一眼确认"我正在改谁" */
.modal__heading {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.modal__sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--mauth-text-faint);
}

.modal__close {
  margin-left: auto;
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--mauth-radius-xs);
  background: transparent;
  color: var(--mauth-text-soft);
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.modal__close:hover {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

/* 分节：基本信息 / 角色与岗位 / 权限例外 —— 用细分隔线断开，避免一长条表单 */
.form-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-section + .form-section {
  padding-top: 14px;
  border-top: 1px solid var(--mauth-border);
}

.form-section__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.form-section__title {
  margin: 0;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: var(--mauth-track-eyebrow);
  color: var(--mauth-text-faint);
}

.form-section__note {
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

/* 两列网格：窄屏自动落回单列（表单在手机上仍是竖排更好填） */
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 14px;
}

.form-grid .is-wide {
  grid-column: 1 / -1;
}

@media (max-width: 560px) {
  .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* ── 权限例外 ───────────────────────────────────────────────── */

.exc-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 一行一条：状态点 / 权限码 / 应用 / 允许拒绝 / 移除 */
.exc {
  display: grid;
  grid-template-columns: 6px minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-xs);
}

/* 状态点：允许=成功色、拒绝=危险色，比读文字快 */
.exc__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--mauth-text-faint);
}

.exc[data-effect='allow'] .exc__dot {
  background: var(--mauth-success);
}

.exc[data-effect='deny'] .exc__dot {
  background: var(--mauth-danger);
}

.exc__code {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12.5px;
}

.exc__app {
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

/* 允许 / 拒绝分段：点一下就换，不用展开下拉 */
.exc-toggle {
  display: inline-flex;
  flex: none;
  border: 1px solid var(--mauth-border-strong);
  border-radius: 999px;
  overflow: hidden;
}

.exc-toggle__btn {
  height: 22px;
  padding: 0 9px;
  border: 0;
  background: transparent;
  color: var(--mauth-text-faint);
  font-size: 11px;
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.exc-toggle__btn:hover {
  color: var(--mauth-text);
}

.exc-toggle__btn.is-on {
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
  font-weight: 600;
}

/* 拒绝态用危险色：这是"收回权限"，视觉上必须与允许区分开 */
.exc-toggle__btn.is-deny.is-on {
  background: var(--mauth-danger-soft);
  color: var(--mauth-danger);
}

.exc__remove {
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--mauth-text-faint);
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.exc__remove:hover {
  background: var(--mauth-danger-soft);
  color: var(--mauth-danger);
}

/* 空态：与列表行同高，避免"没有例外"一句话把整节高度塌掉 */
.exc-empty {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--mauth-radius-xs);
  background: color-mix(in srgb, var(--mauth-text) 3%, transparent);
  color: var(--mauth-text-faint);
  font-size: 12px;
}

.exc-add {
  display: flex;
  align-items: center;
  gap: 8px;
}

.exc-add .input {
  flex: 1;
  min-width: 0;
}

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

/* ── 左树右表 ── */
.users-body {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

/* 操作按钮组：整组靠右，换行时也整组一起走（见模板注释） */
.toolbar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex: none;
}

.dept {
  flex: none;
  width: 188px;
  padding: 6px;
  border: 1px solid var(--mauth-border);
  border-radius: 10px;
  background: var(--mauth-surface);
}

.dept__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px 8px;
}

.dept__title {
  font-size: 10.5px;
  letter-spacing: 0.1em;
  color: var(--mauth-text-faint);
}

.dept__current {
  max-width: 92px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--mauth-text-mid);
}

.dept__list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 560px;
  overflow-y: auto;
}

.dept__item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  text-align: left;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--mauth-text-mid);
  cursor: pointer;
  transition:
    background 0.15s var(--ease),
    color 0.15s var(--ease);
}

.dept__item:hover {
  background: var(--mauth-surface-2);
  color: var(--mauth-text);
}

/*
 * 选中：主色浅底 + 主色文字。
 * 不用左侧那道竖条 —— 圆角行 + 直角竖条在视觉上对不齐，像贴了张标签。
 * 浅底用的是 `--mauth-primary-soft`，换主题色时跟着变。
 */
.dept__item.is-on {
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
  font-weight: 650;
}

.dept__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dept__empty {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--mauth-text-faint);
}

.users-body__main {
  flex: 1;
  min-width: 0;
}

/* 整行可点开详情；操作列自己 @click.stop */
.row-clickable {
  cursor: pointer;
}

.row-clickable:hover td {
  background: var(--mauth-surface-2);
}

@media (max-width: 900px) {
  .users-body {
    flex-direction: column;
  }

  .dept {
    width: 100%;
  }

  .dept__list {
    max-height: 160px;
  }
}

/* 树行：折叠箭头 + 名称按钮同排 */
.dept__row {
  display: flex;
  align-items: center;
  gap: 2px;
}

.dept__twist {
  display: grid;
  place-items: center;
  flex: none;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--mauth-text-faint);
  cursor: pointer;
}

.dept__twist:hover {
  background: var(--mauth-surface-2);
  color: var(--mauth-text);
}

.dept__twist.is-leaf {
  cursor: default;
}

.dept__twist :deep(svg) {
  transition: transform 0.15s var(--ease);
}

.dept__twist :deep(svg.is-open) {
  transform: rotate(90deg);
}

.dept__row .dept__item {
  flex: 1;
  min-width: 0;
}

/* 筛选方式：分段按钮（segmented），比 select 紧凑且不参与表单宽度 */
.mode {
  display: inline-flex;
  flex: none;
  padding: 2px;
  border: 1px solid var(--mauth-border-strong);
  border-radius: 8px;
  background: var(--mauth-surface-2);
}

.mode__btn {
  padding: 4px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font-size: 12.5px;
  color: var(--mauth-text-mid);
  cursor: pointer;
  transition:
    background 0.15s var(--ease),
    color 0.15s var(--ease);
}

.mode__btn:hover {
  color: var(--mauth-text);
}

.mode__btn.is-on {
  background: var(--mauth-surface);
  color: var(--mauth-text);
  font-weight: 650;
  box-shadow: 0 1px 2px color-mix(in srgb, var(--mauth-text) 12%, transparent);
}
</style>
