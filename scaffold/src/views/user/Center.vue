<script setup lang="ts">
/**
 * 个人中心（访问令牌 / 修改密码 / 第三方账号）
 *
 * 三个页签都是**只动自己**的数据：接口按会话里的 userId 过滤，页面不传用户参数，
 * 因此这里不做任何"是不是我"的判断，也不出现用户选择器。
 *
 * === 令牌明文的处理 ===
 * 明文只在创建响应里出现一次。本页把它放在独立的弹窗里展示并提示复制；
 * 关闭即从内存里清掉（`created = null`），不写 localStorage、不写 URL、
 * 不进任何提示条（toast 会被截图转发，等于二次泄漏）。
 *
 * === 空态 ===
 * 空数据仍保留表头 + 一行空状态（`.table-empty`），不塌成一句灰字 —— 表格骨架
 * 本身在告诉用户"这里本该有哪些列"，与用户详情页的写法保持一致。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { computed, onMounted, ref } from 'vue';
import { AlertTriangle, Check, Copy, Globe, KeyRound, Link2, Lock, Plus, Trash2, Unlink } from 'lucide-vue-next';
import { createMyToken, listMyIdentities, listMyTokens, revokeMyToken, unbindMyIdentity } from '@/api/user-center';
import type {
  ApiTokenCreated,
  ApiTokenRow,
  BoundIdentityRow,
  IdentityProviderOption,
  TokenScopeOption
} from '@/api/user-center';
import { changePassword } from '@/api/session';
import PersonalPage from '@/components/business/PersonalPage.vue';
import { useConfirmStore } from '@/stores/confirm';
import { useToastStore } from '@/stores/toast';

type Tab = 'tokens' | 'password' | 'identities';

const toast = useToastStore();
const confirmStore = useConfirmStore();

/** 当前页签 */
const tab = ref<Tab>('tokens');

/**
 * 切页签
 *
 * 第三方绑定是低频数据，首次切过去才请求；令牌是默认页，进页面就拉。
 * 改密是纯表单，不需要预加载。
 *
 * @param next 目标页签
 */
function selectTab(next: Tab): void {
  tab.value = next;
  if (next === 'identities' && !identitiesLoaded.value && !identitiesLoading.value) {
    void loadIdentities();
  }
}

/* ── 访问令牌 ─────────────────────────────────────────────── */

const tokens = ref<ApiTokenRow[]>([]);
const scopeOptions = ref<TokenScopeOption[]>([]);
const maxTokens = ref(20);
const tokensLoading = ref(false);
const tokensError = ref('');
/** 正在删除的令牌 id（防连点） */
const revokingId = ref<number | null>(null);

/** 已用 / 上限（页头读数） */
const tokenCountLabel = computed(() => `${tokens.value.length} / ${maxTokens.value}`);

/** 拉我的令牌 */
async function loadTokens(): Promise<void> {
  tokensLoading.value = true;
  tokensError.value = '';
  try {
    const data = await listMyTokens();
    tokens.value = data.tokens;
    scopeOptions.value = data.availableScopes;
    maxTokens.value = data.maxTokens;
  } catch (err) {
    tokensError.value = err instanceof Error ? err.message : '令牌列表加载失败';
  } finally {
    tokensLoading.value = false;
  }
}

/** 新建弹窗 */
const createOpen = ref(false);
const formName = ref('');
const formScopes = ref<string[]>(['profile']);
const formExpiresDays = ref<number | null>(90);
const creating = ref(false);
const formError = ref('');

/**
 * 默认作用域
 *
 * `profile` 是最小可用的公开资料 scope；注册表里没有时退回第一个候选项，
 * 不硬编码一个当前版本可能不存在的 id。
 *
 * @returns 默认勾选项
 */
function defaultScopes(): string[] {
  const ids = scopeOptions.value.map(item => item.id);
  if (ids.includes('profile')) return ['profile'];
  return ids.length ? [ids[0]] : [];
}

