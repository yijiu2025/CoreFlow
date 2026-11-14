<script setup lang="ts">
/**
 * 部门管理（组织架构）
 *
 * 部门层级同时决定「本部门及以下」数据权限的范围，所以这里以**树**为主视图：
 * 折叠、缩进、每行都能直接「新增下级」—— 而不是让用户去猜一个数字 ID。
 *
 * 上级链 `ancestors` 由后端维护（新增/改父级时自动重写整棵子树），前端只传
 * `parentId`，不自行拼接：拼接规则一旦有两份实现，早晚会出现半截链路。
 *
 * 搜索是**客户端过滤**：`GET /depts/tree` 没有 keyword/status 参数，而部门量级
 * 是几十到几百，本地过滤比给后端加参数更快（也避免"命中项要不要带出父链"的语义
 * 分歧——这里的选择是：命中节点保留整棵子树，未命中的祖先只为带出命中项而保留）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, defineAsyncComponent, onMounted, reactive, ref, watch } from 'vue';
import { createDept, deptTree, removeDept, updateDept } from '@/api/system';
import type { DeptNode, UserRow } from '@/api/types';
import { listUsers } from '@/api/system';

/**
 * 组织架构画布：异步加载
 *
 * 连带 Canvas 舞台与 gsap（约 70KB），部门页首屏是表格 —— 不该为「可能不点的一档
 * 视图」付这个体积。
 */
const OrgCanvas = defineAsyncComponent(() => import('@/components/business/OrgCanvas.vue'));
import { useRenderDevice } from '@/views/device/useRenderDevice';
import { useAuthStore } from '@/stores/auth';
import { ThemeView } from 'skinsuite/vue';
import type { DeptsViewContext } from '@/theme/views/depts';

const auth = useAuthStore();

/**
 * 当前渲染设备
 *
 * 部门树在手机上不能横着滚：左侧层级靠缩进表达，一屏放得下四五个层级，
 * 但表格 4 列（部门 / 成员 / 状态 / 操作）在 390px 上必然要横滚 —— 操作列
 * 够不到，等于没有。所以手机上换成"缩进卡片 + 独立操作行"。
 */
const device = useRenderDevice();

const trees = ref<DeptNode[]>([]);
const loading = ref(false);
const errorMessage = ref('');
const toast = ref('');

/** 折叠状态：存「已收起」的 id，默认全展开（新部门自动展开） */
const collapsed = ref<Set<number>>(new Set());

/** 视图档位：列表 / 组织架构 */
const altView = ref<'table' | 'canvas'>('table');

/** 画布选中部门（null = 未选） */
const selectedId = ref<number | null>(null);

const query = reactive({ keyword: '', status: '' as '' | 0 | 1 });

const dialogOpen = ref(false);
const submitting = ref(false);
/** 溯源弹窗目标（null = 关闭） */
const historyTarget = ref<DeptNode | null>(null);
const editingId = ref<number | null>(null);
const form = reactive({
  parentId: 0,
  name: '',
  leader: '',
  phone: '',
  email: '',
  sort: 10,
  status: 1
});
const errors = reactive<Record<string, string>>({});

/**
 * 提示条
 *
 * @param message 文案
 */
function notify(message: string): void {
  toast.value = message;
  window.setTimeout(() => (toast.value = ''), 2600);
}

/** 加载部门树 */
async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    trees.value = await deptTree();
    // 首次加载全展开：折叠状态只记用户主动收起的，刷新后仍保留（id 不存在时自然失效）
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

/* ── 过滤与展开 ── */

/**
 * 按关键词 / 状态过滤树
 *
 * 命中节点保留整棵子树（用户想看的是「这个部门下面有什么」），未命中的祖先
 * 只为带出命中项而保留（否则树会断层）。
 *
 * @returns 过滤后的树
 */
const filtered = computed<DeptNode[]>(() => {
  const kw = query.keyword.trim().toLowerCase();
  const st = query.status;
  if (!kw && st === '') return trees.value;

  const walk = (nodes: DeptNode[]): DeptNode[] => {
    const out: DeptNode[] = [];
    for (const node of nodes) {
      const hit =
        (!kw ||
          node.name.toLowerCase().includes(kw) ||
          (node.leader ?? '').toLowerCase().includes(kw) ||
          (node.phone ?? '').includes(kw)) &&
        (st === '' || node.status === st);
      if (hit) {
        out.push(node);
        continue;
      }
      const kids = walk(node.children ?? []);
      if (kids.length) out.push({ ...node, children: kids });
    }
    return out;
  };
  return walk(trees.value);
});

/** 过滤生效时忽略折叠（否则用户会以为"搜不到"） */
const filtering = computed(() => Boolean(query.keyword.trim()) || query.status !== '');

