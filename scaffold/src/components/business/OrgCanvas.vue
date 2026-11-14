<script setup lang="ts">
/**
 * 组织架构画布（Full-bleed Canvas）
 *
 * 整齐树布局铺满内容区，四角留给页面放浮动玻璃面板（`#tl` / `#tr` / `#bl` / `#br`）。
 *
 * - 拖拽平移；滚轮以指针为中心缩放（Ctrl / ⌘ 同样缩放）
 * - 连线先画到，节点才点亮（按层级逐层入场）
 * - 单击选中（节点抬起），双击聚焦居中；方向键在节点间移动，Enter 聚焦
 * - 分支颜色取分类色，只用于区分一级分支；选中路径的连线点亮并走脉冲
 *
 * 移植自参考项目 `OrgCanvas.vue`，三处差异：
 *   1. 图标按钮换成 `<button>` + `AppIcon`（本仓没有 IconButton 组件）；
 *   2. 字段对齐本仓：`user_count`（参考项目 `memberCount`）、`status === 1` 为启用；
 *   3. `gsap` 直接从包引入 —— `composables/motion` 只做二次封装，没有转发 gsap。
 *
 * 样式在 `assets/styles/graphs.css` 的 `.org-*` 段（与其他图谱同一套变量）。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { gsap } from 'gsap';
import AppIcon from '@/components/ui/AppIcon.vue';
import { EASE, createFrameLoop, motionSkipped } from '@/composables/motion';
import { useViewportPan } from '@/composables/viewport';
import type { DeptNode } from '@/api/types';

const props = defineProps<{
  tree: DeptNode[];
  selectedId: number | null;
  /** 是否允许在节点上直接新建下级（由宿主按权限传入，画布本身不认权限） */
  creatable?: boolean;
}>();
const emit = defineEmits<{
  (e: 'select', dept: DeptNode): void;
  (e: 'create', dept: DeptNode): void;
  (e: 'refresh'): void;
}>();

const NODE_W = 196;
const NODE_H = 72;
const GAP_X = 26;
const GAP_Y = 64;

const viewport = ref<HTMLElement | null>(null);
const layer = ref<HTMLElement | null>(null);
const collapsed = ref<Set<number>>(new Set());

/* ── 视口：共享平移缩放，渲染走 quickTo（动画）/ gsap.set（直写） ── */
const {
  view,
  zoomAt,
  bind: bindViewport,
  unbind: unbindViewport,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  didPan
} = useViewportPan({
  el: () => viewport.value,
  apply: (_v, animate) => apply(animate),
  /*
   * 节点**不再排除**：在节点上按住也能拖动画布（图很大时用户的第一反应就是抓住
   * 眼前的东西拖）。点击选中靠 `didPan()` 区分 —— 位移超过阈值就不当成点击。
   * 控件与浮动面板仍排除，它们本身要接收点击/输入。
   */
  exclude: '.org-controls, .org-panel',
  // 滚轮直接缩放：页面已经是一屏不滚动，滚轮再用来平移只会让人以为"滚不动"
  wheelZooms: true,
  minK: 0.3,
  maxK: 2
});

interface LaidNode {
  dept: DeptNode;
  x: number;
  y: number;
  depth: number;
  branch: number;
  parentId: number | null;
  hasChildren: boolean;
}

