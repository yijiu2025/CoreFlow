<script setup lang="ts">
/**
 * 应用接口开关（右侧抽屉）
 *
 * 数据就是守卫配置的三级树（系统 / 模块 / 接口），只是按**应用**收口：
 * 只有 `system.json` 里声明了 `app_id` 的系统才属于这个应用，共享系统不会出现在这里。
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
import { ChevronRight, Loader2, Lock, MailCheck, X } from 'lucide-vue-next';
import { appApiStepUpChallenge, appApiStepUpVerify, listAppApis, toggleAppApi } from '@/api/system';
import type { AppApiSystem } from '@/api/system';
import { useToastStore } from '@/stores/toast';

const props = defineProps<{
  /** 应用标识 */
  appId: string;
  /** 应用显示名（标题用） */
  appName: string;
}>();

const emit = defineEmits<{ (e: 'close'): void; (e: 'changed'): void }>();

const toast = useToastStore();

/** 接口树 */
const systems = ref<AppApiSystem[]>([]);
const loading = ref(false);
const error = ref('');
/** 展开中的系统 key（默认全展开：应用下通常只有一两个系统） */
const expanded = ref<Set<string>>(new Set());
/** 正在切换的节点（`system|group|api`），用于行内禁用与转圈 */
const busyKey = ref('');

/** 等待二次认证的上下文 */
const stepup = ref<{
  systemKey: string;
  groupKey?: string;
  apiKey?: string;
  challengeId: string;
  maskedTarget: string;
  /** 服务端算出的 patch，重试时原样带回 */
  patch: Record<string, unknown>;
} | null>(null);
const code = ref('');
const verifying = ref(false);

/** 节点唯一键 */
function nodeKey(systemKey: string, groupKey?: string, apiKey?: string): string {
  return [systemKey, groupKey || '', apiKey || ''].join('|');
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

/** 折叠/展开 */
function toggleExpand(systemKey: string): void {
  const next = new Set(expanded.value);
  if (next.has(systemKey)) next.delete(systemKey);
  else next.add(systemKey);
  expanded.value = next;
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
async function requestChallenge(systemKey: string, groupKey?: string, apiKey?: string): Promise<void> {
  try {
    const res = await appApiStepUpChallenge(props.appId, {
      systemKey,
      groupKey,
      apiKey,
      action: 'toggle'
    });
    stepup.value = {
      systemKey,
      groupKey,
      apiKey,
      challengeId: res.challengeId,
      maskedTarget: res.maskedTarget,
      patch: (res as unknown as { patch: Record<string, unknown> }).patch || {}
    };
    code.value = '';
    toast.push(`验证码已发送至 ${res.maskedTarget}`, 'info');
  } catch (err) {
    toast.pushError(err, '发起认证失败');
  }
}

/** 核验并重试 */
async function confirmStepUp(): Promise<void> {
  const ctx = stepup.value;
  if (!ctx || !code.value.trim()) return;
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

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="api-drawer">
    <!-- 遮罩：点击关闭（抽屉本身阻止冒泡） -->
    <div class="api-drawer__mask" @click="emit('close')" />
    <aside class="api-drawer__panel">
      <header class="api-drawer__head">
        <div>
          <h3 class="api-drawer__title">接口开关 · {{ appName }}</h3>
          <p class="api-drawer__sub">关闭后该接口直接拒绝请求（403 前拦截）。变更需二次认证并留审计。</p>
        </div>
        <button class="btn btn--icon btn--sm" type="button" aria-label="关闭" @click="emit('close')">
          <X :size="16" />
        </button>
      </header>

      <div v-if="loading" class="api-drawer__state"><Loader2 :size="16" class="spin" /> 正在加载接口树…</div>
      <div v-else-if="error" class="api-drawer__state">
        <p>{{ error }}</p>
        <button class="btn btn--sm" type="button" @click="load">重试</button>
      </div>
      <div v-else-if="systems.length === 0" class="api-drawer__state">
        <Lock :size="18" />
        <p>这个应用还没有声明归属的接口系统。</p>
        <p class="api-drawer__hint">
          私有 API 写 <code>"app_id": "{{ appId }}"</code>；共享 API（登录/通知这类，会被别的应用调用） 写
          <code>"owner_app_id": "{{ appId }}"</code> —— 只登记管理归属，不参与会话归属校验。
        </p>
      </div>

      <div v-else class="api-drawer__body">
        <section v-for="system in systems" :key="system.key" class="api-node">
          <div class="api-node__row api-node__row--system">
            <button class="api-node__toggle" type="button" @click="toggleExpand(system.key)">
              <ChevronRight :size="14" :class="{ 'is-open': expanded.has(system.key) }" />
              <span class="api-node__name">{{ system.name || system.key }}</span>
              <code class="api-node__prefix">{{ system.prefix || '—' }}</code>
            </button>
            <label class="switch" :title="system.enabled ? '已启用' : '已关闭'">
              <input
                type="checkbox"
                :checked="system.enabled"
                :disabled="busyKey === nodeKey(system.key)"
                @change="doToggle(system.key)"
              />
              <span class="switch__track" />
            </label>
          </div>

          <div v-if="expanded.has(system.key)" class="api-node__children">
            <section v-for="group in system.groups" :key="group.key" class="api-group">
              <div class="api-node__row">
                <span class="api-node__name api-node__name--group">{{ group.name || group.key }}</span>
                <code class="api-node__prefix">{{ group.prefix || '—' }}</code>
                <label class="switch">
                  <input
                    type="checkbox"
                    :checked="group.enabled"
                    :disabled="busyKey === nodeKey(system.key, group.key)"
                    @change="doToggle(system.key, group.key)"
                  />
                  <span class="switch__track" />
                </label>
              </div>

              <ul class="api-list">
                <li v-for="api in group.apis" :key="api.key" class="api-item">
                  <div class="api-item__main">
                    <span class="api-item__name">{{ api.name || api.key }}</span>
                    <code class="api-item__key">{{ api.key }}</code>
                    <span v-if="api.requireLogin" class="chip">要求登录</span>
                    <span v-if="api.requirePermission" class="chip chip--perm">{{ api.requirePermission }}</span>
                  </div>
                  <label class="switch">
                    <input
                      type="checkbox"
                      :checked="api.enabled"
                      :disabled="busyKey === nodeKey(system.key, group.key, api.key)"
                      @change="doToggle(system.key, group.key, api.key)"
                    />
                    <span class="switch__track" />
                  </label>
                </li>
              </ul>
            </section>
          </div>
        </section>
      </div>

      <footer class="api-drawer__foot">
        <span>共 {{ systems.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.apis.length, 0), 0) }} 个接口</span>
        <span v-if="disabledCount > 0" class="api-drawer__warn">{{ disabledCount }} 个节点已关闭</span>
      </footer>

      <!-- 二次认证：就地展开，不弹第二个浮层 -->
      <div v-if="stepup" class="stepup">
        <div class="stepup__head">
          <MailCheck :size="15" />
          <span>需要二次认证：验证码已发送至 {{ stepup.maskedTarget }}</span>
        </div>
        <div class="stepup__body">
          <input v-model="code" class="stepup__input" inputmode="numeric" maxlength="8" placeholder="输入验证码" />
          <button
            class="btn btn--primary btn--sm"
            type="button"
            :disabled="verifying || !code.trim()"
            @click="confirmStepUp"
          >
            <Loader2 v-if="verifying" :size="14" class="spin" />
            确认并执行
          </button>
          <button class="btn btn--ghost btn--sm" type="button" @click="stepup = null">取消</button>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.api-drawer {
  position: fixed;
  inset: 0;
  z-index: 60;
}

.api-drawer__mask {
  position: absolute;
  inset: 0;
  background: rgb(16 20 24 / 32%);
}

.api-drawer__panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  width: min(560px, 100vw);
  background: var(--mauth-surface);
  border-left: 1px solid var(--mauth-border);
  box-shadow: -8px 0 24px rgb(46 58 62 / 10%);
}