/** 可见行（含缩进层级） */
const rows = computed(() => {
  const out: Array<{ node: DeptNode; depth: number; hasChildren: boolean }> = [];
  const walk = (nodes: DeptNode[], depth: number): void => {
    for (const node of nodes) {
      const hasChildren = Boolean(node.children?.length);
      out.push({ node, depth, hasChildren });
      if (hasChildren && (filtering.value || !collapsed.value.has(node.id))) walk(node.children, depth + 1);
    }
  };
  walk(filtered.value, 0);
  return out;
});

/** 读数：部门数 + 总人数（含下级按树累加，避免重复计算直属口径） */
const summary = computed(() => {
  let count = 0;
  let members = 0;
  let disabled = 0;
  let depth = 0;
  const walk = (nodes: DeptNode[], level: number): void => {
    for (const node of nodes) {
      count += 1;
      members += Number(node.user_count) || 0;
      if (Number(node.status) !== 1) disabled += 1;
      depth = Math.max(depth, level);
      walk(node.children ?? [], level + 1);
    }
  };
  walk(trees.value, 1);
  return { count, members, disabled, depth: count === 0 ? 0 : depth, roots: trees.value.length };
});

/** 成员条的比例基准：取可见行里的最大值，避免小部门全是"满格" */
const maxMembers = computed(() => rows.value.reduce((max, item) => Math.max(max, membersOf(item.node)), 0));

/**
 * 成员条宽度
 *
 * @param node 部门
 * @returns 形如 `62%`
 */
function barWidth(node: DeptNode): string {
  const max = maxMembers.value;
  if (max <= 0) return '0%';
  return `${Math.max((membersOf(node) / max) * 100, 3)}%`;
}

/**
 * 本部门及下级的成员总数
 *
 * @param node 部门
 * @returns 人数
 */
function membersOf(node: DeptNode): number {
  return (Number(node.user_count) || 0) + (node.children ?? []).reduce((sum, c) => sum + membersOf(c), 0);
}

/**
 * 下级部门数量（不含自身）
 *
 * @param node 部门
 * @returns 数量
 */
function descendantsOf(node: DeptNode): number {
  return (node.children ?? []).reduce((sum, c) => sum + 1 + descendantsOf(c), 0);
}

/**
 * 切换折叠
 *
 * @param id 部门 ID
 */
function toggle(id: number): void {
  const next = new Set(collapsed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed.value = next;
}

/** 全部展开 / 收起 */
function expandAll(): void {
  collapsed.value = new Set();
}
function collapseAll(): void {
  const next = new Set<number>();
  const walk = (nodes: DeptNode[]): void => {
    for (const node of nodes) {
      if (node.children?.length) {
        next.add(node.id);
        walk(node.children);
      }
    }
  };
  walk(trees.value);
  collapsed.value = next;
}

/* ── 画布：选中路径与成员 ── */

/**
 * 在树里找从根到目标节点的路径
 *
 * @param nodes 树
 * @param id 部门 ID
 * @param trail 递归累积的路径
 * @returns 路径（未找到为 null）
 */
function findPath(nodes: DeptNode[], id: number, trail: DeptNode[] = []): DeptNode[] | null {
  for (const node of nodes) {
    const next = [...trail, node];
    if (node.id === id) return next;
    const hit = findPath(node.children ?? [], id, next);
    if (hit) return hit;
  }
  return null;
}

const selectedPath = computed(() => (selectedId.value === null ? null : findPath(trees.value, selectedId.value)));
const selected = computed(() => selectedPath.value?.[selectedPath.value.length - 1] ?? null);

// 默认选中第一个根部门；树刷新后选中项不存在则回退（避免面板指向已删除的部门）
watch(
  trees,
  nodes => {
    if (!nodes.length) {
      selectedId.value = null;
      return;
    }
    if (selectedId.value === null || !findPath(nodes, selectedId.value)) selectedId.value = nodes[0].id;
  },
  { immediate: true }
);

const members = ref<UserRow[]>([]);
const membersTotal = ref(0);
const membersLoading = ref(false);
/** 成员请求序号：快速切换部门时丢弃过期响应 */
let memberRequest = 0;

watch(selectedId, async id => {
  members.value = [];
  membersTotal.value = 0;
  if (id === null) return;
  const current = ++memberRequest;
  membersLoading.value = true;
  try {
    const page = await listUsers({ deptId: id, pageNum: 1, pageSize: 6 });
    if (current !== memberRequest) return;
    members.value = page.rows;
    membersTotal.value = page.total;
  } catch {
    /* 成员只是画布上的辅助信息，拉取失败不打断主流程 */
  } finally {
    if (current === memberRequest) membersLoading.value = false;
  }
});

/* ── 表单 ── */

/**
 * 收集某节点及其全部下级 ID（选上级时排除，避免把部门挂到自己下面）
 *
 * @param node 部门
 * @returns ID 列表
 */
function collectIds(node: DeptNode): number[] {
  return [node.id, ...(node.children ?? []).flatMap(collectIds)];
}

/** 上级部门选项（树形缩进；编辑时排除自身与后代） */
const parentOptions = computed(() => {
  const exclude = new Set<number>(
    editingId.value === null ? [] : collectIds(findNode(trees.value, editingId.value) ?? ({} as DeptNode))
  );
  const out: Array<{ id: number; label: string; depth: number }> = [];
  const walk = (nodes: DeptNode[], depth: number): void => {
    for (const node of nodes) {
      if (!exclude.has(node.id)) out.push({ id: node.id, label: node.name, depth });
      walk(node.children ?? [], depth + 1);
    }
  };
  walk(trees.value, 0);
  return out;
});

/**
 * 在树里找节点
 *
 * @param nodes 树
 * @param id 部门 ID
 * @returns 节点或 null
 */
function findNode(nodes: DeptNode[], id: number): DeptNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = findNode(node.children ?? [], id);
    if (hit) return hit;
  }
  return null;
}

