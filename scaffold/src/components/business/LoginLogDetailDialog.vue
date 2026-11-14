<script setup lang="ts">
/**
 * 登录日志详情（弹窗）
 *
 * 列表只有 8 列，`session_logs.details` 这段 JSON 一个字都没显示出来 —— 而排查
 * 登录问题要看的恰恰是它（失败原因、被顶下线的 reason、续期时轮换了哪个令牌）。
 *
 * 三段式：**概览**（一句话说清发生了什么）／**会话**（IP、归属地、User-Agent）
 * ／**载荷**（details 逐键展开，另有原始 JSON 兜底）。
 *
 * 🔴 与 `OperLogDetailDialog` 是同一套视觉语言（同样的三段结构与键值排布）。
 *    两份 scoped 样式目前各自持有 —— 改其中一份的间距/配色时，另一份要一起看。
 *    抽公共类属于重构，不在"补一个详情弹窗"的范围里，先不摊开做。
 *
 * 🔴 **账号口径**：登录日志里 `session_logs.user_id` 就是**当事人本人**（谁在登录），
 *    不存在"操作者 / 被操作账号"两个角色 —— 那是 `audit_logs`（操作日志）的概念。
 *    所以这一格标成「登录账号（本人）」并加一行口径说明：两个页面的详情长得像，
 *    不写清楚就会被当成"这里少显示了被操作的那个人"。
 *
 * @author yijiu2025
 * @since 2026-11-12
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Check, Copy, X } from 'lucide-vue-next';
import { describeLoginEvent, loginEventLabel } from '@/utils/loginLogSummary';
import type { LoginLogRow } from '@/api/types';

const props = defineProps<{
  /** 要展示的行（null = 关闭） */
  row: LoginLogRow | null;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

/**
 * 账号格的角色后缀
 *
 * 这一页只有一方，所以后缀说的是**这个账号本身是什么状态**，不是"哪一方"：
 * 已注销（名字来自快照）/ 本人（正常记录）/ 未识别（尝试登录但账号没对上，
 * 失败日志常见）。三种都会出现，合并成一种写法会丢信息。
 */
/**
 * 归属地展示值
 *
 * 本机（127.0.0.1 / ::1）没有地理归属：显示「本地」比「未解析」准确 ——
 * 「未解析」像是在说"解析失败了"，而本机请求本来就不该有归属地。
 */
const locationText = computed(() => {
  const raw = props.row?.location;
  if (raw) return raw;
  const ip = String(props.row?.ip || '').trim();
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return '本地';
  return '未解析';
});

/** 操作者（谁发起了这条事件）：会话流水里另存的字段，缺省说明没有第二方 */
const operator = computed(() => {
  const details = (props.row?.details ?? {}) as Record<string, unknown>;
  const name = typeof details.operatorName === 'string' ? details.operatorName : '';
  const id = Number(details.operatorId);
  if (!name && !Number.isFinite(id)) return null;
  return { name, id: Number.isFinite(id) ? id : null };
});

/** 操作者不是当事人 → 这条记录是"被别人动了"，不能标「本人」 */
const isForeignAction = computed(() => {
  const id = operator.value?.id;
  const owner = Number(props.row?.user_id);
  return id !== null && id !== undefined && Number.isFinite(owner) && id !== owner;
});

const accountTag = computed(() => {
  if (props.row?.user_status === -1) return '已注销';
  if (!props.row?.username) return '未识别';
  // 被管理员踢下线时，当事人是"被操作账号"，标「本人」会误导成自己点的
  return isForeignAction.value ? '被操作账号' : '本人';
});

/** 复制反馈：'idle' | 'ok' | 'fail' */
const copyState = ref<'idle' | 'ok' | 'fail'>('idle');

/** 载荷逐键展开（按写入顺序，不排序 —— 顺序本身是线索） */
const entries = computed(() => {
  const details = props.row?.details;
  if (!details || typeof details !== 'object') return [];
  return Object.entries(details).map(([key, value]) => ({
    key,
    text: valueOf(value),
    multiline: value !== null && typeof value === 'object',
    // 布尔值单独标出来，渲染成胶囊而不是一整行文字
    bool: typeof value === 'boolean'
  }));
});

