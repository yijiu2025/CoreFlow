<script setup lang="ts">
/**
 * 角色选择器（先选应用 → 再选角色 / 搜索 / 已选摘要）
 *
 * 为什么要有这个组件：用户编辑与批量授权两处都要选角色，原先各写一份平铺 chips ——
 * 一屏几十个角色混在一起，`admin_*` 和 `fw_*` 交错，选错是必然的。
 *
 * === 两级：应用索引条 + 组内列表 ===
 * 角色按 `role.app_id` 归属到应用，顶部一条索引条先收窄范围（`GLOBAL` 公共角色
 * 固定第一），下面再按应用分组列出来。上百个角色时"先选应用"比"翻三百行"快得多，
 * 而搜索留给"我知道它叫什么"的场景 —— 两条路都通，谁也不是谁的替代品。
 *
 * === 搜索 ===
 * 200ms 去抖是给输入法留时间：中文拼音每敲一个字母都过滤，列表会在眼前反复重排。
 * 组字期间（`compositionstart` → `compositionend`）**完全不过滤**，组字结束立刻过滤；
 * 粘贴立即过滤（粘一段带换行的文本时，等 200ms 只会让人以为没反应）。
 * 搜索时忽略应用筛选（跨应用找人），排序按「名称开头命中 > 名称中段 > 仅编码命中」，
 * 同档保持组顺序 + 组内职级降序 —— 命中质量高的排前面，同质量的不打乱既有阅读顺序。
 *
 * === 越权项 ===
 * `manageable === false` 的角色（不在操作者应用域内、或职级不低于他）**可见但不可改**：
 * 藏起来会让人以为"这个用户没有那个角色"，反而更危险。勾选框禁用、仍显示为勾选态、
 * 名称用 `--mauth-text-mid`（**不用 faint / 不整体降透明**：只读恰恰是最需要读清的时候）。
 *
 * 🔴 `props.roles` 只读，所有派生都在 computed 里做（排序用副本）。
 * 🔴 切应用 / 搜索**绝不过滤 `modelValue`** —— 那等于静默摘掉角色，保存后要写进授权流水。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Lock, Search, X } from 'lucide-vue-next';
import type { RoleOption } from '@/api/types';

const props = withDefaults(
  defineProps<{
    /** 当前选中的角色 ID */
    modelValue: number[];
    /** 可选角色（含 app_label / manageable） */
    roles: RoleOption[];
    /**
     * 整体只读（勾选框全部禁用）
     *
     * 用于「编辑自己的账号」：角色变更等于权限变更，必须由职级更高的人操作。
     * 保留控件而不是换成一段文字 —— 用户需要看见自己当前的角色与分组，只是不许改。
     */
    disabled?: boolean;
    /**
     * 选项加载状态
     *
     * `loading` / `error` 两种都**不得**显示「暂无可分配角色」：那是"确实一个都没有"
     * 的结论，而在选项还没到 / 拉失败时下这个结论是错的 —— 用户会以为此人没有角色。
     */
    status?: 'loading' | 'ready' | 'error';
  }>(),
  { disabled: false, status: 'ready' }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: number[]): void;
  /** 点「重试」：由宿主重新拉选项（组件自己不发请求） */
  (e: 'retry'): void;
}>();

/** 只读（自己改自己） */
const readonly = computed(() => props.disabled === true);
/** 选项加载中 */
const loading = computed(() => props.status === 'loading');
/** 选项加载失败 */
const failed = computed(() => props.status === 'error');
/** 候选数 ≥ 9 才给搜索框：只有五六个角色时，一个输入框的注意力成本大于收益 */
const SEARCH_THRESHOLD = 9;

/* ── 搜索状态 ─────────────────────────────────────────────── */

/** 输入框里的原文（受控于 DOM，见 `onSearchInput` 里的说明） */
const query = ref('');
/** 真正参与过滤的关键词（去抖 / 组字结束 / 粘贴后同步） */
const appliedQuery = ref('');
/** 是否正在输入法组字 */
const composing = ref(false);
/** 去抖计时器 */
let debounceTimer = 0;
/** 搜索开始前选中的应用：清空搜索要回到它，而不是回到「全部」 */
const previousApp = ref<string | null>(null);

/** 搜索框 */
const searchEl = ref<HTMLInputElement | null>(null);

/** 应用索引条 */
const appsEl = ref<HTMLElement | null>(null);
/** 当前应用筛选（null = 全部） */
const activeApp = ref<string | null>(null);

/*
 * 搜索开始 / 结束时接管应用筛选
 *
 *   · 搜索一开始：记住当前应用 —— 搜索是"临时越过筛选"，不是放弃筛选；
 *   · 清空搜索：回到那个应用，而不是回到「全部」（用户点过应用这件事不该被抹掉）。
 *
 * 放在 watch 里而不是 `clearQuery` 里：Esc、× 按钮、`清空搜索`、粘贴后清空……清空的入口
 * 有四五个，逐个补一句"顺便恢复应用"必漏一个。
 */
watch(appliedQuery, (next, prev) => {
  if (next && !prev) previousApp.value = activeApp.value;
  else if (!next && prev) activeApp.value = previousApp.value;
  // 新的检索开始/结束：上一次动作回执（如「已清空 N 个角色」）不该继续占着播报区
  if (next !== prev) liveOneShot.value = '';
});

/** 已选摘要是否展开（>3 个时才有意义） */
const pickedOpen = ref(false);
/** 列表滚动容器 */
const listEl = ref<HTMLElement | null>(null);
/** 列表是否真的能滚（决定是否补「共 N 个」与底部渐隐） */
const scrollable = ref(false);
/** 是否已滚到底（到底就撤掉渐隐，否则最后一行总像被盖住一半） */
const atEnd = ref(false);
/** roving tabindex 的当前行 */
const activeIndex = ref(0);
/** 一次性播报（「已清空 N 个角色」这类动作回执） */
const liveOneShot = ref('');

