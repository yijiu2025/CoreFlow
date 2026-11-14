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
import { Download, Pencil, Plus, Search, ShieldAlert, ShieldCheck, Upload, UserCheck, UserX } from 'lucide-vue-next';
import { deptTree, exportUsers, listUsers, updateUserStatus, userOptions } from '@/api/system';
import type { DeptNode, UserEditTarget, UserOptions, UserRow } from '@/api/types';
import GrantHistoryDialog from '@/components/business/GrantHistoryDialog.vue';
import BatchGrantDialog from '@/components/business/BatchGrantDialog.vue';
import UserDangerDialog from '@/components/business/UserDangerDialog.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import UserProfileDrawer from '@/components/business/UserProfileDrawer.vue';
import UserEditDialog from '@/components/business/UserEditDialog.vue';
import UserImportDialog from '@/components/business/UserImportDialog.vue';
import { canManageUser, indexRoles } from '@/utils/scope';
import { useAuthStore } from '@/stores/auth';
import { useRenderDevice } from '@/views/device/useRenderDevice';

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
  toast.value = message;
  window.setTimeout(() => (toast.value = ''), 2600);
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
      <!-- 分段控件与角色页同一套样式（.tabbar/.tab）：外圈带边框 + 内层选中胶囊 -->
      <div class="tabbar" role="tablist" aria-label="筛选方式">
        <button
          type="button"
          role="tab"
          :aria-selected="filterMode === 'all'"
          :class="['tab', { 'is-on': filterMode === 'all' }]"
          @click="switchFilterMode('all')"
        >
          全部用户
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="filterMode === 'dept'"
          :class="['tab', { 'is-on': filterMode === 'dept' }]"
          @click="switchFilterMode('dept')"
        >
          按部门
        </button>
      </div>
      <!--
        一个框搜三样：账号 / 邮箱 / 设备码（后端 `keyword` 三选一命中）。
        设备码原本是第二个输入框 —— 但用户并不知道自己想找的是"人"还是"机器"，
        分成两个框只会让人先猜一次；合并后输入什么都能找到。
      -->
      <input
        v-model="query.keyword"
        class="input user-search"
        placeholder="账号 / 邮箱 / 设备码"
        title="账号、邮箱、设备码（含片段）任一项匹配；设备码会连同历史会话一起找"
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
      <!-- 清空筛选：与其它页同一形态（ghost 无边框 + 纯文字），不挂图标 -->
      <button class="btn btn--ghost btn--sm" type="button" @click="resetQuery">清空</button>

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
          <div v-if="device !== 'mobile'" class="table-wrap">
            <table class="table">
              <colgroup>
                <col style="width: 36px" />
                <col style="width: 95px" />
                <col style="width: 122px" />
                <col style="width: 78px" />
                <col style="width: 110px" />
                <col style="width: 70px" />
                <col style="width: 58px" />
                <col style="width: 168px" />
              </colgroup>
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
                  <!-- 勾选不该连带打开详情抽屉：click 冒泡到 tr 上会触发 openProfile -->
                  <td class="col-check" @click.stop>
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

          <!--
            手机端：一条一行。桌面表格在手机上会退化成「每行 6 个 label/value」的卡片，
            一屏只放得下一个人；这里只留「谁 + 怎么联系 + 是否可用」，
            其余信息点进详情页看（压栈，可返回）。
          -->
          <ul v-else class="mlist">
            <li
              v-for="row in rows"
              :key="row.id"
              class="m-user"
              role="button"
              tabindex="0"
              :aria-label="`${row.username}，${row.status === 1 ? '正常' : '冻结'}，查看详情`"
              @click="openProfile(row)"
              @keydown.enter.prevent="openProfile(row)"
            >
              <span class="m-user__avatar">
                <img v-if="row.avatar" :src="row.avatar" alt="" />
                <span v-else>{{ initialOf(row) }}</span>
              </span>
              <span class="m-user__main">
                <span class="m-user__name">{{ row.username }}</span>
                <span class="m-user__meta">{{ row.email || row.uid }}</span>
              </span>
              <span :class="['m-user__state', row.status === 1 ? 'is-on' : 'is-off']">
                {{ row.status === 1 ? '正常' : '冻结' }}
              </span>
              <AppIcon name="chevronRight" :size="14" class="m-user__arrow" />
            </li>
            <li v-if="loading" class="mlist__hint">加载中…</li>
            <li v-else-if="rows.length === 0" class="mlist__hint">没有符合条件的用户</li>
          </ul>

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

    <!-- 用户表单：新建 / 编辑共用，详情页也用同一个组件（见 UserEditDialog） -->
    <UserEditDialog
      :open="dialogOpen"
      :target="editingTarget"
      :options="options"
      @close="dialogOpen = false"
      @saved="onUserSaved"
    />

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
/* 合并后的搜索框（账号 / 邮箱 / 设备码）：比原来两个框省约 200px，一行更从容 */
.user-search {
  width: 260px;
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
/* ── 手机端：一条一行的精简列表 ────────────────────────────────
   目标是"扫一眼知道有谁"，不是"在一屏里塞下所有字段"：
   头像 + 账号 + 邮箱（放不下就省略）+ 状态，点整行进详情页看全。 */
.m-user {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 8px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--mauth-border) 78%, transparent);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.14s var(--ease);
}

.m-user:last-child {
  border-bottom: 0;
}

/* 手指按下就变色：手机上等 300ms 的 hover 才给反馈，等于没有反馈 */
.m-user:active {
  background: var(--mauth-press);
}

.m-user:focus-visible {
  outline: 2px solid var(--mauth-focus);
  outline-offset: -2px;
}

.m-user__avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 34px;
  height: 34px;
  overflow: hidden;
  border-radius: 50%;
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
  font-size: 13px;
  font-weight: 600;
}

.m-user__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 🔴 min-width: 0 不能省：flex 子项默认不收缩，长邮箱会把状态和箭头挤出屏幕 */
.m-user__main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.m-user__name {
  flex: none;
  max-width: 48%;
  overflow: hidden;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--mauth-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.m-user__meta {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  color: var(--mauth-text-faint);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 状态只留一个点 + 两个字：正常＝灰字绿点（不抢注意力），冻结＝红字红点 */
.m-user__state {
  display: inline-flex;
  align-items: center;
  flex: none;
  gap: 4px;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.m-user__state::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.m-user__state.is-on::before {
  background: var(--mauth-success);
}

.m-user__state.is-off {
  color: var(--mauth-danger);
}

.m-user__arrow {
  flex: none;
  color: var(--mauth-text-faint);
  opacity: 0.7;
}

/* 窄屏：部门树从"左侧一列"变成"列表上方一块"，否则 188px 会把列表压成一条 */
@media (max-width: 820px) {
  .users-body {
    display: block;
  }

  .dept {
    width: auto;
    max-height: 168px;
    margin-bottom: 10px;
    overflow-y: auto;
  }
}
</style>
