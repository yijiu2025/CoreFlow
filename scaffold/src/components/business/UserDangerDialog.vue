<script setup lang="ts">
/**
 * 账号高危操作弹窗（删除 / 注销应用账号 / 临时密码）
 *
 * 三件事都能"让别人的数据消失"或"以别人的身份进入系统"，所以统一放在一个入口里，
 * 并按同一套规矩呈现：
 * - 先说清**会发生什么**（清哪些数据、保留什么、什么时候生效、能不能撤销）；
 * - 每个动作都要**操作者自己的登录密码**（会话可能落在一台没锁屏的机器上）；
 * - 删除要**手打目标账号名**确认 —— 这一条专门防"点错行"。
 *
 * 为什么删完不立刻生效：误删不可逆，而交接期账号常被别处引用着；缓冲期内随时可撤销。
 *
 * @author yijiu2025
 * @since 2026-11-11
 */
import { computed, ref, watch } from 'vue';
import { Check, Copy, KeyRound, Loader2, ShieldAlert, Trash2, Undo2 } from 'lucide-vue-next';
import {
  cancelUserDeletion,
  deactivateUserApp,
  issueUserTempPassword,
  requestUserDeletion,
  userApps,
  userDeletion,
  userTempPasswords
} from '@/api/system';
import type { PendingKick, TempPasswordRow, UserAppRow, UserDeletionRequest } from '@/api/types';

const props = defineProps<{
  /** 目标用户（null = 关闭） */
  userId: number | null;
  username: string;
  /** 是否显示「删除账号」（仅超管） */
  canDelete: boolean;
  /** 是否显示「应用账号」（需 admin:user:deactivate） */
  canDeactivateApp: boolean;
  /** 是否显示「临时密码」（仅超管） */
  canTemp: boolean;
}>();

const emit = defineEmits<{ (e: 'close'): void; (e: 'changed'): void }>();

type Tab = 'delete' | 'apps' | 'temp';

/** 可用的页签（按权限裁剪；一个都没有时上层不会显示入口） */
const tabs = computed<Array<{ key: Tab; label: string; icon: typeof Trash2 }>>(() => {
  const list: Array<{ key: Tab; label: string; icon: typeof Trash2 }> = [];
  if (props.canDelete) list.push({ key: 'delete', label: '删除账号', icon: Trash2 });
  if (props.canDeactivateApp) list.push({ key: 'apps', label: '应用账号', icon: ShieldAlert });
  if (props.canTemp) list.push({ key: 'temp', label: '临时密码', icon: KeyRound });
  return list;
});

const tab = ref<Tab>('delete');
const loading = ref(false);
const busy = ref(false);
const errorMessage = ref('');
const notice = ref('');

/** 删除页签：操作者密码 + 手打的目标账号名 + 原因 */
const password = ref('');
const confirmUsername = ref('');
const reason = ref('');

/** 删除页签：当前待执行的申请（scope=all 的那条） */
const pendingAll = ref<UserDeletionRequest | null>(null);

/** 「会话未踢干净」的记录（注销时 Redis 不可用） */
const pendingKicks = ref<PendingKick[]>([]);

/** 应用页签 */
const appRows = ref<UserAppRow[]>([]);
/** 正在注销哪个应用（'' = 没有） */
const appTarget = ref('');
const appPassword = ref('');

/** 临时密码页签 */
const tempRows = ref<TempPasswordRow[]>([]);
const tempTtl = ref(30);
const tempUses = ref(1);
const tempReason = ref('');
/** 刚签发的明文（只在这里出现一次） */
const issued = ref<{ password: string; expiresAt: string } | null>(null);
const copied = ref(false);

/** 打开时按权限选第一个可用页签并加载数据 */
watch(
  () => props.userId,
  async id => {
    if (id === null) return;
    tab.value = tabs.value[0]?.key ?? 'delete';
    resetForms();
    await reload();
  },
  { immediate: true }
);

/**
 * 切页签时清掉上一页的临时态
 *
 * 密码框不清会让人以为"已经验过了" —— 每个高危动作都必须重新输入。
 *
 * @param next 目标页签
 */
