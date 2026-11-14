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
import { ChevronRight, History, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-vue-next';
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
import DeptHistoryDialog from '@/components/business/DeptHistoryDialog.vue';
import ReadOnlyTag from '@/components/ui/ReadOnlyTag.vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

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
  const exclude = new Set<number>(editingId.value === null ? [] : collectIds(findNode(trees.value, editingId.value) ?? ({} as DeptNode)));
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
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">部门管理</h2>
      <span class="page__sub">组织层级决定「本部门及以下」的数据权限范围，改动会被审计</span>
      <ReadOnlyTag code="admin:dept:update" scope="部门" />
    </div>

    <!-- 读数：先给整棵树的概况，再让人往下看细节 -->
    <div class="stats dept-stats">
      <div class="stat">
        <div class="stat__label">部门总数</div>
        <div class="stat__value">{{ summary.count }}</div>
        <div class="stat__hint">{{ summary.roots }} 个顶级</div>
      </div>
      <div class="stat">
        <div class="stat__label">成员合计</div>
        <div class="stat__value">{{ summary.members }}</div>
        <div class="stat__hint">按直属人数累加</div>
      </div>
      <div class="stat">
        <div class="stat__label">最大层级</div>
        <div class="stat__value">{{ summary.depth }}</div>
        <div class="stat__hint">层数越深，数据权限越窄</div>
      </div>
      <div class="stat">
        <div class="stat__label">停用部门</div>
        <div class="stat__value">{{ summary.disabled }}</div>
        <div class="stat__hint">停用后不出现在可选项里</div>
      </div>
    </div>

    <div class="tabbar" role="tablist" aria-label="视图">
      <button type="button" role="tab" :aria-selected="altView === 'table'" :class="['tab', { 'is-on': altView === 'table' }]" @click="altView = 'table'">列表</button>
      <button type="button" role="tab" :aria-selected="altView === 'canvas'" :class="['tab', { 'is-on': altView === 'canvas' }]" @click="altView = 'canvas'">组织架构</button>
    </div>

    <div v-show="altView === 'table'" class="toolbar">
      <span class="input-wrap">
        <Search :size="14" class="input-wrap__icon" />
        <input
          v-model="query.keyword"
          class="input"
          style="width: 220px"
          placeholder="部门名称 / 负责人 / 电话"
        />
      </span>
      <select v-model="query.status" class="select" style="width: 118px">
        <option value="">全部状态</option>
        <option :value="1">启用</option>
        <option :value="0">停用</option>
      </select>
      <button
        v-if="query.keyword || query.status !== ''"
        class="btn btn--ghost btn--sm"
        type="button"
        @click="query.keyword = ''; query.status = ''"
      >
        清空
      </button>
      <span class="toolbar__spacer"></span>
      <span class="toolbar__group">
        <button class="btn btn--ghost btn--sm" type="button" @click="expandAll">展开</button>
        <button class="btn btn--ghost btn--sm" type="button" @click="collapseAll">收起</button>
      </span>
      <button class="btn btn--sm btn--icon" type="button" :disabled="loading" aria-label="刷新" title="刷新" @click="load">
        <RefreshCw :size="15" />
      </button>
      <button v-if="auth.hasPermission('admin:dept:create')" class="btn btn--primary btn--sm" type="button" @click="openCreate()">
        <Plus :size="15" /> 新建部门
      </button>
    </div>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <section v-if="altView === 'table'" class="panel">
      <div class="table-wrap">
        <table class="table dept-table">
          <thead>
            <tr>
              <th>部门</th>
              <th class="dept-col-members">成员</th>
              <th class="dept-col-status">状态</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in rows" :key="item.node.id" class="dept-row">
              <td>
                <div class="dept-cell">
                  <!-- 层级引导线：每深一层一条竖线，比纯缩进更容易看清从属 -->
                  <span v-for="d in item.depth" :key="d" class="dept-guide" aria-hidden="true"></span>
                  <button
                    v-if="item.hasChildren"
                    class="dept-toggle"
                    type="button"
                    :aria-expanded="filtering || !collapsed.has(item.node.id)"
                    :aria-label="`展开或收起 ${item.node.name}`"
                    @click="toggle(item.node.id)"
                  >
                    <ChevronRight :size="14" :class="{ 'is-open': filtering || !collapsed.has(item.node.id) }" />
                  </button>
                  <span v-else class="dept-toggle is-empty"></span>

                  <span class="dept-cell__body">
                    <span class="dept-cell__title">
                      {{ item.node.name }}
                      <span v-if="item.hasChildren" class="dept-badge">{{ item.node.children.length }}</span>
                    </span>
                    <!-- 次要信息压到第二行：列少一半，扫视成本低一半 -->
                    <span class="dept-cell__sub">
                      {{ item.node.leader || '未指定负责人' }}
                      <template v-if="item.node.phone"> · {{ item.node.phone }}</template>
                      <template v-if="item.node.email"> · {{ item.node.email }}</template>
                    </span>
                  </span>
                </div>
              </td>
              <td class="dept-col-members">
                <div class="dept-members">
                  <span class="dept-members__num tnum">{{ membersOf(item.node) }}</span>
                  <span class="dept-members__hint">直属 {{ item.node.user_count }}</span>
                  <span class="dept-members__bar" aria-hidden="true">
                    <i :style="{ width: barWidth(item.node) }"></i>
                  </span>
                </div>
              </td>
              <td class="dept-col-status">
                <span class="tag" :class="item.node.status === 1 ? 'tag--ok' : 'tag--off'">
                  {{ item.node.status === 1 ? '启用' : '停用' }}
                </span>
              </td>
              <td class="col-actions">
                <button
                  v-if="auth.hasPermission('admin:dept:create')"
                  class="btn btn--ghost btn--sm btn--icon"
                  type="button"
                  title="新增下级部门"
                  aria-label="新增下级部门"
                  @click="openCreate(item.node)"
                >
                  <Plus :size="14" />
                </button>
                <button
                  v-if="auth.hasPermission('admin:dept:update')"
                  class="btn btn--ghost btn--sm btn--icon"
                  type="button"
                  title="编辑"
                  aria-label="编辑"
                  @click="openEdit(item.node)"
                >
                  <Pencil :size="14" />
                </button>
                <button
                  class="btn btn--ghost btn--sm btn--icon"
                  type="button"
                  title="变更历史（谁在什么时候改了什么）"
                  aria-label="变更历史"
                  @click="historyTarget = item.node"
                >
                  <History :size="14" />
                </button>
                <button
                  v-if="auth.hasPermission('admin:dept:delete')"
                  class="btn btn--danger btn--sm btn--icon"
                  type="button"
                  title="删除"
                  aria-label="删除"
                  @click="remove(item.node)"
                >
                  <Trash2 :size="14" />
                </button>
              </td>
            </tr>
            <tr v-if="!loading && rows.length === 0">
              <td colspan="4">
                <div class="empty">{{ filtering ? '没有匹配的部门' : '暂无部门' }}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 组织架构画布：拖拽平移 / Ctrl 滚轮缩放，四角浮动面板 -->
    <section v-if="altView === 'canvas'">
      <OrgCanvas :tree="trees" :selected-id="selectedId" @select="selectedId = $event.id">
        <template #tl>
          <section v-if="selected" class="org-card m-float">
            <span class="dept-eyebrow">{{ selectedPath?.slice(0, -1).map(d => d.name).join(' / ') || '根部门' }}</span>
            <h2 class="org-card-title">{{ selected.name }}</h2>
            <dl class="org-card-rows">
              <dt>负责人</dt>
              <dd>{{ selected.leader || '—' }}</dd>
              <dt>电话</dt>
              <dd class="tnum">{{ selected.phone || '—' }}</dd>
              <dt>邮箱</dt>
              <dd>{{ selected.email || '—' }}</dd>
              <dt>状态</dt>
              <dd>
                <span class="tag" :class="selected.status === 1 ? 'tag--ok' : 'tag--off'">
                  {{ selected.status === 1 ? '启用' : '停用' }}
                </span>
              </dd>
            </dl>
          </section>
        </template>

        <template #tr>
          <section v-if="selected" class="org-card m-float">
            <span class="dept-eyebrow">部门读数</span>
            <dl class="org-card-rows">
              <dt>本部门</dt>
              <dd class="tnum">{{ selected.user_count }} 人</dd>
              <dt>含下级</dt>
              <dd class="tnum">{{ membersOf(selected) }} 人</dd>
              <dt>下级部门</dt>
              <dd class="tnum">{{ descendantsOf(selected) }} 个</dd>
              <dt>层级</dt>
              <dd class="tnum">第 {{ selectedPath?.length ?? 1 }} 层</dd>
            </dl>
          </section>
        </template>

        <template #bl>
          <section v-if="selected" class="org-card m-float">
            <span class="dept-eyebrow">成员 · 共 {{ membersTotal }} 人</span>
            <ul class="dept-members">
              <li v-for="u in members" :key="u.id">
                <span class="dept-members__name">{{ u.username }}</span>
                <span class="dept-members__meta">{{ u.email || '—' }}</span>
              </li>
              <li v-if="!members.length" class="dept-members__empty">
                {{ membersLoading ? '加载中…' : '暂无直属成员' }}
              </li>
            </ul>
          </section>
        </template>

        <template #br>
          <section v-if="selected" class="org-card org-actions m-float">
            <button
              v-if="auth.hasPermission('admin:dept:create')"
              class="btn btn--primary btn--sm"
              type="button"
              @click="openCreate(selected)"
            >
              <Plus :size="14" /> 新增下级
            </button>
            <button
              v-if="auth.hasPermission('admin:dept:update')"
              class="btn btn--ghost btn--sm"
              type="button"
              @click="openEdit(selected)"
            >
              <Pencil :size="14" /> 编辑
            </button>
            <button
              v-if="auth.hasPermission('admin:dept:delete')"
              class="btn btn--danger btn--sm"
              type="button"
              @click="remove(selected)"
            >
              <Trash2 :size="14" /> 删除
            </button>
          </section>
        </template>
      </OrgCanvas>
    </section>

    <div v-if="dialogOpen" class="modal-mask" v-mask-close="() => (dialogOpen = false)">
      <div class="modal">
        <header class="modal__head">
          <span class="modal__title">{{ editingId ? '编辑部门' : '新建部门' }}</span>
        </header>
        <div class="modal__body">
          <label class="field">
            <span class="field__label">上级部门</span>
            <select v-model.number="form.parentId" class="select">
              <option :value="0">无（顶级部门）</option>
              <option v-for="opt in parentOptions" :key="opt.id" :value="opt.id">
                {{ '　'.repeat(opt.depth) }}{{ opt.label }}
              </option>
            </select>
            <span v-if="editingId" class="field__hint">不能选自己或自己的下级（会造成循环）</span>
          </label>
          <label class="field">
            <span class="field__label">部门名称 *</span>
            <input v-model="form.name" class="input" maxlength="50" placeholder="如：研发中心" />
            <span v-if="errors.name" class="field__error">{{ errors.name }}</span>
          </label>
          <label class="field">
            <span class="field__label">负责人</span>
            <input v-model="form.leader" class="input" maxlength="50" placeholder="选填" />
          </label>
          <label class="field">
            <span class="field__label">联系电话</span>
            <input v-model="form.phone" class="input" maxlength="20" placeholder="选填" />
            <span v-if="errors.phone" class="field__error">{{ errors.phone }}</span>
          </label>
          <label class="field">
            <span class="field__label">邮箱</span>
            <input v-model="form.email" class="input" type="email" maxlength="100" placeholder="选填" />
            <span v-if="errors.email" class="field__error">{{ errors.email }}</span>
          </label>
          <label class="field">
            <span class="field__label">显示排序</span>
            <input v-model.number="form.sort" class="input" type="number" min="0" max="9999" />
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
          <button class="btn btn--primary" type="button" :disabled="submitting" @click="submit">
            {{ submitting ? '保存中…' : '保存' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- 变更历史：谁在什么时候把这棵树改成了什么样 -->
    <DeptHistoryDialog
      :dept-id="historyTarget?.id ?? null"
      :dept-name="historyTarget?.name ?? ''"
      @close="historyTarget = null"
    />

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
/* 部门列：引导线 + 折叠箭头 + 两行正文（名称 / 负责人·电话·邮箱） */
.dept-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: var(--row-h);
}

.dept-cell__body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.dept-cell__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 550;
  letter-spacing: -0.01em;
}

/* 次要信息压到第二行：比多两列更容易扫，也扛得住窄屏 */
.dept-cell__sub {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.dept-stats {
  margin-bottom: 2px;
}

.dept-col-members {
  width: 172px;
}

.dept-col-status {
  width: 86px;
}

.dept-members {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dept-members__num {
  min-width: 24px;
  font-size: 13px;
  font-weight: 620;
}

.dept-members__hint {
  font-size: 11px;
  color: var(--mauth-text-faint);
  white-space: nowrap;
}

/* 迷你占比条：同一棵树内横向可比，比一串数字更快看出"哪里人多" */
.dept-members__bar {
  flex: 1;
  min-width: 30px;
  height: 4px;
  border-radius: 999px;
  background: var(--mauth-hover);
  overflow: hidden;
}

.dept-members__bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--mauth-primary);
  opacity: 0.72;
}

/* 层级引导线：每深一层多一条竖虚线，比纯缩进更容易看清从属关系 */
.dept-guide {
  align-self: stretch;
  width: 16px;
  margin-right: 2px;
  border-left: 1px dashed var(--mauth-border-strong);
}

/* 下级数量徽标（只在有子部门时出现） */
.dept-badge {
  flex: none;
  min-width: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--mauth-surface-2);
  color: var(--mauth-text-faint);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  line-height: 17px;
}

.dept-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--mauth-text-mid);
  cursor: pointer;
}

.dept-toggle:hover {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

.dept-toggle.is-empty {
  cursor: default;
}

.dept-toggle svg {
  transition: transform 0.16s ease;
}

.dept-toggle svg.is-open {
  transform: rotate(90deg);
}

/* 工具条右侧的成组按钮：组内紧凑，与其他组之间留白 */
.toolbar__group {
  display: inline-flex;
  gap: 4px;
}

.dept-eyebrow {
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--mauth-text-faint);
}

.dept-members {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.dept-members li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 12.5px;
}

.dept-members__name {
  font-weight: 500;
}

.dept-members__meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.dept-members__empty {
  font-size: 12.5px;
  color: var(--mauth-text-faint);
}
</style>
