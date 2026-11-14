<script setup lang="ts">
/**
 * 操作日志详情（弹窗）
 *
 * 列表列宽有限，`audit_logs.details` 这段 JSON 一个字都没显示出来 —— 而排查问题时
 * 真正要看的恰恰是它（谁、对什么、提交了什么、服务端怎么回的）。
 *
 * 四段式：**摘要**（一句话说清谁对什么做了什么）／**基本信息**（时间、操作者、被操作账号、
 * 模块、事件）／**来源**（IP、设备码、UA，回答"从哪台机器来的"）／**请求 + 载荷**（方法、
 * 路径、耗时，details 逐键展开，回答"具体改了什么"）。原始 JSON 收进折叠区：展开后的键值对
 * 便于阅读，原文用于核对嵌套/顺序，两者同时铺开会把弹窗拉成两屏。
 *
 * 🔴 **「账号」必须说清是哪一个**：`audit_logs.user_id` 恒指**操作者**（谁点的按钮），
 *    而被操作的对象只可能在 `details` 里。只写「账号」时，读日志的人无法判断
 *    「修改部门『管理部门』」是"这个人自己改的"还是"这个人被别人改了" ——
 *    这两件事在处理投诉 / 追责时结论完全相反。所以这里拆成「操作者（发起人）」与
 *    「被操作账号（作用对象）」两格，后者没有就整格不出现，不做任何猜测性填充。
 *
 * 🔴 `detail` 是后端 `JSON.stringify(details)` 的产物，**可能不是合法 JSON**
 *    （历史数据、手工写入、字段被截断）。解析失败就原样当文本显示，
 *    不能因为一条脏数据让整个详情打不开 —— 那正是最需要看它的时候。
 *
 * @author yijiu2025
 * @since 2026-11-11
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Check, Copy, X } from 'lucide-vue-next';
import { summarizeOperEvent } from '@/utils/operLogSummary';
import type { OperLogRow } from '@/api/types';

const props = defineProps<{
  /** 要展示的行（null = 关闭） */
  row: OperLogRow | null;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

/** 复制结果反馈：'idle' | 'ok' | 'fail' */
const copyState = ref<'idle' | 'ok' | 'fail'>('idle');
/** 设备码复制反馈（与载荷复制分开：两个按钮各自给反馈，不共用状态） */
const deviceCopyState = ref<'idle' | 'ok' | 'fail'>('idle');

/**
 * 解析 details
 *
 * @returns 对象形态的载荷；不是 JSON 或不是对象时为 null
 */
const payload = computed<Record<string, unknown> | null>(() => {
  const raw = props.row?.detail;
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
});

/**
 * 值 → 展示文本
 *
 * 嵌套对象/数组用两空格缩进展开；标量直接字符串化。`null` 给破折号而不是 `"null"`，
 * 免得读成"值就是 null"和"没有这个字段"两种意思分不清。
 *
 * @param value 任意值
 * @returns 展示文本
 */
