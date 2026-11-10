<script setup lang="ts">
/**
 * 权限溯源（图谱舞台，三层下钻）
 *
 * - **全景**：中心珍珠球「权限全景」，用户 / 角色 / 菜单三枚玻璃刻度表盘环绕；
 *   每枚表盘的刻度是该类的真实占比（已分配角色的用户 / 有人持有的角色 / 被授权过的页面）。
 *   背景是真实点位排成的刻度弧，悬停表盘时点亮该类并浮出放射状名称与跨类授权线。
 * - **模块**：点表盘 → 珍珠球退到左侧、表盘竖排，该类全部条目以带标签胶囊逐根长出。
 * - **实体**：点条目 → 用户/角色/菜单之间的完整链路（贝塞尔 + 往返脉冲），右侧信息卡滑入。
 *
 * 面包屑与 Esc 逐层返回；实体聚焦键是 `user:1` / `role:2` / `menu:3`。
 *
 * 移植自参考项目 `PermissionTrace.vue`，刻意**去掉了两个依赖**：
 *   `AskDock`（AI 问答坞）与 `InsightPanel`（分析栏组件）——它们各自带一套
 *   与权限无关的样式与数据契约。这里用一张自绘信息卡替代分析栏，保留读数与
 *   关联条目，静默放弃「洞察卡片」那一层（有需要再单独引）。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { computed, onMounted, ref, watch } from 'vue';
import RelationGraph, { type GraphLink, type GraphNode } from '@/components/charts/RelationGraph.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import type { NetLink, NetNode, NetworkData } from '@/composables/neural';
import { loadPermissionGraph, permissionIndex } from '@/composables/permissionGraph';
import {
  holdersOfMenu,
  isSuperRole,
  menuPath,
  menusOfUser,
  permissionFindings,
  roleActive,
  type GraphMenu,
  type PermissionIndex
} from '@/utils/permissionGraph';

type Kind = 'user' | 'role' | 'menu';

const focus = defineModel<string | null>('focus', { default: null });

/** 分类色：用户=2 蓝、角色=3 紫、菜单=5 绿（与 --cat-N 对应） */
const CAT = { user: 2, role: 3, menu: 5 } as const;
const KIND_LABEL: Record<Kind, string> = { user: '用户', role: '角色', menu: '菜单' };
const KIND_ICON: Record<Kind, string> = { user: 'Users', role: 'ShieldCheck', menu: 'ListTree' };

const size = ref({ w: 0, h: 0 });
const loading = ref(true);
const errorMessage = ref('');
const burst = ref(0);
const cluster = ref<Kind | null>(null);
const hoverCluster = ref<Kind | null>(null);

onMounted(async () => {
  try {
    await loadPermissionGraph(true);
    burst.value = Date.now();
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '权限关系加载失败';
  } finally {
    loading.value = false;
  }
});

const index = computed(() => permissionIndex.value);

/** 解析当前聚焦实体（`kind:id`），不存在则视为未聚焦 */
const parsed = computed<{ kind: Kind; id: number } | null>(() => {
  const raw = focus.value ?? '';
  const [kind, idText] = raw.split(':');
  const id = Number(idText);
  if (!['user', 'role', 'menu'].includes(kind) || !Number.isFinite(id)) return null;
  const idx = index.value;
  if (!idx) return null;
  const exists = kind === 'user' ? idx.user.has(id) : kind === 'role' ? idx.role.has(id) : idx.menu.has(id);
  return exists ? { kind: kind as Kind, id } : null;
});

// 进入实体层时记住所属模块，返回时落回模块层
watch(parsed, f => {
  if (f) cluster.value = f.kind;
});

const layer = computed<'hub' | 'module' | 'entity'>(() => (parsed.value ? 'entity' : cluster.value ? 'module' : 'hub'));

/* ── 工具 ── */

/**
 * 取出其中的页面型菜单（目录/按钮不参与"可访问页面"计数）
 *
 * @param idx 索引
 * @param ids 菜单 ID 集合
 * @returns 页面菜单
 */
function pages(idx: PermissionIndex, ids: Iterable<number>): GraphMenu[] {
  return [...ids].map(id => idx.menu.get(Number(id))).filter((m): m is GraphMenu => Boolean(m && m.type === 'menu'));
}

/**
 * 某菜单下已授权的按钮
 *
 * @param idx 索引
 * @param menuId 菜单 ID
 * @param granted 只统计这些菜单 ID（不传则全部）
 * @returns 按钮列表
 */
function buttonsUnder(idx: PermissionIndex, menuId: number, granted?: Set<number>): GraphMenu[] {
  return (idx.childrenOf.get(menuId) ?? []).filter(m => m.type === 'btn' && (!granted || granted.has(m.id)));
}

