<script setup lang="ts">
/**
 * 应用接口开关
 *
 * 数据就是守卫配置的三级树（系统 / 模块 / 接口），只是按**应用**收口：
 * 只有 `system.json` 里声明了 `app_id` 的系统才属于这个应用，共享系统不会出现在这里。
 *
 * ── 两种形态，同一份逻辑 ──
 * `mode = 'inline'`：整页表格（`views/system/AppApis.vue`）。101 个接口在抽屉里只能一条条
 * 往下滚，换成一页表之后能对齐扫读、能搜索、能只看已关闭 —— 这是主要形态。
 * `mode = 'drawer'`：右侧抽屉，保留给"从列表里点一下就改"的临时场景。
 *
 * ── 为什么关一下也要二次认证 ──
 * 误把模块关掉，和越权放宽在结果上没有区别（都是服务不可用或防线被拆）。所以后端
 * （`app/guard/services/config.service.js`）对**收紧与放宽都要求票据**，票据还绑定
 * `path + patchHash`：为 A 路由通过的验证不能拿去关 B。
 *
 * 于是这里的流程是三段，缺一不可：
 *   点击开关 → 409/428（缺票据）→ 内联发码 → 输码换票 → 带 `x-stepup-token` 重试。
 * 🔴 重试时的 patch 由**服务端**按当前状态算（挑战接口返回 `patch` 原样带回），
 *    前端自己 `!enabled` 会在"期间被别人改过"时失配，表现成"认证过了却保存失败"。
 *
 * @author yijiu2025
 * @since 2026-11-21
 */
import { computed, onMounted, ref } from 'vue';
import { ChevronDown, ChevronRight, Loader2, Lock, MailCheck, Search, X } from 'lucide-vue-next';
import {
  appApiStepUpChallenge,
  appApiStepUpVerify,
  getAppSwitchPolicy,
  listAppApis,
  setAppSwitchPolicy,
  toggleAppApi,
  updateAppApi
} from '@/api/system';
import type { AppApiGroup, AppApiNode, AppApiSystem } from '@/api/system';
import { useToastStore } from '@/stores/toast';

const props = withDefaults(
  defineProps<{
    /** 应用标识 */
    appId: string;
    /** 应用显示名（标题用） */
    appName: string;
    /** 形态：整页表格 / 右侧抽屉 */
    mode?: 'drawer' | 'inline';
  }>(),
  { mode: 'drawer' }
);

const emit = defineEmits<{ (e: 'close'): void; (e: 'changed'): void }>();

const toast = useToastStore();

/** 接口树 */
const systems = ref<AppApiSystem[]>([]);
const loading = ref(false);
const error = ref('');
/** 展开中的系统 key（默认全展开：应用下通常只有一两个系统） */
const expanded = ref<Set<string>>(new Set());
/** 展开中的模块 key（`system|group`）。默认收起：先看到"有哪些模块" */
const expandedGroups = ref<Set<string>>(new Set());
/** 正在切换的节点（`system|group|api`），用于行内禁用与转圈 */
const busyKey = ref('');

/** 过滤：关键词（名称 / 路径 / 权限码）与"只看已关闭" */
const keyword = ref('');
const onlyDisabled = ref(false);

/** 二次验证策略（后端设置，只有超管能改） */
const policy = ref<{ requireStepUp: boolean; canEdit: boolean }>({ requireStepUp: true, canEdit: false });
const policyBusy = ref(false);

/** 等待二次认证的上下文（`challengeId` 为空 = 还没发码） */
const stepup = ref<{
  systemKey: string;
  groupKey?: string;
  apiKey?: string;
  challengeId: string;
  maskedTarget: string;
  /** 变更原因：审计与票据都绑定它（后端要求 4-200 字） */
  reason: string;
} | null>(null);
const code = ref('');
const sending = ref(false);
const verifying = ref(false);

/** 节点唯一键 */
function nodeKey(systemKey: string, groupKey?: string, apiKey?: string): string {
  return [systemKey, groupKey || '', apiKey || ''].join('|');
}

/** 模块展开键 */
function groupKeyOf(systemKey: string, groupKey: string): string {
  return `${systemKey}|${groupKey}`;
}

/** 是否命中当前过滤（关键词 + 只看已关闭） */
function hit(node: { name?: string; key?: string; requirePermission?: string | null; enabled: boolean }): boolean {
  if (onlyDisabled.value && node.enabled) return false;
  const k = keyword.value.trim().toLowerCase();
  if (!k) return true;
  return [node.name, node.key, node.requirePermission].some(v =>
    String(v || '')
      .toLowerCase()
      .includes(k)
  );
}

/** 是否处于过滤状态（过滤时强制展开命中项） */
const filtering = computed(() => Boolean(keyword.value.trim()) || onlyDisabled.value);

/**
 * 过滤后的视图（不改原树）
 *
 * 只保留"至少有一个接口命中"的模块，以及"至少有一个模块"的系统 ——
 * 否则搜一个词会出现一堆空分组，滚动距离反而更长。
 */
const view = computed<AppApiSystem[]>(() => {
  const on = filtering.value;
  const out: AppApiSystem[] = [];
  for (const system of systems.value) {
    const groups = system.groups
      .map(group => ({ ...group, apis: on ? group.apis.filter(hit) : group.apis }))
      .filter(group => (on ? group.apis.length > 0 : true));
    if (on && groups.length === 0) continue;
    out.push({ ...system, groups });
  }
  return out;
});