/**
 * 安排一次去抖过滤
 */
function scheduleFilter(): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    appliedQuery.value = query.value.trim();
  }, 200);
}

/**
 * 立即过滤（粘贴 / 组字结束 / 清空）
 */
function flushFilter(): void {
  window.clearTimeout(debounceTimer);
  appliedQuery.value = query.value.trim();
}

/**
 * 输入
 *
 * 🔴 输入框**不绑 `:value`**：组字期间由 Vue 回写 value 会打断部分浏览器的输入法
 *    （拼音还没上屏就被替换成半截字母）。只在清空时手动写 DOM。
 *
 * @param event 输入事件
 */
function onSearchInput(event: Event): void {
  const el = event.target as HTMLInputElement;
  const input = event as InputEvent;
  const raw = el.value;
  // 粘贴进来的多行文本压成一行：换行在单行输入框里不可见，留着会让"搜不到"变得无解
  if (input.inputType === 'insertFromPaste' || /[\r\n\t]/.test(raw)) {
    const clean = raw.replace(/[\r\n\t]+/g, ' ').trim();
    if (el.value !== clean) el.value = clean;
    query.value = clean;
    flushFilter();
    return;
  }
  query.value = raw;
  // 组字期间不过滤：拼音串不是关键词
  if (composing.value) return;
  scheduleFilter();
}

/**
 * 组字结束：立刻过滤
 */
function onCompositionEnd(event: Event): void {
  composing.value = false;
  const el = event.target as HTMLInputElement;
  query.value = el.value;
  flushFilter();
}

/**
 * 清空搜索并回到"搜索前选中的应用"
 *
 * @param focus 是否把焦点送回搜索框（Esc 要，点「清空搜索」也要）
 */
function clearQuery(focus = true): void {
  window.clearTimeout(debounceTimer);
  query.value = '';
  appliedQuery.value = '';
  if (searchEl.value) searchEl.value.value = '';
  if (focus) void nextTick(() => searchEl.value?.focus({ preventScroll: true }));
}

/**
 * 搜索框键盘
 *
 * Esc 只在"有内容"时拦下来（清空 + 保持焦点）；空着时放行，交给宿主的弹窗关闭逻辑 ——
 * 否则一个空的搜索框会把 Esc 吃掉，用户按 Esc 关不掉弹窗还以为卡住了。
 *
 * @param event 键盘事件
 */
function onSearchKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !query.value) return;
  event.preventDefault();
  event.stopPropagation();
  clearQuery(true);
}

/* ── 分组与排序 ───────────────────────────────────────────── */

/** 一组角色 */
interface RoleGroup {
  appId: string;
  label: string;
  /** 当前筛选下该组可见的角色（已排序） */
  roles: RoleOption[];
  /** 组内可管理的角色数（当前筛选结果内） */
  manageable: number;
  /** 可管理的角色是否已全选 */
  allPicked: boolean;
}

/**
 * 应用分组（GLOBAL 置顶，其余按应用名排序）
 *
 * 组内按职级降序：高权限角色在上，符合"先看重要的"的阅读顺序。
 * 排序用副本 —— `props.roles` 是宿主的数组，就地排序会改掉别人的数据。
 */
const allGroups = computed<Array<{ appId: string; label: string; roles: RoleOption[] }>>(() => {
  const buckets = new Map<string, RoleOption[]>();
  for (const role of props.roles) {
    const key = role.app_id || 'GLOBAL';
    const list = buckets.get(key);
    if (list) list.push(role);
    else buckets.set(key, [role]);
  }
  return [...buckets.entries()]
    .map(([appId, list]) => ({
      appId,
      label: list[0]?.app_label || (appId === 'GLOBAL' ? '全局' : appId),
      roles: [...list].sort((a, b) => b.rank_level - a.rank_level || a.id - b.id)
    }))
    .sort((a, b) => {
      if (a.appId === 'GLOBAL') return b.appId === 'GLOBAL' ? 0 : -1;
      if (b.appId === 'GLOBAL') return 1;
      return a.label.localeCompare(b.label, 'zh-CN');
    });
});

/**
 * 把一组可见角色 + 当前已选拼成渲染用的组
 *
 * @param group 应用分组
 * @param list 过滤后的角色
 * @returns 渲染用分组
 */
function toGroup(group: { appId: string; label: string }, list: RoleOption[]): RoleGroup {
  const manageableList = list.filter(role => role.manageable !== false);
  const pickedManaged = manageableList.filter(role => props.modelValue.includes(role.id)).length;
  return {
    appId: group.appId,
    label: group.label,
    roles: list,
    manageable: manageableList.length,
    allPicked: manageableList.length > 0 && pickedManaged === manageableList.length
  };
}

/**
 * 命中档位
 *
 * @param role 角色
 * @param keyword 已小写的关键词
 * @returns 0 名称开头 / 1 名称中段 / 2 仅编码命中；-1 不命中
 */
function hitTier(role: RoleOption, keyword: string): number {
  const name = role.name.toLowerCase();
  if (name.startsWith(keyword)) return 0;
  if (name.includes(keyword)) return 1;
  if (role.code.toLowerCase().includes(keyword)) return 2;
  return -1;
}

/** 当前筛选结果（搜索时忽略应用筛选） */
const filteredGroups = computed<RoleGroup[]>(() => {
  const keyword = appliedQuery.value.toLowerCase();
  const out: RoleGroup[] = [];
  for (const group of allGroups.value) {
    // 搜索非空时全量搜：人在找"某个角色"，不该被上一次点的应用挡住
    if (!keyword && activeApp.value !== null && group.appId !== activeApp.value) continue;

    let list = group.roles;
    if (keyword) {
      const scored: Array<{ role: RoleOption; tier: number }> = [];
      for (const role of group.roles) {
        const tier = hitTier(role, keyword);
        if (tier >= 0) scored.push({ role, tier });
      }
      // 稳定排序（ES2019 起 sort 稳定）：同档内保持组内原有的职级降序
      scored.sort((a, b) => a.tier - b.tier);
      list = scored.map(item => item.role);
    }
    // 0 命中的组不渲染
    if (!list.length) continue;
    out.push(toGroup(group, list));
  }
  return out;
});

