<script setup lang="ts">
/**
 * 岗位阶梯（图谱舞台）
 *
 * 岗位按 `sort` 沿对角线自左下向右上等距铺满舞台，每级是带分类色上沿的
 * 珍珠玻璃台面，台面下淡色光柱垂到刻度地平线；脊线脉冲逐级向上传递。
 * 选中岗位 → 在岗成员以带标签胶囊扇形长到左上空域；右上信息卡给出编辑与跳转。
 *
 * 移植自参考项目 `PostLadder.vue`，三处差异：
 *   1. 在岗成员走本仓的 `GET /posts/:id/users`（参考项目复用用户列表 + postId 过滤，
 *      本仓没有该过滤参数）；
 *   2. 去掉 `PermissionButton` / `StatusTag` / `EmptyState`，改用 `auth.hasPermission`
 *      与既有 `.tag` 样式（少引三个组件，视觉不变）；
 *   3. 用户显示名是 `username`（本仓无 nickname）。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import RelationGraph, { type GraphLink, type GraphNode } from '@/components/charts/RelationGraph.vue';
import { postUsers } from '@/api/system';
import type { PostMember } from '@/api/types';
import { useAuthStore } from '@/stores/auth';

/** 阶梯的输入：岗位行（含在岗人数） */
export interface LadderPost {
  id: number;
  postName: string;
  postCode: string;
  sort: number;
  status: number;
  userCount: number;
}

const props = withDefaults(defineProps<{ posts: LadderPost[]; loading?: boolean }>(), { loading: false });
const emit = defineEmits<{ (e: 'edit', post: LadderPost): void }>();

const auth = useAuthStore();
const router = useRouter();
const size = ref({ w: 0, h: 0 });
const activeId = ref<number | null>(null);
const members = ref<PostMember[]>([]);
const membersLoading = ref(false);
const toast = ref('');

/** 有权限才拉成员明细（否则只显示人数） */
const canListUsers = computed(() => auth.hasPermission('admin:user:read'));

const steps = computed(() => [...props.posts].sort((a, b) => a.sort - b.sort || a.id - b.id));

watch(
  steps,
  list => {
    if (activeId.value !== null && !list.some(p => p.id === activeId.value)) activeId.value = null;
    if (activeId.value === null && list.length) activeId.value = list[list.length - 1].id;
  },
  { immediate: true }
);

const active = computed(() => steps.value.find(p => p.id === activeId.value) ?? null);

/**
 * 加载在岗成员
 *
 * @param id 岗位 ID
 */
async function loadMembers(id: number): Promise<void> {
  if (!canListUsers.value) {
    members.value = [];
    return;
  }
  membersLoading.value = true;
  try {
    members.value = await postUsers(id);
  } catch (err) {
    members.value = [];
    toast.value = err instanceof Error ? err.message : '在岗人员加载失败';
    window.setTimeout(() => (toast.value = ''), 2600);
  } finally {
    membersLoading.value = false;
  }
}

watch(
  activeId,
  id => {
    if (id !== null) void loadMembers(id);
  },
  { immediate: true }
);

/**
 * 分类色（第几级 → 1–5）
 *
 * @param i 序号
 * @returns 分类号
 */
const catOf = (i: number): number => (i % 5) + 1;

const MEMBER_CAP = 12;

