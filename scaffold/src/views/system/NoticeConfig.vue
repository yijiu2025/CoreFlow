<script setup lang="ts">
/**
 * 通知中心（管理页）
 *
 * 四个页签是同一份配置的四个切面，不拆成四个路由：渠道 → 模板 → 事件订阅 → 记录
 * 是一条"配好之后怎么发、发没发出去"的直线，拆开会让运维在菜单里来回跳。
 *
 * 页面不写死宽度，交给外层 `.page`；表格列的宽度用 `<colgroup>` 钉住，
 * 内容长了省略号收口（与 `views/system/Apps.vue` 同一套规则）。
 *
 * 渠道清单与字段全部来自 `/notice/v1/channels`（后端常量）：这里只负责把
 * `field.type` 映射成控件，不维护第二份渠道名单。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { FileText, MailCheck, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next';
import AppSwitch from '@/components/ui/AppSwitch.vue';
import { useToastStore } from '@/stores/toast';
import { useConfirmStore } from '@/stores/confirm';
import {
  createNoticeTemplate,
  getNoticeChannelConfig,
  getNoticeChannels,
  getNoticeEvents,
  listNoticeLogs,
  listNoticeTemplates,
  removeNoticeTemplate,
  saveNoticeChannelConfig,
  saveNoticeEventSubscriptions,
  testNoticeEmail,
  updateNoticeTemplate
} from '@/api/notice-center';
import type {
  NoticeChannel,
  NoticeEvent,
  NoticeLogRow,
  NoticeTemplate,
  NoticeTemplateInput
} from '@/api/notice-center';

type TabKey = 'channels' | 'templates' | 'events' | 'logs';

const toast = useToastStore();
const confirm = useConfirmStore();

/** 页签：顺序即配置顺序 */
const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'channels', label: '渠道配置' },
  { key: 'templates', label: '模板' },
  { key: 'events', label: '事件订阅' },
  { key: 'logs', label: '发送记录' }
];
const tab = ref<TabKey>('channels');
const refreshing = ref(false);

/* ── 渠道 ─────────────────────────────────────────────────── */

const channels = ref<NoticeChannel[]>([]);
const activeChannel = ref('email');
const configForm = reactive<Record<string, string | number | boolean | null>>({});
const configLoading = ref(false);
const savingConfig = ref(false);
const testTarget = ref('');
const testing = ref(false);

/** 当前渠道定义（未加载完时为 null，模板里据此渲染空态） */
const activeChannelMeta = computed(() => channels.value.find(channel => channel.id === activeChannel.value) || null);

/** 字段值 → 输入框可用的字符串 */
function fieldValue(key: string): string {
  const value = configForm[key];
  return value === null || value === undefined ? '' : String(value);
}

/** 写入字段（数字也先存字符串，由后端按字段声明还原） */
function setField(key: string, value: string | boolean): void {
  configForm[key] = value;
}

/** 渠道名（模板 / 记录里显示中文） */
function channelLabel(id: string): string {
  return channels.value.find(channel => channel.id === id)?.label || id;
}

/* ── 模板 ─────────────────────────────────────────────────── */

const templates = ref<NoticeTemplate[]>([]);
const templateFilter = ref('');
const templateDialog = ref(false);
const editingTemplateId = ref<number | null>(null);
const templateForm = reactive({
  code: '',
  name: '',
  channel: 'email',
  subject: '',
  body: '',
  variablesText: '',
  enabled: true
});

/* ── 事件订阅 ─────────────────────────────────────────────── */

const events = ref<NoticeEvent[]>([]);
const eventChannels = ref<Array<{ id: string; label: string; implemented: boolean }>>([]);
const dirtyEvents = ref<Set<string>>(new Set());
const savingEvents = ref(false);

/* ── 发送记录 ─────────────────────────────────────────────── */

const logs = ref<NoticeLogRow[]>([]);
const logTotal = ref(0);
const logStatus = ref<'' | 'sent' | 'failed'>('');
const logPage = ref(1);
const LOG_PAGE_SIZE = 20;
const logsLoading = ref(false);

/** 日志总页数（空集时仍是 1，避免"第 0 / 0 页"） */
const logPages = computed(() => Math.max(1, Math.ceil(logTotal.value / LOG_PAGE_SIZE)));

/** 时间显示（后端给 ISO，转本地格式；解析失败原样返回） */
function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