/** 打开新建弹窗（每次重置，避免上一次的输入残留） */
function openCreate(): void {
  if (tokens.value.length >= maxTokens.value) return;
  formName.value = '';
  formScopes.value = defaultScopes();
  formExpiresDays.value = 90;
  formError.value = '';
  createOpen.value = true;
}

/** 展示明文的一次性弹窗（关闭即清空） */
const created = ref<ApiTokenCreated | null>(null);
const copyState = ref<'idle' | 'copied' | 'failed'>('idle');

/**
 * 提交新建
 *
 * 成功后先关表单、再开明文弹窗：明文只存在于这一条响应里，页面刷新即不可恢复。
 */
async function submitCreate(): Promise<void> {
  if (creating.value) return;
  const name = formName.value.trim();
  if (!name) {
    formError.value = '请填写令牌名称';
    return;
  }

  creating.value = true;
  formError.value = '';
  try {
    const row = await createMyToken({
      name,
      scopes: formScopes.value,
      expiresInDays: formExpiresDays.value ?? undefined
    });
    createOpen.value = false;
    created.value = row;
    copyState.value = 'idle';
    toast.push(`令牌「${row.name}」已创建`);
    await loadTokens();
  } catch (err) {
    formError.value = err instanceof Error ? err.message : '创建失败';
  } finally {
    creating.value = false;
  }
}

/**
 * 复制明文
 *
 * 优先 Clipboard API；不可用（非 HTTPS / 旧浏览器）时退回 textarea + execCommand。
 *
 * @param text 待复制文本
 * @returns 是否复制成功
 */
function fallbackCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  return ok;
}

/** 复制当前明文 */
async function copySecret(): Promise<void> {
  const text = created.value?.token;
  if (!text) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      copyState.value = 'copied';
      return;
    }
    copyState.value = fallbackCopy(text) ? 'copied' : 'failed';
  } catch {
    copyState.value = fallbackCopy(text) ? 'copied' : 'failed';
  }
}

/** 关闭明文弹窗：明文随之从组件状态里消失，之后只能重新创建 */
function closeSecret(): void {
  created.value = null;
  copyState.value = 'idle';
}

/**
 * 删除令牌（软吊销）
 *
 * @param row 令牌行
 */
async function askRevoke(row: ApiTokenRow): Promise<void> {
  if (revokingId.value !== null) return;
  const ok = await confirmStore.ask({
    title: '删除访问令牌',
    message: `删除后，使用「${row.name}」的脚本或工具会立即失效，且无法恢复。`,
    confirmText: '删除',
    danger: true
  });
  if (!ok) return;

  revokingId.value = row.id;
  tokensError.value = '';
  try {
    await revokeMyToken(row.id);
    toast.push('令牌已删除');
    await loadTokens();
  } catch (err) {
    toast.pushError(err, '删除失败');
  } finally {
    revokingId.value = null;
  }
}

/* ── 第三方账号 ───────────────────────────────────────────── */

const identities = ref<BoundIdentityRow[]>([]);
const providers = ref<IdentityProviderOption[]>([]);
const identitiesLoading = ref(false);
const identitiesError = ref('');
/** 是否已成功拉取过（切页签时避免重复请求） */
const identitiesLoaded = ref(false);
/** 正在解绑的行 id */
const unbindingId = ref<number | null>(null);

/** 尚未绑定的 provider（已绑定的不出现在"可绑定"列表里，避免重复入口） */
const unboundProviders = computed(() => providers.value.filter(item => !item.bound));

/** 拉我的第三方绑定 */
async function loadIdentities(): Promise<void> {
  identitiesLoading.value = true;
  identitiesError.value = '';
  try {
    const data = await listMyIdentities();
    identities.value = data.identities;
    providers.value = data.providers;
    identitiesLoaded.value = true;
  } catch (err) {
    identitiesError.value = err instanceof Error ? err.message : '绑定列表加载失败';
  } finally {
    identitiesLoading.value = false;
  }
}

/**
 * 解绑
 *
 * 服务端会拒绝"唯一登录方式"的解绑，页面不重复判一遍 —— 两套判据迟早会不一致。
 *
 * @param row 绑定行
 */