/**
 * 角色实际生效的菜单集合（超管视为全部菜单）
 *
 * @param idx 索引
 * @param roleId 角色 ID
 * @returns 菜单 ID 集合
 */
function grantedOf(idx: PermissionIndex, roleId: number): Set<number> {
  const role = idx.role.get(roleId);
  if (role && isSuperRole(role)) return new Set(idx.graph.menus.map(m => m.id));
  return new Set((role?.menuIds ?? []).map(Number));
}

/**
 * 授予某菜单的非超管角色数
 *
 * @param idx 索引
 * @param menuId 菜单 ID
 * @returns 数量
 */
function activeGrants(idx: PermissionIndex, menuId: number): number {
  return (idx.rolesOfMenu.get(menuId) ?? []).filter(r => {
    const role = idx.role.get(r);
    return roleActive(role) && !isSuperRole(role);
  }).length;
}

/** 纵列：上留面包屑、下留边距 */
const COL_TOP = 76;
const COL_BOTTOM = 72;

/**
 * 把条目排成一列（超出容量时尾插一条「还有 N 项」）
 *
 * @param items 条目
 * @param x 列 x 坐标
 * @param H 舞台高度
 * @param make 生成节点
 * @param moreId 溢出节点的 id
 * @param align 标签对齐
 * @param minGap 最小行距
 * @returns 节点数组
 */
function column<T>(
  items: T[],
  x: number,
  H: number,
  make: (item: T, y: number, i: number, n: number) => GraphNode,
  moreId: string,
  align: GraphNode['align'],
  minGap = 32
): GraphNode[] {
  const span = Math.max(120, H - COL_TOP - COL_BOTTOM);
  const cap = Math.max(4, Math.floor(span / minGap) + 1);
  const shown = items.slice(0, cap);
  const n = shown.length + (items.length > cap ? 1 : 0);
  const gap = n > 1 ? Math.min(46, span / (n - 1)) : 0;
  const y0 = COL_TOP + span / 2 - (gap * (n - 1)) / 2;
  const nodes = shown.map((item, i) => make(item, y0 + i * gap, i, n));
  if (items.length > cap) {
    nodes.push({ id: moreId, x, y: y0 + shown.length * gap, label: `还有 ${items.length - cap} 项`, kind: 'item', align, interactive: false, delay: 0.5 });
  }
  return nodes;
}

/** 模块条目 */
interface Entry {
  id: string;
  label: string;
  sub: string;
  count?: string;
  tone?: GraphNode['tone'];
  icon?: string;
}

/**
 * 某一类的条目清单（带读数：人数 / 页面数 / 授予角色数）
 *
 * @param idx 索引
 * @param kind 类
 * @returns 条目数组
 */
function entriesOf(idx: PermissionIndex, kind: Kind): Entry[] {
  if (kind === 'role') {
    return idx.graph.roles.map(r => {
      const users = idx.usersOfRole.get(Number(r.id))?.length ?? 0;
      const pageCount = pages(idx, grantedOf(idx, Number(r.id))).length;
      return {
        id: `role:${r.id}`,
        label: r.name,
        sub: users ? `${users} 人持有 · ${pageCount} 个页面` : '闲置 · 没有持有人',
        tone: users ? undefined : 'danger'
      };
    });
  }
  if (kind === 'user') {
    return [...idx.graph.users]
      .sort((a, b) => (idx.rolesOfUser.get(Number(b.id))?.length ?? 0) - (idx.rolesOfUser.get(Number(a.id))?.length ?? 0))
      .map(u => {
        const roles = idx.rolesOfUser.get(Number(u.id))?.length ?? 0;
        return {
          id: `user:${u.id}`,
          label: u.username,
          sub: roles ? `${u.dept_name ?? '未分配部门'} · ${roles} 个角色` : '未分配角色',
          tone: u.status !== 1 ? 'off' : roles ? undefined : 'danger'
        };
      });
  }
  return idx.graph.menus
    .filter(m => m.type === 'menu')
    .map(m => {
      const grants = activeGrants(idx, Number(m.id));
      return {
        id: `menu:${m.id}`,
        label: m.name,
        sub: grants ? `${grants} 个角色授予` : '孤立 · 仅超级管理员可见',
        tone: m.status !== 1 ? 'off' : grants ? undefined : 'danger'
      };
    });
}