/* ── 加载 ─────────────────────────────────────────────────── */

let channelsLoaded = false;

/** 渠道清单（只拉一次；刷新按钮会强制重拉） */
async function loadChannels(force = false): Promise<void> {
  if (channelsLoaded && !force) return;
  channels.value = await getNoticeChannels();
  channelsLoaded = true;
  if (!channels.value.some(channel => channel.id === activeChannel.value) && channels.value[0]) {
    activeChannel.value = channels.value[0].id;
  }
}

/** 某渠道的配置 */
async function loadConfig(type: string): Promise<void> {
  configLoading.value = true;
  try {
    const config = await getNoticeChannelConfig(type);
    for (const key of Object.keys(configForm)) delete configForm[key];
    Object.assign(configForm, config);
  } catch (err) {
    toast.push(err instanceof Error ? err.message : '配置加载失败');
  } finally {
    configLoading.value = false;
  }
}

/** 模板列表 */
async function loadTemplates(): Promise<void> {
  try {
    const res = await listNoticeTemplates(templateFilter.value || undefined);
    templates.value = res.rows;
  } catch (err) {
    toast.push(err instanceof Error ? err.message : '模板加载失败');
  }
}

/** 事件清单 + 全局订阅 */
async function loadEvents(): Promise<void> {
  try {
    const res = await getNoticeEvents();
    events.value = res.events;
    eventChannels.value = res.channels;
    dirtyEvents.value = new Set();
  } catch (err) {
    toast.push(err instanceof Error ? err.message : '事件加载失败');
  }
}

/** 发送记录 */
async function loadLogs(): Promise<void> {
  logsLoading.value = true;
  try {
    const res = await listNoticeLogs({
      status: logStatus.value === '' ? undefined : logStatus.value,
      pageNum: logPage.value,
      pageSize: LOG_PAGE_SIZE
    });
    logs.value = res.rows;
    logTotal.value = res.total;
  } catch (err) {
    toast.push(err instanceof Error ? err.message : '记录加载失败');
  } finally {
    logsLoading.value = false;
  }
}

/** 当前页签刷新 */
async function refreshCurrent(): Promise<void> {
  refreshing.value = true;
  try {
    if (tab.value === 'channels') await Promise.all([loadChannels(true), loadConfig(activeChannel.value)]);
    else if (tab.value === 'templates') await loadTemplates();
    else if (tab.value === 'events') await loadEvents();
    else await loadLogs();
  } finally {
    refreshing.value = false;
  }
}

/* ── 渠道操作 ─────────────────────────────────────────────── */

/** 切换渠道：先清空旧表单再拉新配置，避免上一个渠道的字段串进来 */
async function selectChannel(id: string): Promise<void> {
  if (activeChannel.value === id) return;
  activeChannel.value = id;
  for (const key of Object.keys(configForm)) delete configForm[key];
  await loadConfig(id);
}

/** 保存渠道配置 */
async function saveConfig(): Promise<void> {
  savingConfig.value = true;
  try {
    await saveNoticeChannelConfig(activeChannel.value, { ...configForm });
    toast.push('配置已保存');
  } catch (err) {
    toast.push(err instanceof Error ? err.message : '保存失败');
  } finally {
    savingConfig.value = false;
  }
}

/** 发送测试邮件 */
async function sendTest(): Promise<void> {
  const email = testTarget.value.trim();
  if (!email) {
    toast.push('请填写接收测试邮件的邮箱');
    return;
  }
  testing.value = true;
  try {
    await testNoticeEmail(email);
    toast.push('测试邮件已发出，请查收');
  } catch (err) {
    toast.push(err instanceof Error ? err.message : '发送失败');
  } finally {
    testing.value = false;
  }
}

/* ── 模板操作 ─────────────────────────────────────────────── */

/** 打开新建 */
function openCreateTemplate(): void {
  editingTemplateId.value = null;
  Object.assign(templateForm, {
    code: '',
    name: '',
    channel: activeChannel.value,
    subject: '',
    body: '',
    variablesText: '',
    enabled: true
  });
  templateDialog.value = true;
}

/** 打开编辑 */
function openEditTemplate(template: NoticeTemplate): void {
  editingTemplateId.value = template.id;
  Object.assign(templateForm, {
    code: template.code,
    name: template.name,
    channel: template.channel,
    subject: template.subject || '',
    body: template.body,
    variablesText: (template.variables || []).join(', '),
    enabled: template.enabled
  });
  templateDialog.value = true;
}

