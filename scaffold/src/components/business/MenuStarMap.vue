<script setup lang="ts">
/**
 * 导航星系（图谱舞台，三层下钻）
 *
 * - **全景**：中心珍珠球「导航」，一级目录 / 菜单是内圈玻璃刻度表盘
 *   （刻度 = 该分支内页面被普通角色授权的比例）；页面与按钮按一级分支着分类色
 *   排在中圈、外圈，背景是真实点位与授权连线。悬停表盘点亮整条分支。
 * - **分支**：点表盘 → 珍珠球退左、一级项竖排，下属页面以带标签胶囊扇形长出。
 * - **页面**：点页面 → 授予它的角色在左、它的按钮在右，脉冲 角色 → 页面 → 按钮。
 *
 * 孤立页面（无角色授予）与缺权限标识的按钮发红光；左侧「导航预览」即时渲染侧栏样子。
 *
 * 移植自参考项目 `MenuStarMap.vue`，三处刻意差异：
 *   1. 去掉 `InsightPanel` 与 `PermissionButton`（各带一套与本页无关的样式/权限契约），
 *      改为自绘信息卡 + `auth.hasPermission`；
 *   2. `iam_role` 没有 status 列 ⇒ 启用判定走 `roleActive()`（软删由 paranoid 过滤）；
 *   3. 角色节点点击跳角色页并带上 `?trace=role:<id>`，由角色页第三档接住。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import RelationGraph, { type GraphLink, type GraphNode } from '@/components/charts/RelationGraph.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import type { NetLink, NetNode, NetworkData } from '@/composables/neural';
import { loadPermissionGraph, permissionIndex } from '@/composables/permissionGraph';
import type { MenuNode } from '@/api/types';
import { useAuthStore } from '@/stores/auth';
import { holdersOfMenu, isSuperRole, roleActive } from '@/utils/permissionGraph';

const props = defineProps<{ tree: MenuNode[] }>();
const emit = defineEmits<{ (e: 'edit', menu: MenuNode): void; (e: 'create', parent: MenuNode): void }>();

const auth = useAuthStore();
const router = useRouter();
const size = ref({ w: 0, h: 0 });
const branchId = ref<number | null>(null);
const focusId = ref<number | null>(null);
const hoverBranch = ref<number | null>(null);
const showPreview = ref(true);
const showOrphans = ref(false);

/** 有权限看角色页才去拉关系图（否则表盘刻度恒为 0，徒增一次请求） */
const canTrace = computed(() => auth.hasPermission('admin:role:read'));

onMounted(() => {
  if (canTrace.value) void loadPermissionGraph().catch(() => undefined);
});

interface Entry {
  menu: MenuNode;
  parent: MenuNode | null;
  branch: number;
  depth: number;
}

/** 扁平索引：id → 条目（含所属一级分支与深度） */
const flat = computed(() => {
  const map = new Map<number, Entry>();
  const walk = (nodes: MenuNode[], parent: MenuNode | null, depth: number, branch: number): void => {
    nodes.forEach((m, i) => {
      const b = depth === 0 ? i : branch;
      map.set(m.id, { menu: m, parent, branch: b, depth });
      walk(m.children ?? [], m, depth + 1, b);
    });
  };
  walk(props.tree, null, 0, 0);
  return map;
});

// 树刷新后丢失的聚焦对象自动回退
watch(flat, map => {
  if (branchId.value !== null && !map.has(branchId.value)) branchId.value = null;
  if (focusId.value !== null && !map.has(focusId.value)) focusId.value = null;
});

/**
 * 菜单所属分类色（按一级分支取 1–5）
 *
 * @param id 菜单 ID
 * @returns 分类号
 */
const catOf = (id: number): number => ((flat.value.get(id)?.branch ?? 0) % 5) + 1;

/**
 * 非按钮的下级（目录 / 页面）
 *
 * @param m 菜单
 * @returns 子项
 */
const pagesOf = (m: MenuNode): MenuNode[] => (m.children ?? []).filter(c => c.type !== 'btn');

/**
 * 下级按钮
 *
 * @param m 菜单
 * @returns 子项
 */