/** 围绕表盘排成刻度弧的点位 */
function arcs(
  count: number,
  hx: number,
  hy: number,
  away: number,
  W: number,
  H: number
): Array<{ x: number; y: number; depth: number; angle: number }> {
  const perRing = 16;
  const rings = Math.max(1, Math.ceil(count / perRing));
  const out: Array<{ x: number; y: number; depth: number; angle: number }> = [];
  for (let k = 0; k < rings; k += 1) {
    const m = Math.min(perRing, count - k * perRing);
    const spread = Math.min(Math.PI * 0.95, 0.5 + m * 0.16);
    // 相邻点位弧长至少 22px，点少时贴近表盘
    const r = Math.max(84 + k * 22, (22 * Math.max(m - 1, 1)) / spread);
    for (let i = 0; i < m; i += 1) {
      const a = away + (m > 1 ? (i / (m - 1) - 0.5) * spread : 0);
      out.push({
        x: Math.min(W - 14, Math.max(14, hx + Math.cos(a) * r)),
        y: Math.min(H - 14, Math.max(14, hy + Math.sin(a) * r)),
        depth: 2 + k,
        angle: a
      });
    }
  }
  return out;
}

interface HubPos {
  kind: Kind;
  x: number;
  y: number;
}

/**
 * 全景布局：中心球 + 三枚表盘绕椭圆分布
 *
 * @param W 宽
 * @param H 高
 * @returns 中心与三枚表盘坐标
 */
function hubLayout(W: number, H: number): { core: { x: number; y: number }; hubs: HubPos[] } {
  const narrow = W < 640;
  const cx = W / 2;
  const cy = H * (narrow ? 0.46 : 0.54);
  const rx = narrow ? W * 0.3 : Math.min(W * 0.32, 420);
  const ry = Math.min(H * (narrow ? 0.24 : 0.29), 190);
  const at = (deg: number): { x: number; y: number } => ({
    x: Math.min(W - 82, Math.max(82, cx + Math.cos((deg * Math.PI) / 180) * rx)),
    y: cy + Math.sin((deg * Math.PI) / 180) * ry
  });
  return {
    core: { x: cx, y: cy },
    hubs: [
      { kind: 'role', ...at(-90) },
      { kind: 'user', ...at(W < 640 ? 150 : 162) },
      { kind: 'menu', ...at(W < 640 ? 30 : 18) }
    ]
  };
}

/* ── 背景网络（真实点位） ── */
const network = computed<NetworkData | null>(() => {
  const idx = index.value;
  const { w: W, h: H } = size.value;
  if (!idx || !W || !H) return null;
  const { core, hubs } = hubLayout(W, H);
  const nodes: NetNode[] = [];
  const links: NetLink[] = [];

  const lists: Record<Kind, Array<{ id: string; label: string; tone?: NetNode['tone'] }>> = {
    user: idx.graph.users.map(u => ({ id: `user:${u.id}`, label: u.username, tone: u.status !== 1 ? 'off' : undefined })),
    role: idx.graph.roles.map(r => ({ id: `role:${r.id}`, label: r.name })),
    menu: idx.graph.menus.map(m => ({
      id: `menu:${m.id}`,
      label: m.name,
      tone: m.status !== 1 ? 'off' : m.type === 'menu' && activeGrants(idx, Number(m.id)) === 0 ? 'danger' : undefined
    }))
  };

  hubs.forEach(hub => {
    const away = Math.atan2(hub.y - core.y, hub.x - core.x);
    const list = lists[hub.kind];
    const pts = arcs(list.length, hub.x, hub.y, away, W, H);
    const anchor = `anchor:${hub.kind}`;
    nodes.push({ id: anchor, x: hub.x, y: hub.y, cat: CAT[hub.kind], depth: 1, r: 0.01 });
    list.forEach((item, i) => {
      nodes.push({
        id: item.id,
        x: pts[i].x,
        y: pts[i].y,
        cat: CAT[hub.kind],
        depth: pts[i].depth,
        angle: pts[i].angle,
        label: item.label,
        tone: item.tone,
        r: hub.kind === 'menu' ? 2.2 : 2.8
      });
      links.push({ a: anchor, b: item.id, cat: CAT[hub.kind] });
    });
  });

  const has = new Set(nodes.map(n => n.id));
  idx.graph.userRoles.forEach(([u, r]) => {
    if (has.has(`user:${u}`) && has.has(`role:${r}`)) links.push({ a: `user:${u}`, b: `role:${r}`, cat: CAT.user, cross: true });
  });
  idx.graph.roles.forEach(r => {
    if (isSuperRole(r)) return;
    (r.menuIds ?? []).forEach(m => {
      if (has.has(`menu:${m}`)) links.push({ a: `role:${r.id}`, b: `menu:${m}`, cat: CAT.role, cross: true });
    });
  });

  return { nodes, links };
});