function textOf(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

/** 载荷里的一条变更（后端各业务统一用 `{ field, label, from, to }` 记 diff） */
interface ChangeItem {
  field?: string;
  label?: string;
  from?: unknown;
  to?: unknown;
}

/**
 * 变更明细
 *
 * 这是整条日志里最值钱的部分（"把谁从什么改成了什么"）。原样铺 JSON 也能看，
 * 但一眼扫不出重点，所以按行渲染；结构不符（没有数组、元素不是对象）时退回普通展示。
 */
const changes = computed<ChangeItem[]>(() => {
  const raw = payload.value?.changes;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is ChangeItem => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
});

/** 载荷逐键展开（按原始顺序，不排序 —— 写入顺序本身是线索） */
const entries = computed(() =>
  payload.value
    ? Object.entries(payload.value)
        // changes 单独渲染成"改了什么"的 diff 列表（见 changes），这里不再重复一坨 JSON
        .filter(([key]) => !(key === 'changes' && changes.value.length > 0))
        .map(([key, value]) => ({
          key,
          text: textOf(value),
          multiline: value !== null && typeof value === 'object'
        }))
    : []
);

/**
 * 取第一个有值的字段（只认标量）
 *
 * @param source 载荷
 * @param keys 候选键（各写入点命名不统一）
 * @returns 文本；都没有时为空串
 */
function firstText(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

/**
 * 被操作账号（这条操作作用在谁身上）
 *
 * 🔴 `audit_logs` 只存一列「人」：`user_id` 恒为**操作者**（谁点的这个按钮）。
 *    被操作的对象不在表里，只可能出现在业务自己写的 `details` 里 —— 而且各写入点
 *    字段名并不统一（`targetUsername` 见 console/user-profile.service.js，
 *    `targetUserId` 见 admin/user/v1/sessions.js，还有只写 `targetId` 的）。
 *
 *    所以按候选键依次取，一个都取不到就**不显示这一格**：绝不能用操作者的名字去填，
 *    那正是这条日志最容易读错的地方 ——「账号」到底指发起人还是被改的人。
 */
const targetAccount = computed<{ name: string; id: number | null } | null>(() => {
  const detail = payload.value;
  if (!detail) return null;
  const name = firstText(detail, ['targetUsername', 'targetUserName', 'target_username']);
  const idText = firstText(detail, ['targetUserId', 'targetId', 'target_id']);
  const id = /^\d+$/.test(idText) ? Number(idText) : null;
  if (!name && id === null) return null;
  return { name, id };
});

/**
 * 被操作账号是否就是操作者本人（改自己的资料 / 改自己的密码这类）
 *
 * 优先用载荷里显式的 `self`（`SESSION_KICK_DEVICE` 会写它，判据在写入侧最准），
 * 没有这个字段时才退回"名字相同"的比较 —— 名字可改、可重名，只能算次优判据。
 */
const targetIsSelf = computed(() => {
  const flag = payload.value?.self;
  if (typeof flag === 'boolean') return flag;
  const name = targetAccount.value?.name;
  return Boolean(name) && name === props.row?.username;
});

/** 原始 JSON 文本（解析失败时就是原文） */
const rawDetail = computed(() => props.row?.detail || '');
const rawPretty = computed(() => {
  if (!rawDetail.value) return '';
  return payload.value ? JSON.stringify(payload.value, null, 2) : rawDetail.value;
});

/** 是否值得展示"原始 JSON"一段（能和展开段区分开才有意义） */
const showRaw = computed(() => Boolean(rawDetail.value));

/**
 * 时间
 *
 * @param iso ISO 时间串
 * @returns 本地时间（秒级）
 */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 复制载荷
 *
 * 剪贴板 API 在非安全上下文（http + 非 localhost）下不存在，属正常情况，
 * 失败就明说，不做假成功。
 */
async function copyPayload(): Promise<void> {
  if (!rawDetail.value) return;
  try {
    await navigator.clipboard.writeText(rawPretty.value);
    copyState.value = 'ok';
  } catch {
    copyState.value = 'fail';
  }
  window.setTimeout(() => (copyState.value = 'idle'), 1800);
}

/**
 * 复制设备码
 *
 * 设备码是排查"同一台机器还做过什么"的检索键，比全选拖拽顺手 —— 但同样
 * 在非安全上下文下剪贴板不可用，失败就如实提示。
 */
async function copyDevice(): Promise<void> {
  const code = props.row?.device_id;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    deviceCopyState.value = 'ok';
  } catch {
    deviceCopyState.value = 'fail';
  }
  window.setTimeout(() => (deviceCopyState.value = 'idle'), 1800);
}

/**
 * uid 缩写
 *
 * UUID 36 字符会把「账号」这一格撑宽、连带把右侧「模块 / 事件」挤到下一行。
 * 这里保前 8 后 4 —— 足够人工核对，完整值仍在 title 与用户详情里。
 *
 * @param uid 用户 uid
 * @returns 缩写文本
 */
function shortUid(uid: string): string {
  if (!uid) return '';
  return uid.length > 16 ? `${uid.slice(0, 8)}…${uid.slice(-4)}` : uid;
}

/**
 * Esc 关闭
 *
 * @param event 键盘事件
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.row) emit('close');
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

// 换行时清掉上一行的复制反馈，避免"已复制"跟着下一行跑
watch(
  () => props.row?.id,
  () => {
    copyState.value = 'idle';
    deviceCopyState.value = 'idle';
  }
);
</script>

<template>
  <div v-if="row" class="modal-mask" v-mask-close="() => emit('close')">
    <div class="modal oper-detail" role="dialog" aria-modal="true" aria-labelledby="oper-detail-title">
      <header class="modal__head">
        <span id="oper-detail-title" class="modal__title">操作详情</span>
        <span class="oper-id mono">#{{ row.id }}</span>
        <span class="tag" :class="row.status === 1 ? 'tag--ok' : 'tag--off'">
          {{ row.status === 1 ? '成功' : '失败' }}
        </span>
        <button class="oper-detail__close" type="button" aria-label="关闭" @click="emit('close')">
          <X :size="16" />
        </button>
      </header>

      <div class="modal__body oper-detail__body">
        <!-- ① 先一句话说清"谁对什么做了什么"，细节在下面三段。
             主语由操作者点名给出：摘要正文（"修改部门「管理部门」…"）本身不带主语，
             只看它会误以为是"被操作的那个账号"做的。 -->
        <p class="oper-summary">
          <!-- 名字缺失时退到 user_id，最后才说"系统"：把有账号的事件写成系统会误导追责 -->
          <span class="oper-summary__actor">{{ row.username || (row.user_id ? `用户 #${row.user_id}` : '系统') }}</span>
          <span>{{ summarizeOperEvent(row) }}</span>
        </p>

        <section class="oper-block">
          <h3 class="oper-block__title">基本信息</h3>
          <dl class="oper-kv">
            <div>
              <dt>时间</dt>
              <dd class="mono">{{ when(row.created_at) }}</dd>
            </div>
            <!-- 操作者 = `audit_logs.user_id` 指向的人（谁点的按钮）。
                 不能只给显示名：username 可改、重名，注销后还会变成「已注销用户#N」，
                 补上邮箱 / uid / 用户 ID 才能对应到具体账户 -->
            <div class="oper-account">
              <dt>操作者<span class="oper-kv__hint">发起人</span></dt>
              <dd>
                <span class="oper-account__name">{{ row.username || '—' }}</span>
                <span v-if="row.email" class="oper-account__meta mono" :title="row.email">{{ row.email }}</span>
                <span v-if="row.uid" class="oper-account__meta mono" :title="row.uid">
                  uid · {{ shortUid(row.uid) }}
                </span>
                <span v-if="!row.email && !row.uid && row.user_id" class="oper-account__meta mono">
                  用户 #{{ row.user_id }}
                </span>
                <span v-if="!row.user_id" class="oper-account__meta">系统事件（无关联账号）</span>
              </dd>
            </div>
            <!-- 被操作账号：只在载荷里带了目标时出现。没有就不能凭空填一个 ——
                 有它才能回答"这是在改别人，还是他改自己" -->
            <div v-if="targetAccount" class="oper-account">
              <dt>被操作账号<span class="oper-kv__hint">作用对象</span></dt>
              <dd>
                <span class="oper-account__name">{{ targetAccount.name || `用户 #${targetAccount.id}` }}</span>
                <span v-if="targetAccount.name && targetAccount.id" class="oper-account__meta mono">
                  用户 #{{ targetAccount.id }}
                </span>
                <span v-else-if="targetAccount.name" class="oper-account__meta"> 载荷只记了名字，没有用户 ID </span>
                <span v-if="targetIsSelf" class="oper-account__meta">与操作者同一人（本人操作）</span>
              </dd>
            </div>
            <div>
              <dt>模块</dt>
              <dd>{{ row.module || '—' }}</dd>
            </div>
            <div>
              <dt>事件</dt>
              <dd class="mono">{{ row.action || '—' }}</dd>
            </div>
          </dl>
        </section>

        <!-- ② 来源：排查时最常问"哪台机器、从哪来"，设备码单独给复制 -->
        <section class="oper-block">
          <h3 class="oper-block__title">来源</h3>
          <dl class="oper-kv">
            <div>
              <dt>IP</dt>
              <dd class="mono">{{ row.ip || '—' }}</dd>
            </div>
            <div class="oper-dev">
              <dt>设备</dt>
              <dd>
                <template v-if="row.device_id">
                  <span class="mono oper-dev__code">{{ row.device_id }}</span>
                  <button class="oper-mini" type="button" @click="copyDevice">
                    <Check v-if="deviceCopyState === 'ok'" :size="11" />
                    <Copy v-else :size="11" />
                    {{ deviceCopyState === 'ok' ? '已复制' : deviceCopyState === 'fail' ? '复制失败' : '复制' }}
                  </button>
                </template>
                <span v-else class="oper-muted">未记录（该事件写入时未采集设备码）</span>
              </dd>
            </div>
          </dl>
          <p class="oper-ua" :title="row.user_agent">{{ row.user_agent || '未记录 User-Agent' }}</p>
        </section>

        <!-- ③ 请求：方法与路径拼在一行，读起来就是一条 HTTP 请求 -->
        <section class="oper-block">
          <h3 class="oper-block__title">请求</h3>
          <p v-if="row.method || row.path" class="oper-request">
            <span v-if="row.method" class="oper-method" :data-method="row.method.toUpperCase()">{{ row.method }}</span>
            <span class="mono oper-path">{{ row.path || '未记录路径' }}</span>
            <span class="mono oper-cost">{{ row.cost_ms ? `${row.cost_ms} ms` : '未记录耗时' }}</span>
          </p>
          <p v-else class="oper-empty">这条事件由业务侧写入，不经 HTTP 中间件，因此没有方法 / 路径 / 耗时。</p>
        </section>

        <!-- ④ 载荷：真正回答"改了什么" -->
        <section class="oper-block">
          <h3 class="oper-block__title">
            载荷
            <span v-if="entries.length || changes.length" class="oper-block__note">
              {{ entries.length + (changes.length ? 1 : 0) }} 个字段
            </span>
            <button v-if="showRaw" class="oper-copy" type="button" :disabled="copyState === 'ok'" @click="copyPayload">
              <Check v-if="copyState === 'ok'" :size="12" />
              <Copy v-else :size="12" />
              {{ copyState === 'ok' ? '已复制' : copyState === 'fail' ? '复制失败' : '复制' }}
            </button>
          </h3>

          <!-- 变更明细：把 `changes` 数组渲染成「字段：旧 → 新」，这是排查时第一眼要看的 -->
          <ul v-if="changes.length" class="oper-changes">
            <li v-for="(item, i) in changes" :key="`${item.field || item.label || i}`">
              <span class="oper-changes__field">{{ item.label || item.field || `变更 ${i + 1}` }}</span>
              <span class="mono oper-changes__from">{{ textOf(item.from) }}</span>
              <span class="oper-changes__arrow" aria-hidden="true">→</span>
              <span class="mono oper-changes__to">{{ textOf(item.to) }}</span>
            </li>
          </ul>

          <dl v-if="entries.length" class="oper-kv oper-kv--payload">
            <div v-for="item in entries" :key="item.key" :class="{ 'is-wide': item.multiline }">
              <dt class="mono">{{ item.key }}</dt>
              <dd :class="{ mono: true, 'is-block': item.multiline }">{{ item.text }}</dd>
            </div>
          </dl>

          <pre v-else-if="showRaw && !changes.length" class="oper-raw">{{ rawDetail }}</pre>

          <p v-else-if="!changes.length" class="oper-empty">
            这条记录没有附带载荷（只有由业务显式写入 details 的操作才有，例如新建、改配、授权）
          </p>

          <!-- 原始 JSON 折叠：展开后的键值对便于阅读，原文用于核对嵌套/顺序，
               两者同时铺开会把弹窗拉成两屏，所以默认收起 -->
          <details v-if="showRaw" class="oper-fold">
            <summary>原始 JSON</summary>
            <pre class="oper-raw oper-raw--fold">{{ rawPretty }}</pre>
          </details>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 比默认弹窗宽一档：载荷是键值对，560px 会把值挤成竖排 */
.oper-detail {
  width: min(680px, 100%);
}

/* 单号靠标题、独立成小号等宽字：它只是索引，不该和标题抢字号 */
.oper-id {
  font-size: 12px;
  color: var(--mauth-text-faint);
}

.oper-detail__close {
  margin-left: auto;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--mauth-radius-xs);
  background: transparent;
  color: var(--mauth-text-soft);
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.oper-detail__close:hover {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

.oper-detail__body {
  gap: 16px;
  padding-bottom: 20px;
}

/* 摘要：整张弹窗最该被先读到的一句。用一整块极浅底承载，**不加左侧装饰竖线**
   与主色边条 —— 那种"引用块"造型在这里只是视觉噪音，读起来还像被裁掉一截 */
.oper-summary {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--mauth-radius-sm);
  background: color-mix(in srgb, var(--mauth-text) 4%, transparent);
  color: var(--mauth-text);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

/* 摘要主语（操作者）：加粗 + 主色，和后面那句"做了什么"分开读 */
.oper-summary__actor {
  font-weight: 650;
  color: var(--mauth-primary);
}

.oper-summary__actor::after {
  content: '·';
  margin: 0 6px;
  color: var(--mauth-text-faint);
  font-weight: 400;
}

/*
 * 分节标题：文字 + 一条填满剩余宽度的细线
 *
 * 原来只有一行 11px 灰色小字，节与节之间全靠留白分隔；加线之后段落边界
 * 变成一条实际的边，扫读时不必先找小字。`::after` 放在 copy 按钮之前即可，
 * 按钮的 `margin-left: auto` 在有 flex:1 的线时不会多占空间。
 */
.oper-block__title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--mauth-text-mid);
}

