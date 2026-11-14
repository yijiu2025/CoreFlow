<script setup lang="ts">
/**
 * 角色管理
 *
 * 角色是 PBAC 语义：编码 + 应用 + 职级 + 权限码（policy）+ 菜单授权。
 * 本页负责三件事：**角色 CRUD（含权限码编辑）**、**菜单授权**、删除。
 *
 * 🔴 两套授权语义不要混：
 *    - 权限码（policy）= 接口放行的依据，由 `requirePermission` 消费；
 *    - 菜单授权（sys_role_menu）= 只决定侧栏可见性，不影响接口判定。
 *
 * 🔴 内置角色（含 superadmin）：不可删除、不可改菜单授权、**不可改权限码**。
 *    最后一条是防自锁 —— 把 superadmin 的 `admin:*` 删掉，保存瞬间自己就进不去后台，
 *    且没有别的账号能救（只能直连 DB）。后端同样拒绝（403 BUILTIN_PROTECTED），
 *    前端这里只是提前把输入框禁掉，避免"填了半天点保存才被拒"。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, defineAsyncComponent, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { KeyRound, LockKeyhole, Pencil, Plus, RefreshCw, SearchX, Trash2 } from 'lucide-vue-next';
import {
  createRole,
  deptTree,
  listRoles,
  menuTree,
  permissionCatalog,
  removeRole,
  roleMenus,
  saveRoleMenus,
  updateRole
} from '@/api/system';
import type { DeptNode, MenuNode, RoleRow } from '@/api/types';
import ReadOnlyTag from '@/components/ui/ReadOnlyTag.vue';
import type { MatrixRole } from '@/components/business/PermissionMatrix.vue';
import { matchPermission } from '@/utils/permission';

const route = useRoute();

/**
 * 矩阵组件异步加载
 *
 * 它连带 gsap（约 70KB）——角色页首屏是列表，不该为「可能不点的一档视图」付这个体积。
 * 类型仍从原文件 import（`import type` 不产生运行时代码）。
 */
const PermissionMatrix = defineAsyncComponent(() => import('@/components/business/PermissionMatrix.vue'));

/**
 * 溯源视图同样异步：它连带 Canvas 舞台与 gsap，只在切到该档时下载。
 */
const PermissionTrace = defineAsyncComponent(() => import('@/components/business/PermissionTrace.vue'));
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

/**
 * 只读视角（观察者角色）
 *
 * `admin_viewer` 只有 `admin:role:read`：这一页必须能完整地「看」，但一个写入口都不该出现 ——
 * 不是把按钮留着等人点了再吃 403（那要填完表单、点开弹窗才知道自己改不了）。
 * 判据取 `admin:role:update`，与后端 `PUT /roles/:id`、`PUT /roles/:id/menus` 的
 * `requirePermission` 同一个码，前端不另立一套。
 */
const canEdit = computed(() => auth.hasPermission('admin:role:update'));

/**
 * 能否读菜单树
 *
 * 权限矩阵的行来自菜单树（`GET /menus/tree`，要求 `admin:menu:read`）。
 * 角色只读 + 菜单不可读的组合是存在的（自定义角色），那时**不要去请求** ——
 * 请求会 403 并在页面上弹一条「权限不足：需要 [admin:menu:read] 权限」的红字，
 * 而用户对此无能为力。改为在矩阵位置写明缺哪个码。
 */
const canReadMenu = computed(() => auth.hasPermission('admin:menu:read'));

/** 应用筛选：'' = 全部；否则是 app_id（`GLOBAL` 也是一档） */
const appFilter = ref('');

/** 应用显示名（后端下发 app_label，缺失时退回 GLOBAL → 全局） */
function appLabelOf(row: RoleRow): string {
  const key = row.app_id || 'GLOBAL';
  return row.app_label || (key === 'GLOBAL' ? '全局' : key);
}

/**
 * 应用筛选项（含各自角色数）
 *
 * 角色天生是"按应用分家"的（同一个 app 内编码唯一），平铺在一张表里时 `admin_*`
 * 和 `fw_*` 交错，找"防火墙有几个角色"要一行行数。所以先按应用分档。
 */
const appTabs = computed(() => {
  const counts = new Map<string, { label: string; count: number }>();
  for (const row of rows.value) {
    const key = row.app_id || 'GLOBAL';
    const hit = counts.get(key);
    if (hit) hit.count += 1;
    else counts.set(key, { label: appLabelOf(row), count: 1 });
  }
  return [...counts.entries()]
    .map(([id, item]) => ({ id, ...item }))
    .sort((a, b) => (a.id === 'GLOBAL' ? -1 : b.id === 'GLOBAL' ? 1 : a.label.localeCompare(b.label, 'zh-CN')));
});

/**
 * 按应用分组的可见角色
 *
 * 组内维持后端给的顺序（职级降序）—— 高权限角色始终在上面，不会因为分组被打乱。
 */
const roleGroups = computed(() => {
  const source = appFilter.value ? rows.value.filter(row => (row.app_id || 'GLOBAL') === appFilter.value) : rows.value;
  const buckets = new Map<string, { appId: string; label: string; rows: RoleRow[] }>();
  for (const row of source) {
    const key = row.app_id || 'GLOBAL';
    if (!buckets.has(key)) buckets.set(key, { appId: key, label: appLabelOf(row), rows: [] });
    buckets.get(key)!.rows.push(row);
  }
  return [...buckets.values()].sort((a, b) =>
    a.appId === 'GLOBAL' ? -1 : b.appId === 'GLOBAL' ? 1 : a.label.localeCompare(b.label, 'zh-CN')
  );
});

/** 权限码目录项（`GET /permissions/catalog` 的返回形状） */
interface PermItem {
  domain: string;
  domainName: string;
  code: string;
  label: string;
  /** `read` / `write` / `high_risk` / `wildcard` —— 通配项不作为独立条目展示 */
  type?: string;
}

/* ── 权限码：通配符的展示与合并规则 ─────────────────────────────
 *
 * 目录里的 `admin:user:*` / `admin:*` 是"这一组全选"的聚合结果，不是可单独勾选的
 * 权限点：显示出来只会让人以为它们是额外能力。所以：
 *   • 列表**不显示**通配项；
 *   • 某个资源（如 `admin:user`）的具体码全部勾上 → 自动合并成 `admin:user:*`；
 *   • 应用内全部具体码都勾上 → 直接合并成 `admin:*`；
 *   • 取消其中一个 → 把通配**拆回**具体码再删掉它，界面不会出现"看着没勾、实际有"。
 *
 * 🔴 展示层必须按"被覆盖"判定勾选态（`permChecked`），否则合并之后具体码会全变未勾。
 */