/* ── 场景（三层的节点与连线） ── */
const scene = computed<{ nodes: GraphNode[]; links: GraphLink[] }>(() => {
  const idx = index.value;
  const { w, h } = size.value;
  if (!idx || !w || !h) return { nodes: [], links: [] };
  const f = parsed.value;
  const panel = f && w >= 900 ? 340 : 0;
  const W = w - panel;
  const H = h;
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  const stagger = (i: number, n: number, base = 0): number => base + i * Math.min(0.09, 1.8 / Math.max(n, 1));

  const counts: Record<Kind, number | string> = {
    user: idx.graph.usersVisible ? idx.graph.users.length : '—',
    role: idx.graph.roles.length,
    menu: idx.graph.menus.length
  };
  const subs: Record<Kind, string> = {
    user: idx.graph.usersVisible ? '刻度：已分配角色占比' : '无用户查询权限',
    role: '刻度：有人持有占比',
    menu: '刻度：已授权页面占比'
  };
  const pageMenus = idx.graph.menus.filter(m => m.type === 'menu');
  const ratios: Record<Kind, number> = {
    user: idx.graph.users.length
      ? idx.graph.users.filter(u => (idx.rolesOfUser.get(Number(u.id))?.length ?? 0) > 0).length / idx.graph.users.length
      : 0,
    role: idx.graph.roles.length
      ? idx.graph.roles.filter(r => (idx.usersOfRole.get(Number(r.id))?.length ?? 0) > 0).length / idx.graph.roles.length
      : 0,
    menu: pageMenus.length ? pageMenus.filter(m => activeGrants(idx, Number(m.id)) > 0).length / pageMenus.length : 0
  };

  if (layer.value === 'hub') {
    const { core, hubs } = hubLayout(W, H);
    nodes.push({
      id: 'core',
      x: core.x,
      y: core.y,
      size: W < 640 ? 72 : 104,
      label: '权限全景',
      sub: `${idx.graph.userRoles.length} 条授权`,
      kind: 'core',
      interactive: false,
      float: true
    });
    hubs.forEach((hub, hi) => {
      nodes.push({
        id: `hub:${hub.kind}`,
        x: hub.x,
        y: hub.y,
        size: W < 640 ? 84 : 116,
        label: KIND_LABEL[hub.kind],
        sub: subs[hub.kind],
        kind: 'hub',
        icon: KIND_ICON[hub.kind],
        cat: CAT[hub.kind],
        count: counts[hub.kind],
        ratio: ratios[hub.kind],
        from: 'core',
        delay: 0.9 + hi * 0.17,
        float: true
      });
      links.push({ a: 'core', b: `hub:${hub.kind}`, flow: 'both', cat: CAT[hub.kind] });
    });
    return { nodes, links };
  }

  const cy = COL_TOP + (H - COL_TOP - COL_BOTTOM) / 2;

  if (layer.value === 'module') {
    const k = cluster.value as Kind;
    const coreX = Math.max(84, W * 0.07);
    const colX = coreX + 150;
    nodes.push({ id: 'core', x: coreX, y: cy, size: 64, label: '权限全景', kind: 'core', interactive: false });

    const order: Kind[] = (['user', 'role', 'menu'] as Kind[]).filter(x => x !== k);
    const slots: Array<{ kind: Kind; y: number }> = [
      { kind: order[0], y: cy - 180 },
      { kind: k, y: cy - 10 },
      { kind: order[1], y: cy + 170 }
    ];
    slots.forEach(slot => {
      const sel = slot.kind === k;
      nodes.push({
        id: `hub:${slot.kind}`,
        x: colX,
        y: slot.y,
        size: sel ? 112 : 72,
        label: KIND_LABEL[slot.kind],
        sub: sel ? subs[slot.kind] : undefined,
        kind: 'hub',
        icon: KIND_ICON[slot.kind],
        cat: CAT[slot.kind],
        count: counts[slot.kind],
        ratio: ratios[slot.kind],
        from: 'core',
        float: true
      });
      links.push({ a: 'core', b: `hub:${slot.kind}`, flow: sel ? 'both' : 'none', cat: CAT[slot.kind], shape: 'h' });
    });

    const entries = entriesOf(idx, k);
    const fanX = Math.min(Math.max(colX + 300, W * 0.42), W - 320);
    const fan = column(
      entries,
      fanX,
      H,
      (e, y, i, n) => ({
        id: e.id,
        x: fanX,
        y,
        label: e.label,
        sub: e.sub,
        kind: 'item',
        align: 'left',
        cat: CAT[k],
        tone: e.tone,
        from: `hub:${k}`,
        delay: 0.16 + stagger(i, n)
      }),
      `more:${k}`,
      'left',
      34
    );
    nodes.push(...fan);
    fan.forEach(n => {
      if (n.id.startsWith('more:')) return;
      links.push({
        a: `hub:${k}`,
        b: n.id,
        flow: 'forward',
        shape: 'h',
        cat: n.tone === 'danger' ? undefined : CAT[k],
        tone: n.tone === 'danger' ? 'danger' : undefined
      });
    });
    return { nodes, links };
  }

  const fe = f as { kind: Kind; id: number };

  if (fe.kind === 'role') {
    const role = idx.role.get(fe.id) as NonNullable<ReturnType<PermissionIndex['role']['get']>>;
    const userIds = idx.usersOfRole.get(Number(role.id)) ?? [];
    const granted = grantedOf(idx, Number(role.id));
    const center = `role:${role.id}`;
    nodes.push({
      id: center,
      x: W * 0.47,
      y: cy,
      label: role.name,
      sub: role.code,
      kind: 'item',
      icon: KIND_ICON.role,
      cat: CAT.role,
      count: `${userIds.length} 人`
    });
    nodes.push(
      ...column(
        userIds,
        W * 0.2,
        H,
        (id, y, i, n) => {
          const u = idx.user.get(Number(id));
          return {
            id: `user:${id}`,
            x: W * 0.2,
            y,
            label: u?.username ?? `用户 ${id}`,
            sub: u?.dept_name ?? '',
            kind: 'item',
            align: 'right',
            cat: CAT.user,
            tone: u?.status === 0 ? 'off' : undefined,
            from: center,
            delay: stagger(i, n, 0.1)
          };
        },
        'more:user',
        'right'
      )
    );
    nodes.push(
      ...column(
        pages(idx, granted),
        W * 0.74,
        H,
        (m, y, i, n) => {
          const btns = buttonsUnder(idx, Number(m.id), granted).length;
          return {
            id: `menu:${m.id}`,
            x: W * 0.74,
            y,
            label: m.name,
            sub: m.permission ?? m.path ?? '',
            count: btns ? `${btns} 按钮` : undefined,
            kind: 'item',
            align: 'left',
            cat: CAT.menu,
            tone: m.status === 1 ? undefined : 'off',
            from: center,
            delay: stagger(i, n, 0.25)
          };
        },
        'more:menu',
        'left'
      )
    );
    nodes.forEach(n => {
      if (n.id.startsWith('user:')) links.push({ a: n.id, b: center, flow: 'forward', shape: 'h', cat: CAT.user });
      if (n.id.startsWith('menu:')) links.push({ a: center, b: n.id, flow: 'forward', shape: 'h', cat: CAT.menu });
    });
    return { nodes, links };
  }

  if (fe.kind === 'user') {
    const user = idx.user.get(fe.id) as NonNullable<ReturnType<PermissionIndex['user']['get']>>;
    const center = `user:${user.id}`;
    const roleIds = idx.rolesOfUser.get(Number(user.id)) ?? [];
    const menuIds = menusOfUser(idx, Number(user.id));
    nodes.push({
      id: center,
      x: W * 0.14,
      y: cy,
      label: user.username,
      sub: user.dept_name ?? user.email ?? '',
      kind: 'item',
      icon: KIND_ICON.user,
      cat: CAT.user,
      count: `${roleIds.length} 角色`,
      tone: user.status === 1 ? undefined : 'off'
    });
    nodes.push(
      ...column(
        roleIds,
        W * 0.42,
        H,
        (id, y, i, n) => {
          const r = idx.role.get(Number(id));
          return {
            id: `role:${id}`,
            x: W * 0.42,
            y,
            label: r?.name ?? `角色 ${id}`,
            sub: r?.code,
            kind: 'item',
            icon: KIND_ICON.role,
            cat: CAT.role,
            tone: roleActive(r) ? undefined : 'off',
            from: center,
            delay: stagger(i, n, 0.1)
          };
        },
        'more:role',
        'center'
      )
    );
    const pageList = pages(idx, menuIds);
    nodes.push(
      ...column(
        pageList,
        W * 0.7,
        H,
        (m, y, i, n) => ({
          id: `menu:${m.id}`,
          x: W * 0.7,
          y,
          label: m.name,
          sub: m.permission ?? m.path ?? '',
          count: buttonsUnder(idx, Number(m.id), menuIds).length || undefined,
          kind: 'item',
          align: 'left',
          cat: CAT.menu,
          from: center,
          delay: stagger(i, n, 0.35)
        }),
        'more:menu',
        'left'
      )
    );
    const shown = new Set(nodes.map(n => n.id));
    roleIds.forEach(rid => {
      if (!shown.has(`role:${rid}`)) return;
      links.push({ a: center, b: `role:${rid}`, flow: 'forward', shape: 'h', cat: CAT.user });
      const r = idx.role.get(Number(rid));
      if (!roleActive(r) || !r) return;
      pageList.forEach(m => {
        const ok = isSuperRole(r) || (r.menuIds ?? []).map(Number).includes(Number(m.id));
        if (shown.has(`menu:${m.id}`) && ok) links.push({ a: `role:${rid}`, b: `menu:${m.id}`, flow: 'forward', shape: 'h', cat: CAT.menu });
      });
    });
    return { nodes, links };
  }

  const menu = idx.menu.get(fe.id) as NonNullable<ReturnType<PermissionIndex['menu']['get']>>;
  const center = `menu:${menu.id}`;
  const holders = holdersOfMenu(idx, Number(menu.id));
  const orphan = !holders.roles.some(r => !isSuperRole(r));
  nodes.push({
    id: center,
    x: W * 0.76,
    y: cy,
    label: menu.name,
    sub: menu.permission ?? menu.path ?? menu.type,
    kind: 'item',
    icon: menu.type === 'btn' ? 'key' : KIND_ICON.menu,
    cat: CAT.menu,
    count: `${holders.roles.length} 角色`,
    tone: orphan ? 'danger' : menu.status === 1 ? undefined : 'off'
  });
  nodes.push(
    ...column(
      holders.roles,
      W * 0.48,
      H,
      (r, y, i, n) => ({
        id: `role:${r.id}`,
        x: W * 0.48,
        y,
        label: r.name,
        sub: r.code,
        kind: 'item',
        icon: KIND_ICON.role,
        cat: CAT.role,
        from: center,
        delay: stagger(i, n, 0.1)
      }),
      'more:role',
      'center'
    )
  );
  nodes.push(
    ...column(
      holders.users,
      W * 0.2,
      H,
      (u, y, i, n) => ({
        id: `user:${u.id}`,
        x: W * 0.2,
        y,
        label: u.username,
        sub: u.dept_name ?? '',
        kind: 'item',
        align: 'right',
        cat: CAT.user,
        tone: u.status === 1 ? undefined : 'off',
        from: center,
        delay: stagger(i, n, 0.35)
      }),
      'more:user',
      'right'
    )
  );
  const shown = new Set(nodes.map(n => n.id));
  holders.roles.forEach(r => {
    if (!shown.has(`role:${r.id}`)) return;
    links.push({ a: `role:${r.id}`, b: center, flow: 'forward', shape: 'h', cat: CAT.menu });
    (idx.usersOfRole.get(Number(r.id)) ?? []).forEach(u => {
      if (shown.has(`user:${u}`)) links.push({ a: `user:${u}`, b: `role:${r.id}`, flow: 'forward', shape: 'h', cat: CAT.user });
    });
  });
  return { nodes, links };
});