/** 扁平化的可见行（键盘 ↑/↓ 走的是它，跨组连续） */
const rows = computed<Array<{ role: RoleOption; appLabel: string }>>(() =>
  filteredGroups.value.flatMap(group => group.roles.map(role => ({ role, appLabel: group.label })))
);

/** 角色 ID → 扁平行号（模板里按 ID 取序号，避免组内下标与扁平下标混用） */
const rowIndexById = computed(() => {
  const map = new Map<number, number>();
  rows.value.forEach((row, index) => map.set(row.role.id, index));
  return map;
});

/** 当前可见角色总数 */
const visibleCount = computed(() => rows.value.length);

/** 候选数达到阈值才给搜索框 */
const showSearch = computed(() => props.roles.length >= SEARCH_THRESHOLD);

/** 应用索引条：候选应用 ≥2 才渲染（只有一个应用时那条索引条是纯噪音） */
const showApps = computed(() => allGroups.value.length >= 2);

/** 索引条：全部 + 各应用（计数从 `props.roles` 派生，与后端应用表无关） */
const appChips = computed<Array<{ id: string | null; label: string; count: number }>>(() => [
  { id: null, label: '全部', count: props.roles.length },
  ...allGroups.value.map(group => ({ id: group.appId, label: group.label, count: group.roles.length }))
]);

/** 索引条里当前该聚焦的那个（roving tabindex） */
const appsFocusIndex = computed(() => {
  const index = appChips.value.findIndex(chip => chip.id === activeApp.value);
  return index >= 0 ? index : 0;
});

/** 已选 ID 的集合（模板里高频查询，别在模板里反复 includes） */
const pickedSet = computed(() => new Set(props.modelValue));

/** 有已选角色的应用（索引条的计数据此转主色，而不是"全站只要有已选就全亮"） */
const pickedApps = computed(() => {
  const set = new Set<string>();
  for (const group of allGroups.value) {
    if (group.roles.some(role => pickedSet.value.has(role.id))) set.add(group.appId);
  }
  return set;
});

/* ── 已选摘要 ─────────────────────────────────────────────── */

/** 摘要里的一枚 chip */
interface PickedChip {
  id: number;
  /** 左半段：应用名（未知 id 时是 `#123`） */
  appLabel: string;
  /** 右半段：角色名（未知 id 时是「选项未加载」） */
  name: string;
  state: 'normal' | 'locked' | 'unknown';
}

/**
 * 已选摘要
 *
 * 按「应用顺序 + 组内顺序」排，不按点击顺序 —— 点选的先后没有意义，同一应用的
 * 角色应当挨在一起，用户核对时才能一眼看完"这个应用他有哪些角色"。
 *
 * 三类 chip 分开：可移除的 / 越权的（保存不会变更）/ 选项里根本没有的 id（原样保留）。
 */
const pickedChips = computed<PickedChip[]>(() => {
  const known = new Set<number>();
  const out: PickedChip[] = [];
  for (const group of allGroups.value) {
    for (const role of group.roles) {
      known.add(role.id);
      if (!pickedSet.value.has(role.id)) continue;
      out.push({
        id: role.id,
        appLabel: group.label,
        name: role.name,
        state: role.manageable === false ? 'locked' : 'normal'
      });
    }
  }
  // 不在选项里的 id：可能是选项没加载全，也可能是角色被删了。原样保留 + 说清楚
  for (const id of props.modelValue) {
    if (known.has(id)) continue;
    out.push({ id, appLabel: `#${id}`, name: '选项未加载', state: 'unknown' });
  }
  return out;
});

/** 折叠时只显示前 3 枚 */
const visiblePicked = computed(() => (pickedOpen.value ? pickedChips.value : pickedChips.value.slice(0, 3)));

/** 越权已选数（保存时不会提交，必须明确说） */
const lockedCount = computed(() => pickedChips.value.filter(chip => chip.state === 'locked').length);
/** 未知已选数 */
const unknownCount = computed(() => pickedChips.value.filter(chip => chip.state === 'unknown').length);
/** 这里真的能移除的数量（越权 / 未知都不可移除） */
const removableCount = computed(() => pickedChips.value.filter(chip => chip.state === 'normal').length);

/* ── 变更 ─────────────────────────────────────────────────── */

/**
 * 这一行能不能改
 *
 * @param role 角色
 * @returns 是否可切换
 */
function canToggle(role: RoleOption): boolean {
  return !readonly.value && role.manageable !== false;
}

/**
 * 勾选 / 取消
 *
 * @param role 角色
 */
function toggle(role: RoleOption): void {
  if (!canToggle(role)) return;
  const next = new Set(props.modelValue);
  if (next.has(role.id)) next.delete(role.id);
  else next.add(role.id);
  liveOneShot.value = '';
  emit('update:modelValue', [...next]);
}

/**
 * 行点击
 *
 * 🔴 开头挡掉"拖选文本"：想复制角色编码时鼠标划过整行，不该顺手把角色选上/取消。
 *
 * @param role 角色
 */
function onRowClick(role: RoleOption): void {
  if (window.getSelection()?.toString()) return;
  toggle(role);
}

/**
 * 移除一枚已选 chip
 *
 * @param chip 摘要 chip
 */
function removeChip(chip: PickedChip): void {
  if (readonly.value || chip.state !== 'normal') return;
  liveOneShot.value = '';
  emit(
    'update:modelValue',
    props.modelValue.filter(id => id !== chip.id)
  );
}