function switchTab(next: Tab): void {
  tab.value = next;
  errorMessage.value = '';
  notice.value = '';
  password.value = '';
  appTarget.value = '';
  appPassword.value = '';
}

/**
 * 点遮罩关闭
 *
 * 提交中不关：请求已经发出，弹窗一关用户会以为没生效，然后再点一次 →
 * 第二次会撞上"已存在注销申请"的 409。
 */
function onMaskClick(): void {
  if (busy.value) return;
  emit('close');
}

/** 清空表单（关闭 / 换人时） */
function resetForms(): void {
  password.value = '';
  confirmUsername.value = '';
  reason.value = '';
  appTarget.value = '';
  appPassword.value = '';
  tempReason.value = '';
  issued.value = null;
  copied.value = false;
  errorMessage.value = '';
  notice.value = '';
}

/** 加载当前页签需要的数据 */
async function reload(): Promise<void> {
  if (props.userId === null) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    const [deletion, apps, temps] = await Promise.all([
      userDeletion(props.userId),
      props.canDeactivateApp ? userApps(props.userId) : Promise.resolve({ rows: [], total: 0 }),
      props.canTemp ? userTempPasswords(props.userId) : Promise.resolve({ rows: [], total: 0 })
    ]);
    pendingAll.value = deletion.requests.find(item => item.scope === 'all') ?? null;
    pendingKicks.value = deletion.pendingKicks ?? [];
    appRows.value = apps.rows;
    tempRows.value = temps.rows;
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

/** 时间显示（本地时区，秒级足够） */
function when(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 相对到期时间
 *
 * @param iso 到期时间
 * @returns 形如「6 天 3 小时」
 */
function untilText(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(diff)) return '—';
  if (diff <= 0) return '已到期，等待执行';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `${hours} 小时 ${minutes} 分`;
}

/** 状态标记文案（应用列表用） */
function appStateText(row: UserAppRow): string {
  const parts: string[] = [];
  if (row.authorized) parts.push('已授权');
  if (row.has_token) parts.push('有令牌');
  if (row.has_session) parts.push('在线');
  return parts.join(' · ') || '无有效凭据';
}

/**
 * 删除账号
 *
 * 成功后不关闭弹窗：要让人看清"几天后到期、从哪里撤销"。
 */
async function submitDelete(): Promise<void> {
  if (props.userId === null || busy.value) return;
  if (!password.value) {
    errorMessage.value = '请输入你自己的登录密码';
    return;
  }
  if (confirmUsername.value.trim() !== props.username) {
    errorMessage.value = '请输入该用户的登录名以确认删除';
    return;
  }
  busy.value = true;
  errorMessage.value = '';
  try {
    const res = await requestUserDeletion(props.userId, {
      password: password.value,
      confirmUsername: confirmUsername.value.trim(),
      reason: reason.value || undefined
    });
    notice.value = `已发起删除：${res.graceDays} 天后（${when(res.scheduledAt)}）正式清理，期间可撤销。该账号现在起无法登录。`;
    password.value = '';
    confirmUsername.value = '';
    reason.value = '';
    await reload();
    emit('changed');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '删除失败';
  } finally {
    busy.value = false;
  }
}

/** 撤销删除（不需要密码：它只会让账号回到正常，不会造成破坏） */
async function undoDelete(): Promise<void> {
  if (props.userId === null || !pendingAll.value || busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  try {
    await cancelUserDeletion(props.userId, pendingAll.value.id);
    notice.value = '已撤销，账号恢复正常。';
    await reload();
    emit('changed');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '撤销失败';
  } finally {
    busy.value = false;
  }
}

/** 注销某应用账号 */
async function submitAppDeactivate(): Promise<void> {
  if (props.userId === null || !appTarget.value || busy.value) return;
  if (!appPassword.value) {
    errorMessage.value = '请输入你自己的登录密码';
    return;
  }
  busy.value = true;
  errorMessage.value = '';
  try {
    const res = await deactivateUserApp(props.userId, appTarget.value, { password: appPassword.value });
    notice.value = `已发起注销：${when(res.scheduledAt)} 清理该应用数据，期间可撤销。`;
    appTarget.value = '';
    appPassword.value = '';
    await reload();
    emit('changed');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '注销失败';
  } finally {
    busy.value = false;
  }
}

/** 撤销某应用的注销申请 */
async function undoAppDeactivate(row: UserAppRow): Promise<void> {
  if (props.userId === null || !row.pending || busy.value) return;
  busy.value = true;
  try {
    await cancelUserDeletion(props.userId, row.pending.id);
    notice.value = `已撤销「${row.app_label}」的注销申请。`;
    await reload();
    emit('changed');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '撤销失败';
  } finally {
    busy.value = false;
  }
}

/** 签发临时密码 */
async function submitTempPassword(): Promise<void> {
  if (props.userId === null || busy.value) return;
  if (!password.value) {
    errorMessage.value = '请输入你自己的登录密码';
    return;
  }
  busy.value = true;
  errorMessage.value = '';
  try {
    const res = await issueUserTempPassword(props.userId, {
      password: password.value,
      ttlMinutes: tempTtl.value,
      maxUses: tempUses.value,
      reason: tempReason.value || undefined
    });
    issued.value = { password: res.password, expiresAt: res.expiresAt };
    password.value = '';
    await reload();
    emit('changed');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '生成失败';
  } finally {
    busy.value = false;
  }
}

/** 复制刚签发的明文 */
async function copyIssued(): Promise<void> {
  if (!issued.value) return;
  try {
    await navigator.clipboard.writeText(issued.value.password);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1600);
  } catch {
    errorMessage.value = '复制失败，请手动选中复制';
  }
}
</script>

<template>
  <div
    v-if="userId !== null"
    class="modal-mask"
    role="dialog"
    aria-modal="true"
    aria-labelledby="danger-title"
    @click.self="onMaskClick"
  >
    <div class="modal danger-modal">
      <div class="modal__head">
        <span class="danger-icon" aria-hidden="true"><ShieldAlert :size="16" /></span>
        <span id="danger-title" class="modal__title">账号高危操作 · {{ username }}</span>
      </div>

      <div class="danger-tabs" role="tablist">
        <button
          v-for="item in tabs"
          :key="item.key"
          type="button"
          role="tab"
          :aria-selected="tab === item.key"
          :class="['danger-tab', { 'is-on': tab === item.key }]"
          @click="switchTab(item.key)"
        >
          <component :is="item.icon" :size="13" />
          {{ item.label }}
        </button>
      </div>

      <div class="modal__body danger-body">
        <p v-if="notice" class="danger-notice">{{ notice }}</p>
        <p v-if="errorMessage" class="danger-error" role="alert">{{ errorMessage }}</p>

        <!--
          会话没踢干净：注销执行了 ≠ 清理完了。Redis 不可用时只剩 DB revoke，
          残留会话要等下次登录或定时任务补踢 —— 这状态必须让人看见。
        -->
        <div v-if="pendingKicks.length" class="danger-kick">
          <p class="danger-kick__title">还有 {{ pendingKicks.length }} 个会话未清理（Redis 不可用时的残留）</p>
          <p v-for="kick in pendingKicks" :key="kick.id" class="danger-kick__row">
            <span class="mono">
              {{ kick.scope === 'all' ? '全部应用' : kick.app_id }}
            </span>
            <span class="danger-kick__meta">
              已重试 {{ kick.attempts }} 次<template v-if="kick.last_error"> · {{ kick.last_error }}</template>
            </span>
          </p>
          <p class="danger-kick__hint">该用户下次登录时、以及每小时定时任务都会自动重试；成功后自动消失。</p>
        </div>

        <!-- ── 删除账号 ──────────────────────────────────────── -->
        <template v-if="tab === 'delete'">
          <div v-if="loading" class="danger-loading"><Loader2 class="spin" :size="14" /> 加载中…</div>

          <template v-else-if="pendingAll">
            <div class="danger-pending">
              <div class="danger-pending__title">
                待执行删除 · <span class="mono">{{ untilText(pendingAll.scheduled_at) }}</span> 后清理
              </div>
              <p class="danger-pending__sub">
                到期时间 {{ when(pendingAll.scheduled_at) }}
                <template v-if="pendingAll.requested_by_name"> · 由 {{ pendingAll.requested_by_name }} 发起</template>
                <template v-if="pendingAll.reason"> · 原因：{{ pendingAll.reason }}</template>
              </p>
              <p class="danger-pending__sub">该账号现在已无法登录；到期前随时可以撤销。</p>
              <button class="btn btn--sm" type="button" :disabled="busy" @click="undoDelete">
                <Undo2 :size="14" /> 撤销删除
              </button>
            </div>
          </template>

          <template v-else>
            <div class="danger-scope">
              <div>
                <p class="danger-scope__title">将被清除</p>
                <p class="danger-scope__text">
                  账号凭证、全部设备会话、所有应用的授权与令牌、角色与岗位关联、各应用偏好与 API Key、临时密码。
                </p>
              </div>
              <div>
                <p class="danger-scope__title">不会删除</p>
                <p class="danger-scope__text">业务内容（作品、任务、收藏、历史记录）—— 它们可能正被别人引用。</p>
              </div>
              <div>
                <p class="danger-scope__title">生效方式</p>
                <p class="danger-scope__text">立即拒登录，7 天后由定时任务正式清理；期间可撤销。</p>
              </div>
            </div>

            <label class="field">
              <span class="field__label">删除原因（可选，写入审计）</span>
              <input v-model="reason" class="input" type="text" maxlength="255" placeholder="如：员工离职、账号交接" />
            </label>

            <label class="field">
              <span class="field__label">
                输入该用户的登录名 <span class="mono danger-strong">{{ username }}</span> 以确认
              </span>
              <input v-model="confirmUsername" class="input" type="text" autocomplete="off" placeholder="手打账号名" />
            </label>

            <label class="field">
              <span class="field__label">你自己的登录密码（二次验证）</span>
              <input
                v-model="password"
                class="input"
                type="password"
                autocomplete="current-password"
                placeholder="仅用于本次校验"
              />
            </label>
          </template>
        </template>

        <!-- ── 应用账号 ──────────────────────────────────────── -->
        <template v-else-if="tab === 'apps'">
          <div v-if="loading" class="danger-loading"><Loader2 class="spin" :size="14" /> 加载中…</div>
          <template v-else>
            <p class="danger-scope__text">
              只注销该用户在某一个应用里的账号：清该应用的 OAuth 授权、令牌、会话与偏好设置，主账号与其它应用不受影响。
            </p>

            <table v-if="appRows.length" class="table danger-apps">
              <thead>
                <tr>
                  <th>应用</th>
                  <th>状态</th>
                  <th>最近活跃</th>
                  <th class="col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in appRows" :key="row.app_id">
                  <td>
                    <span class="danger-app__name">{{ row.app_label }}</span>
                    <span class="danger-app__id mono">{{ row.app_id }}</span>
                  </td>
                  <td>
                    <span v-if="row.pending" class="tag tag--warn">待注销</span>
                    <span v-else class="danger-app__state">{{ appStateText(row) }}</span>
                  </td>
                  <td class="mono danger-app__time">{{ when(row.last_active_at) }}</td>
                  <td class="col-actions">
                    <button
                      v-if="row.pending"
                      class="btn btn--ghost btn--sm"
                      type="button"
                      :disabled="busy"
                      @click="undoAppDeactivate(row)"
                    >
                      <Undo2 :size="13" /> 撤销
                    </button>
                    <button
                      v-else
                      class="btn btn--danger btn--sm"
                      type="button"
                      @click="appTarget = appTarget === row.app_id ? '' : row.app_id"
                    >
                      {{ appTarget === row.app_id ? '收起' : '注销' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else class="danger-empty">该用户没有已注册的应用账号。</p>

            <div v-if="appTarget" class="danger-confirm">
              <p class="danger-confirm__title">
                注销「{{ appRows.find(r => r.app_id === appTarget)?.app_label }}」的账号
              </p>
              <label class="field">
                <span class="field__label">你自己的登录密码（二次验证）</span>
                <input
                  v-model="appPassword"
                  class="input"
                  type="password"
                  autocomplete="current-password"
                  placeholder="仅用于本次校验"
                />
              </label>
              <button class="btn btn--danger btn--sm" type="button" :disabled="busy" @click="submitAppDeactivate">
                <Loader2 v-if="busy" class="spin" :size="13" />
                确认注销该应用
              </button>
            </div>
          </template>
        </template>

        <!-- ── 临时密码 ──────────────────────────────────────── -->
        <template v-else>
          <p class="danger-scope__text">
            生成一个短时、一次性的登录凭据：用它可以直接登录该账号，但不会改掉用户自己的密码。
            明文只在生成时显示一次，库里只留哈希；每次使用都会写审计。
          </p>

          <div v-if="issued" class="danger-secret">
            <p class="danger-secret__label">临时密码（仅显示这一次）</p>
            <div class="danger-secret__row">
              <code class="danger-secret__value mono">{{ issued.password }}</code>
              <button class="btn btn--sm" type="button" @click="copyIssued">
                <Check v-if="copied" :size="14" />
                <Copy v-else :size="14" />
                {{ copied ? '已复制' : '复制' }}
              </button>
            </div>
            <p class="danger-secret__hint">有效期至 {{ when(issued.expiresAt) }}；关闭后无法再次查看。</p>
          </div>

          <div class="danger-form-row">
            <label class="field">
              <span class="field__label">有效期（分钟）</span>
              <input v-model.number="tempTtl" class="input" type="number" min="5" max="1440" />
            </label>
            <label class="field">
              <span class="field__label">可用次数</span>
              <input v-model.number="tempUses" class="input" type="number" min="1" max="10" />
            </label>
          </div>

          <label class="field">
            <span class="field__label">用途说明（写入审计）</span>
            <input v-model="tempReason" class="input" type="text" maxlength="255" placeholder="如：排障、交接" />
          </label>

          <label class="field">
            <span class="field__label">你自己的登录密码（二次验证）</span>
            <input
              v-model="password"
              class="input"
              type="password"
              autocomplete="current-password"
              placeholder="仅用于本次校验"
            />
          </label>

          <div v-if="tempRows.length" class="danger-temps">
            <p class="danger-temps__title">当前有效的临时密码（{{ tempRows.length }}）</p>
            <p v-for="row in tempRows" :key="row.id" class="danger-temps__row">
              <span class="mono">{{ when(row.expires_at) }} 到期</span>
              <span class="danger-temps__meta">
                已用 {{ row.used_count }}/{{ row.max_uses }}
                <template v-if="row.created_by_name"> · {{ row.created_by_name }} 签发</template>
              </span>
            </p>
            <p class="danger-temps__hint">再次生成会自动作废上面这些 —— 同时存在多把钥匙没有意义。</p>
          </div>
        </template>
      </div>

      <div class="modal__foot">
        <button class="btn btn--ghost btn--sm" type="button" @click="emit('close')">关闭</button>
        <button
          v-if="tab === 'delete' && !pendingAll"
          class="btn btn--danger btn--sm"
          type="button"
          :disabled="busy || loading"
          @click="submitDelete"
        >
          <Loader2 v-if="busy" class="spin" :size="13" />
          确认删除（7 天后生效）
        </button>
        <button
          v-if="tab === 'temp'"
          class="btn btn--primary btn--sm"
          type="button"
          :disabled="busy"
          @click="submitTempPassword"
        >
          <Loader2 v-if="busy" class="spin" :size="13" />
          生成临时密码
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.danger-modal {
  width: min(640px, 100%);
}

.danger-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--mauth-radius-sm);
  background: color-mix(in srgb, #ef4444 14%, transparent);
  color: #b91c1c;
}

.danger-tabs {
  display: flex;
  gap: 4px;
  padding: 10px 18px 0;
  border-bottom: 1px solid var(--mauth-border);
}

.danger-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: var(--mauth-radius-sm) var(--mauth-radius-sm) 0 0;
  background: transparent;
  color: var(--mauth-text-mid);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.danger-tab.is-on {
  background: var(--mauth-surface-2);
  border-color: var(--mauth-border);
  color: var(--mauth-text);
  font-weight: 600;
}

.danger-body {
  gap: 12px;
  max-height: 62vh;
}

.danger-notice {
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--mauth-radius-sm);
  background: color-mix(in srgb, #10b981 12%, transparent);
  color: #047857;
  font-size: 12.5px;
  line-height: 1.6;
}

.danger-error {
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--mauth-radius-sm);
  background: color-mix(in srgb, #ef4444 10%, transparent);
  color: #b91c1c;
  font-size: 12.5px;
}

.danger-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--mauth-text-faint);
  font-size: 12.5px;
}