const buttonsOf = (m: MenuNode): MenuNode[] => (m.children ?? []).filter(c => c.type === 'btn');

/**
 * 是否没有下级页面（一级项直接是页面）
 *
 * @param m 菜单
 * @returns 判定
 */
const isLeafTop = (m: MenuNode): boolean => !pagesOf(m).length;

/**
 * 授予该菜单的启用非超级角色数；未加载权限图时为 null
 *
 * @param id 菜单 ID
 * @returns 数量
 */
function grantCount(id: number): number | null {
  const idx = permissionIndex.value;
  if (!idx) return null;
  return (idx.rolesOfMenu.get(id) ?? []).filter(r => {
    const role = idx.role.get(r);
    return roleActive(role) && !isSuperRole(role);
  }).length;
}

/**
 * 表盘读数：分支内页面被普通角色授权的比例
 *
 * @param m 一级菜单
 * @returns 0–1
 */
function grantedShare(m: MenuNode): number {
  const pages: MenuNode[] = [];
  const walk = (list: MenuNode[]): void =>
    list.forEach(c => {
      if (c.type === 'menu') pages.push(c);
      walk(c.children ?? []);
    });
  walk(m.type === 'menu' ? [m] : m.children ?? []);
  if (!pages.length || !permissionIndex.value) return 0;
  return pages.filter(p => (grantCount(p.id) ?? 0) > 0).length / pages.length;
}

/**
 * 按钮缺权限码（前后端都无从校验）
 *
 * @param m 菜单
 * @returns 判定
 */
const isDanger = (m: MenuNode): boolean => m.type === 'btn' && !m.permission;

/**
 * 孤立页面：启用中、**页面**、除超管外无人授予
 *
 * 🔴 只统计 `type === 'menu'`：目录不需要被直接授权 —— 只要子项被授予，
 *    侧栏就会出现。把目录算进「孤立」会让计数虚高（实测：授予 2/5/21 三个
 *    页面时，三个目录全被判为孤立，计数 2 → 5），运维会以为配置漏了。
 *    与 `permissionFindings().orphanMenus` 的口径保持一致。
 *
 * @param m 菜单
 * @returns 判定
 */
const isOrphan = (m: MenuNode): boolean => m.type === 'menu' && m.status === 1 && grantCount(m.id) === 0;

/**
 * 节点语义色
 *
 * @param m 菜单
 * @returns tone
 */
const toneOf = (m: MenuNode): GraphNode['tone'] =>
  isDanger(m) || (showOrphans.value && isOrphan(m)) ? 'danger' : m.status !== 1 ? 'off' : undefined;

const layer = computed<'hub' | 'branch' | 'page'>(() =>
  focusId.value !== null ? 'page' : branchId.value !== null ? 'branch' : 'hub'
);

/** 页面层的主体：聚焦按钮时取其所属页面 */
const pageMenu = computed<MenuNode | null>(() => {
  if (focusId.value === null) return null;
  const e = flat.value.get(focusId.value);
  if (!e) return null;
  return e.menu.type === 'btn' && e.parent ? e.parent : e.menu;
});

/* ── 全景几何：以珍珠球为心的三圈椭圆 ── */
const PREVIEW_W = 226;
const leftPad = computed(() =>
  showPreview.value && size.value.w >= 1100 && focusId.value === null ? PREVIEW_W : 0
);

/**
 * 椭圆几何参数
 *
 * @returns 圆心、半轴与可用宽度
 */
function geometry(): { cx: number; cy: number; kx: number; ky: number; W: number } {
  const { w, h } = size.value;
  const left = leftPad.value;
  const W = w - left;
  const cx = left + W / 2;
  const cy = h * 0.5;
  const kx = Math.max(160, W / 2 - 60);
  const ky = Math.max(140, h / 2 - 40);
  return { cx, cy, kx, ky, W };
}

const RING = { hub: 0.52, page: 0.77, btn: 0.97 };

/**
 * 子树叶子数（含自身），用于扇区加权
 *
 * @param m 菜单
 * @returns 数量
 */
const leaves = (m: MenuNode): number =>
  1 + (m.children?.length ? m.children.reduce((a, c) => a + leaves(c), 0) : 0);