/**
 * 清空校验错误
 */
function clearErrors(): void {
  for (const key of Object.keys(errors)) delete errors[key];
}

/**
 * 打开新建表单
 *
 * @param parent 上级部门（不传则为顶级）
 */
function openCreate(parent?: DeptNode): void {
  editingId.value = null;
  clearErrors();
  Object.assign(form, {
    parentId: parent?.id ?? 0,
    name: '',
    leader: '',
    phone: '',
    email: '',
    sort: 10,
    status: 1
  });
  dialogOpen.value = true;
}

/**
 * 打开编辑表单
 *
 * @param node 部门
 */
function openEdit(node: DeptNode): void {
  editingId.value = node.id;
  clearErrors();
  Object.assign(form, {
    parentId: node.parent_id,
    name: node.name,
    leader: node.leader ?? '',
    phone: node.phone ?? '',
    email: node.email ?? '',
    sort: node.sort,
    status: node.status
  });
  dialogOpen.value = true;
}

/** 校验（只挡明显错误，真正的约束仍在后端 schema） */
function validate(): boolean {
  clearErrors();
  if (!form.name.trim()) errors.name = '请填写部门名称';
  if (form.name.trim().length > 50) errors.name = '部门名称不超过 50 字';
  // 手机号或固话（带区号）；留空表示不填
  if (form.phone && !/^(1[3-9]\d{9}|0\d{2,3}-?\d{7,8})$/.test(form.phone.trim())) {
    errors.phone = '手机号或固话格式不正确';
  }
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = '邮箱格式不正确';
  }
  return Object.keys(errors).length === 0;
}

/** 保存 */
async function submit(): Promise<void> {
  if (!validate()) return;
  submitting.value = true;
  try {
    const payload = {
      parentId: Number(form.parentId) || 0,
      name: form.name.trim(),
      leader: form.leader.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      sort: Number(form.sort) || 0,
      status: Number(form.status)
    };
    if (editingId.value) {
      await updateDept(editingId.value, payload);
      notify('已保存');
    } else {
      await createDept(payload);
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
 * 删除部门
 *
 * 有下级时前端先拦（后端也会拒），避免用户点了删除才看到 400。
 *
 * @param node 部门
 */
async function remove(node: DeptNode): Promise<void> {
  if (node.children?.length) {
    notify(`「${node.name}」下还有 ${node.children.length} 个下级部门，请先调整或删除下级`);
    return;
  }
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
/** 组织架构画布（异步；版式经 ctx 拿，不自己 import 业务组件） */
const canvas = OrgCanvas;


/**
 * 版式上下文
 *
 * 字段分两类：容器算好的结论（`*` 布尔、格式化后的文案）与容器持有的状态/动作。
 * 版式只读它们，不再自己判权限、不再自己取数。
 */
const ctx: DeptsViewContext = {
  device,
  canvas,
  trees,
  loading,
  errorMessage,
  toast,
  collapsed,
  altView,
  selectedId,
  query,
  dialogOpen,
  submitting,
  historyTarget,
  editingId,
  form,
  errors,
  filtering,
  rows,
  summary,
  selectedPath,
  selected,
  members,
  membersTotal,
  membersLoading,
  parentOptions,
  canCreate: auth.hasPermission('admin:dept:create'),
  canUpdate: auth.hasPermission('admin:dept:update'),
  canDelete: auth.hasPermission('admin:dept:delete'),
  load,
  barWidth,
  membersOf,
  descendantsOf,
  toggle,
  expandAll,
  collapseAll,
  openCreate,
  openEdit,
  submit,
  remove
};
</script>

<template>
  <!-- 页面长什么样在主题包里（`themes/<包>/<设备>/depts/`），容器只准备 ctx -->
  <ThemeView page="depts" :device="device" :ctx="ctx" />
</template>