/** 变量输入（逗号/空格/中文逗号分隔） → 数组 */
function parseVariables(): string[] {
  return [...new Set(templateForm.variablesText.split(/[,\s，]+/).map(item => item.trim()).filter(Boolean))];
}

/** 保存模板 */
async function submitTemplate(): Promise<void> {
  if (!templateForm.code.trim() || !templateForm.name.trim()) {
    toast.push('编码与名称都要填');
    return;
  }
  if (!templateForm.body.trim()) {
    toast.push('正文不能为空');
    return;
  }

  const payload: NoticeTemplateInput = {
    code: templateForm.code.trim(),
    name: templateForm.name.trim(),
    channel: templateForm.channel,
    subject: templateForm.subject.trim() || null,
    body: templateForm.body,
    variables: parseVariables(),
    enabled: templateForm.enabled
  };

  try {
    if (editingTemplateId.value) {
      await updateNoticeTemplate(editingTemplateId.value, payload);
      toast.push('模板已保存');
    } else {
      await createNoticeTemplate(payload);
      toast.push('模板已创建');
    }
    templateDialog.value = false;
    await loadTemplates();
  } catch (err) {
    // 变量未声明等校验错误由后端给出可直接展示的中文消息
    toast.push(err instanceof Error ? err.message : '保存失败');
  }
}

/** 删除模板 */
async function removeTemplate(template: NoticeTemplate): Promise<void> {
  const ok = await confirm.ask({
    title: '删除模板',
    message: `确认删除模板「${template.name}」？删除后该事件会回落到兜底正文。`,
    confirmText: '删除',
    danger: true
  });
  if (!ok) return;
  try {
    await removeNoticeTemplate(template.id);
    toast.push('已删除');
    await loadTemplates();
  } catch (err) {
    toast.push(err instanceof Error ? err.message : '删除失败');
  }
}

/* ── 事件订阅 ─────────────────────────────────────────────── */

/** 切换某事件的渠道默认值（只标脏，点保存才落库） */
function toggleEvent(event: NoticeEvent, channel: string, value: boolean): void {
  event.subscriptions[channel] = value;
  const next = new Set(dirtyEvents.value);
  next.add(event.code);
  dirtyEvents.value = next;
}

/** 是否已有未保存的订阅修改 */
const hasDirtyEvents = computed(() => dirtyEvents.value.size > 0);

/** 保存全部变更的事件（逐事件提交，任一失败即停止并保留未保存标记） */
async function saveEvents(): Promise<void> {
  const codes = [...dirtyEvents.value];
  if (codes.length === 0) return;
  savingEvents.value = true;
  try {
    for (const code of codes) {
      const event = events.value.find(item => item.code === code);
      if (!event) continue;
      const updated = await saveNoticeEventSubscriptions(code, { ...event.subscriptions });
      const index = events.value.findIndex(item => item.code === code);
      if (index >= 0) events.value[index] = { ...events.value[index], subscriptions: updated.subscriptions };
      dirtyEvents.value.delete(code);
    }
    dirtyEvents.value = new Set(dirtyEvents.value);
    toast.push('订阅已保存');
  } catch (err) {
    toast.push(err instanceof Error ? err.message : '保存失败');
  } finally {
    savingEvents.value = false;
  }
}

/* ── 日志操作 ─────────────────────────────────────────────── */

/** 状态筛选变化：回到第一页再查 */
function resetLogPage(): void {
  logPage.value = 1;
  void loadLogs();
}

/** 翻页 */
function gotoLogPage(page: number): void {
  const target = Math.min(Math.max(page, 1), logPages.value);
  if (target === logPage.value) return;
  logPage.value = target;
  void loadLogs();
}

/* ── 生命周期 ─────────────────────────────────────────────── */

watch(tab, key => {
  if (key === 'templates') void loadTemplates();
  else if (key === 'events') void loadEvents();
  else if (key === 'logs') void loadLogs();
  else void loadConfig(activeChannel.value);
});