const scene = computed<{ nodes: GraphNode[]; links: GraphLink[] }>(() => {
  const { w, h } = size.value;
  const list = steps.value;
  if (!w || !h || !list.length) return { nodes: [], links: [] };
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const n = list.length;
  // 台阶沿对角线铺满：左下 → 右上；宽度随数量收缩，绝不出界
  const pad = Math.max(28, w * 0.03);
  const width = Math.max(92, Math.min(150, (w - pad * 2) / Math.max(n, 1) - 12));
  const x0 = pad + width / 2;
  const x1 = w - pad - width / 2;
  const y0 = h - 120;
  const y1 = Math.max(150, h * 0.28);
  list.forEach((p, i) => {
    const k = n > 1 ? i / (n - 1) : 0.5;
    const id = `post:${p.id}`;
    nodes.push({
      id,
      kind: 'slab',
      x: n > 1 ? x0 + (x1 - x0) * k : (x0 + x1) / 2,
      y: y0 + (y1 - y0) * k,
      size: width,
      rank: `第 ${i + 1} 级`,
      label: p.postName,
      sub: p.postCode,
      count: p.userCount,
      cat: catOf(i),
      tone: p.status !== 1 ? 'off' : undefined,
      delay: 0.1 + i * 0.12
    });
    if (i > 0) links.push({ a: `post:${list[i - 1].id}`, b: id, flow: 'forward', shape: 'h', cat: catOf(i) });
  });
  const post = active.value;
  if (!post) return { nodes, links };
  const root = `post:${post.id}`;
  const cat = catOf(list.indexOf(post));
  const shown = members.value.slice(0, MEMBER_CAP);
  const more = members.value.length - shown.length;
  // 成员排在左上空域（信息卡右侧）：最多两列，从选中台阶触须长出
  const colX = [Math.max(300, w * 0.25), Math.max(300, w * 0.25) + 220];
  const top = 76;
  const bottom = Math.min(h * 0.5, h - 260);
  const perCol = Math.max(3, Math.floor((bottom - top) / 50) + 1);
  const items: Array<{ id: string; label: string; sub: string; interactive: boolean }> = shown.map(u => ({
    id: `u:${u.id}`,
    label: u.username,
    sub: [u.email].filter(Boolean).join(' · '),
    interactive: true
  }));
  if (more > 0) items.push({ id: 'more', label: `还有 ${more} 人`, sub: '在用户页查看全部', interactive: false });
  if (!items.length && !membersLoading.value) {
    items.push({
      id: 'empty',
      label: canListUsers.value ? '暂无在岗人员' : `共 ${post.userCount} 人在岗`,
      sub: canListUsers.value ? '可在用户管理中为用户指定岗位' : '无用户查询权限，仅显示人数',
      interactive: false
    });
  }
  items.forEach((it, i) => {
    const c = Math.floor(i / perCol);
    const r = i % perCol;
    const inCol = Math.min(perCol, items.length - c * perCol);
    const gap = Math.min(50, (bottom - top) / Math.max(inCol - 1, 1));
    const y = top + (bottom - top) / 2 - (gap * (inCol - 1)) / 2 + r * gap;
    nodes.push({
      id: it.id,
      kind: 'item',
      align: 'left',
      x: colX[Math.min(c, 1)],
      y,
      label: it.label,
      sub: it.sub,
      icon: it.id.startsWith('u:') ? 'users' : undefined,
      cat: it.id.startsWith('u:') ? cat : undefined,
      tone: it.id.startsWith('u:') ? undefined : 'off',
      interactive: it.interactive,
      from: root,
      delay: 0.12 + i * 0.08
    });
    if (it.id.startsWith('u:')) links.push({ a: root, b: it.id, flow: 'forward', cat });
  });
  return { nodes, links };
});

const highlight = computed<string[] | null>(() => {
  const post = active.value;
  if (!post) return null;
  return scene.value.nodes.filter(n => !n.id.startsWith('post:') || n.id === `post:${post.id}`).map(n => n.id);
});

/**
 * 点击台阶切换岗位；点成员跳用户页并带上关键字
 *
 * @param node 节点
 */
function onSelect(node: GraphNode): void {
  if (node.id.startsWith('post:')) {
    activeId.value = Number(node.id.slice(5));
    return;
  }
  const user = members.value.find(u => `u:${u.id}` === node.id);
  if (user) void router.push({ path: '/system/user', query: { keyword: user.username } });
}
</script>

<template>
  <div class="ladder">
    <RelationGraph
      v-model:size="size"
      class="ladder-stage"
      :style="{ minWidth: `${steps.length * 112 + 72}px` }"
      variant="stage"
      label="岗位能量阶梯"
      :nodes="scene.nodes"
      :links="scene.links"
      :active-id="active ? `post:${active.id}` : null"
      :highlight="highlight"
      @select="onSelect"
      @back="activeId = null"
    >
      <template v-if="active" #tl>
        <section class="ladder-card m-float" :class="`cat-${(steps.indexOf(active) % 5) + 1}`" aria-live="polite">
          <div class="ladder-card-head">
            <span class="ladder-card-rank">第 {{ steps.indexOf(active) + 1 }} 级 · 共 {{ steps.length }} 级</span>
            <span :class="['tag', active.status === 1 ? 'tag--ok' : 'tag--off']">{{ active.status === 1 ? '启用' : '停用' }}</span>
          </div>
          <h3>{{ active.postName }}</h3>
          <span class="ladder-card-rank">{{ active.postCode }}</span>
          <dl>
            <div><dt>在岗</dt><dd class="tnum">{{ active.userCount }}<small>人</small></dd></div>
            <div><dt>排序</dt><dd class="tnum">{{ active.sort }}</dd></div>
          </dl>
          <div class="ladder-card-actions">
            <button
              v-if="auth.hasPermission('admin:post:update')"
              class="btn btn--ghost btn--sm"
              type="button"
              @click="emit('edit', active)"
            >
              编辑岗位
            </button>
          </div>
        </section>
      </template>
      <p v-if="steps.length" class="trace-hint">点击台阶查看在岗人员 · 方向键切换</p>
    </RelationGraph>

    <div v-if="!loading && !steps.length" class="empty">还没有岗位</div>
    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>