/** 过滤中命中的接口数（工具条"匹配 M"） */
const matchedCount = computed(() =>
  view.value.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.apis.length, 0), 0)
);

/** 全部接口数（不吃过滤） */
const totalCount = computed(() =>
  systems.value.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.apis.length, 0), 0)
);

/** 系统是否展开（过滤时全展开，否则听话于用户） */
function systemOpen(systemKey: string): boolean {
  return filtering.value || expanded.value.has(systemKey);
}

/** 模块是否展开（过滤时全展开） */
function groupOpen(systemKey: string, groupKey: string): boolean {
  return filtering.value || expandedGroups.value.has(groupKeyOf(systemKey, groupKey));
}

/** 折叠/展开系统 */
function toggleExpand(systemKey: string): void {
  const next = new Set(expanded.value);
  if (next.has(systemKey)) next.delete(systemKey);
  else next.add(systemKey);
  expanded.value = next;
}

/** 折叠/展开模块 */
function toggleGroup(systemKey: string, groupKey: string): void {
  const key = groupKeyOf(systemKey, groupKey);
  const next = new Set(expandedGroups.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedGroups.value = next;
}

/**
 * 一组接口"共同的权限码"
 *
 * 同一模块下几十行往往都是 `admin:dept:read`，逐行重复会把真正的差异淹掉。
 * 组头显示共同值，行内只在**与组头不同**时才显示自己的码。
 *
 * @param group 模块
 * @returns 共同权限码；不一致时返回空串
 */
function commonPermission(group: AppApiGroup): string {
  const list = group.apis.map(a => a.requirePermission).filter(Boolean) as string[];
  if (list.length === 0) return '';
  const uniq = [...new Set(list)];
  return uniq.length === 1 && uniq[0] ? uniq[0] : '';
}

/** 该组权限码种类数（组头显示"N 种"） */
function permissionKinds(group: AppApiGroup): number {
  return new Set(group.apis.map(a => a.requirePermission || '').filter(Boolean)).size;
}

/** 某个模块的启用计数（组头显示 `3/5`） */
function enabledText(group: AppApiGroup): string {
  const on = group.apis.filter(a => a.enabled).length;
  return `${on}/${group.apis.length}`;
}

/**
 * 写操作识别
 *
 * 关闭一个模块时，"影响 12 个接口"和"影响 3 个会删数据的接口"是两件事。
 * 用路径里的动词判断，不强依赖权限码（有些接口的码是 `*:*` 通配，看不出动作）。
 */
const DANGER_RE = /(purge|delete|remove|reset|revoke|block|kick|disable|export|import)/i;

/**
 * 是否写操作
 *
 * @param key 接口路径（如 `/admin/console/v1/users/:id`）
 * @returns 是否属于高影响动作
 */
function isDangerous(key: string): boolean {
  return DANGER_RE.test(String(key || ''));
}

/** 待确认的关闭动作（`null` = 没有待确认项） */
const pendingOff = ref<{ systemKey: string; groupKey?: string; label: string; total: number; writes: number } | null>(
  null
);

/**
 * 统计关闭某个节点的波及面
 *
 * @param systemKey 系统标识
 * @param groupKey 模块标识（空 = 系统级）
 * @returns 受影响接口数与其中写操作数
 */
function impactOf(systemKey: string, groupKey?: string): { total: number; writes: number } {
  const system = systems.value.find(s => s.key === systemKey);
  if (!system) return { total: 0, writes: 0 };
  const groups = groupKey ? system.groups.filter(g => g.key === groupKey) : system.groups;
  let total = 0;
  let writes = 0;
  for (const g of groups) {
    for (const a of g.apis) {
      if (!a.enabled) continue;
      total += 1;
      if (isDangerous(a.key)) writes += 1;
    }
  }
  return { total, writes };
}

/**
 * 节点开关变更（系统级 / 模块级）
 *
 * 开启直接生效；**关闭先确认**——一次误点会让整块接口全部 403，而恢复要再来一遍二次验证。
 * 取消时把 checkbox 视觉状态推回去（`:checked` 是单向绑定，DOM 已经被用户改过）。
 *
 * @param event 变更事件
 * @param systemKey 系统标识
 * @param groupKey 模块标识（空 = 系统级）
 */
function onNodeChange(event: Event, systemKey: string, groupKey?: string): void {
  const input = event.target as HTMLInputElement;
  if (input.checked) {
    void doToggle(systemKey, groupKey);
    return;
  }
  const { total, writes } = impactOf(systemKey, groupKey);
  if (total === 0) {
    void doToggle(systemKey, groupKey);
    return;
  }
  const system = systems.value.find(s => s.key === systemKey);
  const group = groupKey ? system?.groups.find(g => g.key === groupKey) : null;
  pendingOff.value = {
    systemKey,
    groupKey,
    label: group?.name || group?.key || system?.name || systemKey,
    total,
    writes
  };
  /* 还没确认，先把开关拨回去：否则界面显示"已关闭"但后端没变 */
  input.checked = true;
}

/** 确认关闭 */
function confirmOff(): void {
  const p = pendingOff.value;
  if (!p) return;
  pendingOff.value = null;
  void doToggle(p.systemKey, p.groupKey);
}

/** 拉取接口树 */
async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const res = await listAppApis(props.appId);
    systems.value = res.systems;
    expanded.value = new Set(res.systems.map(s => s.key));
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

/**
 * 切换一个节点的启用状态
 *
 * @param systemKey 系统标识
 * @param groupKey 模块标识（空 = 系统级）
 * @param apiKey 接口标识（空 = 模块级）
 */
async function doToggle(systemKey: string, groupKey?: string, apiKey?: string): Promise<void> {
  const key = nodeKey(systemKey, groupKey, apiKey);
  busyKey.value = key;
  try {
    const res = await toggleAppApi(props.appId, { systemKey, groupKey, apiKey });
    applyEnabled(systemKey, groupKey, apiKey, res.enabled);
    toast.push(res.enabled ? '已开启' : '已关闭');
    emit('changed');
  } catch (err) {
    const e = err as { code?: number; message?: string };
    /* 428/409 = 缺二次认证票据：就地发起认证，认证完自动重试同一个节点 */
    if (e?.code === 428 || e?.code === 409) {
      await requestChallenge(systemKey, groupKey, apiKey);
    } else {
      toast.pushError(e, '切换失败');
    }
  } finally {
    busyKey.value = '';
  }
}

/**
 * 申请二次认证
 *
 * @param systemKey 系统标识
 * @param groupKey 模块标识
 * @param apiKey 接口标识
 */
function requestChallenge(systemKey: string, groupKey?: string, apiKey?: string): void {
  /* 只展开表单：原因必须由人填（4-200 字），拿到之后才发码 */
  stepup.value = { systemKey, groupKey, apiKey, challengeId: '', maskedTarget: '', reason: '' };
  code.value = '';
}

/** 发码（带变更原因） */
async function sendChallengeCode(): Promise<void> {
  const ctx = stepup.value;
  if (!ctx) return;
  const reason = ctx.reason.trim();
  if (reason.length < 4) {
    toast.push('变更原因至少 4 个字', 'info');
    return;
  }
  sending.value = true;
  try {
    const res = await appApiStepUpChallenge(props.appId, {
      systemKey: ctx.systemKey,
      groupKey: ctx.groupKey,
      apiKey: ctx.apiKey,
      action: 'toggle',
      reason
    });
    stepup.value = { ...ctx, challengeId: res.challengeId, maskedTarget: res.maskedTarget };
    toast.push(`验证码已发送至 ${res.maskedTarget}`, 'info');
  } catch (err) {
    toast.pushError(err, '发起认证失败');
  } finally {
    sending.value = false;
  }
}

/** 核验并重试 */
async function confirmStepUp(): Promise<void> {
  const ctx = stepup.value;
  if (!ctx || !ctx.challengeId || !code.value.trim()) return;
  verifying.value = true;
  try {
    const { ticket } = await appApiStepUpVerify(props.appId, { challengeId: ctx.challengeId, code: code.value.trim() });
    const res = await toggleAppApi(props.appId, {
      systemKey: ctx.systemKey,
      groupKey: ctx.groupKey,
      apiKey: ctx.apiKey,
      stepupToken: ticket
    });
    applyEnabled(ctx.systemKey, ctx.groupKey, ctx.apiKey, res.enabled);
    toast.push(res.enabled ? '已开启' : '已关闭');
    stepup.value = null;
    emit('changed');
  } catch (err) {
    toast.pushError(err, '认证失败');
  } finally {
    verifying.value = false;
  }
}

/**
 * 把切换结果写回本地树（不整树重拉：重拉会丢掉展开状态，也会闪一下）
 *
 * @param systemKey 系统标识
 * @param groupKey 模块标识
 * @param apiKey 接口标识
 * @param enabled 新状态
 */
function applyEnabled(
  systemKey: string,
  groupKey: string | undefined,
  apiKey: string | undefined,
  enabled: boolean
): void {
  const system = systems.value.find(s => s.key === systemKey);
  if (!system) return;
  if (!groupKey) {
    system.enabled = enabled;
    return;
  }
  const group = system.groups.find(g => g.key === groupKey);
  if (!group) return;
  if (!apiKey) {
    group.enabled = enabled;
    return;
  }
  const api = group.apis.find(a => a.key === apiKey);
  if (api) api.enabled = enabled;
}

/** 已关闭的接口总数（页脚汇总用） */
const disabledCount = computed(() => {
  let n = 0;
  for (const s of systems.value) {
    if (!s.enabled) n += 1;
    for (const g of s.groups) {
      if (!g.enabled) n += 1;
      for (const a of g.apis) if (!a.enabled) n += 1;
    }
  }
  return n;
});

/**
 * 正在编辑的节点（`null` = 关闭）
 *
 * 编辑与开关走**同一套二次验证**：都是运行时字段变更，都绑 `path + patchHash`。
 * 只是编辑的 patch 由这里构造（只提交改过的字段），而开关的 patch 由服务端算。
 */
const editing = ref<{
  systemKey: string;
  groupKey?: string;
  apiKey?: string;
  name: string;
  description: string;
  requireLogin: boolean;
  ips: string;
  roles: string;
  reason: string;
  challengeId: string;
  maskedTarget: string;
  code: string;
  busy: boolean;
} | null>(null);

/**
 * 打开编辑（只对接口级开放：组/系统级没有"权限码"这类字段可改）
 *
 * @param system 系统节点
 * @param group 模块节点
 * @param api 接口节点
 */
function openEdit(system: AppApiSystem, group: { key: string }, api: AppApiNode): void {
  editing.value = {
    systemKey: system.key,
    groupKey: group.key,
    apiKey: String(api.key),
    name: String(api.name || api.key),
    description: String(api.description || ''),
    requireLogin: Boolean(api.requireLogin),
    ips: (Array.isArray(api.allowIps) ? api.allowIps : []).join(', '),
    roles: (Array.isArray(api.allowRoles) ? api.allowRoles : []).join(', '),
    reason: '',
    challengeId: '',
    maskedTarget: '',
    code: '',
    busy: false
  };
}

/** 从表单构造 patch（只带改过的字段；白名单按逗号/空白切分） */
function buildEditPatch(): {
  patch: Record<string, unknown>;
  description: string;
  requireLogin: boolean;
  ips: string[];
  roles: string[];
} {
  const e = editing.value;
  const split = (text: string): string[] =>
    text
      .split(/[,，\s]+/)
      .map(x => x.trim())
      .filter(Boolean);
  return {
    patch: {},
    description: e ? e.description.trim() : '',
    requireLogin: e ? e.requireLogin : false,
    ips: e ? split(e.ips) : [],
    roles: e ? split(e.roles) : []
  };
}

/** 保存编辑：先直连，遇到 428/409 再走"发码 → 输码 → 重试" */
async function saveEdit(): Promise<void> {
  const e = editing.value;
  if (!e) return;
  const built = buildEditPatch();

  /* 描述变化才提交：避免把没动过的字段一起写（PATCH 语义） */
  const patch: Record<string, unknown> = {
    requireLogin: built.requireLogin,
    allowIps: built.ips,
    allowRoles: built.roles
  };
  if (built.description) patch.description = built.description;

  e.busy = true;
  try {
    const res = await updateAppApi(props.appId, {
      systemKey: e.systemKey,
      groupKey: e.groupKey,
      apiKey: e.apiKey,
      patch
    });
    applyEdited(e, res.node);
    toast.push('已保存');
    editing.value = null;
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 428 || code === 409) {
      await issueEditChallenge(patch);
    } else {
      toast.pushError(err, '保存失败');
    }
  } finally {
    e.busy = false;
  }
}