/** 每个一级项占据的扇区：按叶子数加权，但设保底份额，保证表盘之间留出间距 */
const sectors = computed(() => {
  const raw = props.tree.reduce((a, m) => a + leaves(m), 0) || 1;
  const floor = raw / Math.max(1, props.tree.length * 0.85);
  const weight = (m: MenuNode): number => Math.max(leaves(m), floor);
  const total = props.tree.reduce((a, m) => a + weight(m), 0);
  let cursor = -Math.PI / 2 - (props.tree[0] ? (weight(props.tree[0]) / total) * Math.PI : 0);
  return props.tree.map(m => {
    const span = (weight(m) / total) * Math.PI * 2;
    const s = { menu: m, start: cursor, span, mid: cursor + span / 2 };
    cursor += span;
    return s;
  });
});

/** 背景网络：真实菜单点位与父子关系 */
const network = computed<NetworkData | null>(() => {
  const { w, h } = size.value;
  if (!w || !h || !props.tree.length) return null;
  const { cx, cy, kx, ky } = geometry();
  const nodes: NetNode[] = [];
  const links: NetLink[] = [];
  sectors.value.forEach(({ menu: top, start, span, mid }, bi) => {
    const cat = (bi % 5) + 1;
    nodes.push({
      id: `m:${top.id}`,
      x: cx + Math.cos(mid) * kx * RING.hub,
      y: cy + Math.sin(mid) * ky * RING.hub,
      cat,
      r: 0.1,
      depth: 1
    });
    const pages = pagesOf(top);
    const directBtns = buttonsOf(top);
    const pageSlots = pages.length || 1;
    pages.forEach((page, i) => {
      const a = start + span * ((i + 0.5) / pageSlots);
      const id = `m:${page.id}`;
      nodes.push({
        id,
        x: cx + Math.cos(a) * kx * RING.page,
        y: cy + Math.sin(a) * ky * RING.page,
        cat,
        r: 2.8,
        depth: 2,
        label: page.name,
        tone: toneOf(page) === 'danger' ? 'danger' : page.status !== 1 ? 'off' : undefined
      });
      links.push({ a: `m:${top.id}`, b: id, cat });
      const btns = buttonsOf(page);
      const sub = (span / pageSlots) * 0.8;
      btns.forEach((btn, j) => {
        const ba = a - sub / 2 + sub * ((j + 0.5) / btns.length);
        const bid = `m:${btn.id}`;
        nodes.push({
          id: bid,
          x: cx + Math.cos(ba) * kx * RING.btn,
          y: cy + Math.sin(ba) * ky * RING.btn,
          cat,
          r: 1.5,
          depth: 3,
          label: btn.permission ?? btn.name,
          tone: isDanger(btn) ? 'danger' : btn.status !== 1 ? 'off' : undefined
        });
        links.push({ a: id, b: bid, cat });
      });
    });
    directBtns.forEach((btn, j) => {
      const ba = start + span * ((j + 0.5) / directBtns.length);
      const bid = `m:${btn.id}`;
      nodes.push({
        id: bid,
        x: cx + Math.cos(ba) * kx * RING.btn,
        y: cy + Math.sin(ba) * ky * RING.btn,
        cat,
        r: 1.5,
        depth: 3,
        label: btn.permission ?? btn.name,
        tone: isDanger(btn) ? 'danger' : undefined
      });
      links.push({ a: `m:${top.id}`, b: bid, cat });
    });
  });
  return { nodes, links };
});

const networkLit = computed(() =>
  layer.value !== 'hub' || hoverBranch.value === null ? null : catOf(hoverBranch.value)
);

/* ── 场景 ── */
const COL_TOP = 76;
const COL_BOTTOM = 40;

/**
 * 把条目排成一列
 *
 * @param items 条目
 * @param x 列 x
 * @param H 舞台高
 * @param make 生成节点
 * @returns 节点数组
 */
