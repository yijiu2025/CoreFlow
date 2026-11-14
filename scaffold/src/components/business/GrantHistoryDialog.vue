<script setup lang="ts">
/**
 * 用户授权记录（弹窗）
 *
 * 依次回答三个问题，越靠前越接近"我现在想知道的"：
 *   1. **当前生效** —— 他现在到底有什么：角色按应用分组，展开后权限码再按模块折叠；
 *   2. **生效时间线** —— 按角色聚合的横向条带：哪些还开着、开了多久、中间断过没；
 *   3. **逐条流水** —— 谁在什么时候授予/取消了什么（默认收起，需要时才展开）。
 *
 * 🔴 「生效中」必须由**服务端**判定（`current.roles` / `timeline[].active`），不能按
 *    已加载的流水倒推：流水是分页的，某个角色的授予记录落在第二页之后，前端从第一页
 *    倒扫就会把仍然生效的角色标成"已撤销"（旧实现正是如此）。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { computed, ref, watch } from 'vue';
import { userGrants } from '@/api/system';
import type { CurrentAccess, CurrentAccessRole, GrantLogRow, PermissionGroup, RoleTimelineEntry } from '@/api/types';

const props = defineProps<{
  /** 目标用户 ID（null = 关闭） */
  userId: number | null;
  /** 目标用户账号（标题展示用） */
  username: string;
  /**
   * 是否允许从这里跳到用户编辑
   *
   * 由调用方判定（超出授权范围的用户不给入口），本组件不重复算范围。
   */
  adjustable?: boolean;
}>();

const emit = defineEmits<{ (e: 'close'): void; (e: 'adjust'): void }>();

const rows = ref<GrantLogRow[]>([]);
const total = ref(0);
const timeline = ref<RoleTimelineEntry[]>([]);
const current = ref<CurrentAccess>({ roles: [], permissionCodes: [], permissionGroups: [], apps: [], wildcard: false });
const loading = ref(false);
const errorMessage = ref('');
const filter = ref<'' | 'grant' | 'revoke'>('');
const pageNum = ref(1);
const PAGE_SIZE = 20;

/** 展开了权限码的角色 ID */
const expandedRoles = ref<Set<number>>(new Set());
/** 展开了权限码的模块键（`roleId::moduleKey`，同一模块在不同角色下互不影响） */
const expandedModules = ref<Set<string>>(new Set());

/** 是否还有下一页流水 */
const hasMore = computed(() => rows.value.length < total.value);

/** 仍生效的角色 ID（服务端给的当前状态） */
const activeRoleIds = computed(() => new Set(current.value.roles.map(role => role.role_id)));

/** 当前生效的角色按应用分组（与用户编辑里的角色选择器同一口径） */
const currentGroups = computed(() => {
  const buckets = new Map<string, { label: string; roles: CurrentAccessRole[] }>();
  for (const role of current.value.roles) {
    const key = role.app_id || 'GLOBAL';
    if (!buckets.has(key)) buckets.set(key, { label: role.app_label || (key === 'GLOBAL' ? '全局' : key), roles: [] });
    buckets.get(key)!.roles.push(role);
  }
  return [...buckets.entries()]
    .map(([appId, group]) => ({ appId, ...group }))
    .sort((a, b) => (a.appId === 'GLOBAL' ? -1 : b.appId === 'GLOBAL' ? 1 : a.label.localeCompare(b.label, 'zh-CN')));
});

/** 概览文案：权限码含 `*` 时不能再数个数 */
const summary = computed(() => {
  const roles = current.value.roles.length;
  if (roles === 0) return '当前没有任何生效角色';
  const permText = current.value.wildcard ? '全部权限（*）' : `${current.value.permissionCodes.length} 个权限码`;
  return `${roles} 个角色 · ${permText} · ${current.value.apps.length} 个应用`;
});

/**
 * 某个角色的权限码按模块折叠
 *
 * 复用后端算好的 `permissionGroups`（中文名来自权限元数据），只做"取交集"——
 * 前端不再自己猜模块名，否则新增权限码时会显示成裸代码。
 *
 * @param role 当前生效的角色
 * @returns 该角色涉及到的模块及其权限码
 */