onMounted(async () => {
  try {
    await loadChannels();
    await loadConfig(activeChannel.value);
  } catch (err) {
    toast.push(err instanceof Error ? err.message : '通知配置加载失败');
  }
});
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">通知中心</h2>
      <span class="page__sub">渠道、模板、事件订阅与发送记录</span>
    </div>

    <div class="filterbar">
      <div class="tabbar">
        <button
          v-for="item in tabs"
          :key="item.key"
          class="tab"
          :class="{ 'is-on': tab === item.key }"
          type="button"
          @click="tab = item.key"
        >
          {{ item.label }}
        </button>
      </div>
      <div class="filterbar__actions">
        <button class="btn btn--sm" type="button" :disabled="refreshing" @click="refreshCurrent">
          <RefreshCw :size="15" :class="{ 'is-spinning': refreshing }" /> 刷新
        </button>
      </div>
    </div>

    <!-- 渠道配置 -->
    <section v-if="tab === 'channels'" class="panel notice-split">
      <aside class="notice-channels">
        <button
          v-for="channel in channels"
          :key="channel.id"
          class="notice-channel"
          :class="{ 'is-on': channel.id === activeChannel }"
          type="button"
          @click="selectChannel(channel.id)"
        >
          <span class="notice-channel__name">{{ channel.label }}</span>
          <span :class="['tag', channel.implemented ? 'tag--ok' : 'tag--off']">
            {{ channel.implemented ? '已接入' : '待接入' }}
          </span>
        </button>
        <p v-if="channels.length === 0" class="notice-channels__empty">正在加载渠道…</p>
      </aside>

      <div class="notice-detail">
        <header class="panel__head">
          <span class="panel__title">{{ activeChannelMeta?.label || '渠道配置' }}</span>
          <span class="notice-note">{{ activeChannelMeta?.description }}</span>
        </header>

        <div class="panel__body">
          <p v-if="configLoading" class="notice-state">正在加载配置…</p>

          <form v-else class="notice-form" @submit.prevent="saveConfig">
            <div v-for="field in activeChannelMeta?.fields || []" :key="field.key" class="field">
              <span class="field__label">
                {{ field.label }}<span v-if="field.required" class="field__required">*</span>
              </span>

              <AppSwitch
                v-if="field.type === 'boolean'"
                :model-value="Boolean(configForm[field.key])"
                :label="field.label"
                @update:model-value="value => setField(field.key, value)"
              />

              <select
                v-else-if="field.type === 'select'"
                class="select"
                :value="fieldValue(field.key)"
                :aria-label="field.label"
                @change="setField(field.key, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">请选择</option>
                <option v-for="option in field.options || []" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>

              <input
                v-else
                class="input"
                :type="field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'"
                :value="fieldValue(field.key)"
                :placeholder="field.placeholder || ''"
                :aria-label="field.label"
                @input="setField(field.key, ($event.target as HTMLInputElement).value)"
              />

              <span v-if="field.hint" class="field__hint">{{ field.hint }}</span>
            </div>

            <div class="notice-form__actions">
              <button class="btn btn--primary" type="submit" :disabled="savingConfig">保存配置</button>
              <span v-if="activeChannelMeta && !activeChannelMeta.implemented" class="notice-warn">
                该渠道尚未接入：配置会保存，但发送时按「通道未接入」记失败
              </span>
            </div>
          </form>

          <div v-if="activeChannel === 'email'" class="notice-test">
            <span class="notice-test__title">发送测试邮件</span>
            <div class="notice-test__row">
              <input v-model="testTarget" class="input" type="email" placeholder="接收测试邮件的邮箱" />
              <button class="btn btn--sm" type="button" :disabled="testing" @click="sendTest">
                <MailCheck :size="15" /> 发送
              </button>
            </div>
            <span class="field__hint">使用当前已保存的 SMTP 配置；先保存再测试。</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 模板 -->
    <section v-else-if="tab === 'templates'" class="panel">
      <header class="panel__head">
        <span class="panel__title">模板</span>
        <span class="notice-note">编码建议与事件一致（如 user.created）；多渠道并存时用 user.created.email 区分</span>
        <div class="filterbar__actions">
          <select v-model="templateFilter" class="select notice-filter" @change="loadTemplates">
            <option value="">全部渠道</option>
            <option v-for="channel in channels" :key="channel.id" :value="channel.id">{{ channel.label }}</option>
          </select>
          <button class="btn btn--primary btn--sm" type="button" @click="openCreateTemplate">
            <Plus :size="15" /> 新建模板
          </button>
        </div>
      </header>

      <div class="table-wrap">
        <table class="table">
          <colgroup>
            <col style="width: 22%" />
            <col style="width: 18%" />
            <col style="width: 12%" />
            <col style="width: 10%" />
            <col style="width: 24%" />
            <col style="width: 14%" />
          </colgroup>
          <thead>
            <tr>
              <th>编码</th>
              <th>名称</th>
              <th>渠道</th>
              <th>状态</th>
              <th>变量</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="template in templates" :key="template.id">
              <td class="mono" :title="template.code">{{ template.code }}</td>
              <td :title="template.name">{{ template.name }}</td>
              <td>{{ channelLabel(template.channel) }}</td>
              <td>
                <span :class="['tag', template.enabled ? 'tag--ok' : 'tag--off']">
                  {{ template.enabled ? '启用' : '停用' }}
                </span>
              </td>
              <td :title="(template.variables || []).join(', ')">
                {{ (template.variables || []).join(', ') || '—' }}
              </td>
              <td class="col-actions">
                <button
                  class="btn btn--ghost btn--sm btn--icon"
                  type="button"
                  title="编辑模板"
                  aria-label="编辑模板"
                  @click="openEditTemplate(template)"
                >
                  <Pencil :size="15" />
                </button>
                <button
                  class="btn btn--ghost btn--sm btn--icon notice-danger"
                  type="button"
                  title="删除模板"
                  aria-label="删除模板"
                  @click="removeTemplate(template)"
                >
                  <Trash2 :size="15" />
                </button>
              </td>
            </tr>
            <tr v-if="templates.length === 0">
              <td colspan="6" class="table-empty-cell">
                <div class="table-empty">
                  <FileText :size="24" aria-hidden="true" />
                  <p class="table-empty__title">还没有模板</p>
                  <span class="table-empty__sub">新建后投递会按「事件编码 + 渠道」匹配；没有模板时使用兜底正文</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 事件订阅 -->
    <section v-else-if="tab === 'events'" class="panel">
      <header class="panel__head">
        <span class="panel__title">事件默认订阅</span>
        <span class="notice-note">这里是「用户没设置过」时的默认值；个人设置优先</span>
        <div class="filterbar__actions">
          <button class="btn btn--primary btn--sm" type="button" :disabled="!hasDirtyEvents || savingEvents" @click="saveEvents">
            保存订阅
          </button>
        </div>
      </header>

      <div class="table-wrap">
        <table class="table">
          <colgroup>
            <col style="width: 22%" />
            <col v-for="channel in eventChannels" :key="channel.id" style="width: 9%" />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>事件</th>
              <th v-for="channel in eventChannels" :key="channel.id">
                {{ channel.label }}
                <span v-if="!channel.implemented" class="tag tag--off notice-tag-inline">待接入</span>
              </th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="event in events" :key="event.code">
              <td>
                <span class="notice-event__label">{{ event.label }}</span>
                <span class="mono notice-event__code">{{ event.code }}</span>
              </td>
              <td v-for="channel in eventChannels" :key="channel.id">
                <AppSwitch
                  :model-value="Boolean(event.subscriptions[channel.id])"
                  :label="`${event.label} / ${channel.label}`"
                  @update:model-value="value => toggleEvent(event, channel.id, value)"
                />
              </td>
              <td class="notice-event__desc" :title="event.description">{{ event.description }}</td>
            </tr>
            <tr v-if="events.length === 0">
              <td :colspan="eventChannels.length + 2" class="table-empty-cell">
                <div class="table-empty">
                  <FileText :size="24" aria-hidden="true" />
                  <p class="table-empty__title">事件清单为空</p>
                  <span class="table-empty__sub">事件由代码常量声明（src/app/notice/constants.js），请检查后端是否已更新</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 发送记录 -->
    <section v-else class="panel">
      <header class="panel__head">
        <span class="panel__title">发送记录</span>
        <span class="notice-note">共 {{ logTotal }} 条；失败原因见「错误」列</span>
        <div class="filterbar__actions">
          <select v-model="logStatus" class="select notice-filter" @change="resetLogPage">
            <option value="">全部状态</option>
            <option value="sent">成功</option>
            <option value="failed">失败</option>
          </select>
        </div>
      </header>

      <div class="table-wrap">
        <table class="table">
          <colgroup>
            <col style="width: 16%" />
            <col style="width: 16%" />
            <col style="width: 10%" />
            <col style="width: 20%" />
            <col style="width: 10%" />
            <col style="width: 28%" />
          </colgroup>
          <thead>
            <tr>
              <th>时间</th>
              <th>事件</th>
              <th>渠道</th>
              <th>接收人</th>
              <th>状态</th>
              <th>错误</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in logs" :key="log.id">
              <td class="mono">{{ formatTime(log.createdAt) }}</td>
              <td :title="`${log.eventLabel}（${log.eventCode}）`">{{ log.eventLabel }}</td>
              <td>{{ log.channelLabel }}</td>
              <td :title="log.target || ''">{{ log.target || '—' }}</td>
              <td>
                <span :class="['tag', log.status === 'sent' ? 'tag--ok' : 'tag--off']">
                  {{ log.status === 'sent' ? '成功' : '失败' }}
                </span>
              </td>
              <td class="notice-log__error" :title="log.error || ''">{{ log.error || '—' }}</td>
            </tr>
            <tr v-if="!logsLoading && logs.length === 0">
              <td colspan="6" class="table-empty-cell">
                <div class="table-empty">
                  <FileText :size="24" aria-hidden="true" />
                  <p class="table-empty__title">没有发送记录</p>
                  <span class="table-empty__sub">投递成功或失败都会在这里留痕；切换筛选条件试试</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer class="notice-pager">
        <span class="notice-note">第 {{ logPage }} / {{ logPages }} 页</span>
        <div class="notice-pager__actions">
          <button class="btn btn--sm" type="button" :disabled="logPage <= 1 || logsLoading" @click="gotoLogPage(logPage - 1)">
            上一页
          </button>
          <button
            class="btn btn--sm"
            type="button"
            :disabled="logPage >= logPages || logsLoading"
            @click="gotoLogPage(logPage + 1)"
          >
            下一页
          </button>
        </div>
      </footer>
    </section>

    <!-- 模板弹窗 -->
    <div v-if="templateDialog" class="modal-mask" @click.self="templateDialog = false">
      <div class="modal modal--md" role="dialog" aria-modal="true" aria-label="模板编辑">
        <header class="modal__head">
          <span class="modal__title">{{ editingTemplateId ? '编辑模板' : '新建模板' }}</span>
        </header>

        <div class="modal__body">
          <div class="notice-form__grid">
            <div class="field">
              <span class="field__label">编码<span class="field__required">*</span></span>
              <input v-model="templateForm.code" class="input mono" type="text" placeholder="user.created" />
              <span class="field__hint">建议与事件编码一致；多渠道时用「事件编码.渠道」</span>
            </div>
            <div class="field">
              <span class="field__label">名称<span class="field__required">*</span></span>
              <input v-model="templateForm.name" class="input" type="text" placeholder="用户创建通知" />
            </div>
            <div class="field">
              <span class="field__label">渠道</span>
              <select v-model="templateForm.channel" class="select">
                <option v-for="channel in channels" :key="channel.id" :value="channel.id">
                  {{ channel.label }}{{ channel.implemented ? '' : '（待接入）' }}
                </option>
              </select>
            </div>
            <div class="field">
              <span class="field__label">状态</span>
              <div class="notice-switch-row">
                <AppSwitch v-model="templateForm.enabled" label="启用模板" />
                <span class="field__hint">停用后投递回落到兜底正文</span>
              </div>
            </div>
          </div>

          <div class="field">
            <span class="field__label">标题</span>
            <input v-model="templateForm.subject" class="input" type="text" placeholder="邮件主题；其他渠道可留空" />
          </div>

          <div class="field">
            <span class="field__label">正文<span class="field__required">*</span></span>
            <textarea
              v-model="templateForm.body"
              class="input notice-textarea"
              placeholder="支持 HTML；变量写作双花括号包裹的名称，例如 name"
            />
          </div>

          <div class="field">
            <span class="field__label">变量声明</span>
            <input v-model="templateForm.variablesText" class="input mono" type="text" placeholder="name, link, code" />
            <span class="field__hint">逗号分隔；正文里出现的每个变量都必须在这里声明，否则保存会被拒绝</span>
          </div>
        </div>

        <footer class="modal__foot">
          <button class="btn btn--ghost" type="button" @click="templateDialog = false">取消</button>
          <button class="btn btn--primary" type="button" @click="submitTemplate">保存</button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── 渠道：左列表 + 右表单 ───────────────────────────────── */