function column<T>(
  items: T[],
  x: number,
  H: number,
  make: (item: T, y: number, i: number, n: number) => GraphNode
): GraphNode[] {
  const span = Math.max(120, H - COL_TOP - COL_BOTTOM);
  const n = items.length;
  const gap = n > 1 ? Math.min(52, span / (n - 1)) : 0;
  const y0 = COL_TOP + span / 2 - (gap * (n - 1)) / 2;
  return items.map((item, i) => make(item, y0 + i * gap, i, n));
}

/**
 * 依次入场的延迟
 *
 * @param i 序号
 * @param n 总数
 * @param base 基准
 * @returns 秒
 */
const stagger = (i: number, n: number, base = 0): number => base + i * Math.min(0.09, 1.6 / Math.max(n, 1));

const scene = computed<{ nodes: GraphNode[]; links: GraphLink[] }>(() => {
  const { w, h } = size.value;
  if (!w || !h || !props.tree.length) return { nodes: [], links: [] };
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  if (layer.value === 'hub') {
    const { cx, cy, kx, ky } = geometry();
    nodes.push({
      id: 'root',
      x: cx,
      y: cy,
      size: 72,
      label: '导航',
      sub: `${flat.value.size} 项`,
      kind: 'core',
      interactive: false,
      float: true
    });
    sectors.value.forEach(({ menu: m, mid }, i) => {
      const id = `m:${m.id}`;
      nodes.push({
        id,
        x: cx + Math.cos(mid) * kx * RING.hub,
        y: cy + Math.sin(mid) * ky * RING.hub,
        size: 80,
        kind: 'hub',
        label: m.name,
        sub: isLeafTop(m) ? m.path ?? '' : `${pagesOf(m).length} 个页面`,
        icon: m.icon || 'menu',
        cat: catOf(m.id),
        tone: toneOf(m),
        count: leaves(m) - 1 || undefined,
        ratio: grantedShare(m),
        from: 'root',
        delay: 0.7 + i * 0.12,
        float: true
      });
      links.push({ a: 'root', b: id, flow: 'both', cat: catOf(m.id), dashed: m.visible === 0 });
    });
    return { nodes, links };
  }

  const H = h;
  const left = leftPad.value;
  const W = w - left - (layer.value === 'page' && w >= 900 ? 392 : 0);
  const cy = COL_TOP + (H - COL_TOP - COL_BOTTOM) / 2;
  const branch = flat.value.get(branchId.value ?? -1)?.menu;
  if (!branch) return { nodes, links };

  if (layer.value === 'branch') {
    const coreX = left + Math.max(76, W * 0.06);
    const colX = coreX + 130;
    nodes.push({ id: 'root', x: coreX, y: cy, size: 56, label: '导航', kind: 'core', interactive: false });
    // 一级项竖排：选中居中放大，其余上下排开并退暗
    const others = props.tree.filter(m => m.id !== branch.id);
    const order = [...others.slice(0, Math.ceil(others.length / 2)), branch, ...others.slice(Math.ceil(others.length / 2))];
    const k = order.indexOf(branch);
    const gap = Math.min(130, (H - 120) / Math.max(order.length - 1, 1));
    order.forEach((m, i) => {
      const sel = m.id === branch.id;
      const id = `m:${m.id}`;
      nodes.push({
        id,
        x: colX,
        y: cy + (i - k) * gap,
        size: sel ? 100 : 56,
        ratio: grantedShare(m),
        kind: 'hub',
        label: m.name,
        sub: sel ? `${pagesOf(m).length} 个页面` : undefined,
        icon: m.icon || 'menu',
        cat: catOf(m.id),
        tone: toneOf(m),
        count: sel ? leaves(m) - 1 : undefined,
        from: 'root',
        float: true
      });
      links.push({ a: 'root', b: id, flow: sel ? 'both' : 'none', shape: 'h', cat: catOf(m.id) });
    });
    const pages = pagesOf(branch);
    const fanX = Math.min(Math.max(colX + 280, left + W * 0.42), left + W - 300);
    const fan = column(pages, fanX, H, (p, y, i, n) => ({
      id: `m:${p.id}`,
      x: fanX,
      y,
      kind: 'item',
      align: 'left',
      label: p.name,
      sub: p.path ?? p.permission ?? '',
      count: buttonsOf(p).length ? `${buttonsOf(p).length} 按钮` : undefined,
      icon: p.icon || undefined,
      cat: catOf(p.id),
      tone: toneOf(p),
      from: `m:${branch.id}`,
      delay: 0.15 + stagger(i, n)
    }));
    nodes.push(...fan);
    fan.forEach(n =>
      links.push({
        a: `m:${branch.id}`,
        b: n.id,
        flow: 'forward',
        shape: 'h',
        cat: catOf(branch.id),
        tone: n.tone === 'danger' ? 'danger' : undefined,
        dashed: flat.value.get(Number(n.id.slice(2)))?.menu.visible === 0
      })
    );
    return { nodes, links };
  }

  // 页面层：角色 → 页面 → 按钮
  const page = pageMenu.value;
  if (!page) return { nodes, links };
  const pid = `m:${page.id}`;
  const cat = catOf(page.id);
  nodes.push({
    id: pid,
    x: left + W * 0.44,
    y: cy,
    kind: 'item',
    label: page.name,
    sub: page.permission ?? page.path ?? '',
    icon: page.icon || 'menu',
    cat,
    tone: toneOf(page),
    count: page.type === 'dir' ? '目录' : '页面'
  });
  const btns = buttonsOf(page);
  nodes.push(
    ...column(btns, left + W * 0.72, H, (b, y, i, n) => ({
      id: `m:${b.id}`,
      x: left + W * 0.72,
      y,
      kind: 'item',
      align: 'left',
      label: b.name,
      sub: b.permission ?? '缺少权限标识',
      cat,
      tone: toneOf(b),
      from: pid,
      delay: stagger(i, n, 0.2)
    }))
  );
  btns.forEach(b =>
    links.push({ a: pid, b: `m:${b.id}`, flow: 'forward', shape: 'h', cat, tone: isDanger(b) ? 'danger' : undefined })
  );
  const idx = permissionIndex.value;
  if (idx) {
    const roles = holdersOfMenu(idx, page.id).roles;
    nodes.push(
      ...column(roles, left + W * 0.16, H, (r, y, i, n) => ({
        id: `role:${r.id}`,
        x: left + W * 0.16,
        y,
        kind: 'item',
        align: 'right',
        label: r.name,
        sub: r.code,
        cat: 3,
        tone: roleActive(r) ? undefined : 'off',
        from: pid,
        delay: stagger(i, n, 0.1)
      }))
    );
    roles.forEach(r => links.push({ a: `role:${r.id}`, b: pid, flow: 'forward', shape: 'h', cat: 3 }));
  }
  return { nodes, links };
});