/**
 * 是否通配码
 *
 * @param code 权限码
 * @returns 形如 `admin:*` / `admin:user:*`
 */
function isWildcard(code: string): boolean {
  return code.endsWith(':*');
}

/**
 * 具体码所属资源的通配码
 *
 * `admin:user:create` → `admin:user:*`；不足三段（如 `admin:*`）返回空串。
 *
 * @param code 权限码
 * @returns 资源通配码或空串
 */
function resourceWildcard(code: string): string {
  const parts = code.split(':');
  return parts.length >= 3 ? `${parts.slice(0, -1).join(':')}:*` : '';
}

/** 目录里可勾选的具体码（去掉通配项） */
const concreteCatalog = computed(() => catalog.value.filter(item => !isWildcard(item.code)));

/**
 * 权限码是否生效（自身在列表、或被资源通配 / 应用通配覆盖）
 *
 * @param code 具体权限码
 * @returns 是否已生效
 */
function permChecked(code: string): boolean {
  const list = form.permissions;
  if (list.includes(code) || list.includes('admin:*')) return true;
  const wild = resourceWildcard(code);
  return wild !== '' && list.includes(wild);
}

/**
 * 把权限列表展开成具体码集合（通配 → 其覆盖的具体码）
 *
 * 目录里查不到对应项的旧通配原样保留，避免保存时静默丢掉历史权限。
 *
 * @param codes 权限码列表（可含通配）
 * @returns 具体码数组
 */
function expandPermissions(codes: string[]): string[] {
  const out = new Set<string>();
  const concrete = concreteCatalog.value.map(item => item.code);
  for (const code of codes) {
    if (!isWildcard(code)) {
      out.add(code);
      continue;
    }
    const prefix = code === 'admin:*' ? 'admin:' : code.slice(0, -1);
    let hit = false;
    for (const item of concrete) {
      if (item.startsWith(prefix)) {
        out.add(item);
        hit = true;
      }
    }
    if (!hit) out.add(code);
  }
  return [...out];
}

/**
 * 把具体码集合合并成尽量少的写法（资源全齐 → 资源通配；应用全齐 → `admin:*`）
 *
 * @param codes 具体码集合
 * @returns 允许含通配的权限码列表
 */
function normalizePermissions(codes: string[]): string[] {
  const unique = [...new Set(codes)];
  const known = new Set(concreteCatalog.value.map(item => item.code));
  const unknown = unique.filter(code => !known.has(code));
  const concrete = unique.filter(code => known.has(code));

  // 应用级：`admin:` 下所有具体码都在 → 一个 `admin:*` 就够
  const adminCodes = concreteCatalog.value.filter(item => item.code.startsWith('admin:')).map(i => i.code);
  const rest = concrete.filter(code => !code.startsWith('admin:'));
  if (adminCodes.length > 0 && adminCodes.every(code => concrete.includes(code))) {
    return ['admin:*', ...rest, ...unknown];
  }

  const byResource = new Map<string, string[]>();
  for (const code of concrete) {
    const wild = resourceWildcard(code);
    const key = wild || code;
    const list = byResource.get(key) ?? [];
    list.push(code);
    byResource.set(key, list);
  }

  const out: string[] = [];
  for (const [key, list] of byResource) {
    const wild = list[0] && resourceWildcard(list[0]) ? resourceWildcard(list[0]) : '';
    if (wild) {
      const total = concreteCatalog.value.filter(item => resourceWildcard(item.code) === wild).length;
      if (total > 0 && list.length === total) {
        out.push(wild);
        continue;
      }
    }
    out.push(...list);
    void key;
  }
  return [...out, ...unknown];
}

/**
 * 勾选 / 取消一个具体权限码
 *
 * @param code 权限码
 * @param on 目标状态
 */
function togglePerm(code: string, on: boolean): void {
  const current = new Set(expandPermissions(form.permissions));
  if (on) current.add(code);
  else current.delete(code);
  form.permissions = normalizePermissions([...current]);
}

/** 已选权限的实际覆盖数（通配按它覆盖的具体码计数） */
const permissionCount = computed(() => expandPermissions(form.permissions).length);

/**
 * 视图档位：列表 / 权限矩阵
 *
 * 矩阵读的是**同一份 rows**（列表接口已返回 menu_ids），所以切档不额外请求角色，
 * 只在首次进入矩阵时补一次菜单树。
 */
const altView = ref<'table' | 'matrix' | 'trace'>('table');

/**
 * 溯源视图的聚焦实体（`role:7` 这类）
 *
 * 星图 / 其他页跳过来时带 `?trace=role:<id>`，这里接住直接落到实体层，
 * 省掉用户自己再点两层的功夫。
 */
const traceFocus = ref<string | null>(null);
const matrixSaving = ref(false);

const rows = ref<RoleRow[]>([]);
const total = ref(0);
const loading = ref(false);
const errorMessage = ref('');
const toast = ref('');
const keyword = ref('');

/* ── 菜单授权弹窗 ───────────────────────────────────────────── */
const trees = ref<MenuNode[]>([]);
const dialogOpen = ref(false);
const activeRole = ref<RoleRow | null>(null);
const checked = ref<number[]>([]);
const saving = ref(false);

/* ── 角色表单弹窗（新建 / 编辑）─────────────────────────────── */
const formOpen = ref(false);
const formBuiltin = ref(false);
const formError = ref('');
const submitting = ref(false);
const form = reactive({
  id: 0,
  code: '',
  name: '',
  appId: 'GLOBAL',
  rankLevel: 1,
  description: '',
  permissions: [] as string[],
  /** 数据范围：1 全部 / 2 自定义 / 3 本部门 / 4 本部门及以下 / 5 仅本人 */
  dataScope: 1,
  /** 自定义数据范围时的部门集合 */
  deptIds: [] as number[]
});