.notice-split {
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
}

.notice-channels {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px;
  border-right: 1px solid var(--mauth-border);
  background: color-mix(in srgb, var(--mauth-surface-2) 42%, var(--mauth-surface));
}

.notice-channels__empty {
  margin: 8px 6px;
  color: var(--mauth-text-soft);
  font-size: 12px;
}

.notice-channel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--mauth-radius-sm);
  background: none;
  color: var(--mauth-text-mid);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s var(--ease);
}

.notice-channel:hover {
  background: var(--mauth-hover);
}

.notice-channel.is-on {
  background: var(--mauth-surface);
  color: var(--mauth-primary);
  font-weight: 600;
  box-shadow: inset 0 0 0 1px var(--mauth-border);
}

.notice-channel__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notice-detail {
  min-width: 0;
}

.notice-detail > .panel__head {
  border-top: 0;
}

/* 表单两列：字段少时一屏看完；窄屏收成一列 */
.notice-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 18px;
}

.notice-form > .field {
  margin: 0;
}

.notice-form__actions {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 4px;
}

.notice-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 18px;
}

.notice-switch-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.notice-state {
  margin: 0;
  padding: 28px 0;
  color: var(--mauth-text-soft);
  font-size: 12.5px;
  text-align: center;
}

.notice-warn {
  color: var(--mauth-danger);
  font-size: 12px;
  line-height: 1.5;
}