/** 发起编辑的二次认证（原因 4-200 字） */
async function issueEditChallenge(patch: Record<string, unknown>): Promise<void> {
  const e = editing.value;
  if (!e) return;
  if (e.reason.trim().length < 4) {
    toast.push('请先填写变更原因（至少 4 个字）', 'info');
    return;
  }
  try {
    const res = await appApiStepUpChallenge(props.appId, {
      systemKey: e.systemKey,
      groupKey: e.groupKey,
      apiKey: e.apiKey,
      action: 'patch',
      patch,
      reason: e.reason.trim()
    });
    e.challengeId = res.challengeId;
    e.maskedTarget = res.maskedTarget;
    toast.push(`验证码已发送至 ${res.maskedTarget}`, 'info');
  } catch (err) {
    toast.pushError(err, '发起认证失败');
  }
}

/** 核验并重试保存 */
async function confirmEditStepUp(): Promise<void> {
  const e = editing.value;
  if (!e || !e.challengeId || !e.code.trim()) return;
  const built = buildEditPatch();
  const patch: Record<string, unknown> = {
    requireLogin: built.requireLogin,
    allowIps: built.ips,
    allowRoles: built.roles
  };
  if (built.description) patch.description = built.description;

  e.busy = true;
  try {
    const { ticket } = await appApiStepUpVerify(props.appId, { challengeId: e.challengeId, code: e.code.trim() });
    const res = await updateAppApi(props.appId, {
      systemKey: e.systemKey,
      groupKey: e.groupKey,
      apiKey: e.apiKey,
      patch,
      stepupToken: ticket
    });
    applyEdited(e, res.node);
    toast.push('已保存');
    editing.value = null;
  } catch (err) {
    toast.pushError(err, '保存失败');
  } finally {
    e.busy = false;
  }
}