/**
 * 组头：全选 / 清空
 *
 * 作用域 = **当前筛选结果 ∩ 该应用 ∩ 可管理**：搜索"管理员"时点全选，不该把该应用下
 * 没被搜到的角色也勾上；越权项永不参与（后端会整单拒）。
 *
 * @param group 渲染用分组
 */
function toggleGroup(group: RoleGroup): void {
  if (readonly.value) return;
  const ids = group.roles.filter(role => role.manageable !== false).map(role => role.id);
  if (!ids.length) return;
  const next = new Set(props.modelValue);
  for (const id of ids) {
    if (group.allPicked) next.delete(id);
    else next.add(id);
  }
  liveOneShot.value = '';
  emit('update:modelValue', [...next]);
}

/**
 * 清空已选
 *
 * 只清"这里的用户能摘掉"的那些：越权 / 未知 id 本来就不归他管，假装清掉会让保存结果
 * 与屏幕不一致（后端不会因为这些 id 没提交而删角色）。所以按实际清掉的数量播报。
 */
function clearAll(): void {
  if (readonly.value) return;
  const removable = new Set(
    pickedChips.value.filter(chip => chip.state === 'normal').map(chip => chip.id)
  );
  if (!removable.size) return;
  liveOneShot.value = `已清空 ${removable.size} 个角色`;
  emit(
    'update:modelValue',
    props.modelValue.filter(id => !removable.has(id))
  );
}

/**
 * 选应用（索引条）
 *
 * 搜索中点击 chip = 清空搜索并切到该应用：索引条在搜索态下不显示"选中"（因为此刻
 * 筛选被忽略），但它必须是能点的 —— 让它变成死区等于告诉用户"这里坏了"。
 *
 * @param id 应用 ID（null = 全部）
 */
function selectApp(id: string | null): void {
  if (query.value || appliedQuery.value) {
    window.clearTimeout(debounceTimer);
    query.value = '';
    appliedQuery.value = '';
    if (searchEl.value) searchEl.value.value = '';
  }
  previousApp.value = id;
  activeApp.value = id;
  activeIndex.value = 0;
  liveOneShot.value = '';
  void nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = 0;
  });
}

/* ── 键盘 ─────────────────────────────────────────────────── */

/**
 * 把焦点送到某一行
 *
 * @param index 行号（会夹到有效范围）
 */
function focusRow(index: number): void {
  const last = rows.value.length - 1;
  if (last < 0) return;
  const next = Math.min(last, Math.max(0, index));
  activeIndex.value = next;
  void nextTick(() => {
    const el = listEl.value?.querySelector<HTMLElement>(`[data-rp-idx="${next}"]`);
    el?.focus({ preventScroll: false });
  });
}

/**
 * 行内键盘
 *
 * ↑/↓ 线性移动（跨组连续）、Home/End、PageUp/PageDown；Space/Enter 切换。
 * ←/→ 在列表里**不响应**：那是索引条的切换键，两处都吃会互相打架。
 *
 * @param event 键盘事件
 * @param index 行号
 * @param role 角色
 */
function onRowKeydown(event: KeyboardEvent, index: number, role: RoleOption): void {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      focusRow(index + 1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      focusRow(index - 1);
      break;
    case 'Home':
      event.preventDefault();
      focusRow(0);
      break;
    case 'End':
      event.preventDefault();
      focusRow(rows.value.length - 1);
      break;
    case 'PageDown':
      event.preventDefault();
      focusRow(index + 6);
      break;
    case 'PageUp':
      event.preventDefault();
      focusRow(index - 6);
      break;
    case ' ':
    case 'Enter':
      event.preventDefault();
      toggle(role);
      break;
    default:
      break;
  }
}

/**
 * 索引条 ←/→
 *
 * @param event 键盘事件
 */
function onAppsKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const chips = appChips.value;
  if (!chips.length) return;
  const delta = event.key === 'ArrowRight' ? 1 : -1;
  const current = appsFocusIndex.value;
  const next = (current + delta + chips.length) % chips.length;
  event.preventDefault();
  selectApp(chips[next].id);
  void nextTick(() => {
    appsEl.value?.querySelectorAll<HTMLElement>('.rp-app')[next]?.focus();
  });
}

/* ── 搜索高亮 ─────────────────────────────────────────────── */

/** 高亮片段 */
interface Segment {
  text: string;
  hit: boolean;
}

/**
 * 把名称按关键词切成「高亮 / 普通」片段
 *
 * 用 `<strong>` 而不是 `<mark>`：`<mark>` 自带黄底，在浅色与深色配色下都刺眼，
 * 而且它表达的是"搜索结果标记"（浏览器查找用），这里只是"这段字匹配了"。
 *
 * @param text 名称
 * @returns 片段列表（无关键词时只有一段普通文本）
 */
function highlight(text: string): Segment[] {
  const keyword = appliedQuery.value.toLowerCase();
  if (!keyword) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const index = lower.indexOf(keyword);
  if (index < 0) return [{ text, hit: false }];
  const segments: Segment[] = [];
  if (index > 0) segments.push({ text: text.slice(0, index), hit: false });
  segments.push({ text: text.slice(index, index + keyword.length), hit: true });
  if (index + keyword.length < text.length) {
    segments.push({ text: text.slice(index + keyword.length), hit: false });
  }
  return segments;
}

/* ── 滚动测量（底部渐隐 + 「共 N 个」） ───────────────────── */

/**
 * 量一次列表的可滚状态
 *
 * 只有真能滚时才补「共 N 个角色」与底部渐隐 —— 六个角色也多一行"共 6 个"，
 * 只会让人以为下面还有。
 */
function measureList(): void {
  const el = listEl.value;
  if (!el) {
    scrollable.value = false;
    atEnd.value = true;
    return;
  }
  scrollable.value = el.scrollHeight - el.clientHeight > 2;
  atEnd.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
}

/** 筛选 / 状态一变就重量（列表 DOM 会重建） */
watch(
  [filteredGroups, () => props.status],
  () => {
    void nextTick(measureList);
  },
  { immediate: true, flush: 'post' }
);