.danger-scope {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface-2);
}

.danger-scope__title {
  margin: 0 0 2px;
  font-size: 11.5px;
  font-weight: 620;
  color: var(--mauth-text);
}

.danger-scope__text {
  margin: 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--mauth-text-mid);
}

.danger-strong {
  color: #b91c1c;
  font-weight: 600;
}

.danger-kick {
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, #f59e0b 45%, var(--mauth-border));
  border-radius: var(--mauth-radius-sm);
  background: color-mix(in srgb, #f59e0b 7%, transparent);
}

.danger-kick__title {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 620;
  color: #92400e;
}

.danger-kick__row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin: 2px 0;
  font-size: 11.5px;
  color: var(--mauth-text-mid);
}

.danger-kick__meta {
  color: var(--mauth-text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
}

.danger-kick__hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.danger-pending {
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, #f59e0b 45%, var(--mauth-border));
  border-radius: var(--mauth-radius-sm);
  background: color-mix(in srgb, #f59e0b 8%, transparent);
}

.danger-pending__title {
  font-size: 13px;
  font-weight: 620;
  color: #92400e;
}

.danger-pending__sub {
  margin: 0;
  font-size: 12px;
  color: var(--mauth-text-mid);
}

.danger-apps {
  width: 100%;
}

.danger-app__name {
  font-weight: 550;
}

.danger-app__id,
.danger-app__time {
  margin-left: 6px;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.danger-app__state {
  font-size: 12px;
  color: var(--mauth-text-mid);
}

.danger-empty {
  margin: 0;
  font-size: 12.5px;
  color: var(--mauth-text-faint);
}

.danger-confirm {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px dashed var(--mauth-border-strong);
  border-radius: var(--mauth-radius-sm);
}

.danger-confirm__title {
  margin: 0;
  font-size: 12.5px;
  font-weight: 600;
}

.danger-secret {
  padding: 12px;
  border: 1px solid color-mix(in srgb, #10b981 45%, var(--mauth-border));
  border-radius: var(--mauth-radius-sm);
  background: color-mix(in srgb, #10b981 8%, transparent);
}

.danger-secret__label {
  margin: 0 0 6px;
  font-size: 11.5px;
  font-weight: 620;
  color: #047857;
}

.danger-secret__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.danger-secret__value {
  flex: 1;
  padding: 8px 10px;
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface);
  border: 1px solid var(--mauth-border);
  font-size: 15px;
  letter-spacing: 0.08em;
  user-select: all;
}

.danger-secret__hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--mauth-text-mid);
}

.danger-form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.danger-temps {
  padding: 10px 12px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface-2);
}

.danger-temps__title {
  margin: 0 0 4px;
  font-size: 11.5px;
  font-weight: 620;
}

.danger-temps__row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin: 2px 0;
  font-size: 12px;
  color: var(--mauth-text-mid);
}

.danger-temps__meta {
  color: var(--mauth-text-faint);
}

.danger-temps__hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.spin {
  animation: danger-spin 0.9s linear infinite;
}

@keyframes danger-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