/** 保存成功后把结果写回本地树（不整树重拉，避免丢展开状态） */
function applyEdited(e: { systemKey: string; groupKey?: string; apiKey?: string }, node: AppApiNode | null): void {
  if (!node) return;
  const system = systems.value.find(s => s.key === e.systemKey);
  const group = system?.groups.find(g => g.key === e.groupKey);
  const api = group?.apis.find(a => a.key === e.apiKey);
  if (!api) return;
  Object.assign(api, {
    description: node.description,
    requireLogin: node.requireLogin,
    allowIps: node.allowIps,
    allowRoles: node.allowRoles
  });
}

/** 读策略（失败不阻断面板：默认按"要二次验证"渲染） */
async function loadPolicy(): Promise<void> {
  try {
    policy.value = await getAppSwitchPolicy();
  } catch {
    /* 忽略：拿不到就按默认严格处理 */
  }
}

/** 超管切换策略 */
async function togglePolicy(): Promise<void> {
  const next = !policy.value.requireStepUp;
  policyBusy.value = true;
  try {
    const res = await setAppSwitchPolicy(next);
    policy.value = { ...policy.value, requireStepUp: res.requireStepUp };
    toast.push(res.requireStepUp ? '已开启二次验证' : '已关闭二次验证（仅超管可改）');
    emit('changed');
  } catch (err) {
    toast.pushError(err, '调整失败');
  } finally {
    policyBusy.value = false;
  }
}

onMounted(() => {
  void load();
  void loadPolicy();
});
</script>