/** 模块层：未选中的两枚表盘退暗 */
const otherHubs = computed(() => (['user', 'role', 'menu'] as Kind[]).filter(k => k !== cluster.value));
const highlight = computed<string[] | null>(() => {
  if (layer.value !== 'module') return null;
  const [a, b] = otherHubs.value;
  return scene.value.nodes.filter(n => n.id !== `hub:${a}` && n.id !== `hub:${b}`).map(n => n.id);
});
const networkFocus = computed(() => {
  const k = layer.value === 'hub' ? hoverCluster.value : cluster.value;
  return k ? CAT[k] : null;
});
const networkAlpha = computed(() => (layer.value === 'hub' ? 1 : layer.value === 'module' ? 0.35 : 0.14));

/* ── 交互 ── */

/**
 * 点击节点：表盘进模块层，条目进实体层
 *
 * @param node 被点节点
 */
function onSelect(node: GraphNode): void {
  if (node.id.startsWith('hub:')) {
    cluster.value = node.id.slice(4) as Kind;
    hoverCluster.value = null;
    if (focus.value) focus.value = null;
    return;
  }
  if (/^(user|role|menu):\d+$/.test(node.id) && node.id !== focus.value) focus.value = node.id;
}

/** 返回上一层（实体 → 模块 → 全景） */
function back(): void {
  if (parsed.value) {
    focus.value = null;
    return;
  }
  cluster.value = null;
}