.notice-note {
  color: var(--mauth-text-soft);
  font-size: 12px;
  line-height: 1.5;
}

.notice-filter {
  width: 140px;
}

/* 测试邮件：与配置表单拉开距离，避免误点保存 */
.notice-test {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid var(--mauth-border);
}

.notice-test__title {
  font-size: 13px;
  font-weight: 600;
}

.notice-test__row {
  display: flex;
  gap: 8px;
  max-width: 560px;
}

/* 按钮不参与压缩：图标 + 两个汉字被 flex 一挤就会竖排 */
.notice-test__row .btn {
  flex: none;
  white-space: nowrap;
}

.notice-test__row .input {
  flex: 1 1 auto;
}

/* 表格里的次要信息：事件名 + 编码两行 */
.notice-event__label {
  display: block;
  font-size: 13px;
}

.notice-event__code {
  display: block;
  margin-top: 1px;
  color: var(--mauth-text-faint);
  font-size: 10.5px;
}

.notice-event__desc {
  color: var(--mauth-text-soft);
  font-size: 12px;
}

.notice-tag-inline {
  margin-left: 4px;
  height: 18px;
  padding: 0 5px;
  font-size: 10px;
}

.notice-log__error {
  color: var(--mauth-danger);
  font-size: 12px;
}