<template>
  <div class="api-panel" :class="`api-panel--${mode}`">
    <!-- 遮罩只在抽屉形态出现：整页形态是页面的一部分，不该挡住导航 -->
    <div v-if="mode === 'drawer'" class="api-panel__mask" @click="emit('close')" />

    <section class="api-panel__sheet" :aria-label="`${appName} 接口开关`">
      <header class="api-panel__head">
        <div class="api-panel__titles">
          <h2 class="api-panel__title">接口开关 · {{ appName }}</h2>
          <p class="api-panel__sub">关闭后该接口直接拒绝请求（403 前置拦截）。变更需二次认证并留审计。</p>
        </div>
        <button
          v-if="mode === 'drawer'"
          class="api-panel__close"
          type="button"
          aria-label="关闭"
          @click="emit('close')"
        >
          <X :size="16" />
        </button>
      </header>

      <!-- 工具条：101 个接口里"翻找"是主要动作，搜索必须放在最上面 -->
      <div class="api-panel__tools">
        <label class="api-search">
          <Search :size="14" />
          <input v-model="keyword" type="search" placeholder="搜索接口名 / 路径 / 权限码" aria-label="搜索接口" />
        </label>
        <button
          class="api-chip"
          :class="{ 'api-chip--on': onlyDisabled }"
          type="button"
          :aria-pressed="onlyDisabled"
          @click="onlyDisabled = !onlyDisabled"
        >
          只看已关闭
        </button>
        <span class="api-panel__tools-spacer" />
        <span v-if="filtering" class="api-panel__match">匹配 {{ matchedCount }} / {{ totalCount }}</span>
      </div>

      <!-- 关闭前的影响面确认：一次误点会让整块接口 403，而恢复要再来一遍二次验证 -->
      <div v-if="pendingOff" class="api-confirm" role="alert">
        <span class="api-confirm__text">
          关闭「{{ pendingOff.label }}」将影响 <b>{{ pendingOff.total }}</b> 个接口<template v-if="pendingOff.writes"
            >，其中 <b>{{ pendingOff.writes }}</b> 个是写操作</template
          >
        </span>
        <button class="btn btn--sm" type="button" @click="pendingOff = null">取消</button>
        <button class="btn btn--primary btn--sm" type="button" @click="confirmOff">确认关闭</button>
      </div>

      <div class="api-panel__scroll">
        <p v-if="error" class="api-panel__error">{{ error }}</p>

        <table class="api-table">
          <thead>
            <tr>
              <th class="api-table__name">接口</th>
              <th class="api-table__path">路径</th>
              <th class="api-table__perm">权限码</th>
              <th class="api-table__login">登录</th>
              <th class="api-table__switch">开关</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="system in view" :key="system.key">
              <tr class="api-row api-row--system" @click="toggleExpand(system.key)">
                <td class="api-table__name">
                  <ChevronDown v-if="systemOpen(system.key)" :size="14" class="api-row__caret" />
                  <ChevronRight v-else :size="14" class="api-row__caret" />
                  <span class="api-row__strong">{{ system.name || system.key }}</span>
                </td>
                <td class="api-table__path">
                  <code>{{ system.prefix || '—' }}</code>
                </td>
                <td class="api-table__perm" />
                <td class="api-table__login" />
                <td class="api-table__switch">
                  <span v-if="system.critical" class="lock" title="保护性接口：关闭后无法登录或无法管理，不允许关闭">
                    <Lock :size="13" />
                  </span>
                  <label class="switch" :title="system.enabled ? '已启用' : '已关闭'">
                    <input
                      type="checkbox"
                      :checked="system.enabled"
                      :disabled="system.critical || busyKey === nodeKey(system.key)"
                      :aria-label="`${system.name || system.key} 开关`"
                      @click.stop
                      @change="onNodeChange($event, system.key)"
                    />
                    <span class="switch__track" />
                  </label>
                </td>
              </tr>

              <template v-if="systemOpen(system.key)">
                <template v-for="group in system.groups" :key="group.key">
                  <tr class="api-row api-row--group" @click="toggleGroup(system.key, group.key)">
                    <td class="api-table__name">
                      <ChevronDown v-if="groupOpen(system.key, group.key)" :size="13" class="api-row__caret" />
                      <ChevronRight v-else :size="13" class="api-row__caret" />
                      <span class="api-row__group">{{ group.name || group.key }}</span>
                      <span class="api-row__count">{{ enabledText(group) }}</span>
                    </td>
                    <td class="api-table__path">
                      <code>{{ group.prefix || '—' }}</code>
                    </td>
                    <td class="api-table__perm">
                      <!-- 组头只给"共同权限码"：几十行重复同一个码是噪音，不是信息 -->
                      <span v-if="commonPermission(group)" class="chip chip--perm">{{ commonPermission(group) }}</span>
                      <span v-else-if="permissionKinds(group) > 1" class="chip chip--muted">
                        {{ permissionKinds(group) }} 种权限
                      </span>
                    </td>
                    <td class="api-table__login" />
                    <td class="api-table__switch">
                      <span v-if="group.critical" class="lock" title="保护性接口：关闭后无法登录或无法管理，不允许关闭">
                        <Lock :size="13" />
                      </span>
                      <label class="switch" :title="group.enabled ? '已启用' : '已关闭'">
                        <input
                          type="checkbox"
                          :checked="group.enabled"
                          :disabled="group.critical || busyKey === nodeKey(system.key, group.key)"
                          :aria-label="`${group.name || group.key} 开关`"
                          @click.stop
                          @change="onNodeChange($event, system.key, group.key)"
                        />
                        <span class="switch__track" />
                      </label>
                    </td>
                  </tr>

                  <template v-if="groupOpen(system.key, group.key)">
                    <tr v-for="api in group.apis" :key="api.key" class="api-row api-row--api">
                      <td class="api-table__name">
                        <span class="api-row__name" :class="{ 'is-danger': isDangerous(api.key) }">
                          {{ api.name || api.key }}
                        </span>
                        <span
                          v-if="isDangerous(api.key)"
                          class="chip chip--danger"
                          title="写操作：关闭后相关功能会直接 403"
                        >
                          写
                        </span>
                      </td>
                      <td class="api-table__path">
                        <!-- 长路径必须能看清全名：截断 + title 是唯一不撑破表格的折中 -->
                        <code :title="api.key">{{ api.key }}</code>
                      </td>
                      <td class="api-table__perm">
                        <span
                          v-if="api.requirePermission && api.requirePermission !== commonPermission(group)"
                          class="chip chip--perm"
                          :title="api.requirePermission"
                          >{{ api.requirePermission }}</span
                        >
                        <span v-else-if="!api.requirePermission" class="api-row__muted">—</span>
                        <span v-else class="api-row__same" title="与本组其他接口相同">同上</span>
                      </td>
                      <td class="api-table__login">
                        <span v-if="api.requireLogin" class="chip">要求登录</span>
                        <span v-else class="api-row__muted">—</span>
                      </td>
                      <td class="api-table__switch">
                        <span v-if="api.critical" class="lock" title="保护性接口：关闭后无法登录或无法管理，不允许关闭">
                          <Lock :size="13" />
                        </span>
                        <label class="switch" :title="api.enabled ? '已启用' : '已关闭'">
                          <input
                            type="checkbox"
                            :checked="api.enabled"
                            :disabled="api.critical || busyKey === nodeKey(system.key, group.key, api.key)"
                            :aria-label="`${api.name || api.key} 开关`"
                            @change="doToggle(system.key, group.key, api.key)"
                          />
                          <span class="switch__track" />
                        </label>
                        <button
                          class="btn btn--ghost btn--sm api-edit"
                          type="button"
                          :aria-label="`编辑 ${api.name || api.key}`"
                          title="编辑描述 / 登录要求 / 白名单"
                          @click.stop="openEdit(system, group, api)"
                        >
                          编辑
                        </button>
                      </td>
                    </tr>
                  </template>
                </template>
              </template>
            </template>

            <tr v-if="loading">
              <td colspan="5" class="api-empty"><Loader2 :size="14" class="is-spin" /> 加载中…</td>
            </tr>
            <tr v-else-if="view.length === 0">
              <td colspan="5" class="api-empty">没有匹配的接口</td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer class="api-panel__foot">
        <span>共 {{ totalCount }} 个接口</span>
        <span v-if="disabledCount > 0" class="api-panel__warn">{{ disabledCount }} 个节点已关闭</span>
      </footer>

      <!-- 二次验证策略：只有超管能改，其他人只读 -->
      <div class="policy">
        <span class="policy__label"><Lock :size="13" /> 变更二次验证</span>
        <span class="policy__state">{{ policy.requireStepUp ? '已启用' : '已关闭' }}</span>
        <label v-if="policy.canEdit" class="switch" :title="'仅超级管理员可调整'">
          <input
            type="checkbox"
            :checked="policy.requireStepUp"
            :disabled="policyBusy"
            aria-label="变更二次验证"
            @change="togglePolicy"
          />
          <span class="switch__track" />
        </label>
      </div>

      <!-- 二次认证：内联展开，不走弹窗（弹窗会盖住"到底要关哪个接口"） -->
      <div v-if="stepup" class="stepup">
        <div class="stepup__head">
          <MailCheck :size="14" />
          <span>变更接口开关需要邮箱验证</span>
          <button class="stepup__cancel" type="button" @click="stepup = null">取消</button>
        </div>

        <template v-if="!stepup.challengeId">
          <div class="stepup__body">
            <input
              v-model="stepup.reason"
              class="stepup__input"
              maxlength="200"
              placeholder="变更原因（至少 4 个字，会写进审计）"
              aria-label="变更原因"
            />
            <button class="btn btn--primary btn--sm" type="button" :disabled="sending" @click="sendChallengeCode">
              <Loader2 v-if="sending" :size="14" class="is-spin" />
              {{ sending ? '发送中…' : '发送验证码' }}
            </button>
          </div>
        </template>

        <template v-else>
          <div class="stepup__body">
            <input
              v-model="code"
              class="stepup__input"
              inputmode="numeric"
              maxlength="8"
              placeholder="输入验证码"
              aria-label="验证码"
            />
            <button class="btn btn--primary btn--sm" type="button" :disabled="verifying" @click="confirmStepUp">
              <Loader2 v-if="verifying" :size="14" class="is-spin" />
              {{ verifying ? '核验中…' : '核验并保存' }}
            </button>
            <span class="stepup__hint">已发送至 {{ stepup.maskedTarget }}</span>
          </div>
        </template>
      </div>

      <!-- 编辑节点：描述 / 登录要求 / 白名单。保存同样要二次验证（原因 4-200 字） -->
      <div v-if="editing" class="editor" role="dialog" aria-modal="true" aria-label="编辑接口配置">
        <div class="editor__mask" @click="editing = null" />
        <div class="editor__panel">
          <header class="editor__head">
            <h4 class="editor__title">编辑「{{ editing.name }}」</h4>
            <button class="editor__close" type="button" aria-label="关闭" @click="editing = null">×</button>
          </header>

          <div class="editor__body">
            <label class="editor__field">
              <span class="editor__label">描述</span>
              <input
                v-model="editing.description"
                class="editor__input"
                maxlength="200"
                placeholder="会显示在接口列表里"
              />
            </label>

            <label class="editor__field editor__field--row">
              <span class="editor__label">要求登录</span>
              <label class="switch">
                <input v-model="editing.requireLogin" type="checkbox" />
                <span class="switch__track" />
              </label>
              <span class="editor__hint">关掉后匿名可访问（危险，谨慎）</span>
            </label>

            <label class="editor__field">
              <span class="editor__label">IP 白名单</span>
              <input
                v-model="editing.ips"
                class="editor__input"
                placeholder="逗号分隔，如 10.0.0.1, 192.168.1.0/24；留空 = 不限制"
              />
            </label>

            <label class="editor__field">
              <span class="editor__label">角色白名单</span>
              <input v-model="editing.roles" class="editor__input" placeholder="逗号分隔角色编码；留空 = 不限制" />
            </label>

            <label class="editor__field">
              <span class="editor__label">变更原因</span>
              <input
                v-model="editing.reason"
                class="editor__input"
                maxlength="200"
                placeholder="至少 4 个字，写进审计（保存需要二次验证时必填）"
              />
            </label>

            <div v-if="editing.challengeId" class="editor__field">
              <span class="editor__label">验证码（已发送至 {{ editing.maskedTarget }}）</span>
              <input
                v-model="editing.code"
                class="editor__input"
                inputmode="numeric"
                maxlength="8"
                placeholder="输入验证码"
              />
            </div>
          </div>

          <footer class="editor__foot">
            <button class="btn btn--sm" type="button" :disabled="editing.busy" @click="editing = null">取消</button>
            <button
              v-if="!editing.challengeId"
              class="btn btn--primary btn--sm"
              type="button"
              :disabled="editing.busy"
              @click="saveEdit"
            >
              <Loader2 v-if="editing.busy" :size="14" class="is-spin" />
              保存
            </button>
            <button
              v-else
              class="btn btn--primary btn--sm"
              type="button"
              :disabled="editing.busy || !editing.code.trim()"
              @click="confirmEditStepUp"
            >
              <Loader2 v-if="editing.busy" :size="14" class="is-spin" />
              核验并保存
            </button>
          </footer>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ── 容器：两种形态共用一套内层结构，只有外壳定位不同 ─────────────── */