/** 回到全景 */
function home(): void {
  focus.value = null;
  cluster.value = null;
}

/**
 * 悬停：表盘悬停时聚焦该类
 *
 * @param id 悬停节点 id
 */
function onHover(id: string | null): void {
  hoverCluster.value = id?.startsWith('hub:') ? (id.slice(4) as Kind) : null;
}

/* ── 实体信息卡（替代参考项目的分析栏） ── */
interface CardChip {
  id: string;
  label: string;
  sub: string;
}
interface EntityCard {
  kindLabel: string;
  title: string;
  subtitle: string;
  status: string;
  tiles: Array<{ label: string; value: number | string }>;
  groups: Array<{ title: string; chips: CardChip[]; more: number }>;
}

const card = computed<EntityCard | null>(() => {
  const idx = index.value;
  const f = parsed.value;
  if (!idx || !f) return null;

  const cap = (list: CardChip[], n = 20): { chips: CardChip[]; more: number } => ({
    chips: list.slice(0, n),
    more: Math.max(0, list.length - n)
  });
  const chipUser = (id: number): CardChip | null => {
    const u = idx.user.get(Number(id));
    return u ? { id: `user:${u.id}`, label: u.username, sub: u.dept_name ?? '' } : null;
  };
  const chipRole = (id: number): CardChip | null => {
    const r = idx.role.get(Number(id));
    return r ? { id: `role:${r.id}`, label: r.name, sub: r.code } : null;
  };
  const chipMenu = (m: GraphMenu): CardChip => ({ id: `menu:${m.id}`, label: m.name, sub: m.permission ?? '' });
  const notNull = <T,>(v: T | null): v is T => v !== null;

  if (f.kind === 'role') {
    const role = idx.role.get(f.id) as NonNullable<ReturnType<PermissionIndex['role']['get']>>;
    const users = idx.usersOfRole.get(Number(role.id)) ?? [];
    const granted = grantedOf(idx, Number(role.id));
    const pageList = pages(idx, granted);
    return {
      kindLabel: isSuperRole(role) ? '内置超管 · 拥有全部菜单' : '角色',
      title: role.name,
      subtitle: role.code,
      status: `${pageList.length} 个页面 · ${users.length} 人持有`,
      tiles: [
        { label: '授权页面', value: pageList.length },
        { label: '持有用户', value: idx.graph.usersVisible ? users.length : '—' },
        { label: '权限码', value: (role.permissions ?? []).length }
      ],
      groups: [
        { title: '持有用户', ...cap(users.map(chipUser).filter(notNull)) },
        { title: '可访问页面', ...cap(pageList.map(chipMenu)) }
      ]
    };
  }

  if (f.kind === 'user') {
    const user = idx.user.get(f.id) as NonNullable<ReturnType<PermissionIndex['user']['get']>>;
    const roleIds = idx.rolesOfUser.get(Number(user.id)) ?? [];
    const menuIds = menusOfUser(idx, Number(user.id));
    const pageList = pages(idx, menuIds);
    return {
      kindLabel: user.status === 1 ? '用户' : '用户 · 已停用',
      title: user.username,
      subtitle: user.dept_name ?? '未分配部门',
      status: `${roleIds.length} 个角色 · ${pageList.length} 个页面`,
      tiles: [
        { label: '角色', value: roleIds.length },
        { label: '可访问页面', value: pageList.length },
        { label: '按钮', value: [...menuIds].filter(id => idx.menu.get(Number(id))?.type === 'btn').length }
      ],
      groups: [
        { title: '持有角色', ...cap(roleIds.map(chipRole).filter(notNull)) },
        { title: '可访问页面', ...cap(pageList.map(chipMenu)) }
      ]
    };
  }

  const menu = idx.menu.get(f.id) as NonNullable<ReturnType<PermissionIndex['menu']['get']>>;
  const holders = holdersOfMenu(idx, Number(menu.id));
  const buttons = buttonsUnder(idx, Number(menu.id));
  return {
    kindLabel: menu.type === 'btn' ? '按钮' : menu.type === 'dir' ? '目录' : '页面',
    title: menu.name,
    subtitle: menu.permission ?? menu.path ?? '',
    status: menuPath(idx, Number(menu.id))
      .map(m => m.name)
      .join(' / '),
    tiles: [
      { label: '授予角色', value: holders.roles.length },
      { label: '覆盖用户', value: idx.graph.usersVisible ? holders.users.length : '—' },
      { label: '下级按钮', value: buttons.length }
    ],
    groups: [
      { title: '授予角色', ...cap(holders.roles.map(r => chipRole(r.id)).filter(notNull)) },
      { title: '可访问用户', ...cap(holders.users.map(u => chipUser(u.id)).filter(notNull)) }
    ]
  };
});