/** 换人 / 换应用后行数可能变少，把游标夹回范围内 */
watch(rows, list => {
  if (activeIndex.value > list.length - 1) activeIndex.value = Math.max(0, list.length - 1);
});

onMounted(() => {
  void nextTick(measureList);
  // 容器变宽变窄（弹窗拉伸 / 窗口缩放）也会改变可滚状态
  window.addEventListener('resize', measureList);
});

onBeforeUnmount(() => {
  window.clearTimeout(debounceTimer);
  window.removeEventListener('resize', measureList);
});

/* ── 播报 ─────────────────────────────────────────────────── */

/** 默认播报：搜索态报命中数，否则报"已选 + 当前显示" */
const defaultLive = computed(() => {
  if (appliedQuery.value) return `找到 ${visibleCount.value} 个角色`;
  const scope =
    activeApp.value === null
      ? '全部'
      : allGroups.value.find(group => group.appId === activeApp.value)?.label ?? '全部';
  return `已选 ${props.modelValue.length} 个角色 · 当前显示 ${scope} 的 ${visibleCount.value} 个`;
});

/** 播报文本（动作回执优先，下一次交互复位） */
const liveText = computed(() => liveOneShot.value || defaultLive.value);
</script>

<template>
  <div class="rp" :aria-busy="loading || undefined">
    <!-- 工具行：搜索 + 清空已选（不占两行，36 高与输入框同基准） -->
    <div v-if="loading || showSearch" class="rp-tools">
      <div class="rp-search">
        <Search class="rp-search__icon" :size="14" aria-hidden="true" />
        <input
          ref="searchEl"
          class="rp-search__input"
          type="text"
          :disabled="loading"
          placeholder="搜索角色名 / 编码"
          aria-label="搜索角色"
          autocomplete="off"
          spellcheck="false"
          @input="onSearchInput"
          @compositionstart="composing = true"
          @compositionend="onCompositionEnd"
          @keydown="onSearchKeydown"
        />
        <button v-if="query" class="rp-search__clear" type="button" aria-label="清空搜索" @click="clearQuery(true)">
          <X :size="13" aria-hidden="true" />
        </button>
      </div>
      <button
        v-if="!readonly && pickedChips.length"
        class="rp-tools__clear"
        type="button"
        :disabled="removableCount === 0"
        :title="removableCount === 0 ? '越权角色不能在这里移除' : '清空可移除的已选角色'"
        @click="clearAll"
      >
        清空已选
      </button>
    </div>

    <!-- 应用索引条：候选应用 ≥2 才出现；单行横滑，两端渐隐。
         搜索中加 `is-searching`：此刻应用筛选被忽略，索引条不许有任何"选中"的视觉 -->
    <div
      v-if="showApps && !loading && !failed"
      ref="appsEl"
      :class="['rp-apps', { 'is-searching': !!appliedQuery }]"
      role="radiogroup"
      aria-label="按应用筛选"
      @keydown="onAppsKeydown"
    >
      <button
        v-for="(chip, i) in appChips"
        :key="chip.id ?? '__all'"
        :class="['rp-app', { 'is-on': activeApp === chip.id && !appliedQuery }]"
        type="button"
        role="radio"
        :aria-checked="activeApp === chip.id && !appliedQuery"
        :tabindex="i === appsFocusIndex ? 0 : -1"
        @click="selectApp(chip.id)"
      >
        {{ chip.label }}
        <span
          :class="[
            'rp-app__count',
            'mono',
            { 'is-picked': chip.id === null ? pickedSet.size > 0 : pickedApps.has(chip.id) }
          ]"
        >
          {{ chip.count }}
        </span>
      </button>
    </div>

    <!-- 已选摘要：≤3 枚全显，>3 显前 3 + N；展开后一列、最多 4 行内部滚动。
         选项还没到（loading / error）时整条不渲染：那时每枚 chip 都只能写
         「#123 · 选项未加载」，五枚这样的 chip 比不给摘要更糊涂。 -->
    <div v-if="pickedChips.length && !loading && !failed" :class="['rp-picked', { 'is-open': pickedOpen }]">
      <ul class="rp-picked__list">
        <li
          v-for="chip in visiblePicked"
          :key="chip.id"
          :class="['rp-chip', `rp-chip--${chip.state}`]"
          :title="
            chip.state === 'locked'
              ? '不在你的管理范围，保存时不会变更'
              : chip.state === 'unknown'
                ? '不在当前选项里，会原样保留'
                : `${chip.appLabel} · ${chip.name}`
          "
        >
          <span class="rp-chip__text">{{ chip.appLabel }} · {{ chip.name }}</span>
          <Lock v-if="chip.state === 'locked'" class="rp-chip__lock" :size="10" aria-hidden="true" />
          <button
            v-if="chip.state === 'normal' && !readonly"
            class="rp-chip__x"
            type="button"
            :aria-label="`移除 ${chip.name}`"
            @click="removeChip(chip)"
          >
            <X :size="11" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <button
        v-if="pickedChips.length > 3"
        class="rp-picked__more"
        type="button"
        :aria-expanded="pickedOpen"
        @click="pickedOpen = !pickedOpen"
      >
        {{ pickedOpen ? '收起' : `+${pickedChips.length - 3}` }}
      </button>
      <button
        v-if="!readonly"
        class="rp-picked__clear"
        type="button"
        :disabled="removableCount === 0"
        :title="removableCount === 0 ? '越权角色不能在这里移除' : '清空已选角色'"
        @click="clearAll"
      >
        清空
      </button>
    </div>

    <!-- 加载失败：只报"没加载出来"+ 重试，绝不说"暂无可分配角色" -->
    <div v-if="failed" class="rp-error">
      <span class="rp-error__text">角色选项没有加载出来</span>
      <button class="rp-error__retry" type="button" @click="emit('retry')">重试</button>
    </div>

    <!-- 加载中：3 行骨架，与真实行同高，跳版最小 -->
    <div v-else-if="loading" class="rp-skeletons" aria-hidden="true">
      <span class="rp-skeleton"></span>
      <span class="rp-skeleton"></span>
      <span class="rp-skeleton"></span>
    </div>

    <!-- 确实一个可选角色都没有 -->
    <p v-else-if="!roles.length" class="rp-empty">暂无可分配角色</p>

    <!-- 有关键词但 0 命中 -->
    <div v-else-if="!rows.length" class="rp-empty">
      <span>没有匹配「{{ appliedQuery }}」的角色</span>
      <button class="rp-empty__clear" type="button" @click="clearQuery(true)">清空搜索</button>
    </div>

    <div v-else class="rp-listwrap" :class="{ 'is-scroll': scrollable && !atEnd }">
      <div
        ref="listEl"
        class="rp-list"
        role="listbox"
        aria-multiselectable="true"
        aria-label="角色（可多选）"
        @scroll.passive="measureList"
      >
        <section v-for="group in filteredGroups" :key="group.appId" class="rp-group" role="group" :aria-label="group.label">
          <header class="rp-group__head">
            <span class="rp-group__label">{{ group.label }}</span>
            <span class="rp-group__count mono">{{ group.roles.length }}</span>
            <span v-if="readonly || group.manageable === 0" class="tag tag--off">只读</span>
            <button v-else class="rp-group__all" type="button" @click="toggleGroup(group)">
              {{ group.allPicked ? `清空 ${group.manageable} 个` : `全选 ${group.manageable} 个` }}
            </button>
          </header>

          <div class="rp-group__rows">
            <div
              v-for="role in group.roles"
              :key="role.id"
              :class="['rp-row', { 'is-picked': pickedSet.has(role.id), 'is-locked': role.manageable === false }]"
              role="option"
              :aria-selected="pickedSet.has(role.id)"
              :aria-disabled="readonly || role.manageable === false ? 'true' : undefined"
              :tabindex="rowIndexById.get(role.id) === activeIndex ? 0 : -1"
              :data-rp-idx="rowIndexById.get(role.id) ?? 0"
              :title="
                readonly
                  ? '只读：不能修改自己账号的角色'
                  : role.manageable === false
                    ? '不在你的管理范围（应用域或职级限制）'
                    : `${role.code} · 职级 ${role.rank_level}`
              "
              @click="onRowClick(role)"
              @keydown="onRowKeydown($event, rowIndexById.get(role.id) ?? 0, role)"
            >
              <span class="rp-row__main">
                <input
                  class="rp-row__box"
                  type="checkbox"
                  :checked="pickedSet.has(role.id)"
                  :disabled="readonly || role.manageable === false"
                  aria-hidden="true"
                  tabindex="-1"
                />
                <span class="rp-row__name">
                  <template v-for="(part, i) in highlight(role.name)" :key="i">
                    <strong v-if="part.hit">{{ part.text }}</strong>
                    <span v-else>{{ part.text }}</span>
                  </template>
                </span>
              </span>
              <span class="rp-row__meta">
                <span class="mono rp-row__code">{{ role.code }}</span>
                <!-- 搜索时组头会被打散，行尾补应用名，否则不知道这条属于哪个应用 -->
                <span v-if="appliedQuery" class="rp-row__app">{{ group.label }}</span>
                <span class="rp-row__rank mono">Lv {{ role.rank_level }}</span>
                <span v-if="role.manageable === false" class="rp-row__lock">
                  <Lock :size="10" aria-hidden="true" />
                  不可管理
                </span>
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- 列表能滚时才补总数：不能滚还说"共 N 个"会让人以为下面还有 -->
    <p v-if="scrollable" class="rp-count">共 {{ visibleCount }} 个角色</p>

    <p v-if="lockedCount" class="rp-foot">其中 {{ lockedCount }} 个不在你的管理范围，保存时不会变更</p>
    <p v-if="unknownCount" class="rp-foot">有 {{ unknownCount }} 个角色不在当前选项里，会原样保留</p>
    <p v-if="readonly" class="rp-note">只读：不能修改自己账号的角色</p>

    <p class="rp-sr" role="status" aria-live="polite">{{ liveText }}</p>
  </div>