const highlight = computed<string[] | null>(() => {
  if (layer.value === 'branch') {
    return scene.value.nodes.filter(n => !(n.kind === 'hub' && n.id !== `m:${branchId.value}`)).map(n => n.id);
  }
  if (layer.value === 'page' && focusId.value !== null) {
    const f = flat.value.get(focusId.value);
    if (f?.menu.type === 'btn') {
      return [
        `m:${f.menu.id}`,
        `m:${pageMenu.value?.id}`,
        ...scene.value.nodes.filter(n => n.id.startsWith('role:')).map(n => n.id)
      ];
    }
  }
  return null;
});

/**
 * 点击节点
 *
 * @param node 节点
 */
function onSelect(node: GraphNode): void {
  if (node.id.startsWith('role:')) {
    void router.push({ path: '/system/role', query: { trace: node.id } });
    return;
  }
  const id = Number(node.id.slice(2));
  const e = flat.value.get(id);
  if (!e) return;
  if (e.depth === 0) {
    branchId.value = id;
    focusId.value = isLeafTop(e.menu) ? id : null;
    hoverBranch.value = null;
    return;
  }
  focusId.value = id;
}

/** 返回上一层 */
function back(): void {
  if (focusId.value !== null) {
    const leaf = branchId.value !== null && focusId.value === branchId.value;
    const f = flat.value.get(focusId.value);
    // 按钮聚焦先退回所属页面，再退回分支
    if (f?.menu.type === 'btn' && f.parent) {
      focusId.value = f.parent.id;
      return;
    }
    focusId.value = null;
    if (leaf) branchId.value = null;
    return;
  }
  branchId.value = null;
}