/** 整齐树布局：叶子按顺序占位，父节点居中于子节点之间 */
const layout = computed(() => {
  const nodes: LaidNode[] = [];
  let cursor = 0;
  const place = (dept: DeptNode, depth: number, branch: number, parentId: number | null): number => {
    const kids = collapsed.value.has(dept.id) ? [] : (dept.children ?? []);
    let x: number;
    if (!kids.length) {
      x = cursor;
      cursor += NODE_W + GAP_X;
    } else {
      const xs = kids.map((child, i) => place(child, depth + 1, depth === 0 ? i : branch, dept.id));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    nodes.push({
      dept,
      x,
      y: depth * (NODE_H + GAP_Y),
      depth,
      branch,
      parentId,
      hasChildren: Boolean(dept.children?.length)
    });
    return x;
  };
  props.tree.forEach((root, i) => place(root, 0, i, null));
  nodes.sort((a, b) => a.depth - b.depth || a.x - b.x);
  const byId = new Map(nodes.map(n => [n.dept.id, n]));
  const links = nodes
    .filter(n => n.parentId !== null && byId.has(n.parentId))
    .map(n => {
      const p = byId.get(n.parentId as number) as LaidNode;
      const px = p.x + NODE_W / 2;
      const py = p.y + NODE_H;
      const cx = n.x + NODE_W / 2;
      const midY = py + GAP_Y / 2;
      const r = Math.min(10, Math.abs(cx - px) / 2);
      const dir = cx > px ? 1 : -1;
      const d =
        Math.abs(cx - px) < 1
          ? `M${px},${py} V${n.y}`
          : `M${px},${py} V${midY - r} Q${px},${midY} ${px + dir * r},${midY} H${cx - dir * r} Q${cx},${midY} ${cx},${midY + r} V${n.y}`;
      return { id: n.dept.id, d, depth: n.depth, branch: n.branch };
    });
  const width = nodes.length ? Math.max(...nodes.map(n => n.x)) + NODE_W : 0;
  const height = nodes.length ? Math.max(...nodes.map(n => n.y)) + NODE_H : 0;
  return { nodes, links, width, height };
});

/* ── 视图变换：只动 layer 的 transform ── */

/**
 * 应用视口变换
 *
 * @param animate 是否走动画（拖拽 / 滚轮时直写，避免每帧起补间）
 */
function apply(animate = true): void {
  if (!layer.value) return;
  if (!animate || motionSkipped()) {
    gsap.set(layer.value, { x: view.x, y: view.y, scale: view.k });
    return;
  }
  /*
   * 这里用 `gsap.to` 而不是 `quickTo`：
   * quickTo 分别绑 x / y / scale 三个属性时，x、y 会动而 `scale` 不落值 ——
   * 表现就是"点 ± 按钮、或按 Ctrl 滚轮，画面没变大变小"。
   * 一条 tween 同时写三个属性反而更稳，`overwrite: 'auto'` 保证连续操作不叠补间。
   */
  gsap.to(layer.value, {
    x: view.x,
    y: view.y,
    scale: view.k,
    duration: 0.55,
    ease: 'power3.out',
    overwrite: 'auto'
  });
}

/** 视口尺寸取布局像素（clientWidth / Height），页面进场缩放期间量到的包围盒会偏小 */
const viewportBox = (): { width: number; height: number } | null =>
  viewport.value ? { width: viewport.value.clientWidth, height: viewport.value.clientHeight } : null;

/**
 * 适应画布
 *
 * @param animate 是否走动画
 */
function fit(animate = true): void {
  const box = viewportBox();
  const { width, height } = layout.value;
  if (!box || !width) return;
  /*
   * 留白跟着画布走，不能写死 96：画布被压到 290px 时，96×2.4 的竖向留白就要占掉 230px，
   * 算出来必然撞到 0.35 的下限 —— 节点缩成一排小方块，看着像画布坏了。
   */
  const pad = Math.min(96, box.width * 0.08, box.height * 0.16);
  view.k = Math.min(1.2, Math.max(0.35, Math.min((box.width - pad * 2) / width, (box.height - pad * 2.4) / height)));
  view.x = (box.width - width * view.k) / 2;
  view.y = Math.max(pad, (box.height - height * view.k) / 2);
  apply(animate);
}

/**
 * 把某节点居中
 *
 * @param id 部门 ID
 */
function focusNode(id: number): void {
  const node = layout.value.nodes.find(n => n.dept.id === id);
  const box = viewportBox();
  if (!node || !box) return;
  view.k = Math.max(view.k, 0.9);
  view.x = box.width / 2 - (node.x + NODE_W / 2) * view.k;
  view.y = box.height / 2 - (node.y + NODE_H / 2) * view.k;
  apply();
}

/**
 * 收起 / 展开下级
 *
 * @param id 部门 ID
 */
function toggle(id: number): void {
  const next = new Set(collapsed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed.value = next;
}

/**
 * 方向键导航：上 = 上级，下 = 第一个下级，左右 = 同级相邻，Enter = 聚焦
 *
 * @param event 键盘事件
 * @param node 当前节点
 */
/**
 * 点击节点（选中）
 *
 * 拖拽结束后浏览器仍会补一个 click；位移过就不该顺手选中鼠标下面的节点。
 *
 * @param dept 部门
 * @returns {void}
 */
function onNodeClick(dept: DeptNode): void {
  if (didPan()) return;
  emit('select', dept);
}

/**
 * 双击节点（聚焦居中）
 *
 * @param id 部门 ID
 * @returns {void}
 */
function onNodeDblClick(id: number): void {
  if (didPan()) return;
  focusNode(id);
}

function onKey(event: KeyboardEvent, node: LaidNode): void {
  const nodes = layout.value.nodes;
  let target: LaidNode | undefined;
  if (event.key === 'ArrowUp') target = nodes.find(n => n.dept.id === node.parentId);
  else if (event.key === 'ArrowDown') target = nodes.find(n => n.parentId === node.dept.id);
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const row = nodes.filter(n => n.depth === node.depth).sort((a, b) => a.x - b.x);
    target = row[row.indexOf(node) + (event.key === 'ArrowRight' ? 1 : -1)];
  } else if (event.key === 'Enter') {
    focusNode(node.dept.id);
    return;
  } else return;
  event.preventDefault();
  if (!target) return;
  const next = target;
  emit('select', next.dept);
  nextTick(() => viewport.value?.querySelector<HTMLElement>(`[data-node="${next.dept.id}"]`)?.focus());
}

/* ── 选中路径：根 → 当前节点的连线点亮并走脉冲 ── */
const activePathIds = computed(() => {
  const ids = new Set<number>();
  if (props.selectedId === null) return ids;
  const parentOf = new Map(layout.value.nodes.map(n => [n.dept.id, n.parentId]));
  let cur: number | null | undefined = props.selectedId;
  while (cur != null) {
    const parent = parentOf.get(cur);
    if (parent == null) break;
    ids.add(cur);
    cur = parent;
  }
  return ids;
});

const pulseNodes = computed(() => {
  const out: Array<{ key: string; link: number; cat: number }> = [];
  const branchOf = new Map(layout.value.links.map(l => [l.id, (l.branch % 5) + 1]));
  activePathIds.value.forEach(id => {
    for (let k = 0; k < 2; k += 1) out.push({ key: `${id}:${k}`, link: id, cat: branchOf.get(id) ?? 1 });
  });
  return out;
});

const pulseEls = new Map<string, { c: SVGCircleElement; link: number }>();

/**
 * 绑定脉冲圆点
 *
 * @param key 脉冲键（`link:index`）
 * @param el 元素
 */
function bindPulse(key: string, el: unknown): void {
  if (el instanceof SVGCircleElement) pulseEls.set(key, { c: el, link: Number(key.split(':')[0]) });
  else pulseEls.delete(key);
}

const pathLens = new Map<number, number>();
const pulseLoop = createFrameLoop((dt, t) => {
  pulseEls.forEach(p => {
    const path = layer.value?.querySelector<SVGPathElement>(`.org-link[data-link="${p.link}"]`);
    if (!path || motionSkipped()) {
      p.c.style.opacity = '0';
      return;
    }
    let len = pathLens.get(p.link);
    if (len === undefined) {
      len = path.getTotalLength();
      pathLens.set(p.link, len);
    }
    const k = Number(p.c.dataset.idx ?? 0);
    const u = (t * 0.3 + k * 0.5 + (p.link % 7) * 0.11) % 1;
    const pt = path.getPointAtLength(len * u);
    p.c.setAttribute('cx', String(pt.x));
    p.c.setAttribute('cy', String(pt.y));
    p.c.style.opacity = String(Math.sin(u * Math.PI) * 0.9);
  });
});

/* ── 入场：按层级先画连线，再点亮该层节点 ── */
function playEntrance(): void {
  if (!layer.value || motionSkipped()) return;
  const tl = gsap.timeline();
  const depths = Math.max(0, ...layout.value.nodes.map(n => n.depth));
  for (let d = 0; d <= depths; d += 1) {
    const links = layer.value.querySelectorAll<SVGPathElement>(`.org-link[data-depth="${d}"]`);
    links.forEach(path => {
      const len = path.getTotalLength();
      tl.fromTo(
        path,
        { strokeDasharray: len, strokeDashoffset: len },
        {
          strokeDashoffset: 0,
          duration: 0.42,
          ease: EASE.swap,
          clearProps: 'strokeDasharray,strokeDashoffset'
        },
        Math.max(0, d * 0.2 - 0.12)
      );
    });
    const nodes = layer.value.querySelectorAll(`.org-node[data-depth="${d}"]`);
    tl.fromTo(
      nodes,
      { opacity: 0, y: 10, scale: 0.96 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.5,
        ease: EASE.reveal,
        stagger: { each: 0.04, from: 'start' },
        clearProps: 'opacity,transform'
      },
      d * 0.2 + 0.18
    );
  }
}

let observer: ResizeObserver | null = null;
let played = false;

/**
 * 让画布正好填满「标题之下 → 视口底部」这段空间
 *
 * 原先 CSS 写的是 `max(560px, calc(100dvh - 252px))`：252px 是估出来的头部高度，
 * 而 560px 的保底在小屏上会把整页顶出视口 —— 用户得滚动才能看全画布，而画布本身
 * 已经支持平移缩放，页面再滚一层就纯粹是别扭。
 *
 * 这里实测画布顶部距文档顶部的距离（加 scrollY 换算成文档坐标，与当前滚动位置无关），
 * 头部换行、统计卡变高、窗口缩放都自动跟上，不需要再维护那个魔法数字。
 *
 * @returns {void}
 */
function syncHeight(): void {
  const el = viewport.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  // 页面容器自带 padding-bottom（`.page` 是 40px），不减掉它的话画布底边正好把页面撑出滚动条
  const page = el.closest('.page');
  const padBottom = page ? Number.parseFloat(getComputedStyle(page).paddingBottom) || 0 : 16;
  const available = document.documentElement.clientHeight - rect.top - padBottom - 8;
  // 200 是下限：再矮就没有可视区域了；此时宁可让画布矮一点，也不要页面出现滚动
  el.style.setProperty('--org-canvas-h', `${Math.max(200, Math.round(available))}px`);
}

onMounted(() => {
  observer = new ResizeObserver(() => fit(false));
  if (viewport.value) observer.observe(viewport.value);
  bindViewport();
  pulseLoop.start(viewport.value);
  syncHeight();
  window.addEventListener('resize', syncHeight);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  unbindViewport();
  pulseLoop.stop();
  window.removeEventListener('resize', syncHeight);
  if (layer.value) gsap.killTweensOf(layer.value);
});

watch(
  () => layout.value.nodes.length,
  async n => {
    if (!n) return;
    pathLens.clear();
    await nextTick();
    syncHeight();
    fit(played);
    if (!played) {
      played = true;
      playEntrance();
    }
  },
  { immediate: true }
);

defineExpose({ fit, focusNode });
</script>

<template>
  <div
    ref="viewport"
    class="org-canvas"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div class="org-dots" aria-hidden="true" />
    <div ref="layer" class="org-layer" :style="{ width: `${layout.width}px`, height: `${layout.height}px` }">
      <svg class="org-links" :width="layout.width" :height="layout.height" aria-hidden="true">
        <path
          v-for="l in layout.links"
          :key="l.id"
          :d="l.d"
          :data-depth="l.depth"
          :data-link="l.id"
          :class="['org-link', `cat-${(l.branch % 5) + 1}`, { 'is-active': activePathIds.has(l.id) }]"
        />
        <circle
          v-for="p in pulseNodes"
          :key="p.key"
          :ref="el => bindPulse(p.key, el)"
          :data-idx="p.key.split(':')[1]"
          :class="['org-pulse', `cat-${p.cat}`]"
          r="3"
        />
      </svg>
      <div
        v-for="n in layout.nodes"
        :key="n.dept.id"
        role="button"
        tabindex="0"
        :data-node="n.dept.id"
        :data-depth="n.depth"
        :aria-pressed="n.dept.id === selectedId"
        :aria-label="`${n.dept.name}，${n.dept.user_count ?? 0} 人`"
        :class="[
          'org-node',
          `cat-${(n.branch % 5) + 1}`,
          { 'is-selected': n.dept.id === selectedId, 'is-root': n.depth === 0, 'is-off': n.dept.status === 0 }
        ]"
        :style="{ left: `${n.x}px`, top: `${n.y}px`, width: `${NODE_W}px`, height: `${NODE_H}px` }"
        @click="onNodeClick(n.dept)"
        @dblclick="onNodeDblClick(n.dept.id)"
        @keydown="onKey($event, n)"
      >
        <span class="org-strip" aria-hidden="true" />
        <span class="org-name">{{ n.dept.name }}</span>
        <span class="org-meta">
          <span class="org-leader">{{ n.dept.leader || '未设负责人' }}</span>
          <span class="org-count tnum">{{ n.dept.user_count ?? 0 }} 人</span>
        </span>
        <!--
          快捷「+」：加下级不用"先选中 → 再去右下角点"，卡片角上就能开。
          只在悬停 / 键盘聚焦 / 选中时露出，避免满屏 + 号盖住部门名。
        -->
        <button
          v-if="props.creatable"
          type="button"
          class="org-add"
          :aria-label="`在「${n.dept.name}」下新建部门`"
          :title="`在「${n.dept.name}」下新建部门`"
          @click.stop="emit('create', n.dept)"
        >
          <AppIcon name="plus" :size="12" />
        </button>
        <button
          v-if="n.hasChildren"
          type="button"
          class="org-toggle"
          :aria-label="collapsed.has(n.dept.id) ? '展开下级' : '收起下级'"
          @click.stop="toggle(n.dept.id)"
        >
          {{ collapsed.has(n.dept.id) ? (n.dept.children?.length ?? 0) : '−' }}
        </button>
      </div>
    </div>

    <div class="org-panel is-tl"><slot name="tl" /></div>
    <div class="org-panel is-tr"><slot name="tr" /></div>
    <div class="org-panel is-bl"><slot name="bl" /></div>
    <div class="org-panel is-br"><slot name="br" /></div>

    <div class="org-controls m-float" role="group" aria-label="画布缩放">
      <button class="org-ctl" type="button" aria-label="放大" @click="zoomAt(1.2)">
        <AppIcon name="plus" :size="14" />
      </button>
      <button class="org-ctl" type="button" aria-label="缩小" @click="zoomAt(1 / 1.2)">
        <AppIcon name="minus" :size="14" />
      </button>
      <button class="org-ctl" type="button" aria-label="适应画布" @click="fit()">
        <AppIcon name="fit" :size="14" />
      </button>
      <span class="org-ctl-sep" aria-hidden="true" />
      <!-- 画布视图没有工具栏，刷新只能放这儿：多标签页并行改部门时很需要 -->
      <button class="org-ctl" type="button" aria-label="刷新" title="刷新" @click="emit('refresh')">
        <AppIcon name="refresh" :size="14" />
      </button>
    </div>
  </div>
</template>