.api-panel {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: flex-end;
}

.api-panel--inline {
  position: static;
  inset: auto;
  z-index: auto;
  display: block;
}

.api-panel__mask {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, #000 32%, transparent);
}

.api-panel__sheet {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(680px, 100%);
  height: 100%;
  background: var(--mauth-surface);
  border-left: 1px solid var(--mauth-border);
  box-shadow: var(--e3);
}

.api-panel--inline .api-panel__sheet {
  width: 100%;
  height: auto;
  min-height: 360px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-md);
  box-shadow: var(--e1);
  overflow: hidden;
}

/* ── 头部 ───────────────────────────────────────────────── */

.api-panel__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--mauth-border);
}

.api-panel__titles {
  min-width: 0;
  flex: 1;
}

.api-panel__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--mauth-text);
}

.api-panel__sub {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--mauth-text-faint);
}

.api-panel__close {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: var(--mauth-radius-sm);
  background: transparent;
  color: var(--mauth-text-faint);
  cursor: pointer;
}

.api-panel__close:hover {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

/* ── 工具条 ─────────────────────────────────────────────── */

.api-panel__tools {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--mauth-border);
  background: color-mix(in srgb, var(--mauth-surface-2) 45%, var(--mauth-surface));
}

.api-panel__tools-spacer {
  margin-left: auto;
}