/** 原始 JSON 文本（展开段丢掉了嵌套结构，留一份原文） */
const rawPretty = computed(() => {
  const details = props.row?.details;
  if (!details) return '';
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return '';
  }
});

/**
 * 值 → 展示文本
 *
 * `null` 给破折号而不是 `"null"`：`"null"` 会和字符串 "null" 混淆。
 *
 * @param value 任意值
 * @returns 展示文本
 */
function valueOf(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

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
 * 剪贴板 API 在非安全上下文（http + 非 localhost）下不存在，属正常情况 ——
 * 失败就明说，不做假成功。
 */
async function copyPayload(): Promise<void> {
  if (!rawPretty.value) return;
  try {
    await navigator.clipboard.writeText(rawPretty.value);
    copyState.value = 'ok';
  } catch {
    copyState.value = 'fail';
  }
  window.setTimeout(() => (copyState.value = 'idle'), 1800);
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
  () => (copyState.value = 'idle')
);
</script>

<template>
  <div v-if="row" class="modal-mask" v-mask-close="() => emit('close')">
    <div class="modal sess-detail" role="dialog" aria-modal="true" aria-labelledby="sess-detail-title">
      <header class="modal__head">
        <span id="sess-detail-title" class="modal__title">登录详情</span>
        <!-- 单号只是索引：等宽小字贴在标题后，不和标题抢字号 -->
        <span class="sess-id mono">#{{ row.id }}</span>
        <span class="tag" :class="row.status === 1 ? 'tag--ok' : 'tag--off'">
          {{ row.status === 1 ? '成功' : '失败' }}
        </span>
        <button class="sess-detail__close" type="button" aria-label="关闭" @click="emit('close')">
          <X :size="16" />
        </button>
      </header>

      <div class="modal__body sess-detail__body">
        <!-- ① 概览：先给一句人话，再列字段 -->
        <section class="sess-block">
          <h3 class="sess-block__title">概览</h3>
          <p class="sess-summary">{{ describeLoginEvent(row) }}</p>
          <dl class="sess-kv">
            <div>
              <dt>时间</dt>
              <dd class="mono">{{ when(row.created_at) }}</dd>
            </div>
            <div>
              <dt>账号（{{ accountTag }}）</dt>
              <dd>
                <template v-if="row.user_status === -1 && row.prev_username"> 注销-{{ row.prev_username }} </template>
                <template v-else>{{ row.username || '—' }}</template>
              </dd>
            </div>
            <div v-if="operator">
              <dt>操作者</dt>
              <dd>
                {{ operator.name || '—' }}
                <span v-if="operator.id !== null" class="mono sess-code">#{{ operator.id }}</span>
                <span v-if="!isForeignAction" class="sess-tag-quiet">本人</span>
              </dd>
            </div>
            <div>
              <dt>事件</dt>
              <dd>
                {{ loginEventLabel(row.event) }} <span class="mono sess-code">{{ row.event }}</span>
              </dd>
            </div>
            <div>
              <dt>应用</dt>
              <dd class="mono">{{ row.app_id || '—' }}</dd>
            </div>
            <!-- 注销前邮箱只在有快照时出现：没有就说明连原名都没留住，
                 单独摆一行「邮箱 未留存」等于重复同一件事 -->
            <div v-if="row.prev_email">
              <dt>注销前邮箱</dt>
              <dd class="mono">{{ row.prev_email }}</dd>
            </div>
          </dl>

          <!-- 口径说明：不写这一行，读的人会拿它和操作日志的「操作者 / 被操作账号」
               对照，以为这里只是省略了另一半 -->
          <p class="sess-caption">
            「登录账号」是这条记录的**当事人**（谁被记录了）。多数事件当事人就是操作者本人； 被管理员踢下线这类事件不是
            —— 那时「操作者」会单独列在下面，别把两者混成一件事。
          </p>

          <!-- 说明这段只对已注销账号出现：读日志的人看到「注销-xxx」必须知道这个名字
               是从哪儿来的（它已经不在用户表里了），否则会去搜一个搜不到的账号 -->
          <p v-if="row.user_status === -1" class="sess-note">
            <template v-if="row.prev_username">
              该账号已注销：用户名与邮箱在注销执行时已从用户表清除，这里显示的是注销申请表里留存的快照；
              用户表当前记录为「{{ row.username }}」。
            </template>
            <template v-else>
              该账号已注销，且注销发生在快照留存功能上线之前 —— 注销前的用户名与邮箱已不可恢复， 只能按占位名「{{
                row.username
              }}」记录。
            </template>
          </p>
        </section>

        <!-- ② 会话：这条记录能定位到的客户端信息 -->
        <section class="sess-block">
          <h3 class="sess-block__title">会话</h3>
          <dl class="sess-kv">
            <div>
              <dt>来源 IP</dt>
              <dd class="mono">{{ row.ip || '—' }}</dd>
            </div>
            <div>
              <dt>归属地</dt>
              <!-- location 是写入方留的空列（实测 96 条全空）：显示"未解析"而不是"—"，
                   否则看不出是"没解析"还是"这条恰好在内网" -->
              <dd>{{ locationText }}</dd>
            </div>
          </dl>
          <p class="sess-ua" :title="row.user_agent">
            {{ row.user_agent || '未记录 User-Agent' }}
          </p>
        </section>

        <!-- ③ 载荷：真正回答"为什么" -->
        <section class="sess-block">
          <h3 class="sess-block__title">
            载荷
            <button
              v-if="rawPretty"
              class="sess-copy"
              type="button"
              :disabled="copyState === 'ok'"
              @click="copyPayload"
            >
              <Check v-if="copyState === 'ok'" :size="12" />
              <Copy v-else :size="12" />
              {{ copyState === 'ok' ? '已复制' : copyState === 'fail' ? '复制失败' : '复制' }}
            </button>
          </h3>

          <dl v-if="entries.length" class="sess-kv sess-kv--payload">
            <div v-for="item in entries" :key="item.key" :class="{ 'is-wide': item.multiline }">
              <dt class="mono">{{ item.key }}</dt>
              <dd :class="{ mono: true, 'is-block': item.multiline }">
                <span v-if="item.bool" class="sess-bool" :class="{ 'is-on': item.text === '是' }">
                  {{ item.text }}
                </span>
                <template v-else>{{ item.text }}</template>
              </dd>
            </div>
          </dl>

          <p v-else class="sess-empty">
            这条事件没有附带载荷（session_logs.details 为空）。事件码本身已经说明了结果， 没有更多可展开的细节。
          </p>

          <details v-if="rawPretty && entries.length" class="sess-raw">
            <summary>原始 JSON</summary>
            <pre>{{ rawPretty }}</pre>
          </details>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * 详情弹窗的视觉口径
 *
 * 这不是表单，而是一份"要快速读完的记录"：所以没有卡片、没有立体感，
 * 只靠**分节横线 + 稳定行距 + 等宽值**建立层次。任何额外的边框/底色都会在
 * 一屏里堆成噪音，反而看不出哪句是重点。
 */

/* 比默认弹窗宽一档：载荷是键值对，560px 会把值挤成竖排 */
.sess-detail {
  width: min(680px, 100%);
}

/* 单号：等宽小字贴标题，只做索引，不参与标题层级 */
.sess-id {
  font-size: 12px;
  color: var(--mauth-text-faint);
}

.sess-detail__close {
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

.sess-detail__close:hover {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

.sess-detail__body {
  gap: 16px;
  padding-bottom: 20px;
}

/* 摘要：整张弹窗最该被先读到的一句。极浅底承载，不加左侧竖条 —— 那会读成"引用块" */
.sess-summary {
  margin: 0 0 2px;
  padding: 10px 12px;
  border-radius: var(--mauth-radius-sm);
  background: color-mix(in srgb, var(--mauth-text) 4%, transparent);
  color: var(--mauth-text);
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

/*
 * 分节标题：文字 + 一条填满剩余宽度的细线
 *
 * 比原来"11px 灰色小字"更能看出段落边界：线本身承担分隔，不需要给每节加卡片。
 * `::after` 放在按钮之前（按钮不再 margin-left:auto），否则线会跑到按钮右边去。
 */
.sess-block__title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--mauth-text-mid);
}

.sess-block__title::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--mauth-border);
}