/** 数据范围选项（文案与参考实现一致，便于运维迁移心智） */
const SCOPE_OPTIONS = [
  { value: 1, label: '全部数据', hint: '系统内所有部门的数据' },
  { value: 4, label: '本部门及以下', hint: '本部门与全部下级部门的数据' },
  { value: 3, label: '本部门', hint: '仅本部门的数据' },
  { value: 5, label: '仅本人', hint: '只能看到本人创建的数据' },
  { value: 2, label: '自定义', hint: '按下面勾选的部门范围查看数据' }
] as const;

/** 当前数据范围档位的说明（下拉里只放标签，解释放下面一行，避免下拉项过长） */
const currentScopeHint = computed(() => SCOPE_OPTIONS.find(opt => opt.value === form.dataScope)?.hint ?? '');

/** 部门树（给「自定义」用） */
const deptTrees = ref<DeptNode[]>([]);
/** 部门树扁平化，带深度用于缩进 */
const deptFlat = computed(() => {
  const out: Array<{ node: DeptNode; depth: number }> = [];
  const walk = (nodes: DeptNode[], depth: number): void => {
    for (const node of nodes) {
      out.push({ node, depth });
      if (node.children?.length) walk(node.children, depth + 1);
    }
  };
  walk(deptTrees.value, 0);
  return out;
});

/** 拉部门树（只在表单里用；没权限时留空） */
async function loadDepts(): Promise<void> {
  if (deptTrees.value.length > 0) return;
  try {
    deptTrees.value = await deptTree();
  } catch {
    deptTrees.value = [];
  }
}

/* ── 权限码目录 ─────────────────────────────────────────────── */
const catalog = ref<PermItem[]>([]);
const catalogLoading = ref(false);
const permKeyword = ref('');

const isEditing = computed(() => form.id > 0);

/**
 * 该角色是否**能用**某个菜单节点
 *
 * 菜单授权是开关，policy 是能力上限：没有对应权限码的节点，勾了不会有任何效果
 * （按钮不出现、接口 403）。这个弹窗是**单角色**的，所以这类节点直接不列出来 ——
 * 列表里剩下的每一条都真的可用，"勾选"与"有权限"从此一致。
 *
 * @param node 菜单节点
 * @returns 是否可授权
 */
function menuEligible(node: MenuNode): boolean {
  const code = node.permission;
  if (!code) return true;
  return matchPermission(activeRole.value?.permissions ?? [], code);
}

/** 扁平化菜单树（带层级，便于缩进展示；跳过该角色没有权限码的节点及其整枝） */
const flatMenus = computed(() => {
  const out: Array<{ node: MenuNode; depth: number }> = [];
  const walk = (nodes: MenuNode[], depth: number): void => {
    for (const node of nodes) {
      if (!menuEligible(node)) continue;
      out.push({ node, depth });
      if (node.children?.length) walk(node.children, depth + 1);
    }
  };
  walk(trees.value, 0);
  return out;
});

/** 被隐藏的节点数（该角色没有对应权限码）—— 列表少了一截，得给个数，否则像丢数据 */
const hiddenMenuCount = computed(() => {
  let all = 0;
  const walk = (nodes: MenuNode[]): void => {
    for (const node of nodes) {
      all += 1;
      if (node.children?.length) walk(node.children);
    }
  };
  walk(trees.value);
  return all - flatMenus.value.length;
});

/**
 * 菜单 id → 节点
 *
 * 勾选级联要能顺着树走，而 `flatMenus` 只留了 depth、丢了父子关系。
 * 每次从 `trees` 重建（菜单树很小，几十个节点），不做额外状态。
 */