.oper-block__title::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--mauth-border);
}

/* 字段数：附在标题后的小计数，帮助判断"载荷是不是被截断了" */
.oper-block__note {
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--mauth-text-faint);
  opacity: 0.85;
}

.oper-copy {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 0 8px;
  height: 20px;
  border: 1px solid var(--mauth-border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--mauth-text-soft);
  font-size: 10.5px;
  letter-spacing: 0;
  cursor: pointer;
}

.oper-copy:hover:not(:disabled) {
  color: var(--mauth-text);
  border-color: var(--mauth-border-strong);
  background: var(--mauth-hover);
}

.oper-copy:disabled {
  cursor: default;
  color: var(--mauth-success);
}

/* 键值对：窄屏自动折成一列，不被长路径撑破 */
.oper-kv {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 10px 18px;
  margin: 0;
}

.oper-kv > div {
  min-width: 0;
}

.oper-kv dt {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

/*
 * dt 里的角色说明（"发起人" / "作用对象"）
 *
 * 这两格都叫"账号"时最容易被读错：一个是你，一个是被改的人。标签本身只写角色，
 * 补一句更小的注解把差别说死在原地，比底下再加一段解释更省事。
 */
.oper-kv__hint {
  margin-left: 5px;
  font-size: 10px;
  font-weight: 400;
  color: var(--mauth-text-faint);
  opacity: 0.85;
}

.oper-kv dd {
  margin: 3px 0 0;
  font-size: 12.5px;
  color: var(--mauth-text);
  overflow-wrap: anywhere;
}

/* 账号格：显示名 + 邮箱 + uid 三行，长 uuid 允许折行 */
.oper-account dd {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.oper-account__name {
  color: var(--mauth-text);
}

.oper-account__meta {
  font-size: 11px;
  line-height: 1.45;
  color: var(--mauth-text-faint);
  overflow-wrap: anywhere;
}

/* 设备码最长 100 字符：占满一整行，避免和 IP 挤在同一个网格单元里被压成一条 */
.oper-dev {
  grid-column: 1 / -1;
}

.oper-dev dd {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.oper-dev__code {
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

/* 设备码旁的小复制键：跟载荷复制同一视觉语言，但更小一号（行内使用） */
.oper-mini {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 20px;
  padding: 0 7px;
  border: 1px solid var(--mauth-border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--mauth-text-soft);
  font-size: 10.5px;
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.oper-mini:hover {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

.oper-muted {
  font-size: 12px;
  color: var(--mauth-text-faint);
}

/* 变更明细：一行一变，「字段 旧 → 新」。箭头用主色，读起来就是一次赋值 */
.oper-changes {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
}

.oper-changes > li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  padding: 7px 10px;
  border-radius: var(--mauth-radius-xs);
  background: color-mix(in srgb, var(--mauth-primary) 5%, transparent);
  font-size: 12px;
}

.oper-changes__field {
  flex: none;
  font-weight: 650;
  color: var(--mauth-text-mid);
}

.oper-changes__from,
.oper-changes__to {
  overflow-wrap: anywhere;
}

.oper-changes__from {
  color: var(--mauth-text-faint);
}

.oper-changes__to {
  color: var(--mauth-text);
}

.oper-changes__arrow {
  flex: none;
  color: var(--mauth-primary);
  font-weight: 700;
}

/* 多行值（对象/数组）独占一行：和标量并排会把网格拉得很难看 */
.oper-kv--payload {
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

/*
 * 载荷：一行一个字段，像表格一样读
 *
 * 🔴 键列用 `max-content` 而不是固定 168px：定宽会把短值推到很右边、中间留白，
 *    看着像缺了内容。行间用细实线而不是每行一块灰底 —— 字段多时灰底会碎成色块。
 */
.oper-kv--payload {
  gap: 0;
}

.oper-kv--payload > div {
  display: grid;
  grid-template-columns: minmax(72px, max-content) minmax(0, 1fr);
  align-items: baseline;
  gap: 14px;
  padding: 7px 2px;
  border-bottom: 1px solid var(--mauth-border);
}

.oper-kv--payload > div:last-child {
  border-bottom: 0;
}

.oper-kv--payload > div:hover {
  background: color-mix(in srgb, var(--mauth-text) 2.5%, transparent);
}

.oper-kv--payload > div.is-wide {
  grid-template-columns: minmax(0, 1fr);
  gap: 5px;
}

.oper-kv--payload dt {
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.oper-kv--payload dd {
  margin: 0;
  font-size: 12px;
}

.oper-kv--payload dd.is-block {
  white-space: pre-wrap;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--mauth-text-mid);
}

.oper-request {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0;
  min-width: 0;
}

/* 耗时右对齐到底：它是个读数，不该插在方法与路径中间打断语义 */
.oper-cost {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

/* 方法徽标：只按"读/写"分两色，不搞五色 —— 日志里真正要区分的就是这两类 */
.oper-method {
  flex: none;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--mauth-hover);
  color: var(--mauth-text-mid);
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.oper-method[data-method='POST'],
.oper-method[data-method='PUT'],
.oper-method[data-method='PATCH'],
.oper-method[data-method='DELETE'] {
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
}

.oper-path {
  font-size: 12.5px;
  color: var(--mauth-text);
  overflow-wrap: anywhere;
}

/* User-Agent：最长的一条无关信息，压到两行以内，完整内容看 title */
.oper-ua {
  margin: 10px 0 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  font-size: 11px;
  line-height: 1.55;
  color: var(--mauth-text-faint);
  overflow-wrap: anywhere;
}

/* 兜底原文：等宽、可横向滚动，不折行 —— 折了就看不出 JSON 结构 */
.oper-raw {
  margin: 0;
  padding: 12px;
  max-height: 260px;
  overflow: auto;
  border-radius: var(--mauth-radius-sm);
  background: color-mix(in srgb, var(--mauth-text) 4%, transparent);
  color: var(--mauth-text-mid);
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.6;
  white-space: pre;
}

.oper-empty {
  margin: 0;
  padding: 12px;
  border-radius: var(--mauth-radius-sm);
  background: color-mix(in srgb, var(--mauth-text) 3%, transparent);
  color: var(--mauth-text-faint);
  font-size: 12px;
  line-height: 1.6;
}

/* 原始 JSON 折叠区：默认收起，需要核对嵌套结构时再展开 */
.oper-fold {
  margin-top: 12px;
}

.oper-fold summary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  cursor: pointer;
  user-select: none;
  transition: color 0.16s var(--ease);
}

.oper-fold summary:hover {
  color: var(--mauth-text);
}

.oper-fold summary {
  width: fit-content;
  font-size: 11px;
  color: var(--mauth-text-faint);
  cursor: pointer;
  user-select: none;
}

.oper-fold summary:hover {
  color: var(--mauth-text-soft);
}

.oper-raw--fold {
  margin-top: 8px;
  max-height: 220px;
}

@media (max-width: 560px) {
  .oper-kv--payload > div {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
}
</style>