/** 回到全景 */
function home(): void {
  focusId.value = null;
  branchId.value = null;
}

/**
 * 悬停一级项时点亮整条分支
 *
 * @param id 悬停节点
 */
function onHover(id: string | null): void {
  const n = id?.startsWith('m:') ? flat.value.get(Number(id.slice(2))) : null;
  hoverBranch.value = n && n.depth === 0 ? n.menu.id : null;
}

/**
 * 从任意节点跳到它所在的分支
 *
 * @param id 菜单 ID
 */
function jump(id: number): void {
  const e = flat.value.get(id);
  if (!e) return;
  let top: Entry | undefined = e;
  while (top?.parent) top = flat.value.get(top.parent.id);
  branchId.value = top?.menu.id ?? null;
  focusId.value = e.depth === 0 && !isLeafTop(e.menu) ? null : id;
}

/* ── 信息卡 ── */
const TYPE: Record<MenuNode['type'], string> = { dir: '目录', menu: '页面', btn: '按钮' };

interface CardChip {
  id: string;
  label: string;
  sub: string;
  tone?: GraphNode['tone'];
}

const card = computed<{
  kind: string;
  icon: string;
  title: string;
  subtitle: string;
  status: string;
  tiles: Array<{ label: string; value: number | string }>;
  groups: Array<{ title: string; chips: CardChip[] }>;
  menu: MenuNode;
} | null>(() => {
  if (focusId.value === null) return null;
  const entry = flat.value.get(focusId.value);
  if (!entry) return null;
  const m = entry.menu;
  const crumbs: string[] = [];
  let cur: Entry | undefined = entry;
  while (cur) {
    crumbs.unshift(cur.menu.name);
    cur = cur.parent ? flat.value.get(cur.parent.id) : undefined;
  }
  const idx = permissionIndex.value;
  const holders = idx ? holdersOfMenu(idx, m.id) : null;
  return {
    kind: TYPE[m.type],
    icon: m.type === 'btn' ? 'key' : m.icon || 'menu',
    title: m.name,
    subtitle: m.permission || m.path || '',
    status: crumbs.join(' / '),
    tiles: [
      { label: '下级', value: m.children?.length ?? 0 },
      { label: '授予角色', value: holders ? holders.roles.length : '—' },
      { label: '覆盖用户', value: holders && idx?.graph.usersVisible ? holders.users.length : '—' }
    ],
    groups: [
      ...(holders
        ? [
            {
              title: '授予角色',
              chips: holders.roles.map<CardChip>(r => ({ id: `role:${r.id}`, label: r.name, sub: r.code }))
            }
          ]
        : []),
      ...(m.children?.length
        ? [
            {
              title: m.type === 'menu' ? '页面按钮' : '下级菜单',
              chips: m.children.map<CardChip>(c => ({
                id: `menu:${c.id}`,
                label: c.name,
                sub: c.permission ?? '',
                tone: isDanger(c) ? 'danger' : c.status !== 1 ? 'off' : undefined
              }))
            }
          ]
        : [])
    ],
    menu: m
  };
});

/**
 * 卡片里的条目跳转
 *
 * @param chip 条目
 */
function onChip(chip: CardChip): void {
  if (chip.id.startsWith('menu:')) {
    focusId.value = Number(chip.id.slice(5));
    return;
  }
  if (chip.id.startsWith('role:')) void router.push({ path: '/system/role', query: { trace: chip.id } });
}

/* ── 导航预览与图例 ── */
const preview = computed(() => props.tree.filter(m => m.type !== 'btn'));

const findings = computed(() => {
  let orphan = 0;
  let noCode = 0;
  let hidden = 0;
  flat.value.forEach(({ menu }) => {
    if (isDanger(menu)) noCode += 1;
    else if (isOrphan(menu)) orphan += 1;
    if (menu.visible === 0 && menu.type !== 'btn') hidden += 1;
  });
  return { orphan, noCode, hidden };
});