const menuIndex = computed(() => {
  const map = new Map<number, MenuNode>();
  const walk = (nodes: MenuNode[]): void => {
    for (const node of nodes) {
      map.set(node.id, node);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(trees.value);
  return map;
});

/**
 * 自身 + 全部后代 id
 *
 * @param nodeId 节点 id
 * @returns id 列表（祖先在前）
 */
function selfAndDescendants(nodeId: number): number[] {
  const root = menuIndex.value.get(nodeId);
  if (!root) return [nodeId];
  const out: number[] = [];
  const walk = (node: MenuNode): void => {
    out.push(node.id);
    for (const child of node.children ?? []) walk(child);
  };
  walk(root);
  return out;
}

/**
 * 全部祖先 id（由近到远）
 *
 * 勾一个按钮必须连带勾上它的页面与目录：只授权子项、不授权父级，
 * 侧栏根本渲染不出那一条，等于这次授权没生效。
 *
 * @param nodeId 节点 id
 * @returns 祖先 id 列表
 */
function ancestorsOf(nodeId: number): number[] {
  const parent = new Map<number, number>();
  const walk = (nodes: MenuNode[]): void => {
    for (const node of nodes) {
      for (const child of node.children ?? []) parent.set(child.id, node.id);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(trees.value);

  const out: number[] = [];
  let current = parent.get(nodeId);
  while (current !== undefined) {
    out.push(current);
    current = parent.get(current);
  }
  return out;
}

/**
 * 勾选 / 取消某菜单节点
 *
 * 规则（树的常识，缺一条都会出现"授权了但不生效"）：
 *   - 勾父级 → 连带勾全部子孙（否则页面有了、按钮没有，页面里的按钮全不见）
 *   - 取消父级 → 连带取消全部子孙（否则留下孤儿按钮，永远显示不出来）
 *   - 勾子级 → 连带勾全部祖先（否则子项没有挂载点）
 *   - 取消子级 → **不动祖先**（"页面可见、这个按钮隐藏"是合法状态）
 *
 * @param nodeId 节点 id
 * @param on 目标状态
 */
function toggleMenu(nodeId: number, on: boolean): void {
  const next = new Set(checked.value);
  // 级联只碰"该角色有权限码"的节点：勾一个没码的按钮不会生效，写进授权表只会变成噪音
  const subtree = selfAndDescendants(nodeId).filter(id => {
    const node = menuIndex.value.get(id);
    return !node || menuEligible(node);
  });

  if (on) {
    for (const id of subtree) next.add(id);
    for (const id of ancestorsOf(nodeId)) next.add(id);
  } else {
    for (const id of subtree) next.delete(id);
  }

  checked.value = [...next];
}

/** 按关键词过滤后的权限码 */
const filteredCatalog = computed(() => {
  const kw = permKeyword.value.trim().toLowerCase();
  if (!kw) return catalog.value;
  return catalog.value.filter(p => p.code.toLowerCase().includes(kw) || (p.label || '').toLowerCase().includes(kw));
});

/** 权限码按 domain 分组（保持后端返回顺序，不在前端排序 —— 顺序本身是设计） */
const catalogGroups = computed(() => {
  const map = new Map<string, { domain: string; domainName: string; items: PermItem[] }>();
  for (const item of filteredCatalog.value) {
    // 通配项不当独立条目展示：它是"这组全选"的聚合结果，由勾选自动产生
    if (isWildcard(item.code)) continue;
    const key = item.domain || 'other';
    let group = map.get(key);
    if (!group) {
      group = { domain: key, domainName: item.domainName || key, items: [] };
      map.set(key, group);
    }
    group.items.push(item);
  }
  return Array.from(map.values());
});

/**
 * 内置角色实际持有的权限码，按 domain 分组
 *
 * 目录里查不到的码（例如通配 `admin:user:*`）不丢弃，归到「其它」并按编码显示 ——
 * 内置角色恰恰最可能出现通配码，把它们过滤掉等于漏报权限。
 */
const builtinGroups = computed(() => {
  const byCode = new Map(catalog.value.map(item => [item.code, item]));
  const map = new Map<string, { domain: string; domainName: string; items: PermItem[] }>();
  // 展开通配：内置角色的 policy 常是 `admin:*`，直接按码遍历只会显示一行 `admin:*`，
  // 看不出它实际覆盖了哪些能力
  for (const code of expandPermissions(form.permissions)) {
    const item = byCode.get(code) ?? { code, label: '', domain: 'other', domainName: '其它' };
    const key = item.domain || 'other';
    let group = map.get(key);
    if (!group) {
      group = { domain: key, domainName: item.domainName || key, items: [] };
      map.set(key, group);
    }
    group.items.push(item);
  }
  return Array.from(map.values());
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
 * 当前应用分档下的角色数
 *
 * `total` 是服务端返回的总数（只反映关键词过滤），应用分档是前端过滤，
 * 不补这一段的话，筛了「防火墙」标题仍写"共 23 个角色"，看起来像筛选没生效。
 *
 * @returns 数量；未分档时为 null（标题不显示这一段）
 */
const appFilteredCount = computed(() =>
  appFilter.value ? rows.value.filter(r => (r.app_id || 'GLOBAL') === appFilter.value).length : null
);

/**
 * 矩阵列：角色（`menuLocked` 决定该列只读，不是 `builtin`）
 *
 * `builtin` 只表示"由代码声明"（不可删）—— 本仓几乎所有角色都是，拿它锁列就等于
 * 矩阵一列都点不动。菜单可见性是运行期数据，除超管外都该可调。
 */
const matrixRoles = computed<MatrixRole[]>(() =>
  // 只把「能改的」角色放进矩阵：矩阵是一键保存，把别家应用的角色也列进去只会
  // 让整次保存被后端拒绝（而用户以为自己只是改了自己应用的那几个）。
  // 🔴 只读视角**不过滤**：那条理由只对"要提交"成立，观察者根本不提交；
  //    照过滤会让他的矩阵一列都不剩（`manageable` 是应用域/职级判据，不是读权限）。
  //
  // 🔴 应用分档必须在这里也生效：分档是**前端**过滤（列表走 `roleGroups`），
  //    矩阵只认 `rows`，所以先前在列表点了「防火墙」再切矩阵会退回全部角色。
  rows.value
    .filter(r => !appFilter.value || (r.app_id || 'GLOBAL') === appFilter.value)
    .filter(r => !canEdit.value || r.manageable !== false)
    .map(r => ({
      id: r.id,
      name: r.name,
      builtin: r.builtin,
      menuLocked: r.menuLocked,
      // 角色的权限码也要进矩阵：它要与"菜单授权"对账，才能标出"勾了也点不到"的格子
      codes: r.permissions,
      status: 1
    }))
);

/** 矩阵授权：roleId → menuIds，直接取列表接口返回的 menu_ids */
const matrixGrants = computed<Record<number, number[]>>(() => {
  const out: Record<number, number[]> = {};
  for (const r of rows.value) out[r.id] = r.menu_ids ?? [];
  return out;
});

/**
 * 提交矩阵改动
 *
 * 后端只有单角色授权接口，所以按角色并发提交；任一失败即整体报错
 * （已成功的不会回滚，但下次打开矩阵会读到真实状态，不会出现假成功）。
 *
 * @param changes 需要保存的角色与菜单集合
 */
async function saveMatrix(changes: Array<{ roleId: number; menuIds: number[] }>): Promise<void> {
  if (changes.length === 0) return;
  if (!canEdit.value) {
    notify('当前账号只有查看权限，不能保存菜单授权');
    return;
  }
  matrixSaving.value = true;
  try {
    await Promise.all(changes.map(c => saveRoleMenus(c.roleId, c.menuIds)));
    notify(`已保存 ${changes.length} 个角色的菜单授权`);
    await load();
  } catch (err) {
    notify(err instanceof Error ? err.message : '保存失败');
  } finally {
    matrixSaving.value = false;
  }
}

/** 进入矩阵前确保菜单树已加载（读不到菜单就干脆不请求，见 `canReadMenu` 注释） */
watch(altView, v => {
  if (v === 'matrix' && canReadMenu.value) void ensureTrees();
});

/** 懒加载权限码目录（首次打开表单才拉，135 条不算大但没必要每页都取） */
async function ensureCatalog(): Promise<void> {
  if (catalog.value.length > 0) return;
  catalogLoading.value = true;
  try {
    catalog.value = await permissionCatalog();
  } catch (err) {
    formError.value = err instanceof Error ? err.message : '权限码目录加载失败';
  } finally {
    catalogLoading.value = false;
  }
}

/**
 * 确保菜单树已加载（矩阵与授权弹窗共用）
 *
 * @returns 加载完成
 */
async function ensureTrees(): Promise<void> {
  if (trees.value.length > 0) return;
  try {
    trees.value = await menuTree();
  } catch (err) {
    notify(err instanceof Error ? err.message : '菜单树加载失败');
  }
}

/** 打开「新建角色」 */
function openCreate(): void {
  form.id = 0;
  form.code = '';
  form.name = '';
  form.appId = 'GLOBAL';
  form.rankLevel = 1;
  form.dataScope = 1;
  form.deptIds = [];
  void loadDepts();
  form.description = '';
  form.permissions = [];
  formBuiltin.value = false;
  formError.value = '';
  permKeyword.value = '';
  formOpen.value = true;
  void ensureCatalog();
}

/**
 * 打开「编辑角色」
 *
 * 权限码直接取 `row.permissions`（后端已从 policy 解出，是真实值），
 * 不要按菜单或名字反推 —— 那两处语义与 policy 无关。
 *
 * @param row 角色行
 */
function openFormEdit(row: RoleRow): void {
  form.id = row.id;
  form.code = row.code;
  form.name = row.name;
  form.appId = row.app_id;
  form.rankLevel = row.rank_level;
  form.dataScope = row.data_scope ?? 1;
  form.deptIds = [...(row.dept_ids ?? [])];
  void loadDepts();
  form.description = row.description || '';
  form.permissions = [...row.permissions];
  formBuiltin.value = !!row.builtin;
  formError.value = '';
  permKeyword.value = '';
  formOpen.value = true;
  void ensureCatalog();
}

/**
 * 该组权限码是否已全选
 *
 * @param items 组内权限项
 * @returns 是否全选
 */
function allChecked(items: PermItem[]): boolean {
  return items.length > 0 && items.every(i => permChecked(i.code));
}

/**
 * 组内全选 / 清空
 *
 * 全选后由 `normalizePermissions` 自动合并成通配符（整组齐 → `xxx:*`，全站齐 → `admin:*`）。
 *
 * @param items 组内权限项
 * @param on true=全选，false=清空
 */
function toggleGroup(items: PermItem[], on: boolean): void {
  const current = new Set(expandPermissions(form.permissions));
  for (const item of items) {
    if (on) current.add(item.code);
    else current.delete(item.code);
  }
  form.permissions = normalizePermissions([...current]);
}

/** 提交角色表单 */
async function submitForm(): Promise<void> {
  formError.value = '';
  if (!form.name.trim()) {
    formError.value = '请填写角色名称';
    return;
  }
  if (!isEditing.value && !form.code.trim()) {
    formError.value = '请填写角色编码';
    return;
  }
  submitting.value = true;
  try {
    if (isEditing.value) {
      await updateRole(form.id, {
        name: form.name,
        rankLevel: form.rankLevel,
        description: form.description,
        // 内置角色不提交 permissions：后端对内置角色明确拒绝改权限码，
        // 传了只会 403；不传则 name/职级仍可维护。
        ...(formBuiltin.value ? {} : { permissions: form.permissions }),
        dataScope: form.dataScope,
        deptIds: form.dataScope === 2 ? form.deptIds : []
      });
      notify('已保存');
    } else {
      await createRole({
        code: form.code.trim(),
        name: form.name,
        appId: form.appId.trim() || 'GLOBAL',
        rankLevel: form.rankLevel,
        description: form.description,
        permissions: form.permissions,
        dataScope: form.dataScope,
        deptIds: form.dataScope === 2 ? form.deptIds : []
      });
      notify('已创建');
    }
    formOpen.value = false;
    await load();
  } catch (err) {
    formError.value = err instanceof Error ? err.message : '保存失败';
  } finally {
    submitting.value = false;
  }
}

/**
 * 打开菜单授权
 *
 * @param row 角色行
 */
async function openMenus(row: RoleRow): Promise<void> {
  // 兜底：按钮已按 `canEdit` 隐藏，这里再拦一次 —— 函数可能被别处（星图 / 深链）调到，
  // 打开一个"保存必然 403"的弹窗比不打开更糟
  if (!canEdit.value) {
    notify('当前账号只有查看权限，不能修改菜单授权');
    return;
  }
  activeRole.value = row;
  dialogOpen.value = true;
  try {
    if (trees.value.length === 0) trees.value = await menuTree();
    const result = await roleMenus(row.id);
    /*
     * 历史授权里可能存在"只勾了按钮、没勾页面"（旧版弹窗不会连带勾父级）。
     * 打开时先把祖先补齐，否则界面显示成"页面没授权、按钮已授权"这种自相矛盾的状态，
     * 用户一保存就把它固化了。
     */
    const normalized = new Set(result.menuIds);
    for (const id of result.menuIds) {
      for (const ancestor of ancestorsOf(Number(id))) normalized.add(ancestor);
    }
    checked.value = [...normalized];
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

onMounted(() => {
  const incoming = route.query.trace;
  if (typeof incoming === 'string' && /^(user|role|menu):\d+$/.test(incoming)) {
    altView.value = 'trace';
    traceFocus.value = incoming;
  }
  void load();
});
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">角色管理</h2>
      <span class="page__sub">
        共 {{ total }} 个角色<template v-if="appFilteredCount !== null"> · 当前应用 {{ appFilteredCount }} 个</template>
        · 权限码决定接口放行，菜单只决定侧栏可见
      </span>
      <!-- 只读标记与按钮同一个判据（`admin:role:update`），见 ui/ReadOnlyTag.vue -->
      <ReadOnlyTag code="admin:role:update" scope="角色" />
    </div>

    <div class="tabbar" role="tablist" aria-label="视图">
      <button
        type="button"
        role="tab"
        :aria-selected="altView === 'table'"
        :class="['tab', { 'is-on': altView === 'table' }]"
        @click="altView = 'table'"
      >
        列表
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="altView === 'matrix'"
        :class="['tab', { 'is-on': altView === 'matrix' }]"
        @click="altView = 'matrix'"
      >
        权限矩阵
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="altView === 'trace'"
        :class="['tab', { 'is-on': altView === 'trace' }]"
        @click="altView = 'trace'"
      >
        授权溯源
      </button>
    </div>

    <!-- 搜索/刷新对列表和矩阵都生效（矩阵列就是角色），所以矩阵视图也保留 -->
    <div v-show="altView !== 'trace'" class="toolbar">
      <input v-model="keyword" class="input" style="width: 220px" placeholder="名称 / 编码" @keyup.enter="load" />
      <button class="btn btn--sm" type="button" :disabled="loading" @click="load"><RefreshCw :size="15" /> 刷新</button>
      <button
        v-if="auth.hasPermission('admin:role:create')"
        class="btn btn--primary btn--sm"
        type="button"
        @click="openCreate"
      >
        <Plus :size="15" /> 新建角色
      </button>
    </div>

    <!-- 应用分档：角色是"按应用分家"的，先分档再找比逐行扫快得多。
         矩阵视图同样可见 —— 否则在列表里选好的档位切过去就"看不见自己在筛什么" -->
    <div v-show="altView !== 'trace'" class="role-tabs" role="group" aria-label="按应用筛选">
      <button
        type="button"
        :class="['role-tab', { 'is-on': appFilter === '' }]"
        :aria-pressed="appFilter === ''"
        @click="appFilter = ''"
      >
        全部
        <span class="role-tab__count mono">{{ rows.length }}</span>
      </button>
      <button
        v-for="tab in appTabs"
        :key="tab.id"
        type="button"
        :class="['role-tab', { 'is-on': appFilter === tab.id }]"
        :aria-pressed="appFilter === tab.id"
        @click="appFilter = tab.id"
      >
        {{ tab.label }}
        <span class="role-tab__count mono">{{ tab.count }}</span>
      </button>
    </div>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <section v-if="altView === 'table'" class="panel">
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
            <template v-for="group in roleGroups" :key="group.appId">
              <!-- 分组标题行：应用名 + 角色数，扫视时先定位"哪个应用" -->
              <tr class="role-group-row">
                <td colspan="8">
                  <span class="role-group-row__label">{{ group.label }}</span>
                  <span class="role-group-row__count mono">{{ group.rows.length }}</span>
                  <span class="role-group-row__hint">{{ group.appId }}</span>
                </td>
              </tr>
              <tr v-for="row in group.rows" :key="row.id">
                <td>
                  {{ row.name }}
                  <span v-if="row.builtin" class="tag tag--info" style="margin-left: 6px">内置</span>
                </td>
                <td class="mono">{{ row.code }}</td>
                <td>{{ row.app_label || row.app_id }}</td>
                <td class="mono">{{ row.rank_level }}</td>
                <td class="mono">{{ row.user_count }}</td>
                <td class="mono">{{ row.permissions.length }}</td>
                <td class="mono">{{ row.menu_ids.length }}</td>
                <td class="col-actions">
                  <button
                    v-if="auth.hasPermission('admin:role:update')"
                    class="btn btn--ghost btn--sm"
                    type="button"
                    :disabled="row.manageable === false"
                    :title="row.manageable === false ? '不在你的管理范围（应用域或职级限制）' : '编辑角色'"
                    @click="openFormEdit(row)"
                  >
                    <Pencil :size="14" /> 编辑
                  </button>
                  <!-- 授权：超管的菜单固定为全部（后端直接拒），按钮不该可点 ——
                       能点开却只有一列灰掉的矩阵，等于让人白点一次。
                       写权限没有时整颗按钮不出现（只读用户不该看到"点了会 403"的东西） -->
                  <button
                    v-if="canEdit"
                    class="btn btn--ghost btn--sm"
                    type="button"
                    :disabled="row.manageable === false || row.menuLocked"
                    :title="
                      row.menuLocked
                        ? '超级管理员的菜单固定为全部，不可修改'
                        : row.manageable === false
                          ? '不在你的管理范围（应用域或职级限制）'
                          : '菜单授权'
                    "
                    @click="openMenus(row)"
                  >
                    <KeyRound :size="14" /> 授权
                  </button>
                  <button
                    v-if="!row.builtin && auth.hasPermission('admin:role:delete')"
                    class="btn btn--danger btn--sm"
                    type="button"
                    :disabled="row.manageable === false"
                    :title="row.manageable === false ? '不在你的管理范围（应用域或职级限制）' : '删除角色'"
                    @click="remove(row)"
                  >
                    <Trash2 :size="14" /> 删除
                  </button>
                </td>
              </tr>
            </template>
            <tr v-if="!loading && rows.length === 0">
              <td colspan="8"><div class="empty">暂无角色</div></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 权限矩阵：菜单 × 角色，勾选即菜单可见性（接口权限看权限码）。
         没有菜单读取权限时不去请求菜单树，而是说明缺哪个码 —— 见 canReadMenu -->
    <section v-if="altView === 'matrix'">
      <PermissionMatrix
        v-if="canReadMenu && matrixRoles.length"
        :menus="trees"
        :roles="matrixRoles"
        :grants="matrixGrants"
        :editable="canEdit"
        :saving="matrixSaving"
        @save="saveMatrix"
        @blocked="notify"
      />
      <!-- 筛空了要给出口：矩阵没有列时就是一片空白，看着像页面坏了 -->
      <div v-else-if="canReadMenu" class="panel matrix-locked">
        <p class="matrix-locked__title"><SearchX :size="16" /> 当前筛选下没有角色</p>
        <p class="matrix-locked__hint">
          把上方应用分档切回「全部」，或清空搜索关键词后再看。矩阵的列就是角色，没有角色就没有可勾的格子。
        </p>
      </div>
      <div v-else class="panel matrix-locked">
        <p class="matrix-locked__title"><LockKeyhole :size="16" /> 权限矩阵需要「查看菜单」权限</p>
        <p class="matrix-locked__hint">
          矩阵的行就是菜单树。当前账号只有角色查看权限，没有读取菜单的
          <code class="mono">admin:menu:read</code>，因此这里无法渲染。请联系管理员分配后再看。
        </p>
      </div>
    </section>

    <!-- 授权溯源：用户 → 角色 → 菜单 三层下钻（图谱舞台） -->
    <section v-if="altView === 'trace'">
      <PermissionTrace v-model:focus="traceFocus" />
    </section>

    <!-- 角色表单（新建 / 编辑，含权限码） -->
    <div v-if="formOpen" class="modal-mask" v-mask-close="() => (formOpen = false)">
      <div class="modal modal--wide">
        <header class="modal__head">
          <span class="modal__title">{{ isEditing ? `编辑角色 · ${form.name}` : '新建角色' }}</span>
        </header>
        <div class="modal__body">
          <label class="field">
            <span class="field__label">角色名称</span>
            <input v-model="form.name" class="input" maxlength="50" />
          </label>
          <label class="field">
            <span class="field__label">角色编码{{ isEditing ? '（不可修改）' : '' }}</span>
            <input
              v-model="form.code"
              class="input mono"
              :disabled="isEditing"
              maxlength="50"
              placeholder="如 ops_admin"
            />
          </label>
          <label class="field">
            <span class="field__label">所属应用{{ isEditing ? '（不可修改）' : '' }}</span>
            <input
              v-model="form.appId"
              class="input mono"
              :disabled="isEditing"
              maxlength="64"
              placeholder="GLOBAL = 全局"
            />
          </label>
          <label class="field">
            <span class="field__label">职级（0–99，不能高于你自己的最高职级）</span>
            <input v-model.number="form.rankLevel" class="input" type="number" min="0" max="99" />
          </label>

          <!--
            数据范围 = 行级数据权限：决定这个角色的人**能看到哪些行**。
            与上面的权限码是两件事：权限码管"能不能调接口"，这里管"调通后能看到谁"。
          -->
          <div class="field">
            <span class="field__label">数据范围（能看哪些数据）</span>
            <!--
              下拉而不是五张单选卡：这五项是同一个维度的枚举，卡片会把弹窗撑得很长，
              而"自定义"只是其中一种取值，不该让所有选项都占满版面。
            -->
            <select v-model.number="form.dataScope" class="select" aria-label="数据范围">
              <option v-for="opt in SCOPE_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <p class="form-hint">{{ currentScopeHint }}</p>

            <div v-if="form.dataScope === 2" class="scope__depts">
              <p class="form-hint">勾选可见部门（自动包含其下级部门）：</p>
              <label
                v-for="item in deptFlat"
                :key="item.node.id"
                class="scope__dept"
                :style="{ paddingLeft: `${8 + item.depth * 14}px` }"
              >
                <input v-model="form.deptIds" type="checkbox" :value="item.node.id" />
                {{ item.node.name }}
              </label>
              <p v-if="deptFlat.length === 0" class="form-hint">暂无可选部门</p>
            </div>
          </div>
          <label class="field">
            <span class="field__label">说明</span>
            <input v-model="form.description" class="input" maxlength="255" />
          </label>

          <div class="field">
            <!--
              内置角色：权限码由代码声明（`roleRegistry` → policy），这里**只展示它实际
              持有的那些**，不给勾选框。列全量 135 条再全部置灰，会让人误以为"还能选，
              只是现在不让点"，也让真正的权限集合淹没在无关项里。
            -->
            <template v-if="formBuiltin">
              <span class="field__label">
                权限码（由代码声明）· 共 <span class="mono">{{ permissionCount }}</span> 项
              </span>
              <p class="form-hint">内置角色的权限码不可在此修改；名称、职级、说明仍可维护。</p>
              <div class="perm-panel perm-panel--static">
                <div v-if="catalogLoading" class="empty">权限码加载中…</div>
                <section v-for="group in builtinGroups" :key="group.domain" class="perm-group">
                  <header class="perm-group__head">
                    <span class="perm-group__title">
                      {{ group.domainName }}
                      <span class="mono perm-group__count">{{ group.items.length }}</span>
                    </span>
                  </header>
                  <div class="perm-items">
                    <div v-for="perm in group.items" :key="perm.code" class="perm-item perm-item--static">
                      <!-- 目录里查不到的码（通配 / 新增）没有中文名，只显示编码，不要重复两遍 -->
                      <span class="perm-item__text">
                        <span v-if="perm.label" class="perm-item__label" :title="perm.label">{{ perm.label }}</span>
                        <code
                          class="perm-item__code"
                          :class="{ 'perm-item__code--solo': !perm.label }"
                          :title="perm.code"
                        >
                          {{ perm.code }}
                        </code>
                      </span>
                    </div>
                  </div>
                </section>
                <div v-if="!catalogLoading && builtinGroups.length === 0" class="empty">该角色未持有权限码</div>
              </div>
            </template>

            <!-- 自定义角色：全量目录，可勾选 -->
            <template v-else>
              <span class="field__label">
                权限码（接口放行依据）· 已选 <span class="mono">{{ permissionCount }}</span>
                <span v-if="form.permissions.some(isWildcard)" class="perm-wild-hint"
                  >（含通配符，已自动合并）</span
                >
              </span>
              <input v-model="permKeyword" class="input" style="margin-bottom: 8px" placeholder="搜索权限码 / 名称" />
              <div class="perm-panel">
                <div v-if="catalogLoading" class="empty">权限码加载中…</div>
                <section v-for="group in catalogGroups" :key="group.domain" class="perm-group">
                  <header class="perm-group__head">
                    <span class="perm-group__title">
                      {{ group.domainName }}
                      <span class="mono perm-group__count">{{ group.items.length }}</span>
                    </span>
                    <button
                      class="btn btn--ghost btn--sm"
                      type="button"
                      @click="toggleGroup(group.items, !allChecked(group.items))"
                    >
                      {{ allChecked(group.items) ? '清空' : '全选' }}
                    </button>
                  </header>
                  <div class="perm-items">
                    <label
                      v-for="perm in group.items"
                      :key="perm.code"
                      class="perm-item"
                      :class="{ 'is-on': form.permissions.includes(perm.code) }"
                    >
                      <!--
                        受控勾选：勾选态由 `permChecked` 派生（被通配覆盖也算勾上），
                        所以不能用 `v-model` 直接绑数组 —— 合并成通配后具体码就不在数组里了。
                      -->
                      <input
                        type="checkbox"
                        :checked="permChecked(perm.code)"
                        @change="event => togglePerm(perm.code, (event.target as HTMLInputElement).checked)"
                      />
                      <!--
                        中文名与编码分两行：同一行里编码是 flex-shrink:0 的长串，
                        会把中文名挤成「创建…」「为…」—— 看不出这条权限到底是什么。
                      -->
                      <span class="perm-item__text">
                        <span class="perm-item__label" :title="perm.label">{{ perm.label }}</span>
                        <code class="perm-item__code" :title="perm.code">{{ perm.code }}</code>
                      </span>
                    </label>
                  </div>
                </section>
                <div v-if="!catalogLoading && catalogGroups.length === 0" class="empty">没有匹配的权限码</div>
              </div>
            </template>
          </div>

          <p v-if="formError" class="tag tag--off">{{ formError }}</p>
        </div>
        <footer class="modal__foot">
          <button class="btn btn--ghost" type="button" @click="formOpen = false">取消</button>
          <button class="btn btn--primary" type="button" :disabled="submitting" @click="submitForm">
            {{ submitting ? '保存中…' : '保存' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- 菜单授权 -->
    <div v-if="dialogOpen" class="modal-mask" v-mask-close="() => (dialogOpen = false)">
      <div class="modal">
        <header class="modal__head">
          <span class="modal__title">菜单授权 · {{ activeRole?.name }}</span>
        </header>
        <div class="modal__body">
          <p class="field__label">
            勾选 = 该角色可用：取消勾选某个按钮后，该角色的这个操作接口也会 403。能力上限由「权限码」决定。
          </p>
          <p v-if="hiddenMenuCount > 0" class="field__label">
            另有 {{ hiddenMenuCount }} 项该角色没有对应权限码，已隐藏 ——
            {{
              activeRole?.builtin
                ? '内置角色的码由代码声明（src/app/*/permission/roles.js），改完重启后端才生效。'
                : '先去「角色编辑 → 权限码」补上，它们才会出现在这里。'
            }}
          </p>
          <div class="menu-list">
            <label
              v-for="item in flatMenus"
              :key="item.node.id"
              class="menu-item"
              :style="{ paddingLeft: `${item.depth * 16}px` }"
            >
              <input
                type="checkbox"
                :checked="checked.includes(item.node.id)"
                @change="toggleMenu(item.node.id, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ item.node.name }}</span>
              <span class="tag" style="margin-left: 6px">{{
                item.node.type === 'dir' ? '目录' : item.node.type === 'btn' ? '按钮' : '页面'
              }}</span>
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
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface-2);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--mauth-radius-xs);
  font-size: 13px;
  cursor: pointer;
}

.menu-item:hover {
  background: var(--mauth-hover);
}

/* 角色表单：权限码面板 */
.modal--wide {
  max-width: 720px;
}

.form-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--mauth-text-mid);
}

.perm-panel {
  max-height: 320px;
  overflow-y: auto;
  display: grid;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface-2);
}

.perm-group__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.perm-group__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--mauth-text-mid);
}

.perm-group__count {
  font-weight: 400;
  opacity: 0.7;
}

.perm-items {
  display: grid;
  /* 220 起：名称与编码已经分两行，中文名独占一行足够显示；再大会掉成一列 */
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 4px;
}

.perm-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 5px 8px;
  border-radius: var(--mauth-radius-xs);
  font-size: 12px;
  cursor: pointer;
  border: 1px solid transparent;
}

/* 勾选框对齐首行文字（两行结构下 align-items:center 会飘到中间） */
.perm-item > input[type='checkbox'] {
  flex: none;
  margin: 2px 0 0;
  accent-color: var(--mauth-primary);
  cursor: pointer;
}

/* 名称 + 编码竖排容器：名称完整可读，编码退成次要信息 */
.perm-item__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.perm-item:hover {
  background: var(--mauth-hover);
}

.perm-item.is-on {
  border-color: var(--mauth-primary);
  background: var(--mauth-primary-soft);
}

.perm-item.is-disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

/*
 * 只读展示（内置角色的权限码）：没有勾选框，所以既不该有 hover 反馈，
 * 也不该用"禁用"那种发灰 —— 发灰读起来像"权限被停用了"，而它只是不可改。
 */
.perm-item--static {
  cursor: default;
  border-color: var(--mauth-border);
  background: var(--mauth-surface);
}

/* 没有中文名的权限码独占一行并左对齐（否则它会贴在右侧，看着像缺了内容） */
.perm-item__code--solo {
  font-size: 11.5px;
  opacity: 0.75;
}

.perm-item--static:hover {
  background: var(--mauth-surface);
}

.perm-panel--static {
  background: var(--mauth-surface);
}

.perm-item__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--mauth-text);
}