.api-search {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  max-width: 340px;
  padding: 0 10px;
  height: 30px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface);
  color: var(--mauth-text-faint);
}

.api-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--mauth-text);
  font-size: 12.5px;
}

.api-chip {
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--mauth-border);
  border-radius: 999px;
  background: var(--mauth-surface);
  color: var(--mauth-text-soft);
  font-size: 12px;
  cursor: pointer;
}

.api-chip--on {
  border-color: var(--mauth-primary);
  color: var(--mauth-primary);
  background: color-mix(in srgb, var(--mauth-primary) 10%, transparent);
}

.api-panel__match {
  font-size: 12px;
  color: var(--mauth-text-faint);
}

/* ── 开关：纯 CSS，不引组件库（与旧版逐像素一致，别改成复选框） ── */

.switch {
  position: relative;
  display: inline-flex;
  flex: none;
  width: 34px;
  height: 18px;
  cursor: pointer;
  vertical-align: -3px;
}

.switch input {
  position: absolute;
  opacity: 0;
}

.switch__track {
  width: 100%;
  height: 100%;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mauth-text-faint) 40%, transparent);
  transition: background 0.15s ease;
}

.switch__track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 18%);
  transition: transform 0.15s ease;
}

.switch input:checked + .switch__track {
  background: var(--mauth-primary);
}

.switch input:checked + .switch__track::after {
  transform: translateX(16px);
}

.switch input:disabled + .switch__track {
  opacity: 0.5;
}

/* ── 表格 ───────────────────────────────────────────────── */

.api-panel__scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 6px 8px;
}

.api-panel--inline .api-panel__scroll {
  max-height: min(62vh, 760px);
}

.api-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12.5px;
}

.api-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 10px;
  text-align: left;
  font-weight: 500;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
  background: var(--mauth-surface);
  border-bottom: 1px solid var(--mauth-border);
  white-space: nowrap;
}