</template>

<style scoped>
/*
 * 容器查询的锚点
 *
 * 选择器要按"容器有多宽"决定单列还是两列，而不是按"窗口有多宽" —— 同一个选择器
 * 既会出现在 800px 的编辑弹窗里，也会出现在 680px 的批量授权弹窗里，用 `@media`
 * 永远只能猜对一半。
 */
.rp {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ── 工具行 ───────────────────────────────────────────────── */
.rp-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rp-search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: var(--control-h);
  border: 1px solid var(--mauth-border-strong);
  border-radius: var(--mauth-radius-xs);
  background: var(--mauth-input-bg, var(--mauth-surface));
  transition:
    border-color 0.16s var(--ease),
    box-shadow 0.16s var(--ease);
}

.rp-search:focus-within {
  border-color: var(--mauth-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--mauth-primary) 16%, transparent);
}

.rp-search__icon {
  flex: none;
  margin: 0 6px 0 10px;
  color: var(--mauth-text-faint);
}

.rp-search__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 30px 0 0;
  border: 0;
  background: transparent;
  color: var(--mauth-text);
  font: inherit;
  font-size: 13px;
  outline: none;
}

.rp-search__input::placeholder {
  color: var(--mauth-text-faint);
}

.rp-search__input:disabled {
  cursor: not-allowed;
  color: var(--mauth-text-soft);
}

/* 清空按钮：16 高的一枚 ×，不撑高输入框 */
.rp-search__clear {
  position: absolute;
  top: 50%;
  right: 6px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--mauth-hover);
  color: var(--mauth-text-mid);
  cursor: pointer;
  transform: translateY(-50%);
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.rp-search__clear:hover {
  background: var(--mauth-press);
  color: var(--mauth-text);
}

