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
import { useRoute, useRouter } from 'vue-router';
import { deptTree, exportUsers, listUsers, updateUserStatus, userOptions } from '@/api/system';
import type { DeptNode, UserEditTarget, UserOptions, UserRow } from '@/api/types';
import { canManageUser, indexRoles } from '@/utils/scope';
import { useAuthStore } from '@/stores/auth';
import { useRenderDevice } from '@/views/device/useRenderDevice';
import { ThemeView } from 'skinsuite/vue';
import type { UsersViewContext } from '@/theme/views/users';
import { useToastStore } from '@/stores/toast';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

/**
 * 当前渲染设备（`?device=mobile|std` 或 ≤820px 自动判定）
 *
 * 只用来决定「这张列表怎么画」：桌面走表格 + 详情抽屉，手机走一行一条的列表 +
 * 详情页。CSS 断点改不了 DOM 结构，所以这个判定必须在 JS 里做一次。
 */
const device = useRenderDevice();

const rows = ref<UserRow[]>([]);
const total = ref(0);
const loading = ref(false);
const errorMessage = ref('');
/* 全局轻提示：样式 / 时长 / 悬停暂停都在 stores/toast.ts 一处 */
const toastStore = useToastStore();

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
 * 🔴 **重复点选中的那一档，也要有反应**。这里曾经对 `filterMode === mode` 直接
 *    `return`：用户看到「全部用户」已经是高亮的，再点一下页面连 loading 都不闪，
 *    于是报成"这个按钮无效"（前端已经高亮、deptId 也本来就是空，确实什么都没发生）。
 *    分段控件在用户眼里是"按钮"而不是"状态灯" —— 点下去必须留下后果，
 *    所以现在无论模式变没变，都重新拉一次当前视图；唯一省掉的是部门树的重复拉取。
 *
 * @param mode 目标方式
 */
function switchFilterMode(mode: 'all' | 'dept'): void {
  const changed = filterMode.value !== mode;
  filterMode.value = mode;

  if (mode === 'dept') {
    // 树只在真正切进来时拉：重复点不该打接口。列表也不动 —— 部门还没选，条件没变
    if (!changed) {
      // 已经是「按部门」了，再点一次 = 刷新当前部门视图（有选部门就重查该部门）
      void load();
      return;
    }
    void loadDeptTree();
    return;
  }

  // 已经在「全部用户」时不再动 deptId / 页码（本来就是干净的），只是重查一次；
  // 真从部门切回来才需要清限定并回到第一页
  if (changed) {
    query.deptId = null;
    query.pageNum = 1;
  }
  void load();
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
  /*
   * 手机端不走抽屉：抽屉盖住半屏、右侧滑出，在 390px 上左右都不留余量，
   * 而且「退回去」只能点遮罩 —— 不是 App 的手感。改成压栈进详情页，
   * 顶栏会出现返回箭头（路由 `meta.stack`，见 AppShell）。
   */
  if (device.value === 'mobile') {
    router.push({ name: 'system-user-detail', params: { id: row.id } });
    return;
  }
  profileId.value = row.id;
}

/**
 * 手机端列表的头像占位字
 *
 * 没有头像的人不能留一个灰圆圈（一整屏灰点分不清谁是谁）：
 * 取账号首字，中文就是第一个字、英文首字母大写。
 *
 * @param row 列表行
 * @returns 单个字符
 */
function initialOf(row: UserRow): string {
  return (row.username || row.uid || '?').trim().slice(0, 1).toUpperCase();
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

/** 编辑目标（`null` = 新建）—— 表单状态与提交逻辑都在 `UserEditDialog` 里 */
const editingTarget = ref<UserEditTarget | null>(null);
/** 编辑 / 新建弹窗开关 */
const dialogOpen = ref(false);

/** 总页数 */
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / query.pageSize)));

/**
 * 提示条（3 秒自动消失）
 *
 * @param message 提示文案
 */
function notify(message: string): void {
  toastStore.push(message);
}

/**
 * 拉取列表
 *
 * @returns 无
 */
/**
 * 把当前筛选条件写回地址栏
 *
 * 手机端从列表压栈进详情、返回时列表会**重新挂载** —— 条件不写进 URL，
 * 回来就是"第一页、筛选全清"，等于每次都从头找。顺带两个好处：
 * 链接可分享，F5 不丢条件（原来只有 `?keyword=` 单向支持）。
 *
 * 只写非默认值，地址栏保持短：`/system/user` 就是"全部、第 1 页"。
 *
 * @returns 无
 */
function syncQuery(): void {
  const next: Record<string, string> = {};
  if (query.keyword) next.keyword = query.keyword;
  if (query.deptId !== null) next.deptId = String(query.deptId);
  if (query.appId) next.appId = query.appId;
  if (query.status !== null) next.status = String(query.status);
  if (query.pageNum > 1) next.page = String(query.pageNum);
  // 与当前地址完全一致就别折腾：每次挂载都 replace 一遍会白跑一次导航守卫
  const same =
    Object.keys(next).length === Object.keys(route.query).length &&
    Object.entries(next).every(([key, value]) => route.query[key] === value);
  if (same) return;
  /*
   * `replace` 而不是 `push`：翻页/筛选不该在浏览器历史里堆一串条目，
   * 否则"返回"会被困在上一页而不是回到上一个页面。
   */
  router.replace({ query: next });
}

