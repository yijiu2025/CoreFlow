<script setup lang="ts">
/**
 * 菜单管理（表格 + 树形缩进）
 *
 * 菜单决定侧栏结构与按钮权限（谁能看到由「角色 × 菜单」矩阵决定）；
 * `permission` 是按钮权限码，后端接口放行仍看 PBAC policy。
 * 删除有子菜单或仍被角色引用时会被后端拒绝（前端只展示原因）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, defineAsyncComponent, onMounted, reactive, ref } from 'vue';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next';
import AppIcon from '@/components/ui/AppIcon.vue';
import AppSwitch from '@/components/ui/AppSwitch.vue';
import ReadOnlyTag from '@/components/ui/ReadOnlyTag.vue';
import { ICON_NAMES } from '@/components/ui/icon-registry';
import { createMenu, menuApps, menuPermissionOptions, menuTree, removeMenu, updateMenu } from '@/api/system';
import type { MenuNode } from '@/api/types';
import { useRenderDevice } from '@/views/device/useRenderDevice';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

/**
 * 当前渲染设备
 *
 * 菜单表 8 列（名称 / 类型 / 路由 / 权限码 / 排序 / 显示 / 状态 / 操作），
 * 手机上必然横滚，而操作列在最右 —— 够不到。手机上换成"缩进卡片"：
 * 名称与类型在标题行、「显示」开关留在右侧、路由/权限码/排序压进第二行。
 */
const device = useRenderDevice();

/**
 * 本应用可用的权限码（只含 `admin:` 开头的）
 *
 * 🔴 菜单树是本应用自己的，权限码也只能是本应用的。别的应用的码写进来永远匹配不到
 *    本应用的任何一个 `requirePermission`：看起来配了权限，实际谁都点不开；角色授权页
 *    还会把它算成"该角色拥有别的应用的能力"。后端已拒写，这里只负责**别把它摆出来**。
 *
 * 拉取失败时退化成自由输入（不阻断编辑），校验仍由后端兜底。
 */
const permissionOptions = ref<Array<{ code: string; label: string; type: string }>>([]);
const permissionSet = computed(() => new Set(permissionOptions.value.map(item => item.code)));

/**
 * 可配置的应用
 *
 * 只有注册过权限码的应用才在这里 —— 没有码就没有可授权的界面元素，
 * 列出来只会是一个永远为空的分档。
 */
const apps = ref<Array<{ id: string; name: string; writable: boolean }>>([]);

/** 当前查看的应用（'' = 全部应用） */
const appFilter = ref('');

/** 当前账号可配置的应用（表单下拉只列这些，避免选了才 403） */
const writableApps = computed(() => apps.value.filter(app => app.writable !== false));

/** 当前视图对应的应用是否可写（分档在"全部"时按 admin 判断） */
const currentAppWritable = computed(() => {
  const id = appFilter.value || 'admin';
  return apps.value.find(app => app.id === id)?.writable !== false;
});

/** 应用显示名 */
function appLabelOf(id: string): string {
  return apps.value.find(item => item.id === id)?.name || (id === 'admin' ? '管理后台' : id);
}

/**
 * 导航星系：异步加载
 *
 * 它连带 Canvas 舞台与 gsap（约 70KB），而菜单页首屏是表格 —— 不该为
 * 「可能不点的一档视图」付这个体积。
 */
const MenuStarMap = defineAsyncComponent(() => import('@/components/business/MenuStarMap.vue'));

/** 视图档位：表格 / 导航星系 */
const altView = ref<'table' | 'star'>('table');

const trees = ref<MenuNode[]>([]);
const loading = ref(false);
const errorMessage = ref('');
const toast = ref('');

const dialogOpen = ref(false);
const editingId = ref<number | null>(null);
const form = reactive({
  parentId: 0,
  /** 归属应用：决定权限码命名空间与树的归属 */
  appId: 'admin',
  name: '',
  /*
   * 标注成联合类型而不是让它推断成 string：
   * `reactive()` 会把字面量放宽成 string，之后 `TYPE_TEXT[form.type]` 就索引不到
   * `Record<'dir'|'menu'|'btn', string>`（TS7053），而这只是"字面量被放宽"造成的假问题。
   */
  type: 'menu' as MenuNode['type'],
  icon: 'Circle',
  path: '',
  component: '',
  permission: '',
  sort: 0,
  visible: 1,
  status: 1
});