/* 文字按钮：与输入框同高，否则一行里会有一个矮半截的东西 */
.rp-tools__clear {
  flex: none;
  height: var(--control-h);
  padding: 0 10px;
  border: 0;
  border-radius: var(--mauth-radius-xs);
  background: transparent;
  color: var(--mauth-text-soft);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.rp-tools__clear:hover:not(:disabled) {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

.rp-tools__clear:disabled {
  color: var(--mauth-text-faint);
  cursor: not-allowed;
}

/* ── 应用索引条 ───────────────────────────────────────────── */
.rp-apps {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
  /* 两端渐隐：告诉手指"这条还能滑"，比一根滚动条安静 */
  mask-image: linear-gradient(90deg, transparent, var(--mauth-text) 10px, var(--mauth-text) calc(100% - 10px), transparent);
}

.rp-apps::-webkit-scrollbar {
  display: none;
}

.rp-app {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--mauth-border-strong);
  border-radius: 999px;
  background: var(--mauth-surface);
  color: var(--mauth-text-mid);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    border-color 0.16s var(--ease),
    color 0.16s var(--ease);
}

.rp-app:hover {
  border-color: var(--mauth-primary);
  color: var(--mauth-text);
}

.rp-app.is-on {
  border-color: color-mix(in srgb, var(--mauth-primary) 42%, transparent);
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
  font-weight: 620;
}

/*
 * 搜索中：索引条只保留"能点"，不保留任何"选中"的视觉
 *
 * 搜索是**跨应用全量搜**（应用筛选被忽略）。此刻还给某个 chip 描主色边，会被读成
 * "只搜了这一个应用" —— 用户会以为另一个应用里的结果不存在。所以连 hover 的主色描边
 * 也换成中性底色：可点性靠底色反馈，选中与否此刻根本不成立。
 */
.rp-apps.is-searching .rp-app:hover {
  border-color: var(--mauth-border-strong);
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

.rp-app__count {
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

/* 有已选时计数转主色：一眼看出"这个应用里我选了几个" */
.rp-app__count.is-picked {
  color: var(--mauth-primary);
  font-weight: 600;
}

.rp-app.is-on .rp-app__count {
  color: var(--mauth-primary);
}

/* ── 已选摘要 ─────────────────────────────────────────────── */
.rp-picked {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
}

.rp-picked__list {
  display: flex;
  flex: 1;
  flex-wrap: nowrap;
  gap: 4px;
  min-width: 0;
  margin: 0;
  padding: 0;
  overflow: hidden;
  list-style: none;
}

/* 展开：一列、最多 4 行内部滚动（多了会把下面的列表挤没） */
.rp-picked.is-open {
  align-items: flex-start;
}

.rp-picked.is-open .rp-picked__list {
  flex-direction: column;
  max-height: calc(4 * 22px + 3 * 4px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.rp-chip {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  height: 22px;
  max-width: 260px;
  padding: 0 4px 0 8px;
  border: 1px solid var(--mauth-border);
  border-radius: 999px;
  background: var(--mauth-tag-bg, var(--mauth-hover));
  color: var(--mauth-tag-ink, var(--mauth-text-mid));
  font-size: 11.5px;
}

.rp-picked.is-open .rp-chip {
  max-width: none;
}

.rp-chip__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rp-chip--locked {
  border-color: color-mix(in srgb, var(--mauth-warning) 26%, transparent);
  background: var(--mauth-warning-soft);
  color: var(--mauth-warning);
}

.rp-chip--unknown {
  border-style: dashed;
  border-color: var(--mauth-border-strong);
  background: transparent;
  color: var(--mauth-text-soft);
  padding-right: 8px;
}

.rp-chip__lock {
  flex: none;
}

/* 移除按钮 16×16：再小就点不准，再大就把 chip 撑胖 */
.rp-chip__x {
  display: grid;
  place-items: center;
  flex: none;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: currentColor;
  cursor: pointer;
  opacity: 0.66;
  transition:
    background 0.16s var(--ease),
    opacity 0.16s var(--ease);
}

.rp-chip__x:hover {
  background: color-mix(in srgb, currentColor 16%, transparent);
  opacity: 1;
}

.rp-picked__more {
  flex: none;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--mauth-border);
  border-radius: 999px;
  background: var(--mauth-surface);
  color: var(--mauth-text-soft);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.rp-picked__more:hover {
  border-color: var(--mauth-border-strong);
  color: var(--mauth-text);
}

/* 摘要条的「清空」：危险动作，用文字按钮（不给实底，避免和主操作抢） */
.rp-picked__clear {
  flex: none;
  height: 22px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--mauth-radius-xs);
  background: transparent;
  color: var(--mauth-danger);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.rp-picked__clear:hover:not(:disabled) {
  background: var(--mauth-danger-soft);
}

.rp-picked__clear:disabled {
  color: var(--mauth-text-faint);
  cursor: not-allowed;
}

/* ── 列表 ─────────────────────────────────────────────────── */
.rp-listwrap {
  position: relative;
  min-width: 0;
}

/* 底部 16px 渐隐：切掉半行时"下面还有"这件事必须看得见 */
.rp-listwrap.is-scroll::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 16px;
  background: linear-gradient(to top, var(--mauth-surface), transparent);
  pointer-events: none;
}

.rp-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  /* 200% 缩放时 45dvh 会先触顶：否则一屏里只剩列表，看不到下面的说明与总数 */
  max-height: min(var(--rp-list-max, 264px), 45dvh);
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-xs);
}

/* 组是整行（组头必须横贯两列），列宽交给组内的行网格 */
.rp-group {
  grid-column: 1 / -1;
  min-width: 0;
}

.rp-group + .rp-group {
  border-top: 1px solid var(--mauth-border);
}

.rp-group__head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  background: var(--mauth-surface-2);
  border-bottom: 1px solid var(--mauth-border);
}

.rp-group__label {
  font-size: 11.5px;
  font-weight: 620;
  color: var(--mauth-text-mid);
}

.rp-group__count {
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

.rp-group__all {
  margin-left: auto;
  padding: 2px 6px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--mauth-text-soft);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.rp-group__all:hover {
  background: var(--mauth-hover);
  color: var(--mauth-primary);
}

.rp-group__rows {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  padding: 2px;
}

/* ── 行 ───────────────────────────────────────────────────── */
.rp-row {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-height: 44px;
  min-width: 0;
  padding: 6px 8px;
  border-radius: var(--mauth-radius-xs);
  cursor: pointer;
  transition: background 0.14s var(--ease);
}

.rp-row:hover {
  background: var(--mauth-hover);
}

/* 选中三重信号：勾选框 + 浅主色底 + 字重。只靠一个在强光/深色下都会漏 */
.rp-row.is-picked {
  background: color-mix(in srgb, var(--mauth-primary) 6%, transparent);
}

.rp-row.is-picked .rp-row__name {
  font-weight: 620;
}

.rp-row.is-locked {
  cursor: not-allowed;
}

.rp-row.is-locked:hover {
  background: none;
}

.rp-row__main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.rp-row__box {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--mauth-primary);
  /* 点击一律由整行接：勾选框只是"当前状态"的显示器，不该自己吃掉一次点击 */
  pointer-events: none;
}

.rp-row__name {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 550;
  color: var(--mauth-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 越权项：降到 mid 一档，但**不**用 faint、不整体降透明 —— 只读时这些字正是要读的 */
.rp-row.is-locked .rp-row__name {
  color: var(--mauth-text-mid);
}

.rp-row__name strong {
  font-weight: 650;
  color: var(--mauth-primary);
}

.rp-row.is-locked .rp-row__name strong {
  color: var(--mauth-primary);
}

.rp-row__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  /* 与名称左对齐：16 勾选框 + 6 间距 */
  padding-left: 22px;
}

.rp-row__code {
  min-width: 0;
  overflow: hidden;
  font-size: 10.5px;
  color: var(--mauth-text-soft);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rp-row__app {
  flex: none;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--mauth-tag-bg, var(--mauth-hover));
  color: var(--mauth-tag-ink, var(--mauth-text-mid));
  font-size: 10px;
  line-height: 16px;
}

.rp-row__rank {
  flex: none;
  margin-left: auto;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--mauth-tag-bg, var(--mauth-hover));
  color: var(--mauth-tag-ink, var(--mauth-text-mid));
  font-size: 10.5px;
  line-height: 18px;
}

.rp-row__lock {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 2px;
  font-size: 10.5px;
  color: var(--mauth-warning);
}

/* ── 状态 ─────────────────────────────────────────────────── */
.rp-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 14px 12px;
  border: 1px dashed var(--mauth-border-strong);
  border-radius: var(--mauth-radius-xs);
  color: var(--mauth-text-soft);
  font-size: 12.5px;
}