const findings = computed(() => (index.value ? permissionFindings(index.value) : null));

const entityLabel = computed(() => {
  const f = parsed.value;
  const idx = index.value;
  if (!f || !idx) return '';
  if (f.kind === 'user') return idx.user.get(f.id)?.username ?? '';
  if (f.kind === 'role') return idx.role.get(f.id)?.name ?? '';
  return idx.menu.get(f.id)?.name ?? '';
});
</script>

<template>
  <div class="trace">
    <RelationGraph
      v-model:size="size"
      class="trace-graph"
      variant="stage"
      label="权限溯源图"
      :nodes="scene.nodes"
      :links="scene.links"
      :active-id="parsed ? focus : null"
      :highlight="highlight"
      :network="network"
      :network-focus="networkFocus"
      :network-alpha="networkAlpha"
      :burst-key="burst"
      @select="onSelect"
      @back="back"
      @hover="onHover"
    >
      <template #tl>
        <nav class="trace-crumbs m-float" aria-label="溯源路径">
          <button v-if="layer !== 'hub'" class="trace-back" type="button" aria-label="返回上一层" @click="back">
            <AppIcon name="chevronLeft" :size="14" />
          </button>
          <button type="button" :class="['trace-crumb', { 'is-current': layer === 'hub' }]" @click="home">
            <AppIcon name="ShieldCheck" :size="13" />权限全景
          </button>
          <template v-if="cluster && layer !== 'hub'">
            <span class="trace-sep" aria-hidden="true">/</span>
            <button type="button" :class="['trace-crumb', `cat-${CAT[cluster]}`, { 'is-current': layer === 'module' }]" @click="focus = null">
              {{ KIND_LABEL[cluster] }}
            </button>
          </template>
          <template v-if="parsed">
            <span class="trace-sep" aria-hidden="true">/</span>
            <b class="trace-crumb is-current">{{ entityLabel }}</b>
          </template>
        </nav>
      </template>

      <template v-if="layer === 'hub' && findings" #tr>
        <dl class="trace-legend m-float">
          <div class="cat-2"><dt><i />用户</dt><dd class="tnum">{{ index?.graph.users.length ?? 0 }}</dd></div>
          <div class="cat-3"><dt><i />角色</dt><dd class="tnum">{{ index?.graph.roles.length ?? 0 }}</dd></div>
          <div class="cat-5"><dt><i />菜单</dt><dd class="tnum">{{ index?.graph.menus.length ?? 0 }}</dd></div>
          <div class="is-warn"><dt>闲置角色</dt><dd class="tnum">{{ findings.unusedRoles.length }}</dd></div>
          <div class="is-warn"><dt>孤立菜单</dt><dd class="tnum">{{ findings.orphanMenus.length }}</dd></div>
          <div class="is-warn"><dt>无角色用户</dt><dd class="tnum">{{ findings.usersWithoutRole.length }}</dd></div>
        </dl>
      </template>

      <!-- 实体信息卡：替代参考项目的 InsightPanel 分析栏 -->
      <aside v-if="card" class="trace-panel">
        <header class="trace-panel__head">
          <div>
            <p class="trace-panel__kind">{{ card.kindLabel }}</p>
            <h3 class="trace-panel__title">{{ card.title }}</h3>
            <p class="trace-panel__sub mono">{{ card.subtitle }}</p>
          </div>
          <button class="trace-panel__close" type="button" aria-label="关闭" @click="back">×</button>
        </header>
        <p class="trace-panel__status">{{ card.status }}</p>
        <dl class="trace-tiles">
          <div v-for="tile in card.tiles" :key="tile.label">
            <dt>{{ tile.label }}</dt>
            <dd class="tnum">{{ tile.value }}</dd>
          </div>
        </dl>
        <section v-for="group in card.groups" :key="group.title" class="trace-group">
          <h4>{{ group.title }}</h4>
          <div class="trace-chips">
            <button v-for="chip in group.chips" :key="chip.id" type="button" class="trace-chip" @click="focus = chip.id">
              <span class="trace-chip__label">{{ chip.label }}</span>
              <span v-if="chip.sub" class="trace-chip__sub mono">{{ chip.sub }}</span>
            </button>
            <span v-if="group.more" class="trace-chip__more">还有 {{ group.more }} 项</span>
          </div>
        </section>
      </aside>

      <p v-if="loading" class="trace-hint">正在汇总授权关系…</p>
      <p v-else-if="errorMessage" class="trace-hint is-error">{{ errorMessage }}</p>
      <p v-else-if="layer === 'module'" class="trace-hint">点击任一条目，展开它的完整授权链路</p>
    </RelationGraph>
  </div>