function roleModules(role: CurrentAccessRole): PermissionGroup[] {
  const owned = new Set(role.permissions);
  const groups: PermissionGroup[] = [];
  const covered = new Set<string>();

  for (const group of current.value.permissionGroups) {
    const codes = group.codes.filter(item => owned.has(item.code));
    if (codes.length === 0) continue;
    groups.push({ ...group, codes });
    for (const item of codes) covered.add(item.code);
  }

  const rest = role.permissions.filter(code => !covered.has(code));
  if (rest.length > 0) {
    groups.push({ key: '__rest__', label: '其它', domain: '', domainName: '', codes: rest.map(code => ({ code, label: '' })) });
  }
  return groups;
}

/** 是否展开某个角色的权限码 */
function isRoleOpen(roleId: number): boolean {
  return expandedRoles.value.has(roleId);
}

/** 展开 / 收起某角色的权限码 */
function toggleRole(roleId: number): void {
  const next = new Set(expandedRoles.value);
  if (next.has(roleId)) next.delete(roleId);
  else next.add(roleId);
  expandedRoles.value = next;
}

/**
 * 展开 / 收起某个模块
 *
 * @param roleId 角色 ID
 * @param key 模块键
 */
function toggleModule(roleId: number, key: string): void {
  const token = `${roleId}::${key}`;
  const next = new Set(expandedModules.value);
  if (next.has(token)) next.delete(token);
  else next.add(token);
  expandedModules.value = next;
}

/** 是否展开某个模块 */
function isModuleOpen(roleId: number, key: string): boolean {
  return expandedModules.value.has(`${roleId}::${key}`);
}

/* ── 时间线 ───────────────────────────────────────────────── */

/** 画图用的"现在"（打开弹窗时定格，避免条带随秒跳动） */
const nowTs = ref(Date.now());

/** 时间轴范围：最早一次授予 → 现在 */
const range = computed(() => {
  const starts = timeline.value
    .flatMap(entry => entry.segments.map(segment => new Date(segment.from).getTime()))
    .filter(Number.isFinite);
  if (starts.length === 0) return null;
  const min = Math.min(...starts);
  return { min, span: Math.max(nowTs.value - min, 1) };
});

/**
 * 条带的定位与宽度（百分比）
 *
 * @param segment 区间片段
 * @returns 内联样式
 */
function barStyle(segment: { from: string; to: string | null }): Record<string, string> {
  const box = range.value;
  if (!box) return { display: 'none' };
  const from = new Date(segment.from).getTime();
  const to = segment.to ? new Date(segment.to).getTime() : nowTs.value;
  const left = ((from - box.min) / box.span) * 100;
  const width = (Math.max(to - from, 0) / box.span) * 100;
  // 极短的区间（一分钟内）也要看得见：给个最小宽度，位置仍按真实比例
  return { left: `${Math.max(left, 0)}%`, width: `${Math.max(width, 0.8)}%` };
}

/**
 * 该角色累计生效时长
 *
 * @param entry 角色时间线
 * @returns 形如 `12 天` / `3 小时`
 */
function totalSpan(entry: RoleTimelineEntry): string {
  const ms = entry.segments.reduce((sum, segment) => {
    const from = new Date(segment.from).getTime();
    const to = segment.to ? new Date(segment.to).getTime() : nowTs.value;
    return sum + Math.max(to - from, 0);
  }, 0);
  const days = ms / 86400000;
  if (days >= 1) return `${Math.floor(days)} 天`;
  const hours = ms / 3600000;
  if (hours >= 1) return `${Math.floor(hours)} 小时`;
  return '不到 1 小时';
}

/** 时间轴两端标签 */
const axisLabels = computed(() => {
  if (!range.value) return { start: '', end: '' };
  return { start: when(new Date(range.value.min).toISOString()), end: '现在' };
});

/* ── 加载 ─────────────────────────────────────────────────── */

/**
 * 加载一页流水（当前状态与时间线随响应一起刷新）
 *
 * @param append 是否追加（「加载更多」）
 */