async function askUnbind(row: BoundIdentityRow): Promise<void> {
  if (unbindingId.value !== null) return;
  const name = row.displayName ? `${row.providerLabel} · ${row.displayName}` : row.providerLabel;
  const ok = await confirmStore.ask({
    title: '解绑第三方账号',
    message: `确认解绑「${name}」？解绑后该账号将不再与本账号关联。`,
    confirmText: '解绑',
    danger: true
  });
  if (!ok) return;

  unbindingId.value = row.id;
  identitiesError.value = '';
  try {
    await unbindMyIdentity(row.id);
    toast.push('已解绑');
    await loadIdentities();
  } catch (err) {
    toast.pushError(err, '解绑失败');
  } finally {
    unbindingId.value = null;
  }
}

/* ── 修改密码 ───────────────────────────────────────────────
 *
 * 只动自己：`PUT /session/password` 由服务端按会话里的 userId 取凭证，页面不发用户参数。
 *
 * 🔴 登录设备**不在这里**：主题版式（`themes/<包>/<设备>/profile/`）已经在「个人资料」
 *    里承载了设备列表与踢下线，而且手机版式也必须能用。在账号与安全页再放一份，
 *    就是两套 UI 做同一件事 —— 改一处漏一处，用户还会疑惑"哪份是真的"。
 */

const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const changingPwd = ref(false);
const pwdError = ref('');

/** 两次输入是否不一致（只在确认框有内容时提示，不打断输入过程） */
const pwdMismatch = computed(() => confirmPassword.value.length > 0 && confirmPassword.value !== newPassword.value);

/**
 * 提交改密
 *
 * 前端只挡"两次不一致"和"太短"这类明显错误；强度规则（长度 / 字符类型）由服务端
 * `validatePasswordStrength` 判定 —— 两边各写一份的结果是提示文案不一致，
 * 用户按前端提示改完仍被拒。
 *
 * @returns {Promise<void>}
 */
async function submitPassword(): Promise<void> {
  if (changingPwd.value) return;
  pwdError.value = '';
  if (!oldPassword.value) {
    pwdError.value = '请输入当前密码';
    return;
  }
  if (newPassword.value.length < 8) {
    pwdError.value = '新密码至少 8 位';
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    pwdError.value = '两次输入的新密码不一致';
    return;
  }
  if (newPassword.value === oldPassword.value) {
    pwdError.value = '新密码不能与当前密码相同';
    return;
  }

  changingPwd.value = true;
  try {
    await changePassword(oldPassword.value, newPassword.value);
    toast.push('密码已更新，其它设备仍保持登录');
    oldPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
  } catch (err) {
    pwdError.value = err instanceof Error ? err.message : '修改失败';
  } finally {
    changingPwd.value = false;
  }
}

/* ── 展示工具 ─────────────────────────────────────────────── */

/**
 * 时间显示（本地时区，分钟精度）
 *
 * @param iso ISO 时间串
 * @returns 展示文本
 */