.notice-danger {
  color: var(--mauth-danger);
}

.notice-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 16px 12px;
  border-top: 1px solid var(--mauth-border);
}

.notice-pager__actions {
  display: flex;
  gap: 6px;
}

.notice-textarea {
  height: 150px;
  padding: 8px 10px;
  line-height: 1.6;
  resize: vertical;
}

.is-spinning {
  animation: notice-spin 0.9s linear infinite;
}

@keyframes notice-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 表格空态：与 UserProfileDrawer 的 .table-empty 同构（scoped，故在此复制） */
.table-empty-cell {
  padding: 0 !important;
  background: color-mix(in srgb, var(--mauth-surface-2) 42%, var(--mauth-surface));
}

.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 32px 16px;
  color: var(--mauth-text-faint);
  text-align: center;
}

.table-empty__title {
  margin: 6px 0 0;
  color: var(--mauth-text-mid);
  font-size: 13px;
  font-weight: 600;
}

.table-empty__sub {
  max-width: 46ch;
  color: var(--mauth-text-soft);
  font-size: 11.5px;
  line-height: 1.5;
}

@media (max-width: 860px) {
  .notice-split {
    grid-template-columns: 1fr;
  }

  .notice-channels {
    flex-direction: row;
    flex-wrap: wrap;
    border-right: 0;
    border-bottom: 1px solid var(--mauth-border);
  }

  .notice-form,
  .notice-form__grid {
    grid-template-columns: 1fr;
  }

  .notice-filter {
    width: 100%;
  }
}
</style>