async function load(append = false): Promise<void> {
  if (props.userId === null) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await userGrants(props.userId, {
      pageNum: pageNum.value,
      pageSize: PAGE_SIZE,
      ...(filter.value ? { action: filter.value } : {})
    });
    rows.value = append ? [...rows.value, ...page.rows] : page.rows;
    total.value = page.total;
    // 当前状态与时间线跟分页无关，每次都用最新的一份覆盖
    current.value = page.current ?? { roles: [], permissionCodes: [], permissionGroups: [], apps: [], wildcard: false };
    timeline.value = page.timeline ?? [];
    nowTs.value = Date.now();
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

/** 切换筛选（回到第一页） */
function setFilter(next: '' | 'grant' | 'revoke'): void {
  filter.value = next;
  pageNum.value = 1;
  void load();
}

/** 加载更多 */
function more(): void {
  pageNum.value += 1;
  void load(true);
}

/**
 * 时间显示（本地时区，秒级足够）
 *
 * @param iso ISO 时间串
 * @returns 形如 2026-11-10 12:34:56
 */
function when(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 生效时长（"已生效多久"，比一个绝对时间更能让人判断该不该继续留着）
 *
 * @param iso 起始时间
 * @returns 形如 `3 天` / `2 小时` / `刚刚`
 */
function since(iso: string | null): string {
  if (!iso) return '';
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return '';
  const diff = Date.now() - start;
  if (diff < 0) return '';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时`;
  return `${Math.floor(hours / 24)} 天`;
}

/**
 * 操作人附加信息（邮箱 · 部门）
 *
 * 只认后端**现查**到的详情：流水里只有账号名快照，同名同姓时判断不了"这是哪个部门的
 * 管理员批的"。系统自动授权（`operator_id` 为空）没有详情，返回空串。
 *
 * @param row 流水行
 * @returns 形如 `zhangsan@corp.com · 技术部`，无详情时为空串
 */
function operatorDetail(row: GrantLogRow): string {
  return [row.operator_email, row.operator_dept].filter(Boolean).join(' · ');
}

/**
 * 操作人悬停全量信息（长邮箱会被省略号截断，悬停可看全）
 *
 * @param row 流水行
 * @returns 悬停提示文本
 */
function operatorTitle(row: GrantLogRow): string {
  const parts = [row.operator_name, operatorDetail(row)];
  if (row.operator_uid) parts.push(`uid ${row.operator_uid}`);
  if (row.operator_deleted) parts.push('账号已删除');
  return parts.filter(Boolean).join('\n');
}

// 打开 / 换人时重置并加载
watch(
  () => props.userId,
  id => {
    if (id === null) return;
    rows.value = [];
    total.value = 0;
    timeline.value = [];
    pageNum.value = 1;
    filter.value = '';
    expandedRoles.value = new Set();
    expandedModules.value = new Set();
    void load();
  },
  { immediate: true }
);
</script>

<template>
  <div v-if="userId !== null" class="modal-mask" v-mask-close="() => emit('close')">
    <div class="modal grant-modal">
      <header class="modal__head">
        <span class="modal__title">授权记录 · {{ username }}</span>
        <button class="grant-close" type="button" aria-label="关闭" @click="emit('close')">×</button>
      </header>

      <div class="modal__body grant-body">
        <p v-if="errorMessage" class="field__error">{{ errorMessage }}</p>

        <!-- ① 当前生效 -->
        <section class="grant-current">
          <header class="grant-current__head">
            <span class="grant-current__title">当前生效</span>
            <span class="tag" :class="current.roles.length > 0 ? 'tag--ok' : 'tag--off'">{{ current.roles.length }} 个角色</span>
            <span class="grant-current__summary">{{ summary }}</span>
            <button v-if="adjustable && current.roles.length > 0" class="btn btn--ghost btn--sm" type="button" @click="emit('adjust')">
              调整权限
            </button>
          </header>

          <p v-if="current.roles.length === 0" class="grant-current__empty">该用户当前没有任何生效角色（因此也没有任何后台权限）</p>

          <div v-for="group in currentGroups" :key="group.appId" class="grant-current__group">
            <span class="grant-current__app">{{ group.label }}</span>
            <div class="grant-current__roles">
              <div v-for="role in group.roles" :key="role.role_id" class="grant-role">
                <div class="grant-role__row">
                  <button class="grant-role__head" type="button" :aria-expanded="isRoleOpen(role.role_id)" @click="toggleRole(role.role_id)">
                    <span class="grant-role__name">{{ role.role_name }}</span>
                    <span class="grant-role__code mono">{{ role.role_code }}</span>
                    <span class="grant-role__count mono">{{ role.permissions.includes('*') ? '全部' : role.permissions.length }}</span>
                    <span class="grant-role__caret" aria-hidden="true">{{ isRoleOpen(role.role_id) ? '▴' : '▾' }}</span>
                  </button>
                  <button v-if="adjustable" class="grant-role__adjust" type="button" title="打开用户编辑，调整角色与岗位" @click="emit('adjust')">
                    去调整
                  </button>
                </div>

                <p class="grant-role__meta">
                  <template v-if="role.granted_at">
                    {{ role.granted_by || '系统' }} 于 {{ when(role.granted_at) }} 授予
                    <span class="grant-role__since">· 已生效 {{ since(role.granted_at) }}</span>
                  </template>
                  <template v-else>无授予流水（历史数据或初始化创建）</template>
                </p>

                <!-- 权限码：先按模块折叠，再展开看具体码 -->
                <div v-if="isRoleOpen(role.role_id)" class="grant-modules">
                  <p v-if="role.permissions.length === 0" class="grant-role__perm-empty">该角色没有配置任何权限码</p>
                  <div v-for="module in roleModules(role)" :key="module.key" class="grant-module">
                    <button class="grant-module__head" type="button" :aria-expanded="isModuleOpen(role.role_id, module.key)" @click="toggleModule(role.role_id, module.key)">
                      <span class="grant-module__label">{{ module.label }}</span>
                      <span class="grant-module__count mono">{{ module.codes.length }}</span>
                      <span v-if="module.domainName && module.domainName !== group.label" class="grant-module__domain">{{ module.domainName }}</span>
                      <span class="grant-module__caret" aria-hidden="true">{{ isModuleOpen(role.role_id, module.key) ? '▴' : '▾' }}</span>
                    </button>
                    <div v-if="isModuleOpen(role.role_id, module.key)" class="grant-perms">
                      <span v-for="item in module.codes" :key="item.code" class="grant-perm" :title="item.code">
                        {{ item.label || item.code }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ② 生效时间线：一个角色一条横向条带 -->
        <section v-if="timeline.length > 0" class="grant-timeline">
          <header class="grant-timeline__head">
            <span class="grant-timeline__title">生效时间线</span>
            <span class="grant-timeline__hint">按角色聚合 · 空白处表示当时没有这个角色</span>
          </header>

          <div class="tl-axis">
            <span class="mono">{{ axisLabels.start }}</span>
            <span class="mono">{{ axisLabels.end }}</span>
          </div>

          <div v-for="entry in timeline" :key="entry.role_id" class="tl-row">
            <span class="tl-row__name" :title="`${entry.role_name} · ${entry.role_code}`">{{ entry.role_name }}</span>
            <div class="tl-row__track">
              <span
                v-for="(segment, index) in entry.segments"
                :key="index"
                class="tl-bar"
                :class="{ 'is-open': segment.to === null }"
                :style="barStyle(segment)"
                :title="`${when(segment.from)} → ${segment.to ? when(segment.to) : '现在'}`"
              ></span>
            </div>
            <span class="tl-row__state" :class="{ 'is-on': entry.active }">
              {{ entry.active ? `生效中 · ${totalSpan(entry)}` : `已撤销 · 共 ${totalSpan(entry)}` }}
            </span>
          </div>
        </section>

        <!-- ③ 逐条流水（默认收起） -->
        <details class="grant-events">
          <summary class="grant-events__summary">
            逐条流水
            <span class="mono grant-events__count">{{ total }} 条</span>
          </summary>

          <div class="grant-filter tabbar" role="tablist" aria-label="筛选">
            <button type="button" role="tab" :aria-selected="filter === ''" :class="['tab', { 'is-on': filter === '' }]" @click="setFilter('')">全部</button>
            <button type="button" role="tab" :aria-selected="filter === 'grant'" :class="['tab', { 'is-on': filter === 'grant' }]" @click="setFilter('grant')">授予</button>
            <button type="button" role="tab" :aria-selected="filter === 'revoke'" :class="['tab', { 'is-on': filter === 'revoke' }]" @click="setFilter('revoke')">取消</button>
          </div>

          <p v-if="!loading && rows.length === 0" class="grant-empty">还没有授权记录</p>

          <ol class="grant-list">
            <li v-for="row in rows" :key="row.id" :class="['grant-item', `is-${row.action}`]">
              <span class="grant-dot" aria-hidden="true"></span>
              <div class="grant-main">
                <p class="grant-line">
                  <b class="grant-operator" :title="operatorTitle(row)">{{ row.operator_name }}</b>
                  <!-- 授权人详情：一眼看出"是哪个部门的谁"，不用再去用户列表里反查 -->
                  <span v-if="operatorDetail(row)" class="grant-operator-info" :title="operatorTitle(row)">
                    {{ operatorDetail(row) }}
                  </span>
                  <span v-if="row.operator_deleted" class="tag tag--off">账号已删除</span>
                  <span v-else-if="row.operator_status === 0" class="tag tag--off">已冻结</span>
                  <span v-else-if="row.operator_status === -1" class="tag tag--off">已注销</span>
                  {{ row.action === 'grant' ? '授予' : '取消' }}
                  <b>{{ row.role_name }}</b>
                  <span class="mono grant-code">{{ row.role_code }}</span>
                  <span v-if="row.app_id && row.app_id !== 'GLOBAL'" class="tag tag--info">{{ row.app_id }}</span>
                  <span v-if="row.action === 'grant' && activeRoleIds.has(row.role_id)" class="tag tag--ok">生效中</span>
                </p>
                <p class="grant-meta mono">{{ when(row.created_at) }}<span v-if="row.remark"> · {{ row.remark }}</span></p>
              </div>
            </li>
          </ol>

          <button v-if="hasMore" class="btn btn--sm grant-more" type="button" :disabled="loading" @click="more">
            {{ loading ? '加载中…' : '加载更多' }}
          </button>
        </details>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grant-modal {
  width: min(720px, 100%);
}

.modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.grant-close {
  flex: none;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--mauth-text-mid);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.grant-close:hover {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

/* ── ① 当前生效 ───────────────────────────────────────────── */
.grant-current {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface-2);
}

.grant-current__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.grant-current__title {
  font-size: 12.5px;
  font-weight: 620;
}

.grant-current__summary {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.grant-current__empty {
  margin: 0;
  font-size: 12px;
  color: var(--mauth-text-faint);
}

.grant-current__group {
  display: flex;
  gap: 10px;
  padding-top: 6px;
  border-top: 1px dashed var(--mauth-border);
}

.grant-current__app {
  flex: none;
  width: 62px;
  padding-top: 4px;
  font-size: 11.5px;
  color: var(--mauth-text-soft);
  text-align: right;
}

.grant-current__roles {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.grant-role {
  border-radius: var(--mauth-radius-xs);
  background: var(--mauth-surface);
  box-shadow: inset 0 0 0 1px var(--mauth-border);
}

.grant-role__row {
  display: flex;
  align-items: center;
}

/* 角色头：整行可点，展开看权限码 */
.grant-role__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  border-radius: var(--mauth-radius-xs);
}

.grant-role__head:hover {
  background: var(--mauth-hover);
}

.grant-role__name {
  font-weight: 600;
}

.grant-role__code {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.grant-role__count {
  margin-left: auto;
  font-size: 11px;
  color: var(--mauth-text-soft);
}

.grant-role__caret {
  color: var(--mauth-text-faint);
  font-size: 10px;
}

/* 「去调整」：跳用户编辑，不是就地改权限 */
.grant-role__adjust {
  flex: none;
  margin-right: 8px;
  padding: 2px 8px;
  border: 1px solid var(--mauth-border-strong);
  border-radius: 999px;
  background: none;
  color: var(--mauth-text-soft);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.grant-role__adjust:hover {
  color: var(--mauth-primary);
  border-color: var(--mauth-primary);
}

.grant-role__meta {
  margin: 0;
  padding: 0 10px 6px;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.grant-role__since {
  color: var(--mauth-text-soft);
}

.grant-role__perm-empty {
  margin: 0;
  padding: 2px 10px 8px;
  font-size: 11.5px;
  color: var(--mauth-danger);
}

/* 模块折叠层 */
.grant-modules {
  padding: 0 10px 8px;
}

.grant-module + .grant-module {
  border-top: 1px dashed var(--mauth-border);
}

.grant-module__head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.grant-module__label {
  font-weight: 600;
  color: var(--mauth-text-mid);
}

.grant-module__count {
  padding: 0 5px;
  border-radius: 999px;
  background: var(--mauth-hover);
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

.grant-module__domain {
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

.grant-module__caret {
  margin-left: auto;
  color: var(--mauth-text-faint);
  font-size: 10px;
}

.grant-perms {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 2px 0 6px;
}

.grant-perm {
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
  font-size: 11px;
}

/* ── ② 时间线 ─────────────────────────────────────────────── */
.grant-timeline {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
}

.grant-timeline__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 2px;
}

.grant-timeline__title {
  font-size: 12.5px;
  font-weight: 620;
}

.grant-timeline__hint {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.tl-axis {
  display: flex;
  justify-content: space-between;
  padding-left: 96px;
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

.tl-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tl-row__name {
  flex: none;
  width: 88px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--mauth-text-mid);
  text-align: right;
}

/* 轨道本身就是"时间轴"：条带按真实比例落位 */
.tl-row__track {
  position: relative;
  flex: 1;
  height: 14px;
  border-radius: 4px;
  background: var(--mauth-hover);
  overflow: hidden;
}

.tl-bar {
  position: absolute;
  top: 2px;
  bottom: 2px;
  border-radius: 3px;
  background: var(--mauth-text-faint);
}

/* 开着的条带用主色实心：一眼分出"还挂着的" */
.tl-bar.is-open {
  background: var(--mauth-primary);
}

.tl-row__state {
  flex: none;
  width: 96px;
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

.tl-row__state.is-on {
  color: var(--mauth-success);
}

/* ── ③ 逐条流水 ───────────────────────────────────────────── */
.grant-events {
  border-top: 1px solid var(--mauth-border);
  padding-top: 8px;
}

.grant-events__summary {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--mauth-text-mid);
  cursor: pointer;
  list-style: none;
}

.grant-events__summary::-webkit-details-marker {
  display: none;
}

.grant-events__summary::before {
  content: '▸';
  font-size: 10px;
  color: var(--mauth-text-faint);
}

.grant-events[open] .grant-events__summary::before {
  content: '▾';
}

.grant-events__count {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.grant-filter {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 6px 0 0;
}

.grant-body {
  gap: 8px;
  min-height: 180px;
}

.grant-empty {
  padding: 12px 0;
  text-align: center;
  font-size: 12.5px;
  color: var(--mauth-text-faint);
}

.grant-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.grant-item {
  display: flex;
  gap: 10px;
  padding: 8px 2px;
  border-bottom: 1px dashed var(--mauth-border);
}

.grant-item:last-child {
  border-bottom: 0;
}

/* 左侧时间线圆点：授予=主色实心，取消=空心 */
.grant-dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-top: 7px;
  border-radius: 999px;
  background: var(--mauth-primary);
}

.grant-item.is-revoke .grant-dot {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--mauth-text-faint);
}

.grant-main {
  min-width: 0;
}

.grant-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0;
  font-size: 13px;
}

.grant-line b {
  font-weight: 600;
}

/* 授权人详情：紧跟账号名，弱化到"可读但不抢主语" */
.grant-operator {
  cursor: help;
}

.grant-operator-info {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.grant-code {
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.grant-meta {
  margin: 3px 0 0;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.grant-more {
  margin-top: 8px;
  width: 100%;
}
</style>