function when(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 作用域摘要（表格单元格）
 *
 * @param row 令牌行
 * @returns 空格分隔的 scope 串
 */
function scopeSummary(row: ApiTokenRow): string {
  return row.scopes.length ? row.scopes.join(' · ') : '—';
}

/**
 * 作用域完整说明（title 提示）
 *
 * @param row 令牌行
 * @returns 每个 scope 的「id：描述」
 */
function scopeTitle(row: ApiTokenRow): string {
  return row.scopes
    .map(id => {
      const option = scopeOptions.value.find(item => item.id === id);
      return option ? `${id}：${option.description}` : id;
    })
    .join('\n');
}

onMounted(loadTokens);
</script>

<template>
  <!-- 根节点不再自带 .page：控制台版式已把内容放进 <main class="page">，再套一层会多缩进 24px -->
  <PersonalPage title="账号与安全" sub="管理你的访问令牌与第三方账号绑定">
    <div class="tabbar" role="tablist" aria-label="账号与安全页签">
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'tokens'"
        :class="['tab', { 'is-on': tab === 'tokens' }]"
        @click="selectTab('tokens')"
      >
        访问令牌
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'password'"
        :class="['tab', { 'is-on': tab === 'password' }]"
        @click="selectTab('password')"
      >
        修改密码
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'identities'"
        :class="['tab', { 'is-on': tab === 'identities' }]"
        @click="selectTab('identities')"
      >
        第三方账号
      </button>
    </div>

    <!-- ── 访问令牌 ─────────────────────────────────────────── -->
    <section v-if="tab === 'tokens'" class="panel">
      <header class="panel__head">
        <span class="panel__title">访问令牌</span>
        <span class="panel__note">{{ tokenCountLabel }}</span>
        <div class="panel__actions">
          <button
            class="btn btn--primary btn--sm"
            type="button"
            :disabled="tokens.length >= maxTokens"
            :title="tokens.length >= maxTokens ? '已达上限，请先删除不用的令牌' : '创建一串只显示一次的访问令牌'"
            @click="openCreate"
          >
            <Plus :size="14" aria-hidden="true" />
            新建令牌
          </button>
        </div>
      </header>

      <div class="panel__body">
        <p class="hint">
          用于脚本 / 第三方调用，权限等同你本人（除全局通配）。令牌一旦泄露等于账号泄露，请像密码一样保管。
        </p>
        <p class="hint">
          调用方式：在请求头带上 <code class="mono">Authorization: Bearer &lt;令牌&gt;</code>。接口权限仍按你当前的角色判定，
          角色被收回后令牌随之失效；令牌本身可在下方随时删除。
        </p>
        <p v-if="tokensError" class="field__error">{{ tokensError }}</p>

        <div class="table-wrap">
          <table class="table token-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>令牌前缀</th>
                <th>作用域</th>
                <th>最近使用</th>
                <th>到期</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in tokens" :key="row.id">
                <td :title="row.name">{{ row.name }}</td>
                <td class="mono" :title="`只展示前 12 个字符，完整令牌无法再次查看`">{{ row.prefix }}…</td>
                <td :title="scopeTitle(row)">{{ scopeSummary(row) }}</td>
                <td class="mono">{{ when(row.lastUsedAt) }}</td>
                <td>
                  <span v-if="!row.expiresAt" class="tag">永不过期</span>
                  <span v-else-if="row.expired" class="tag tag--off" :title="when(row.expiresAt)">已过期</span>
                  <span v-else class="mono">{{ when(row.expiresAt) }}</span>
                </td>
                <td>
                  <button
                    class="btn btn--danger btn--sm"
                    type="button"
                    :disabled="revokingId === row.id"
                    @click="askRevoke(row)"
                  >
                    <Trash2 :size="13" aria-hidden="true" />
                    {{ revokingId === row.id ? '删除中…' : '删除' }}
                  </button>
                </td>
              </tr>

              <tr v-if="tokensLoading">
                <td colspan="6">
                  <div class="empty">令牌列表加载中…</div>
                </td>
              </tr>
              <tr v-else-if="!tokens.length && !tokensError">
                <td colspan="6" class="table-empty-cell">
                  <div class="table-empty">
                    <KeyRound :size="24" aria-hidden="true" />
                    <p class="table-empty__title">还没有访问令牌</p>
                    <span class="table-empty__sub">
                      创建令牌后，可以用它代表你在脚本或第三方工具里调用接口（请求头
                      <code class="mono">Authorization: Bearer &lt;令牌&gt;</code>）；明文只在创建时显示一次
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p v-if="tokens.length" class="hint hint--foot">
          令牌前缀仅用于辨认，完整令牌无法再次查看。达到 {{ maxTokens }} 个后需要先删除不用的令牌才能继续创建。
        </p>
      </div>
    </section>

    <!-- ── 修改密码 ─────────────────────────────────────────── -->
    <section v-else-if="tab === 'password'" class="panel">
      <header class="panel__head">
        <span class="panel__title">修改密码</span>
        <span class="panel__note">改密后其它设备仍保持登录，需要强制下线请在「个人资料」里操作</span>
      </header>

      <div class="panel__body">
        <div class="pwd-grid">
          <label class="field">
            <span class="field__label">当前密码</span>
            <input v-model="oldPassword" class="input" type="password" autocomplete="current-password" />
          </label>
          <label class="field">
            <span class="field__label">新密码</span>
            <input
              v-model="newPassword"
              class="input"
              type="password"
              autocomplete="new-password"
              placeholder="至少 8 位"
            />
          </label>
          <label class="field">
            <span class="field__label">确认新密码</span>
            <input
              v-model="confirmPassword"
              class="input"
              type="password"
              autocomplete="new-password"
              @keyup.enter="submitPassword"
            />
            <span v-if="pwdMismatch" class="field__error">两次输入的新密码不一致</span>
          </label>
        </div>

        <p v-if="pwdError" class="field__error">{{ pwdError }}</p>

        <div class="pwd-foot">
          <button class="btn btn--primary btn--sm" type="button" :disabled="changingPwd" @click="submitPassword">
            <Lock :size="14" aria-hidden="true" />
            {{ changingPwd ? '提交中…' : '更新密码' }}
          </button>
          <span class="field__hint">密码强度由服务端判定（长度 / 字符类型）；这里只挡"两次不一致"这类明显错误。</span>
        </div>

        <p class="hint hint--foot">
          登录设备与会话下线在
          <RouterLink to="/settings/profile">个人资料</RouterLink>
          页管理 —— 那里同时有手机版式，跨端都能用。
        </p>
      </div>
    </section>

    <!-- ── 第三方账号 ───────────────────────────────────────── -->
    <div v-else class="panel-stack">
      <section class="panel">
        <header class="panel__head">
          <span class="panel__title">已绑定账号</span>
          <span class="panel__note">{{ identities.length }} 个</span>
        </header>

        <div class="table-wrap">
          <table class="table identity-table">
            <thead>
              <tr>
                <th>平台</th>
                <th>账号</th>
                <th>绑定时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in identities" :key="row.id">
                <td>
                  <span class="provider-cell">
                    <Globe :size="14" aria-hidden="true" />
                    {{ row.providerLabel }}
                  </span>
                </td>
                <td>
                  <span class="provider-cell__name">{{ row.displayName || '未提供显示名' }}</span>
                  <span class="mono provider-cell__uid">{{ row.account }}</span>
                </td>
                <td class="mono">{{ when(row.boundAt) }}</td>
                <td>
                  <button
                    class="btn btn--danger btn--sm"
                    type="button"
                    :disabled="unbindingId === row.id"
                    @click="askUnbind(row)"
                  >
                    <Unlink :size="13" aria-hidden="true" />
                    {{ unbindingId === row.id ? '解绑中…' : '解绑' }}
                  </button>
                </td>
              </tr>

              <tr v-if="identitiesLoading">
                <td colspan="4">
                  <div class="empty">绑定列表加载中…</div>
                </td>
              </tr>
              <tr v-else-if="!identities.length && !identitiesError">
                <td colspan="4" class="table-empty-cell">
                  <div class="table-empty">
                    <Link2 :size="24" aria-hidden="true" />
                    <p class="table-empty__title">还没有绑定第三方账号</p>
                    <span class="table-empty__sub"
                      >绑定后可在下方「可绑定平台」里查看；目前还没有接入任何第三方登录</span
                    >
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p v-if="identitiesError" class="field__error identity-error">{{ identitiesError }}</p>
      </section>

      <section class="panel">
        <header class="panel__head">
          <span class="panel__title">可绑定平台</span>
          <span class="panel__note">未接入的平台会在配置后开放</span>
        </header>
        <div class="panel__body">
          <ul v-if="unboundProviders.length" class="provider-list">
            <li
              v-for="item in unboundProviders"
              :key="item.provider"
              :class="['provider', { 'is-off': !item.available }]"
            >
              <span class="provider__icon" aria-hidden="true">
                <Globe :size="16" />
              </span>
              <span class="provider__body">
                <span class="provider__name">{{ item.label }}</span>
                <span class="provider__reason">{{ item.available ? '已完成配置，可以绑定' : item.reason }}</span>
              </span>
              <span :class="['tag', item.available ? 'tag--ok' : 'tag--off']">
                {{ item.available ? '可绑定' : '未接入' }}
              </span>
            </li>
          </ul>
          <div v-else class="table-empty">
            <Link2 :size="24" aria-hidden="true" />
            <p class="table-empty__title">没有可绑定的平台</p>
            <span class="table-empty__sub">可绑定的平台都已绑定，或后端尚未登记任何 provider</span>
          </div>
        </div>
      </section>
    </div>

    <!-- ── 新建令牌 ─────────────────────────────────────────── -->
    <div v-if="createOpen" class="modal-mask" @click.self="createOpen = false">
      <div class="modal modal--sm" role="dialog" aria-modal="true" aria-label="新建访问令牌">
        <header class="modal__head">
          <span class="modal__title">新建访问令牌</span>
        </header>
        <div class="modal__body">
          <label class="field">
            <span class="field__label">名称<span class="field__required">*</span></span>
            <input
              v-model="formName"
              class="input"
              maxlength="64"
              placeholder="如：部署脚本 / 本地 CLI"
              @keyup.enter="submitCreate"
            />
          </label>

          <div class="field">
            <span class="field__label">作用域</span>
            <div class="scope-list">
              <label v-for="item in scopeOptions" :key="item.id" class="scope">
                <input v-model="formScopes" type="checkbox" :value="item.id" />
                <span class="scope__body">
                  <span class="scope__name mono">{{ item.id }}</span>
                  <span class="scope__desc">{{ item.description }}</span>
                </span>
              </label>
            </div>
            <span class="field__hint">默认只勾选 profile；勾得越多，令牌能读到的信息越多。</span>
          </div>

          <label class="field">
            <span class="field__label">有效期</span>
            <select v-model="formExpiresDays" class="select">
              <option :value="30">30 天</option>
              <option :value="90">90 天</option>
              <option :value="180">180 天</option>
              <option :value="365">365 天</option>
              <option :value="null">永不过期</option>
            </select>
          </label>

          <p v-if="formError" class="field__error">{{ formError }}</p>
        </div>
        <footer class="modal__foot">
          <button class="btn" type="button" :disabled="creating" @click="createOpen = false">取消</button>
          <button class="btn btn--primary" type="button" :disabled="creating" @click="submitCreate">
            {{ creating ? '创建中…' : '创建' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- ── 明文只显示一次 ───────────────────────────────────── -->
    <div v-if="created" class="modal-mask" @click.self="closeSecret">
      <div class="modal modal--md" role="dialog" aria-modal="true" aria-label="令牌已创建">
        <header class="modal__head">
          <span class="modal__title">令牌已创建</span>
        </header>
        <div class="modal__body">
          <div class="warn-box">
            <AlertTriangle :size="16" aria-hidden="true" />
            <span>{{ created.warning }}，关闭后无法再次查看。请现在复制并保存到安全的位置。</span>
          </div>

          <div class="field">
            <span class="field__label">访问令牌</span>
            <div class="secret-row">
              <code class="secret-value mono">{{ created.token }}</code>
              <button class="btn btn--sm" type="button" @click="copySecret">
                <Check v-if="copyState === 'copied'" :size="14" aria-hidden="true" />
                <Copy v-else :size="14" aria-hidden="true" />
                {{ copyState === 'copied' ? '已复制' : '复制' }}
              </button>
            </div>
            <span v-if="copyState === 'failed'" class="field__error">复制失败，请手动选择上面的文本复制。</span>
            <span v-else class="field__hint">
              名称：{{ created.name }} · 前缀：{{ created.prefix }} · 到期：{{
                created.expiresAt ? when(created.expiresAt) : '永不过期'
              }}
            </span>
          </div>
        </div>
        <footer class="modal__foot">
          <button class="btn btn--primary" type="button" @click="closeSecret">我已保存，关闭</button>
        </footer>
      </div>
    </div>
  </PersonalPage>
</template>

<style scoped>
/* 改密三格：宽屏一行三列，窄屏折成一列（密码框太窄时看不清自己输了什么） */
.pwd-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px 16px;
}

/* 说明文字里的跳转：默认链接色，别让它在灰字里"消失" */
.hint a {
  color: var(--mauth-primary);
  text-decoration: none;
}

.hint a:hover {
  text-decoration: underline;
}

/* 提交按钮与说明同一行：说明是"前端为什么只管两次不一致"，贴着按钮才好读 */
.pwd-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.panel-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 面板头右侧动作：标题与计数靠左，按钮整体吸右 */
.panel__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.panel__note {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

/* 说明文字：收在可读宽度内，不横跨整张宽表 */
.hint {
  max-width: 62em;
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.65;
  color: var(--mauth-text-faint);
}

.hint--foot {
  margin: 12px 0 0;
}

/* 表格列宽：定宽布局下由表头决定，内容再长也不推动别的列 */
.token-table th:nth-child(2) {
  width: 150px;
}

.token-table th:nth-child(3) {
  width: 190px;
}

.token-table th:nth-child(4),
.token-table th:nth-child(5) {
  width: 156px;
}

.token-table th:nth-child(6) {
  width: 96px;
}

.identity-table th:last-child {
  width: 96px;
}

.identity-table th:nth-child(3) {
  width: 168px;
}

/* 绑定列表加载失败：贴着表格下方提示，不另起一块面板 */
.identity-error {
  padding: 10px 16px 0;
}

/* 平台名与图标同排；账号两行（显示名 + 打码标识） */
.provider-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.provider-cell__name {
  display: block;
  color: var(--mauth-text);
  font-size: 13px;
}

.provider-cell__uid {
  display: block;
  margin-top: 1px;
  color: var(--mauth-text-faint);
  font-size: 10.5px;
}

/* ── 可绑定平台列表 ───────────────────────────────────────── */
.provider-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.provider {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface);
}

/* 未接入：整体降一档对比度，但仍可读（原因必须看得清） */
.provider.is-off {
  background: color-mix(in srgb, var(--mauth-surface-2) 55%, var(--mauth-surface));
}

.provider__icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--mauth-surface-2);
  color: var(--mauth-text-mid);
}

