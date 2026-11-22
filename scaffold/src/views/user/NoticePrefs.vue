<script setup lang="ts">
/**
 * 个人通知偏好
 *
 * 每个人自己决定"哪个事件、走哪个渠道、什么时段别打扰"。页面只调两个接口：
 * `GET/PUT /notice/v1/preferences` —— 用户身份由后端从会话取，前端不传 userId。
 *
 * 矩阵里没保存过的格子显示的是**生效值**（全局订阅/事件默认），不是 false：
 * 把"未设置"画成关闭会让用户以为通知默认全关。
 *
 * 未接入的渠道整列禁用并标注「待接入」：能打开却永远发不出去，比不能打开更糟。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { onMounted, reactive, ref } from 'vue';
import { BellOff, RefreshCw } from 'lucide-vue-next';
import AppSwitch from '@/components/ui/AppSwitch.vue';
import PersonalPage from '@/components/business/PersonalPage.vue';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';

/** 能不能跳去管理侧的通知中心（只有持 notice:config:read 的人才有这个页面） */
const auth = useAuthStore();
import { getNoticePreferences, saveNoticePreferences } from '@/api/notice-center';
import type { NoticePreferenceEvent } from '@/api/notice-center';

const toast = useToastStore();

/** 渠道列（只含渲染矩阵需要的字段） */
const channels = ref<Array<{ id: string; label: string; implemented: boolean }>>([]);
/** 事件行 */
const events = ref<NoticePreferenceEvent[]>([]);
/** 开关状态：`eventCode|channel` → 是否接收 */
const matrix = reactive<Record<string, boolean>>({});
/** 免打扰时段（HH:MM；空串表示不限制） */
const quietFrom = ref('');
const quietTo = ref('');
const loading = ref(false);
const saving = ref(false);

/** 矩阵键 */
function keyOf(eventCode: string, channel: string): string {
  return `${eventCode}|${channel}`;
}

/** 某格当前值 */
function enabledOf(eventCode: string, channel: string): boolean {
  return Boolean(matrix[keyOf(eventCode, channel)]);
}

/** 写某格 */
function setEnabled(eventCode: string, channel: string, value: boolean): void {
  matrix[keyOf(eventCode, channel)] = value;
}

/** 清空免打扰时段 */
function clearQuiet(): void {
  quietFrom.value = '';
  quietTo.value = '';
}

/** 加载偏好 + 目录 */
async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await getNoticePreferences();
    channels.value = res.channels;
    events.value = res.events;

    for (const key of Object.keys(matrix)) delete matrix[key];
    for (const row of res.rows) matrix[keyOf(row.eventCode, row.channel)] = row.enabled;

    // 免打扰时段是所有行共用的；取第一条有值的行，避免某些行被旧逻辑写成不同值
    const withQuiet = res.rows.find(row => row.quietFrom || row.quietTo);
    quietFrom.value = withQuiet?.quietFrom || '';
    quietTo.value = withQuiet?.quietTo || '';
  } catch (err) {
    toast.push(err instanceof Error ? err.message : '偏好加载失败');
  } finally {
    loading.value = false;
  }
}