.api-table__path {
  width: 34%;
}

.api-table__perm {
  width: 24%;
}

.api-table__login {
  width: 84px;
  text-align: center;
}

.api-table__switch {
  width: 60px;
  text-align: right;
}

.api-row td {
  padding: 6px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--mauth-border) 62%, transparent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.api-row--system {
  cursor: pointer;
  background: color-mix(in srgb, var(--mauth-surface-2) 60%, var(--mauth-surface));
}

.api-row--group {
  cursor: pointer;
}

.api-row--group td {
  background: color-mix(in srgb, var(--mauth-surface-2) 28%, var(--mauth-surface));
}

.api-row--api:hover td {
  background: var(--mauth-hover);
}

.api-row__caret {
  vertical-align: -2px;
  margin-right: 4px;
  color: var(--mauth-text-faint);
}

.api-row__strong {
  font-weight: 600;
  color: var(--mauth-text);
}

.api-row__group {
  padding-left: 10px;
  font-weight: 550;
  color: var(--mauth-text);
}

.api-row__name {
  padding-left: 24px;
  color: var(--mauth-text-soft);
}

.api-row__count {
  margin-left: 6px;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.api-row td code {
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.api-row__muted {
  color: var(--mauth-text-faint);
}

.api-row__same {
  font-size: 11px;
  color: var(--mauth-text-faint);
  cursor: help;
}

.api-empty {
  padding: 28px 10px;
  text-align: center;
  color: var(--mauth-text-faint);
  font-size: 12.5px;
}

/* ── 关闭确认条 / 危险动作标识 ───────────────────────────── */

.api-confirm {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-bottom: 1px solid color-mix(in srgb, var(--mauth-danger) 32%, transparent);
  background: color-mix(in srgb, var(--mauth-danger) 8%, var(--mauth-surface));
  font-size: 12px;
  color: var(--mauth-text);
}

.api-confirm__text {
  flex: 1;
  min-width: 0;
}

.api-confirm__text b {
  font-weight: 600;
  color: var(--mauth-danger);
}

.api-row__name.is-danger {
  color: var(--mauth-text);
  font-weight: 550;
}

.chip--danger {
  margin-left: 6px;
  padding: 0 5px;
  border: 1px solid color-mix(in srgb, var(--mauth-danger) 40%, transparent);
  border-radius: 4px;
  color: var(--mauth-danger);
  font-size: 10.5px;
  line-height: 15px;
}

/* ── 页脚与策略 ─────────────────────────────────────────── */

.api-panel__foot {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 18px;
  border-top: 1px solid var(--mauth-border);
  font-size: 12px;
  color: var(--mauth-text-faint);
}

.api-panel__warn {
  color: var(--mauth-danger);
}

.api-panel__error {
  margin: 10px;
  padding: 8px 10px;
  border-radius: var(--mauth-radius-sm);
  background: color-mix(in srgb, var(--mauth-danger) 10%, transparent);
  color: var(--mauth-danger);
  font-size: 12px;
}

.policy {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-top: 1px solid var(--mauth-border);
  font-size: 12px;
  color: var(--mauth-text-soft);
}

.policy__label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.policy__state {
  color: var(--mauth-text-faint);
}

/* ── 二次认证（内联） ───────────────────────────────────── */

.lock {
  display: inline-flex;
  align-items: center;
  margin-right: 4px;
  color: var(--mauth-text-faint);
}

.api-edit {
  margin-left: 6px;
  padding: 0 6px;
  height: 22px;
  font-size: 11.5px;
}

.editor {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
}

.editor__mask {
  position: absolute;
  inset: 0;
  background: rgb(16 20 24 / 36%);
}

.editor__panel {
  position: relative;
  width: min(520px, calc(100vw - 32px));
  max-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: var(--mauth-surface);
  box-shadow: 0 12px 40px rgb(16 20 24 / 22%);
  overflow: hidden;
}

.editor__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--mauth-border);
}

.editor__title {
  flex: 1;
  margin: 0;
  font-size: 14px;
  font-weight: 620;
}

.editor__close {
  border: 0;
  background: none;
  color: var(--mauth-text-soft);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.editor__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px;
  overflow: auto;
}

.editor__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.editor__field--row {
  flex-direction: row;
  align-items: center;
  gap: 10px;
}

.editor__label {
  color: var(--mauth-text-mid);
  font-size: 12px;
}

.editor__hint {
  color: var(--mauth-text-faint);
  font-size: 11.5px;
}

.editor__input {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--mauth-border);
  border-radius: 8px;
  background: var(--mauth-surface);
  color: var(--mauth-text);
  font: inherit;
  font-size: 12.5px;
}

.editor__foot {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 10px 16px 14px;
  border-top: 1px solid var(--mauth-border);
}

.stepup {
  border-top: 1px solid var(--mauth-border);
  background: color-mix(in srgb, var(--mauth-primary) 6%, var(--mauth-surface));
}

.stepup__head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px 0;
  font-size: 12px;
  color: var(--mauth-text-soft);
}

.stepup__cancel {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--mauth-text-faint);
  font-size: 12px;
  cursor: pointer;
}

.stepup__body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 18px 12px;
}

.stepup__input {
  flex: 1;
  min-width: 180px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface);
  color: var(--mauth-text);
  font-size: 12.5px;
}

.stepup__hint {
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.is-spin {
  animation: api-spin 0.9s linear infinite;
}

@keyframes api-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