.provider__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.provider__name {
  color: var(--mauth-text);
  font-size: 13px;
  font-weight: 560;
}

.provider__reason {
  overflow: hidden;
  color: var(--mauth-text-faint);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 新建令牌：作用域多选 ─────────────────────────────────── */
.scope-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 220px;
  padding: 4px;
  overflow-y: auto;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface);
}

.scope {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 8px;
  border-radius: var(--mauth-radius-xs);
  cursor: pointer;
}

.scope:hover {
  background: var(--mauth-hover);
}

.scope input {
  flex: none;
  margin-top: 2px;
}

.scope__body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.scope__name {
  color: var(--mauth-text);
  font-size: 12.5px;
}

.scope__desc {
  color: var(--mauth-text-soft);
  font-size: 11.5px;
  line-height: 1.5;
}

/* ── 明文展示 ─────────────────────────────────────────────── */
.warn-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--mauth-danger) 28%, var(--mauth-border));
  border-radius: var(--mauth-radius-sm);
  background: color-mix(in srgb, var(--mauth-danger) 7%, var(--mauth-surface));
  color: var(--mauth-text);
  font-size: 12.5px;
  line-height: 1.55;
}

.warn-box svg {
  flex: none;
  margin-top: 2px;
  color: var(--mauth-danger);
}

.secret-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

/* 长令牌必须整串可见：换行而不截断，复制按钮保持右对齐 */
.secret-value {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  overflow-wrap: anywhere;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface-2);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.secret-row .btn {
  flex: none;
  align-self: flex-start;
}

/* ── 空态（与用户详情页同一套结构与类名） ─────────────────── */
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

@media (max-width: 820px) {
  .hint {
    margin-bottom: 10px;
  }

  .provider__reason {
    white-space: normal;
  }

  .secret-row {
    flex-direction: column;
  }

  .secret-row .btn {
    align-self: stretch;
  }
}
</style>