.rp-empty__clear {
  padding: 2px 8px;
  border: 1px solid var(--mauth-border-strong);
  border-radius: 999px;
  background: var(--mauth-surface);
  color: var(--mauth-text-mid);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.rp-empty__clear:hover {
  color: var(--mauth-primary);
  border-color: var(--mauth-primary);
}

.rp-error {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-xs);
  background: color-mix(in srgb, var(--mauth-danger) 5%, transparent);
}

.rp-error__text {
  font-size: 12.5px;
  color: var(--mauth-danger);
}

.rp-error__retry {
  margin-left: auto;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--mauth-border-strong);
  border-radius: var(--mauth-radius-xs);
  background: var(--mauth-surface);
  color: var(--mauth-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.rp-error__retry:hover {
  border-color: var(--mauth-primary);
  color: var(--mauth-primary);
}

.rp-skeletons {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-xs);
}

.rp-skeleton {
  height: 32px;
  border-radius: var(--mauth-radius-xs);
  background: linear-gradient(90deg, var(--mauth-hover), var(--mauth-press), var(--mauth-hover));
  background-size: 200% 100%;
  animation: rp-skeleton 1.2s ease infinite;
}

@keyframes rp-skeleton {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

.rp-count {
  margin: 0;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.rp-foot {
  margin: 0;
  font-size: 12px;
  color: var(--mauth-warning);
}

.rp-note {
  margin: 0;
  font-size: 12px;
  color: var(--mauth-text-soft);
}

/* ── 键盘焦点 ─────────────────────────────────────────────── */
.rp-row:focus-visible,
.rp-app:focus-visible,
.rp-group__all:focus-visible,
.rp-chip__x:focus-visible,
.rp-picked__clear:focus-visible,
.rp-picked__more:focus-visible,
.rp-tools__clear:focus-visible,
.rp-search__clear:focus-visible,
.rp-error__retry:focus-visible,
.rp-empty__clear:focus-visible {
  outline: 2px solid var(--mauth-primary);
  outline-offset: -2px;
}

/* 容器窄于 480 时单列：280px 的两列在 440 里会挤出省略号 */
@container (max-width: 480px) {
  .rp-group__rows {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* 读屏专用播报区 */
.rp-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/*
 * 强制配色（Windows 高对比度）
 *
 * 系统会用自己的色板覆盖所有颜色，`color-mix` 混出来的浅底会直接消失，
 * 选中行就只剩勾选框一个信号 —— 这里改用系统高亮色画一条左描边。
 * `CanvasText` / `Highlight` 是 CSS 系统色关键字，不属于本项目的配色令牌。
 */
@media (forced-colors: active) {
  .rp-row.is-picked {
    outline: 2px solid Highlight;
    outline-offset: -2px;
  }

  .rp-row.is-locked .rp-row__name {
    color: CanvasText;
  }
}
</style>