/**
 * 已折叠的节点 id（只对「有子项」的目录 / 页面有意义）
 *
 * 折叠是**纯视图状态**，不落库、不参与任何权限判断：同一个菜单树不同人看，
 * 展开程度本来就该各自决定。
 */
const collapsed = ref<Set<number>>(new Set());

/**
 * 切换某个节点的折叠状态
 *
 * @param id 节点 ID
 */
function toggleCollapse(id: number): void {
  const next = new Set(collapsed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed.value = next;
}

/** 全树里所有「有子项」的节点 id（与当前折叠状态无关） */
const expandableIds = computed(() => {
  const ids: number[] = [];
  const walk = (nodes: MenuNode[]): void => {
    for (const node of nodes) {
      if (node.children?.length) {
        ids.push(node.id);
        walk(node.children);
      }
    }
  };
  walk(trees.value);
  return ids;
});

/** 是否已全部折叠（决定按钮显示「展开全部」还是「折叠全部」） */
const allCollapsed = computed(
  () => expandableIds.value.length > 0 && expandableIds.value.every(id => collapsed.value.has(id))
);

/** 全部折叠 / 全部展开 */
function toggleAll(): void {
  collapsed.value = allCollapsed.value ? new Set() : new Set(expandableIds.value);
}

/**
 * 菜单总项数
 *
 * 不能用 `flat.length`：它是**当前可见**的行数，折叠后会变小，
 * 标题就会从"共 12 项"变成"共 5 项"，看起来像菜单被删了。
 */
const totalCount = computed(() => {
  let n = 0;
  const walk = (nodes: MenuNode[]): void => {
    for (const node of nodes) {
      n += 1;
      if (node.children?.length) walk(node.children);
    }
  };
  walk(trees.value);
  return n;
});

/** 扁平化（缩进展示；折叠节点的子树不展开） */
const flat = computed(() => {
  const out: Array<{ node: MenuNode; depth: number; hasChildren: boolean; isCollapsed: boolean }> = [];
  const walk = (nodes: MenuNode[], depth: number): void => {
    for (const node of nodes) {
      const hasChildren = Boolean(node.children?.length);
      const isCollapsed = hasChildren && collapsed.value.has(node.id);
      out.push({ node, depth, hasChildren, isCollapsed });
      if (hasChildren && !isCollapsed) walk(node.children ?? [], depth + 1);
    }
  };
  walk(trees.value, 0);
  return out;
});

/**
 * 在完整树里找一个节点（不受折叠影响）
 *
 * `flat` 只含当前可见行，折叠后拿它查父级会查不到 —— 弹窗标题就会掉回"新建菜单"。
 *
 * @param id 节点 ID
 * @returns 节点或 null
 */
function findNode(id: number): MenuNode | null {
  const walk = (nodes: MenuNode[]): MenuNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const hit = walk(node.children ?? []);
      if (hit) return hit;
    }
    return null;
  };
  return walk(trees.value);
}

/**
 * 提示条
 *
 * @param message 文案
 */
function notify(message: string): void {
  toast.value = message;
  window.setTimeout(() => (toast.value = ''), 2600);
}

/** 首次加载是否已按默认规则折叠过（后续刷新不覆盖用户的手动展开） */
let collapsedInitialized = false;

/**
 * 默认折叠：只含「按钮」的子树
 *
 * 按钮是权限点，不是导航项：混在目录/页面里会让人以为"新增的按钮变成了一个菜单"。
 * 默认收起，父行右侧的子项数徽标仍能说明"它下面有 1 个按钮"。
 * 只处理"全部子项都是按钮"的节点 —— 目录下的页面保持展开，否则一进页面全是收起的。
 *
 * @param nodes 菜单树
 * @returns 要折叠的节点 id
 */
function defaultCollapsed(nodes: MenuNode[]): Set<number> {
  const set = new Set<number>();
  const walk = (list: MenuNode[]): void => {
    for (const node of list) {
      const kids = node.children ?? [];
      if (kids.length > 0 && kids.every(kid => kid.type === 'btn')) set.add(node.id);
      walk(kids);
    }
  };
  walk(nodes);
  return set;
}