.perm-item__code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 10.5px;
  line-height: 1.4;
  opacity: 0.6;
}

/* 通配提示：说明"已选 N"里包含整组授权，避免与可见的勾选行数不一致时被当成 bug */
.perm-wild-hint {
  font-weight: 400;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

/* ── 应用分档 ─────────────────────────────────────────────── */
.role-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 2px;
}

.role-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--mauth-border-strong);
  border-radius: 999px;
  background: var(--mauth-surface);
  color: var(--mauth-text-mid);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition:
    color 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease;
}

.role-tab:hover {
  color: var(--mauth-primary);
  border-color: var(--mauth-primary);
}

/* 选中态用主色描边而不是实心：分档是筛选器，不该抢表格的视觉重量 */
.role-tab.is-on {
  border-color: var(--mauth-primary);
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
}

.role-tab__count {
  padding: 0 5px;
  border-radius: 999px;
  background: var(--mauth-hover);
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.role-tab.is-on .role-tab__count {
  background: color-mix(in srgb, var(--mauth-primary) 14%, transparent);
  color: var(--mauth-primary);
}

/* 分组标题行：贴着表格走，比单独一张卡片更紧凑 */
.role-group-row td {
  padding: 6px 12px;
  background: var(--mauth-surface-2);
  border-bottom: 1px solid var(--mauth-border);
}

.role-group-row__label {
  font-size: 12px;
  font-weight: 620;
  color: var(--mauth-text);
}

.role-group-row__count {
  margin-left: 6px;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.role-group-row__hint {
  margin-left: 8px;
  font-size: 10.5px;
  color: var(--mauth-text-faint);
  opacity: 0.8;
}

/* 数据范围：下拉 + 自定义时展开的部门勾选 */
.scope__depts {
  margin-top: 8px;
  max-height: 180px;
  overflow-y: auto;
  padding: 8px 4px;
  border: 1px dashed var(--mauth-border);
  border-radius: 8px;
}

.scope__dept {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 4px;
  padding-bottom: 4px;
  font-size: 12.5px;
  color: var(--mauth-text-mid);
}

/* 矩阵不可用时的说明面板：读起来要像"缺一个条件"，不是"权限出错" */
.matrix-locked {
  display: grid;
  gap: 6px;
  padding: 20px 22px;
}

.matrix-locked__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  font-weight: 620;
  color: var(--mauth-text);
}

.matrix-locked__hint {
  margin: 0;
  max-width: 60ch;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--mauth-text-mid);
}

.matrix-locked__hint code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--mauth-surface-2);
  font-size: 11.5px;
}
</style>