</template>

<style scoped>
.trace {
  position: relative;
}

.trace-graph {
  height: max(560px, calc(100dvh - 236px));
}

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

/* 实体信息卡：右侧滑入 */
.trace-panel {
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

.trace-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.trace-panel__kind {
  margin: 0 0 2px;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--mauth-text-faint);
}

.trace-panel__title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
}

.trace-panel__sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--mauth-text-faint);
}

.trace-panel__close {
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

.trace-panel__close:hover {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

.trace-panel__status {
  margin: 0;
  font-size: 12px;
  color: var(--mauth-text-soft);
}

.trace-tiles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 0;
}

.trace-tiles div {
  padding: 8px 10px;
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface-2);
}

.trace-tiles dt {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.trace-tiles dd {
  margin: 2px 0 0;
  font-size: 18px;
  font-weight: 600;
}

.trace-group h4 {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--mauth-text-mid);
}

.trace-chips {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.trace-chip {
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

.trace-chip:hover {
  border-color: var(--mauth-primary);
  background: var(--mauth-primary-soft);
}

.trace-chip__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trace-chip__sub {
  flex: none;
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

.trace-chip__more {
  font-size: 11px;
  color: var(--mauth-text-faint);
  padding-left: 10px;
}

.trace-hint.is-error {
  color: var(--mauth-danger);
}
</style>