.api-drawer__head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--mauth-border);
}

.api-drawer__title {
  margin: 0;
  font-size: 15px;
  font-weight: 620;
}

.api-drawer__sub {
  margin: 4px 0 0;
  color: var(--mauth-text-soft);
  font-size: 12px;
  line-height: 1.6;
}

.api-drawer__state {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  padding: 40px 20px;
  color: var(--mauth-text-soft);
  font-size: 12.5px;
  text-align: center;
}

.api-drawer__hint {
  margin: 0;
  color: var(--mauth-text-faint);
}

.api-drawer__body {
  flex: 1;
  overflow: auto;
  padding: 8px 12px 12px;
}

.api-node {
  border-bottom: 1px solid var(--mauth-border);
}

.api-node:last-child {
  border-bottom: 0;
}

.api-node__row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 6px;
}

.api-node__row--system {
  background: var(--mauth-surface-2);
  border-radius: 8px;
  margin-top: 6px;
}

.api-node__toggle {
  display: flex;
  flex: 1;
  gap: 6px;
  align-items: center;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.api-node__toggle svg {
  transition: transform 0.15s ease;
}

.api-node__toggle svg.is-open {
  transform: rotate(90deg);
}

.api-node__name {
  font-weight: 600;
}

.api-node__name--group {
  flex: 1;
  font-weight: 500;
}

.api-node__prefix {
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--mauth-surface-2);
  color: var(--mauth-text-faint);
  font-size: 11.5px;
}

.api-node__children {
  padding: 0 0 8px 18px;
}

.api-group {
  margin-top: 4px;
}

.api-list {
  margin: 0;
  padding: 0 0 0 14px;
  list-style: none;
}

.api-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 5px 6px;
  border-radius: 6px;
}

.api-item:hover {
  background: var(--mauth-surface-2);
}

.api-item__main {
  display: flex;
  flex: 1;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.api-item__name {
  overflow: hidden;
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.api-item__key {
  color: var(--mauth-text-faint);
  font-size: 11.5px;
}

.chip {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--mauth-surface-2);
  color: var(--mauth-text-soft);
  font-size: 11px;
  white-space: nowrap;
}

.chip--perm {
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
}

/* 开关：纯 CSS，不引组件库 */
.switch {
  position: relative;
  display: inline-flex;
  flex: none;
  width: 34px;
  height: 18px;
  cursor: pointer;
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

.api-drawer__foot {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 10px 18px;
  border-top: 1px solid var(--mauth-border);
  color: var(--mauth-text-soft);
  font-size: 12px;
}

.api-drawer__warn {
  color: var(--mauth-danger, #d9534f);
}

.stepup {
  padding: 12px 18px 14px;
  border-top: 1px solid var(--mauth-border);
  background: var(--mauth-surface-2);
}

.stepup__head {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12.5px;
}

.stepup__body {
  display: flex;
  gap: 8px;
  align-items: center;
}

.stepup__input {
  flex: 1;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--mauth-border);
  border-radius: 8px;
  background: var(--mauth-surface);
  color: var(--mauth-text);
  font: inherit;
  letter-spacing: 2px;
}

.spin {
  animation: api-spin 0.9s linear infinite;
}

@keyframes api-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .api-drawer__panel {
    width: 100vw;
  }
}
</style>