/* 注销说明：中性浅底，别用警示色 —— 注销是正常业务，不是错误 */
.sess-note {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: var(--mauth-radius-sm);
  background: color-mix(in srgb, var(--mauth-text) 3%, transparent);
  color: var(--mauth-text-soft);
  font-size: 12px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

/*
 * 口径说明（不是告警）
 *
 * 与 `.sess-note` 的区别是"要不要打断阅读"：那条是"这名字不可信，你得知道为什么"，
 * 值得一块底色；这条只是把"这里为什么没有第二个账号"讲清楚，一行淡字足够，
 * 加底色反而会和上面那条撞成两坨提示条。
 */
.sess-caption {
  margin: 10px 0 0;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--mauth-text-faint);
  overflow-wrap: anywhere;
}

.sess-code {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

/* 「本人」这类极轻标记：只做语义补充，不抢正文的注意力 */
.sess-tag-quiet {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--mauth-surface-2);
  color: var(--mauth-text-soft);
  font-size: 11px;
}

.sess-copy {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 2px;
  padding: 0 8px;
  height: 20px;
  border: 1px solid var(--mauth-border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--mauth-text-soft);
  font-size: 10.5px;
  letter-spacing: 0;
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.sess-copy:hover:not(:disabled) {
  color: var(--mauth-text);
  background: var(--mauth-hover);
}

.sess-copy:disabled {
  cursor: default;
  color: var(--mauth-success);
}

/* 键值对：窄屏自动折成一列，不被长串撑破 */
.sess-kv {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 9px 20px;
  margin: 0;
}

.sess-kv > div {
  min-width: 0;
}

.sess-kv dt {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.sess-kv dd {
  margin: 3px 0 0;
  font-size: 12.5px;
  color: var(--mauth-text);
  overflow-wrap: anywhere;
}

/*
 * 载荷：一行一个字段，像表格一样读
 *
 * 🔴 键列用 `max-content` 而不是固定 168px：定宽会把 `是`、`browser` 这种短值
 *    推到很右边，中间留一大片空白，看着像缺了内容。按内容定宽后值紧跟键。
 *    行间用极细实线分隔（不是每行一块灰底），一屏 10 个字段也不会碎成一堆色块。
 */
.sess-kv--payload {
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
}

.sess-kv--payload > div {
  display: grid;
  grid-template-columns: minmax(72px, max-content) minmax(0, 1fr);
  align-items: baseline;
  gap: 14px;
  padding: 7px 2px;
  border-bottom: 1px solid var(--mauth-border);
}

.sess-kv--payload > div:last-child {
  border-bottom: 0;
}

.sess-kv--payload > div:hover {
  background: color-mix(in srgb, var(--mauth-text) 2.5%, transparent);
}

.sess-kv--payload > div.is-wide {
  grid-template-columns: minmax(0, 1fr);
  gap: 5px;
}

.sess-kv--payload dt {
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.sess-kv--payload dd {
  margin: 0;
  font-size: 12.5px;
}

.sess-kv--payload dd.is-block {
  white-space: pre-wrap;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--mauth-text-mid);
}

/* 布尔值：胶囊。扫一列时"是/否"的形状比两个汉字更快被认出来 */
.sess-bool {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mauth-text) 7%, transparent);
  color: var(--mauth-text-mid);
  font-size: 11px;
  font-weight: 600;
}

.sess-bool.is-on {
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
}

/* User-Agent：最长的一条无关信息，压到两行以内，完整内容看 title */
.sess-ua {
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

/* 原始 JSON 折叠起来：展开段已经能读懂，原文只在"要贴给后端"时才需要 */
.sess-raw {
  margin-top: 12px;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.sess-raw summary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  cursor: pointer;
  user-select: none;
  transition: color 0.16s var(--ease);
}

.sess-raw summary:hover {
  color: var(--mauth-text);
}

.sess-raw pre {
  margin: 8px 0 0;
  padding: 12px;
  max-height: 240px;
  overflow: auto;
  border-radius: var(--mauth-radius-sm);
  background: color-mix(in srgb, var(--mauth-text) 4%, transparent);
  color: var(--mauth-text-mid);
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.6;
  white-space: pre;
}

.sess-empty {
  margin: 0;
  padding: 12px;
  border-radius: var(--mauth-radius-sm);
  background: color-mix(in srgb, var(--mauth-text) 3%, transparent);
  color: var(--mauth-text-faint);
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 560px) {
  .sess-kv--payload > div {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
}
</style>