async function load(): Promise<void> {
  /*
   * 每次真正取数时同步地址栏：写在这里而不是各个动作里，
   * 覆盖"搜索 / 翻页 / 点部门 / 重置 / 刷新"全部入口，不会漏一处。
   */
  syncQuery();
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
 * 列表行 → 编辑弹窗的初始值
 *
 * 🔴 回填用 `role_ids` / `post_ids`，**不能用名字反查**：角色可能重名（不同 app
 *    有同名角色）、可改名、名字里还可能有逗号（GROUP_CONCAT 的分隔符）——
 *    任何一条都会静默选错角色，且保存后把用户的真实角色覆盖掉。
 *
 * @param row 用户行
 * @returns 弹窗初始值
 */
function targetOf(row: UserRow): UserEditTarget {
  return {
    id: row.id,
    username: row.username,
    email: row.email || '',
    deptId: row.dept_id,
    status: row.status,
    roleIds: parseIds(row.role_ids),
    postIds: parseIds(row.post_ids)
  };
}

/** 打开「新建」表单（`target = null`） */
function openCreate(): void {
  editingTarget.value = null;
  dialogOpen.value = true;
}

/**
 * 打开「编辑」表单
 *
 * @param row 用户行
 */
function openEdit(row: UserRow): void {
  editingTarget.value = targetOf(row);
  dialogOpen.value = true;
}

/**
 * 保存完成（新建 / 编辑同一出口）
 *
 * 弹窗自己已经关了，这里只补列表刷新与提示 —— 让保存成功在列表上立刻可见，
 * 而不是要用户自己按刷新。
 *
 * @param message 弹窗给的提示语
 */
async function onUserSaved(message: string): Promise<void> {
  dialogOpen.value = false;
  notify(message);
  await load();
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

/**
 * 从地址栏读回筛选条件（进入页面时调用一次）
 *
 * 只认能通过校验的值：`status` 只接受 0/1、`deptId`/`page` 只接受正整数 ——
 * 手改地址栏塞进来一个 `?page=abc` 不该把列表打成空页。
 *
 * @returns 无
 */
function restoreQuery(): void {
  const q = route.query;
  if (typeof q.keyword === 'string' && q.keyword) query.keyword = q.keyword;

  const deptId = Number(q.deptId);
  if (Number.isInteger(deptId) && deptId > 0) {
    query.deptId = deptId;
    // 带部门条件进来，左侧树就该是"选中的"状态，否则筛选结果和界面不一致
    filterMode.value = 'dept';
  }

  if (typeof q.appId === 'string' && q.appId) query.appId = q.appId;

  if (q.status === '0' || q.status === '1') query.status = Number(q.status);

  const page = Number(q.page);
  if (Number.isInteger(page) && page > 0) query.pageNum = page;
}

onMounted(async () => {
  /*
   * 从地址栏还原筛选条件
   *
   * 两个来源：① 手机端从详情返回（上一屏的条件在 URL 里）；② 别的页面跳过来时带的
   * `?keyword=`。都只读一次，之后由 `syncQuery` 单向写出去，不存在两边互相覆盖。
   */
  restoreQuery();
  loadDeptTree();
  await load();
  try {
    options.value = await userOptions();
  } catch {
    /* 选项拉取失败不阻塞列表：表单里对应下拉为空即可 */
  }
});

/**
 * 版式上下文
 *
 * 字段分两类：容器算好的结论（`*` 布尔、格式化后的文案）与容器持有的状态/动作。
 * 版式只读它们，不再自己判权限、不再自己取数。
 */
const ctx: UsersViewContext = {
  device, rows, total, loading, errorMessage, query, options, filterMode, collapsedDept,
  profileId, deptFlat, currentDeptName, selected, allSelected, someSelected, selectedUsers,
  grantTarget, dangerTarget, batchOpen, importOpen, editingTarget, dialogOpen, pageCount,
  grantAdjustable,
  canCreate: auth.hasPermission('admin:user:create'),
  canUpdate: auth.hasPermission('admin:user:update'),
  canExport: auth.hasPermission('admin:user:export'),
  canImport: auth.hasPermission('admin:user:import'),
  canGrants: auth.hasPermission('admin:user:grants'),
  canRead: auth.hasPermission('admin:user:read'),
  canDeleteUser, canTempPassword, canDeactivateApp, canOpenDanger,
  verdictOf, hintOf, deletionHint, initialOf, toggleDept, switchFilterMode, pickDept, openProfile,
  load, search, resetQuery, turnPage, toggleSelect, toggleSelectAll, openGrants, openDanger,
  refreshAfterDanger, onImported, adjustFromGrants, onBatchDone, openCreate, openEdit,
  onUserSaved, toggleStatus, exportCsv
};
</script>

<template>
  <!-- 页面长什么样在主题包里（`themes/<包>/<设备>/users/`），容器只准备 ctx -->
  <ThemeView page="users" :device="device" :ctx="ctx" scope="inherit" />
</template>