/** 保存（提交完整矩阵，后端按 (user,event,channel) upsert） */
async function save(): Promise<void> {
  if (events.value.length === 0) {
    toast.push('事件清单尚未加载，暂不能保存');
    return;
  }

  const items: Array<{ eventCode: string; channel: string; enabled: boolean }> = [];
  for (const event of events.value) {
    for (const channel of channels.value) {
      items.push({
        eventCode: event.code,
        channel: channel.id,
        enabled: enabledOf(event.code, channel.id)
      });
    }
  }

  saving.value = true;
  try {
    await saveNoticePreferences({
      items,
      quietFrom: quietFrom.value || null,
      quietTo: quietTo.value || null
    });
    toast.push('偏好已保存');
  } catch (err) {
    toast.push(err instanceof Error ? err.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PersonalPage title="通知偏好" sub="选择要接收的事件与渠道，并设置免打扰时段">
    <!-- 页面级操作放右上：与「账号与安全」的新建按钮同一位置，四页一致 -->
    <template #actions>
      <button class="btn btn--sm" type="button" :disabled="loading" @click="load">
        <RefreshCw :size="15" :class="{ 'is-spinning': loading }" /> 刷新
      </button>
    </template>

    <!-- 两处「通知」的分工要说清楚，否则用户会以为这里能开关企业微信这类渠道 -->
    <p class="prefs-note prefs-scope">
      <template v-if="auth.hasPermission('notice:config:read')">
        哪些渠道可用、发什么模板，由管理员在
        <RouterLink to="/system/notice">系统管理 → 通知中心</RouterLink>
        配置；本页只决定你自己收什么。
      </template>
      <template v-else>哪些渠道可用由管理员在「系统管理 → 通知中心」配置；本页只决定你自己收什么。</template>
    </p>

    <section class="panel prefs-quiet">
      <header class="panel__head">
        <span class="panel__title">免打扰时段</span>
        <span class="prefs-note">时段内不发通知，可跨天（如 22:00–08:00）；两端相同表示不限制</span>
      </header>
      <div class="panel__body prefs-quiet__body">
        <div class="field">
          <span class="field__label">开始</span>
          <input v-model="quietFrom" class="input prefs-time" type="time" aria-label="免打扰开始时间" />
        </div>
        <span class="prefs-quiet__sep">至</span>
        <div class="field">
          <span class="field__label">结束</span>
          <input v-model="quietTo" class="input prefs-time" type="time" aria-label="免打扰结束时间" />
        </div>
        <button class="btn btn--ghost btn--sm" type="button" @click="clearQuiet">清除</button>
        <span class="field__hint">时段对所有事件生效；点击「保存偏好」后应用。</span>
      </div>
    </section>

    <section class="panel">
      <header class="panel__head">
        <span class="panel__title">事件订阅</span>
        <span class="prefs-note">未保存过的格子显示的是系统默认值；改动后点「保存偏好」</span>
      </header>

      <div class="table-wrap">
        <table class="table">
          <colgroup>
            <col style="width: 20%" />
            <!-- 渠道列给 12%：9% 在 1160 宽下只有约 104px，「企业微信 + 待接入」会被截成省略号 -->
            <col v-for="channel in channels" :key="channel.id" style="width: 12%" />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>事件</th>
              <th v-for="channel in channels" :key="channel.id">
                {{ channel.label }}
                <span v-if="!channel.implemented" class="tag tag--off prefs-tag">待接入</span>
              </th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="event in events" :key="event.code">
              <td>
                <span class="prefs-event__label">{{ event.label }}</span>
                <span class="mono prefs-event__code">{{ event.code }}</span>
              </td>
              <td v-for="channel in channels" :key="channel.id">
                <AppSwitch
                  :model-value="enabledOf(event.code, channel.id)"
                  :disabled="!channel.implemented"
                  :label="`${event.label} / ${channel.label}`"
                  @update:model-value="value => setEnabled(event.code, channel.id, value)"
                />
              </td>
              <td class="prefs-event__desc" :title="event.description">{{ event.description }}</td>
            </tr>
            <tr v-if="!loading && events.length === 0">
              <td :colspan="channels.length + 2" class="table-empty-cell">
                <div class="table-empty">
                  <BellOff :size="24" aria-hidden="true" />
                  <p class="table-empty__title">暂无可订阅的事件</p>
                  <span class="table-empty__sub">事件由系统预置；如果这里是空的，请稍后再试或联系管理员</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer class="prefs-foot">
        <span class="prefs-note">共 {{ events.length }} 个事件 × {{ channels.length }} 个渠道</span>
        <button class="btn btn--primary" type="button" :disabled="saving || loading" @click="save">保存偏好</button>
      </footer>
    </section>
  </PersonalPage>
</template>

<style scoped>
.prefs-note {
  color: var(--mauth-text-soft);
  font-size: 12px;
  line-height: 1.5;
}

.prefs-scope {
  margin: 0 0 12px;
}

.prefs-scope a {
  color: var(--mauth-primary);
  text-decoration: none;
}

.prefs-scope a:hover {
  text-decoration: underline;
}

.prefs-quiet {
  margin-bottom: 12px;
}

.prefs-quiet__body {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.prefs-quiet__sep {
  padding-bottom: 9px;
  color: var(--mauth-text-soft);
  font-size: 12px;
}

.prefs-time {
  width: 150px;
}

.prefs-event__label {
  display: block;
  font-size: 13px;
}

.prefs-event__code {
  display: block;
  margin-top: 1px;
  color: var(--mauth-text-faint);
  font-size: 10.5px;
}

.prefs-event__desc {
  color: var(--mauth-text-soft);
  font-size: 12px;
}

.prefs-tag {
  margin-left: 4px;
  height: 18px;
  padding: 0 5px;
  font-size: 10px;
}

.prefs-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--mauth-border);
}

.is-spinning {
  animation: prefs-spin 0.9s linear infinite;
}

@keyframes prefs-spin {
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

@media (max-width: 760px) {
  .prefs-time {
    width: 100%;
  }
}
</style>