/** 加载菜单树 */
async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await menuTree(appFilter.value || undefined);
    /*
     * 必须是数组。
     *
     * 网关/代理出错时可能返回一段字符串（HTML 或 JSON 文本）而不是数组，
     * 直接塞进 `trees` 会让 `flat` 去遍历**字符串的每个字符** —— 表格里凭空
     * 多出几百行空菜单，看起来像渲染炸了，实际是数据形状不对。宁可空表 + 报错。
     */
    trees.value = Array.isArray(result) ? result : [];
    if (!Array.isArray(result)) errorMessage.value = '菜单树返回格式异常，请刷新重试';
    // 只在首次加载时套默认折叠：刷新后仍保留用户手动展开/收起的状态
    if (!collapsedInitialized && Array.isArray(result)) {
      collapsed.value = defaultCollapsed(result);
      collapsedInitialized = true;
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

/**
 * 打开新建表单
 *
 * 从行内「＋」进入时按上级推断类型：目录下建页面，页面下建按钮 ——
 * 这是唯一合理的层级（按钮不能有子项，也绝不能挂在目录下）。
 *
 * @param parent 上级菜单（未传则为根）
 */
/**
 * 切换归属应用
 *
 * 换应用后原来的权限码属于旧命名空间，留着必被后端拒写，所以直接清空。
 *
 * @returns {void}
 */
function onAppChange(): void {
  form.permission = '';
  void loadPermissionOptions(form.appId);
}

function openCreate(parent?: MenuNode): void {
  const childType: MenuNode['type'] = parent?.type === 'menu' ? 'btn' : 'menu';
  editingId.value = null;
  const appId = parent?.app_id || appFilter.value || 'admin';
  Object.assign(form, {
    parentId: parent?.id ?? 0,
    appId,
    name: '',
    type: childType,
    icon: 'Circle',
    path: '',
    component: '',
    permission: '',
    sort: 0,
    visible: 1,
    status: 1
  });
  void loadPermissionOptions(appId);
  dialogOpen.value = true;
}

/**
 * 打开编辑表单
 *
 * @param node 菜单节点
 */
function openEdit(node: MenuNode): void {
  editingId.value = node.id;
  Object.assign(form, {
    parentId: node.parent_id,
    appId: node.app_id || 'admin',
    name: node.name,
    type: node.type,
    icon: node.icon || 'Circle',
    path: node.path || '',
    component: node.component || '',
    permission: node.permission || '',
    sort: node.sort,
    visible: node.visible,
    status: node.status
  });
  void loadPermissionOptions(node.app_id || 'admin');
  dialogOpen.value = true;
}

/**
 * 「上级菜单」下拉候选项
 *
 * 只有目录/页面能当父级（按钮不能再挂子项）；编辑时排除自己与整棵子树，
 * 否则一保存就把节点挪到自己下面，树直接断掉。
 */
const parentOptions = computed(() => {
  const blocked = new Set<number>();
  if (editingId.value !== null) {
    const self = flat.value.find(item => item.node.id === editingId.value)?.node;
    const collect = (node: MenuNode): void => {
      blocked.add(node.id);
      (node.children ?? []).forEach(collect);
    };
    if (self) collect(self);
  }
  return flat.value
    .filter(item => item.node.type !== 'btn' && !blocked.has(item.node.id))
    .map(item => ({ id: item.node.id, name: item.node.name, depth: item.depth }));
});

/** 类型中文名 */
const TYPE_TEXT: Record<MenuNode['type'], string> = { dir: '目录', menu: '页面', btn: '按钮' };

/**
 * 弹窗标题
 *
 * 新建时必须写明「挂在谁下面」：原先只有一句"新建菜单"，保存后新行直接出现在
 * 列表里，看不出它是谁的子项（尤其同名目录并存时）—— 用户会以为"按钮/子菜单
 * 直接进了菜单"。类型也进标题（新建页面 / 新建按钮），避免默认值是按钮时误建。
 */
const dialogTitle = computed(() => {
  if (editingId.value) return '编辑菜单';
  if (!form.parentId) return '新建菜单';
  const parent = findNode(form.parentId);
  return parent ? `在「${parent.name}」下新建${TYPE_TEXT[form.type]}` : '新建菜单';
});

/**
 * 图标下拉选项
 *
 * 取值来自 `icon-registry`（能渲染的名字就是这些），不让人凭记忆手打 ——
 * 打错不会报错，只会静默变成一个圆，很难发现。
 * 若历史数据里存了注册表外的名字，临时插进选项，避免编辑一次就被改成别的东西。
 */
const iconOptions = computed(() => {
  const list = [...ICON_NAMES];
  if (form.icon && !list.includes(form.icon)) list.unshift(form.icon);
  return list;
});

/**
 * 保存 / 删除后的统一刷新
 *
 * 必须刷两处：
 * 1. 本页表格（`load()`）；
 * 2. 当前账号的侧栏与权限快照（`auth.load(true)`）—— 菜单树是登录时取一次缓存的，
 *    只刷表格的话左侧导航、以及这次改动带来的按钮权限都要等 F5 才生效，
 *    看起来就像"保存了没反应"。
 */
async function refreshAll(): Promise<void> {
  await Promise.all([load(), auth.load(true)]);
}

/** 保存 */
async function submit(): Promise<void> {
  if (!form.name.trim()) {
    notify('请填写菜单名称');
    return;
  }
  // 按钮没有权限码等于没有意义：既无法在矩阵里授权，前端也判不了显隐
  if (form.type === 'btn' && !form.permission.trim()) {
    notify('按钮必须填权限码，例如 admin:user:create');
    return;
  }
  try {
    const payload = { ...form };
    if (editingId.value) {
      await updateMenu(editingId.value, payload);
      notify('已保存');
    } else {
      await createMenu(payload);
      notify('已创建');
    }
    dialogOpen.value = false;
    /*
     * 新建后把父级展开：否则父级正折着，刚建好的子项立刻"消失"，
     * 用户会以为没保存成功又点一次。
     */
    if (!editingId.value && form.parentId) {
      const next = new Set(collapsed.value);
      next.delete(form.parentId);
      collapsed.value = next;
    }
    await refreshAll();
  } catch (err) {
    notify(err instanceof Error ? err.message : '保存失败');
  }
}

/**
 * 删除菜单
 *
 * @param node 菜单节点
 */
async function remove(node: MenuNode): Promise<void> {
  if (!window.confirm(`确认删除菜单「${node.name}」？`)) return;
  try {
    await removeMenu(node.id);
    notify('已删除');
    await refreshAll();
  } catch (err) {
    notify(err instanceof Error ? err.message : '删除失败');
  }
}

/**
 * 行内切换「显示」
 *
 * 直接落库、不进弹窗：这是"先下架再说"的高频动作。
 * 关掉之后**所有人**的侧栏都不再出现这一项 —— 超管、已授权角色都一样：
 * 这是下架，不是取消授权（`sys_role_menu` 原样保留，重新打开即恢复）。
 *
 * @param node 菜单节点
 * @param value 是否显示
 */
async function toggleVisible(node: MenuNode, value: boolean): Promise<void> {
  const isBtn = node.type === 'btn';
  try {
    await updateMenu(node.id, { visible: value ? 1 : 0 });
    notify(
      value
        ? isBtn
          ? '已显示：持有该权限码的角色能看到这个按钮'
          : '已显示'
        : isBtn
          ? '已隐藏：所有角色都不再显示这个按钮（授权保留）'
          : '已隐藏：所有角色的侧栏都不再出现'
    );
    // 必须刷 me：当前会话里的 permissions 是后端算好的生效码，停用/下架按钮会改变它
    await refreshAll();
  } catch (err) {
    notify(err instanceof Error ? err.message : '更新失败');
  }
}

/**
 * 权限码提示
 *
 * 只在"能确定它不属于本应用"时报警：候选列表还没拉到（或拉取失败）时保持沉默 ——
 * 那时任何码都不在集合里，报警只会是误报。
 *
 * @returns 提示文案（空串表示不提示）
 */ const permissionWarning = computed(() => {
  const code = form.permission.trim();
  if (!code || !permissionOptions.value.length) return '';
  return permissionSet.value.has(code) ? '' : `「${code}」不是本应用的权限码，保存会被后端拒绝`;
});

/**
 * 拉本应用权限码
 *
 * 失败静默：拿不到候选不该阻断菜单编辑，非法码仍由后端 `assertOwnPermission` 拒写。
 */
async function loadPermissionOptions(appId = 'admin'): Promise<void> {
  try {
    const result = await menuPermissionOptions(appId);
    permissionOptions.value = result.options || [];
  } catch {
    permissionOptions.value = [];
  }
}

/** 拉应用列表（失败不阻断：只影响分档与显示名，树仍可看） */
async function loadApps(): Promise<void> {
  try {
    const result = await menuApps();
    apps.value = Array.isArray(result) ? result : [];
  } catch {
    apps.value = [{ id: 'admin', name: '管理后台', writable: true }];
  }
}

/**
 * 切换应用分档
 *
 * @param id 应用标识（'' = 全部）
 */
function switchApp(id: string): void {
  if (appFilter.value === id) return;
  appFilter.value = id;
  collapsedInitialized = false;
  void load();
}

/**
 * 应用下拉的 change 处理
 *
 * 刻意**不用** `v-model`：`switchApp` 里"值没变就直接 return"是防重复请求的逻辑，
 * 而 `v-model` 会先把 `appFilter` 改掉，让它永远命中那句 return、树不再重新加载。
 *
 * @param event 原生 select 事件
 */
function onPickApp(event: Event): void {
  switchApp((event.target as HTMLSelectElement).value);
}

onMounted(() => {
  loadApps();
  loadPermissionOptions('admin');
  load();
});
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">菜单管理</h2>
      <span class="page__sub">共 {{ totalCount }} 项</span>
      <ReadOnlyTag code="admin:menu:update" scope="菜单" />
    </div>

    <!--
      筛选条：视图切换 + 应用分档 + 动作压成一行。
      应用分档原来是 9 个 chip（占一整行，换行后还把刷新/折叠挤到第三行），
      改成下拉后与视图切换、右侧动作同排；不可写的应用在下拉里标「只读」。
    -->
    <div class="filterbar">
      <div class="tabbar filterbar__views" role="tablist" aria-label="视图">
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
          :aria-selected="altView === 'star'"
          :class="['tab', { 'is-on': altView === 'star' }]"
          @click="altView = 'star'"
        >
          导航星系
        </button>
      </div>

      <!-- 应用分档：支持多应用后，不同应用的菜单混在一棵树里会没法找 -->
      <select
        v-if="altView === 'table'"
        :value="appFilter"
        class="select filterbar__app"
        aria-label="按应用筛选"
        @change="onPickApp"
      >
        <option value="">全部应用（{{ totalCount }}）</option>
        <option v-for="app in apps" :key="app.id" :value="app.id">
          {{ app.name }}{{ app.writable === false ? '（只读）' : '' }}
        </option>
      </select>

      <!--
        展开/折叠全部放在**左侧控件区**（视图切换 + 应用分档之后），不进右侧动作组。
        它改的是「这张表怎么显示」，和「列表 / 导航星系」是同一类东西；
        右侧只留刷新、新建菜单这种"会打接口 / 改数据"的动作，边界才清楚。
        实边框（不是 `btn--ghost`）：左边紧挨着有边框的下拉，无框会显得残缺。
      -->
      <button
        v-if="altView === 'table' && expandableIds.length > 0"
        class="btn btn--sm"
        type="button"
        @click="toggleAll"
      >
        <AppIcon name="chevronRight" :size="14" :class="{ 'is-open': !allCollapsed }" />
        {{ allCollapsed ? '展开全部' : '折叠全部' }}
      </button>

      <div class="filterbar__actions">
        <button class="btn btn--sm" type="button" :disabled="loading" @click="refreshAll">
          <RefreshCw :size="15" /> 刷新
        </button>
        <button
          v-if="altView === 'table' && auth.hasPermission('admin:menu:create')"
          class="btn btn--primary btn--sm"
          type="button"
          :disabled="!currentAppWritable"
          :title="currentAppWritable ? '' : '你没有该应用的管理权限'"
          @click="openCreate()"
        >
          <Plus :size="15" /> 新建菜单
        </button>
      </div>
    </div>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <section v-if="altView === 'table'" class="panel">
      <div v-if="device !== 'mobile'" class="table-wrap">
        <table class="table">
          <colgroup>
            <col style="width: 148px" />
            <col style="width: 58px" />
            <col style="width: 120px" />
            <col style="width: 148px" />
            <col style="width: 58px" />
            <col style="width: 58px" />
            <col style="width: 58px" />
            <col style="width: 130px" />
          </colgroup>
          <thead>
            <tr>
              <th>名称</th>
              <th>类型</th>
              <th>路由</th>
              <th>权限码</th>
              <th>排序</th>
              <th>显示</th>
              <th>状态</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in flat" :key="item.node.id">
              <!--
                名称列带折叠箭头：目录/页面有子项时可收起来。
                没有子项的节点也放一个同宽占位，否则同一层的名字会左右错位。
              -->
              <td :style="{ paddingLeft: `${10 + item.depth * 18}px` }">
                <div class="menu-cell">
                  <button
                    v-if="item.hasChildren"
                    class="menu-twist"
                    type="button"
                    :aria-expanded="!item.isCollapsed"
                    :aria-label="item.isCollapsed ? `展开 ${item.node.name}` : `收起 ${item.node.name}`"
                    @click="toggleCollapse(item.node.id)"
                  >
                    <AppIcon name="chevronRight" :size="12" :class="{ 'is-open': !item.isCollapsed }" />
                  </button>
                  <span v-else class="menu-twist is-leaf" aria-hidden="true" />
                  <span class="menu-name" :class="{ 'is-btn': item.node.type === 'btn' }">{{ item.node.name }}</span>
                  <span v-if="appFilter === '' && item.depth === 0" class="tag tag--info app-tag">
                    {{ appLabelOf(item.node.app_id) }}
                  </span>
                  <span v-if="item.hasChildren" class="menu-count" :title="`${item.node.children?.length} 个子项`">
                    {{ item.node.children?.length }}
                  </span>
                </div>
              </td>
              <td>
                <span :class="['tag', item.node.type === 'btn' ? 'tag--off' : 'tag--info']">{{
                  TYPE_TEXT[item.node.type]
                }}</span>
              </td>
              <td class="mono">{{ item.node.path || '—' }}</td>
              <td class="mono">{{ item.node.permission || '—' }}</td>
              <td class="mono">{{ item.node.sort }}</td>
              <td>
                <!--
                  所有类型（含按钮）都由「显示」开关控制是否展示：
                  目录/页面 = 侧栏是否出现；按钮 = 是否出现在页面工具栏。
                  置 0 是"下架"，授权原样保留，重新打开即恢复。
                -->
                <AppSwitch
                  :model-value="item.node.visible === 1"
                  :label="`显示 ${item.node.name}`"
                  :disabled="!auth.hasPermission('admin:menu:update')"
                  @update:model-value="value => toggleVisible(item.node, value)"
                />
              </td>
              <td>
                <!-- 状态是记录（正常 / 停用），不是开关；停用后连授权都判否 -->
                <span :class="['tag', item.node.status === 1 ? 'tag--ok' : 'tag--off']">
                  {{ item.node.status === 1 ? '正常' : '停用' }}
                </span>
              </td>
              <td class="col-actions">
                <button
                  v-if="auth.hasPermission('admin:menu:create') && item.node.type !== 'btn'"
                  class="btn btn--ghost btn--sm btn--icon"
                  type="button"
                  :title="`在「${item.node.name}」下新增${item.node.type === 'menu' ? '按钮' : '页面'}`"
                  :aria-label="`在「${item.node.name}」下新增${item.node.type === 'menu' ? '按钮' : '页面'}`"
                  @click="openCreate(item.node)"
                >
                  <Plus :size="15" />
                </button>
                <button
                  v-if="auth.hasPermission('admin:menu:update')"
                  class="btn btn--ghost btn--sm btn--icon"
                  type="button"
                  title="编辑"
                  aria-label="编辑"
                  @click="openEdit(item.node)"
                >
                  <Pencil :size="15" />
                </button>
                <button
                  v-if="auth.hasPermission('admin:menu:delete')"
                  class="btn btn--ghost btn--sm btn--icon is-danger"
                  type="button"
                  title="删除"
                  aria-label="删除"
                  @click="remove(item.node)"
                >
                  <Trash2 :size="15" />
                </button>
              </td>
            </tr>
            <tr v-if="!loading && flat.length === 0">
              <td colspan="8"><div class="empty">暂无菜单</div></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!--
        手机端：缩进卡片。层级靠缩进（每层 14px）+ 折叠箭头表达，
        「显示」开关留在右侧（它是这一屏最常点的控件），其余字段压成一行副标题。
      -->
      <ul v-else class="mlist">
        <li v-for="item in flat" :key="item.node.id" class="mcard">
          <div class="mcard__head">
            <div class="mcard__main">
              <span class="mcard__title" :style="{ paddingLeft: `${item.depth * 14}px` }">
                <button
                  v-if="item.hasChildren"
                  class="mgroup__twist"
                  type="button"
                  :aria-expanded="!item.isCollapsed"
                  :aria-label="item.isCollapsed ? `展开 ${item.node.name}` : `收起 ${item.node.name}`"
                  @click="toggleCollapse(item.node.id)"
                >
                  <AppIcon name="chevronRight" :size="12" :class="{ 'is-open': !item.isCollapsed }" />
                </button>
                <span v-else class="mcard__indent" aria-hidden="true"></span>
                <span class="mcard__title-text" :class="{ 'menu-name--btn': item.node.type === 'btn' }">
                  {{ item.node.name }}
                </span>
                <span :class="['tag', item.node.type === 'btn' ? 'tag--off' : 'tag--info']">
                  {{ TYPE_TEXT[item.node.type] }}
                </span>
                <span v-if="item.hasChildren" class="menu-count">{{ item.node.children?.length }}</span>
              </span>
              <span class="mcard__sub mono" :style="{ paddingLeft: `${20 + item.depth * 14}px` }">
                {{ item.node.path || '无路由' }} · {{ item.node.permission || '无权限码' }}
              </span>
              <span class="mcard__meta" :style="{ paddingLeft: `${20 + item.depth * 14}px` }">
                <span>排序 {{ item.node.sort }}</span>
                <span v-if="appFilter === '' && item.depth === 0">{{ appLabelOf(item.node.app_id) }}</span>
                <span :class="['tag', item.node.status === 1 ? 'tag--ok' : 'tag--off']">
                  {{ item.node.status === 1 ? '正常' : '停用' }}
                </span>
              </span>
            </div>
            <!-- 显示开关：手机上它比"状态"更常用，单独留在右侧不参与换行 -->
            <AppSwitch
              :model-value="item.node.visible === 1"
              :label="`显示 ${item.node.name}`"
              :disabled="!auth.hasPermission('admin:menu:update')"
              @update:model-value="value => toggleVisible(item.node, value)"
            />
          </div>
          <div class="mcard__acts">
            <button
              v-if="auth.hasPermission('admin:menu:create') && item.node.type !== 'btn'"
              class="btn btn--sm"
              type="button"
              @click="openCreate(item.node)"
            >
              <Plus :size="13" /> {{ item.node.type === 'menu' ? '按钮' : '下级' }}
            </button>
            <button
              v-if="auth.hasPermission('admin:menu:update')"
              class="btn btn--sm"
              type="button"
              @click="openEdit(item.node)"
            >
              <Pencil :size="13" /> 编辑
            </button>
            <button
              v-if="auth.hasPermission('admin:menu:delete')"
              class="btn btn--danger btn--sm"
              type="button"
              @click="remove(item.node)"
            >
              <Trash2 :size="13" /> 删除
            </button>
          </div>
        </li>
        <li v-if="!loading && flat.length === 0" class="mlist__hint">暂无菜单</li>
      </ul>
    </section>

    <!-- 导航星系：目录 / 页面 / 按钮的三层星图（复用同一份菜单树） -->
    <section v-if="altView === 'star'">
      <MenuStarMap :tree="trees" @edit="openEdit" @create="openCreate" />
    </section>

    <div v-if="dialogOpen" class="modal-mask" v-mask-close="() => (dialogOpen = false)">
      <div class="modal">
        <header class="modal__head">
          <span class="modal__title">{{ dialogTitle }}</span>
        </header>
        <div class="modal__body">
          <!--
            归属应用决定权限码的命名空间。新建时可选；已有节点禁用 ——
            换应用要连父子一起换，单条换会造出跨应用的父子关系。
          -->
          <label class="field">
            <span class="field__label">归属应用</span>
            <select v-model="form.appId" class="select" :disabled="editingId !== null" @change="onAppChange">
              <option v-for="app in writableApps" :key="app.id" :value="app.id">{{ app.name }}</option>
            </select>
            <p v-if="editingId !== null" class="form-hint">
              已有菜单不能直接更换应用（父子必须同属一个应用），需要更换请删除后重建。
            </p>
          </label>
          <label class="field">
            <span class="field__label">上级菜单</span>
            <select v-model.number="form.parentId" class="select">
              <option :value="0">（根节点）</option>
              <option v-for="item in parentOptions" :key="item.id" :value="item.id">
                {{ '　'.repeat(item.depth) }}{{ item.name }}
              </option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">名称</span>
            <input
              v-model="form.name"
              class="input"
              maxlength="50"
              :placeholder="form.type === 'btn' ? '如：新增用户' : ''"
            />
          </label>
          <label class="field">
            <span class="field__label">类型</span>
            <select v-model="form.type" class="select">
              <option value="dir">目录</option>
              <option value="menu">页面</option>
              <option value="btn">按钮</option>
            </select>
          </label>
          <label v-if="form.type !== 'btn'" class="field">
            <span class="field__label">图标</span>
            <div class="icon-pick">
              <span class="icon-pick__preview"><AppIcon :name="form.icon" :size="16" /></span>
              <select v-model="form.icon" class="select">
                <option v-for="name in iconOptions" :key="name" :value="name">{{ name }}</option>
              </select>
            </div>
          </label>
          <label v-if="form.type !== 'btn'" class="field">
            <span class="field__label">路由</span>
            <input v-model="form.path" class="input" maxlength="200" placeholder="/system/user" />
          </label>
          <label v-if="form.type === 'menu'" class="field">
            <span class="field__label">视图键</span>
            <input v-model="form.component" class="input" maxlength="200" />
          </label>
          <label class="field">
            <span class="field__label">权限码{{ form.type === 'btn' ? '（按钮必填）' : '' }}</span>
            <input
              v-model="form.permission"
              class="input"
              maxlength="100"
              list="menu-permission-options"
              :placeholder="form.type === 'btn' ? 'admin:user:create' : 'admin:user:read'"
            />
            <datalist id="menu-permission-options">
              <option v-for="item in permissionOptions" :key="item.code" :value="item.code">
                {{ item.label }}
              </option>
            </datalist>
            <span v-if="permissionWarning" class="field__error">{{ permissionWarning }}</span>
            <span v-else class="field__hint">只能是本应用的权限码（admin: 开头），可从列表里选。</span>
          </label>
          <label class="field">
            <span class="field__label">排序</span>
            <input v-model.number="form.sort" class="input" type="number" min="0" />
          </label>
          <label v-if="form.type !== 'btn'" class="field">
            <span class="field__label">显示</span>
            <select v-model.number="form.visible" class="select">
              <option :value="1">显示</option>
              <option :value="0">隐藏（所有角色都不显示）</option>
            </select>
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

<style scoped>
/* 筛选条骨架在 components.css（`.filterbar`），这里只钉应用下拉的宽度：
   最长的应用名是「RetroWeb 逆合成工作台」，200px 才不截断。 */
.filterbar__app {
  flex: 0 0 200px;
}

/* 顶层行标注归属应用（"全部"视图下才有意义，分档后冗余） */
.app-tag {
  margin-left: 6px;
  flex: none;
}

/* 图标选择：左边实时预览，右边下拉 —— 选之前就能看见长什么样 */
.icon-pick {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-pick__preview {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border: 1px solid var(--mauth-border-strong);
  border-radius: var(--mauth-radius-xs);
  background: var(--mauth-surface-2);
  color: var(--mauth-text-mid);
}

.icon-pick .select {
  flex: 1;
  min-width: 0;
}

/* 操作列三个图标按钮：删除单独给红色，其余保持幽灵态 */
.btn--icon.is-danger:hover:not(:disabled) {
  color: var(--mauth-danger);
  border-color: color-mix(in srgb, var(--mauth-danger) 34%, transparent);
  background: var(--mauth-danger-soft);
}

/* ── 树形行：折叠箭头 + 名称 + 子项计数 ───────────────────────── */

.menu-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.menu-twist {
  display: grid;
  place-items: center;
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--mauth-text-faint);
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.menu-twist:hover {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

/* 叶子节点的同宽占位：不显示但占位，保证同层名字左边缘对齐 */
.menu-twist.is-leaf {
  cursor: default;
  pointer-events: none;
}

/* 箭头旋转 90° = 已展开（与用户页的部门树同一语义） */
.menu-twist :deep(svg),
.toolbar :deep(svg) {
  transition: transform 0.16s var(--ease);
}

.menu-twist :deep(svg.is-open),
.toolbar :deep(svg.is-open) {
  transform: rotate(90deg);
}

.menu-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 按钮行弱化：它是"权限点"而不是导航项，不该和目录/页面抢注意力 */
.menu-name.is-btn {
  color: var(--mauth-text-mid);
}

/* 子项数：折叠后仍看得出藏了几个 */
.menu-count {
  flex: none;
  min-width: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--mauth-hover);
  color: var(--mauth-text-faint);
  font-size: 10.5px;
  line-height: 16px;
  text-align: center;
}
</style>