const crumbs = computed(() => {
  const list: Array<{ id: number; label: string }> = [];
  const b = branchId.value !== null ? flat.value.get(branchId.value) : null;
  if (b) list.push({ id: b.menu.id, label: b.menu.name });
  const pm = pageMenu.value;
  if (pm && pm.id !== b?.menu.id) list.push({ id: pm.id, label: pm.name });
  const f = focusId.value !== null ? flat.value.get(focusId.value) : null;
  if (f && f.menu.type === 'btn') list.push({ id: f.menu.id, label: f.menu.name });
  return list;
});

const orbits = computed(() => {
  if (layer.value !== 'hub' || !size.value.w) return [];
  const { kx, ky } = geometry();
  return [RING.hub, RING.page, RING.btn].map(r => ({ rx: kx * r, ry: ky * r }));
});
</script>

<template>
  <RelationGraph
    v-model:size="size"
    class="starmap"
    variant="stage"
    label="导航星系"
    :nodes="scene.nodes"
    :links="scene.links"
    :active-id="focusId !== null ? `m:${focusId}` : null"
    :highlight="highlight"
    :network="network"
    :network-focus="networkLit"
    :network-alpha="layer === 'hub' ? 1 : layer === 'branch' ? 0.3 : 0.12"
    :orbits="orbits"
    @select="onSelect"
    @back="back"
    @hover="onHover"
  >
    <template #tl>
      <nav class="trace-crumbs m-float" aria-label="星系路径">
        <button v-if="layer !== 'hub'" class="trace-back" type="button" aria-label="返回上一层" @click="back">
          <AppIcon name="chevronLeft" :size="14" />
        </button>
        <button type="button" :class="['trace-crumb', { 'is-current': layer === 'hub' }]" @click="home">
          <AppIcon name="menu" :size="13" />导航
        </button>
        <template v-for="(c, i) in crumbs" :key="c.id">
          <span class="trace-sep" aria-hidden="true">/</span>
          <b v-if="i === crumbs.length - 1" class="trace-crumb is-current">{{ c.label }}</b>
          <button v-else type="button" class="trace-crumb" @click="jump(c.id)">{{ c.label }}</button>
        </template>
      </nav>
    </template>

    <template v-if="layer === 'hub'" #tr>
      <dl class="trace-legend m-float">
        <div v-if="permissionIndex" :class="['is-warn legend-toggle', { 'is-on': showOrphans }]" @click="showOrphans = !showOrphans">
          <dt><button type="button" :aria-pressed="showOrphans">孤立页面</button></dt>
          <dd class="tnum">{{ findings.orphan }}</dd>
        </div>
        <div class="is-warn"><dt>缺权限标识</dt><dd class="tnum">{{ findings.noCode }}</dd></div>
        <div><dt>隐藏项</dt><dd class="tnum">{{ findings.hidden }}</dd></div>
      </dl>
      <button type="button" class="stage-chip" :aria-pressed="showPreview" @click="showPreview = !showPreview">
        <AppIcon name="layers" :size="13" />导航预览
      </button>
    </template>

    <nav v-if="leftPad" class="nav-preview m-float" aria-label="导航预览">
      <span class="nav-preview-title">侧栏预览</span>
      <ul>
        <li v-for="dir in preview" :key="dir.id" :class="{ 'is-hidden': dir.visible === 0, 'is-off': dir.status !== 1 }">
          <button type="button" :class="['nav-preview-item', { 'is-on': branchId === dir.id }]" @click="jump(dir.id)">
            <AppIcon :name="dir.icon || 'menu'" :size="13" />{{ dir.name }}
            <AppIcon v-if="dir.visible === 0" name="eye" :size="11" class="nav-preview-flag" />
          </button>
          <ul v-if="dir.type === 'dir'">
            <li v-for="page in pagesOf(dir)" :key="page.id" :class="{ 'is-hidden': page.visible === 0, 'is-off': page.status !== 1 }">
              <button type="button" :class="['nav-preview-item is-sub', { 'is-on': pageMenu?.id === page.id }]" @click="jump(page.id)">
                {{ page.name }}<AppIcon v-if="page.visible === 0" name="eye" :size="11" class="nav-preview-flag" />
              </button>
            </li>
          </ul>
        </li>
      </ul>
    </nav>

    <aside v-if="card" class="star-panel">
      <header class="star-panel__head">
        <div>
          <p class="star-panel__kind"><AppIcon :name="card.icon" :size="12" /> {{ card.kind }}</p>
          <h3 class="star-panel__title">{{ card.title }}</h3>
          <p class="star-panel__sub mono">{{ card.subtitle }}</p>
        </div>
        <button class="star-panel__close" type="button" aria-label="关闭" @click="back">×</button>
      </header>
      <p class="star-panel__status">{{ card.status }}</p>
      <dl class="star-tiles">
        <div v-for="tile in card.tiles" :key="tile.label">
          <dt>{{ tile.label }}</dt>
          <dd class="tnum">{{ tile.value }}</dd>
        </div>
      </dl>
      <section v-for="group in card.groups" :key="group.title" class="star-group">
        <h4>{{ group.title }}</h4>
        <div class="star-chips">
          <button
            v-for="chip in group.chips"
            :key="chip.id"
            type="button"
            :class="['star-chip', chip.tone ? `is-${chip.tone}` : '']"
            @click="onChip(chip)"
          >
            <span class="star-chip__label">{{ chip.label }}</span>
            <span v-if="chip.sub" class="star-chip__sub mono">{{ chip.sub }}</span>
          </button>
        </div>
      </section>
      <footer class="star-panel__actions">
        <button
          v-if="card.menu.type !== 'btn' && auth.hasPermission('admin:menu:create')"
          class="btn btn--ghost btn--sm"
          type="button"
          @click="emit('create', card.menu)"
        >
          <AppIcon name="plus" :size="14" /> {{ card.menu.type === 'dir' ? '新增菜单' : '新增按钮' }}
        </button>
        <button v-if="auth.hasPermission('admin:menu:update')" class="btn btn--primary btn--sm" type="button" @click="emit('edit', card.menu)">
          <AppIcon name="edit" :size="14" /> 编辑
        </button>
      </footer>
    </aside>

    <p v-if="layer === 'hub' && scene.nodes.length" class="trace-hint">点击表盘展开分支 · 刻度为已授权页面占比</p>
    <p v-else-if="layer === 'branch'" class="trace-hint">点击页面查看它的按钮与授权角色</p>
  </RelationGraph>
</template>

<style scoped>
.trace-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--mauth-text-mid);
  cursor: pointer;
}

.trace-back:hover {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

/* 信息卡：右侧滑入 */
.star-panel {
  position: absolute;
  top: 12px;
  right: 12px;
  bottom: 12px;
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  overflow-y: auto;
  border-radius: var(--mauth-radius-lg);
  border: 1px solid var(--mauth-border-strong);
  background: var(--mauth-surface);
  box-shadow: var(--e2);
  backdrop-filter: blur(14px);
}

.star-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.star-panel__kind {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0 0 2px;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--mauth-text-faint);
}

.star-panel__title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
}

.star-panel__sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--mauth-text-faint);
}

.star-panel__close {
  flex: none;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--mauth-text-mid);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.star-panel__close:hover {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

.star-panel__status {
  margin: 0;
  font-size: 12px;
  color: var(--mauth-text-soft);
}

.star-tiles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 0;
}

.star-tiles div {
  padding: 8px 10px;
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface-2);
}

.star-tiles dt {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.star-tiles dd {
  margin: 2px 0 0;
  font-size: 18px;
  font-weight: 600;
}

.star-group h4 {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--mauth-text-mid);
}

.star-chips {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.star-chip {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: var(--mauth-radius-xs);
  background: var(--mauth-surface-2);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.star-chip:hover {
  border-color: var(--mauth-primary);
  background: var(--mauth-primary-soft);
}

.star-chip.is-danger {
  color: var(--mauth-danger);
}

.star-chip.is-off {
  opacity: 0.6;
  text-decoration: line-through;
}

.star-chip__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.star-chip__sub {
  flex: none;
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

.star-panel__actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 4px;
}

.star-panel__actions .btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
</style>
