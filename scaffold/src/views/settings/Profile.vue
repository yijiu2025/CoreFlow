<script setup lang="ts">
/**
 * 个人设置（主题 + 登录设备）
 *
 * 主题色：改完立刻生效并自动保存，没有「保存」按钮 —— 这类偏好是"所见即所得"的，
 * 点了色卡界面已经变了，再让人点一次保存只会产生"我明明改过了"的疑问。改为防抖
 * 自动保存 + 状态提示（保存中 / 已保存 / 失败），失败时也保留界面上的选择，不悄悄回滚。
 * 保存的值跟**账号**走（`user_user.preferences`），换设备登录会自动同步。
 *
 * 登录设备：本人自助踢下线。走 `/user/v1/sessions/*`（只看得到、也只能动自己的设备），
 * 与用户管理里的设备页是两组接口 —— 那边是管理员看别人，需要 `admin:user:*` 权限。
 *
 * @author yijiu2025
 * @since 2026-11-12
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Check, LogOut, MonitorSmartphone, PowerOff, Trash2 } from 'lucide-vue-next';
import {
  kickMyDevice,
  kickOtherDevices,
  myDevices,
  pruneMyRevokedDevices,
  saveProfile,
  uploadAvatar
} from '@/api/session';
import type { MyDeviceRow } from '@/api/types';
import { useAccentStore } from '@/stores/accent';
import { useAuthStore } from '@/stores/auth';

const accentStore = useAccentStore();
const auth = useAuthStore();
const router = useRouter();

/* ── 后台内展示身份（昵称 / 头像）────────────────────────────── */

/**
 * 资料只影响 console：全局 `user_user.username / avatar` 不动，
 * 那是所有应用共享的身份，这里改的是"后台里显示成什么"。
 */
const nickname = ref(auth.me?.profile?.nickname || auth.me?.username || '');
const avatar = ref(auth.me?.profile?.avatar || '');
/** 头像地址加载失败（换新头像/清空后要复位，否则回落后再也显示不出来） */
const avatarBroken = ref(false);
const profileState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const profileError = ref('');
let profileTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 自动保存资料（600ms 防抖）
 *
 * 打字时不该每个字符一次请求。保存成功后同步更新 `auth.me.profile`，
 * 顶栏头像与昵称立刻跟着变，不用等下一次刷新。
 */
function scheduleProfileSave(): void {
  profileState.value = 'saving';
  if (profileTimer) clearTimeout(profileTimer);
  profileTimer = setTimeout(async () => {
    profileTimer = null;
    try {
      const saved = await saveProfile({ nickname: nickname.value.trim(), avatar: avatar.value.trim() });
      if (auth.me) auth.me.profile = { nickname: saved.nickname || auth.me.username, avatar: saved.avatar || '' };
      profileState.value = 'saved';
    } catch (err) {
      profileState.value = 'error';
      profileError.value = err instanceof Error ? err.message : '保存失败';
    }
  }, 600);
}

// 昵称走自动保存；头像由上传接口直接落库，再监听它只会重复 PUT 同一个 URL
watch(nickname, () => scheduleProfileSave());

// 地址一变就重新给图片一次机会：上传成功后必须能显示新图
watch(avatar, () => {
  avatarBroken.value = false;
});

/** 隐藏的文件选择框（按钮只是它的触发器） */
const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const avatarError = ref('');

/**
 * 选图后立刻上传
 *
 * 上传接口内部已把 URL 写进 console 资料，所以这里只更新界面状态，
 * 不再走 `saveProfile`（否则同一个 URL 会再 PUT 一次）。
 *
 * @param event input change 事件
 */
async function onPickAvatar(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  avatarError.value = '';
  uploading.value = true;
  try {
    const saved = await uploadAvatar(file);
    avatar.value = saved.avatar;
    if (auth.me) auth.me.profile = { nickname: nickname.value || auth.me.username, avatar: saved.avatar };
    profileState.value = 'saved';
  } catch (err) {
    avatarError.value = err instanceof Error ? err.message : '上传失败';
  } finally {
    uploading.value = false;
  }
}

/** 移除头像（回落到全局头像） */
async function clearAvatar(): Promise<void> {
  avatarError.value = '';
  avatar.value = '';
  if (auth.me) auth.me.profile = { nickname: nickname.value || auth.me.username, avatar: '' };
  await saveProfile({ avatar: '' }).catch(() => {});
}

/* ── 我的登录设备 ───────────────────────────────────────────── */

const devices = ref<MyDeviceRow[]>([]);
const devicesLoading = ref(false);
const devicesError = ref('');
const deviceNotice = ref('');
/** 正在踢的设备行 id（防连点；null = 空闲） */
const kicking = ref<number | null>(null);
/** 正在踢「其他所有设备」 */
const kickingAll = ref(false);
/** 是否把「已下线」的历史行也铺出来（默认只看在线，否则几十条灰行把在线的埋掉） */
const showRevoked = ref(false);
/** 正在清理已下线记录 */
const pruning = ref(false);

/** 在线设备 */
/**
 * 在线设备
 *
 * 过期的历史行（`stale`）不算在线：会话早就不在了，算进来会让「在线 N 台」虚高。
 * 它们仍留在列表里（可点下线清理），只是不计入这个数字。
 */
const activeDevices = computed(() => devices.value.filter(row => !isRevoked(row) && !row.stale));
/** 已下线（历史）记录 */
const revokedDevices = computed(() => devices.value.filter(row => isRevoked(row)));
/** 当前要渲染的行 */
const visibleDevices = computed(() =>
  showRevoked.value ? devices.value : devices.value.filter(row => !isRevoked(row))
);

/**
 * 拉我的设备
 *
 * @returns 无
 */
async function loadDevices(): Promise<void> {
  devicesLoading.value = true;
  devicesError.value = '';
  try {
    const result = await myDevices();
    devices.value = result.devices;
  } catch (err) {
    devicesError.value = err instanceof Error ? err.message : '设备列表加载失败';
  } finally {
    devicesLoading.value = false;
  }
}

/**
 * 会话是否已失效
 *
 * 后端 raw 查询与模型查询混用，`revoked` 可能是 boolean 或 0/1，两种都要认。
 *
 * @param row 设备行
 * @returns 是否已失效
 */
function isRevoked(row: MyDeviceRow): boolean {
  return row.revoked === true || Number(row.revoked) === 1;
}

/**
 * 设备类型
 *
 * 优先看设备码前缀（WEB- / MOBILE- / MINI- 是本仓约定，见 auth/device），
 * 认不出来退回 UA 关键字 —— 只用于显示，不参与任何判定。
 *
 * @param row 设备行
 * @returns 类型名
 */
function deviceKind(row: MyDeviceRow): string {
  const code = String(row.deviceId || '').toUpperCase();
  if (code.startsWith('MINI')) return '小程序';
  if (code.startsWith('MOBILE') || code.startsWith('APP') || code.startsWith('ANDROID')) return '手机';
  if (code.startsWith('WEB') || code.startsWith('BROWSER')) return '浏览器';
  const ua = String(row.userAgent || '').toLowerCase();
  if (/iphone|android|mobile/.test(ua)) return '手机';
  if (/ipad|tablet/.test(ua)) return '平板';
  return row.deviceId ? '浏览器' : '未知';
}

/**
 * UA 摘要（`Chrome · Windows`）
 *
 * 不引 UA 解析库：只为"快速分辨这台是哪台"，识别不出的部分宁可留空。
 *
 * @param ua User-Agent
 * @returns 摘要
 */
function uaSummary(ua: string | null): string {
  const text = String(ua || '');
  if (!text) return '未记录 UA';
  const browser = /Edg\//.test(text)
    ? 'Edge'
    : /Chrome\//.test(text)
      ? 'Chrome'
      : /Firefox\//.test(text)
        ? 'Firefox'
        : /Safari\//.test(text)
          ? 'Safari'
          : '';
  // 🔴 顺序即判据：iPhone/iPad 的 UA 里带 "like Mac OS X"，先判 macOS 会把手机认成电脑
  const os = /Windows/.test(text)
    ? 'Windows'
    : /iPhone|iPad/.test(text)
      ? 'iOS'
      : /Android/.test(text)
        ? 'Android'
        : /Mac OS X/.test(text)
          ? 'macOS'
          : /Linux/.test(text)
            ? 'Linux'
            : '';
  return [browser, os].filter(Boolean).join(' · ') || '未识别';
}

/**
 * 时间（本地，秒级；空值给占位）
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
 * 踢我的某台设备下线
 *
 * 踢「当前设备」等于主动登出：后端会同时清登录 Cookie，这里顺势清本地状态并回登录页 ——
 * 不跳的话页面会停在原地，下一次任意请求才 401，看起来像"点了没反应"。
 *
 * @param row 设备行
 * @returns 无
 */
async function kickDevice(row: MyDeviceRow): Promise<void> {
  if (kicking.value !== null || isRevoked(row)) return;
  const tip = row.isCurrent
    ? '这是你当前正在使用的设备，确认后本次登录会立即退出。\n\n确定继续？'
    : `确认让设备「${row.deviceId}」下线？\n\n该设备上的登录会话会立即失效。`;
  if (!window.confirm(tip)) return;

  kicking.value = row.id;
  deviceNotice.value = '';
  devicesError.value = '';
  try {
    const result = await kickMyDevice(row.id);
    if (result.current) {
      deviceNotice.value = '当前设备已下线，正在退出登录…';
      window.setTimeout(() => {
        auth.reset();
        void router.replace('/login');
      }, 800);
      return;
    }
    deviceNotice.value =
      result.kicked > 0
        ? `已让「${row.deviceId}」下线`
        : result.revoked > 0
          ? `「${row.deviceId}」的会话已过期，已撤销 ${result.revoked} 条历史令牌`
          : `「${row.deviceId}」没有需要下线的会话`;
    await loadDevices();
  } catch (err) {
    devicesError.value = err instanceof Error ? err.message : '踢下线失败';
  } finally {
    kicking.value = null;
  }
}

/**
 * 退出其他所有设备
 *
 * @returns 无
 */
async function kickOthers(): Promise<void> {
  if (kickingAll.value) return;
  if (!window.confirm('确认退出其他所有设备？\n\n当前设备会保持登录，其它设备的会话立即失效。')) return;
  kickingAll.value = true;
  deviceNotice.value = '';
  devicesError.value = '';
  try {
    const { kicked } = await kickOtherDevices();
    deviceNotice.value = kicked > 0 ? `已退出 ${kicked} 个其他会话` : '没有其他活跃会话';
    await loadDevices();
  } catch (err) {
    devicesError.value = err instanceof Error ? err.message : '退出其他设备失败';
  } finally {
    kickingAll.value = false;
  }
}

/**
 * 清理已下线设备记录
 *
 * 只删历史行（后端限定 `revoked = 1` 且 `user_id = 当前用户`），不会碰任何在线会话。
 * 确认框里把条数写清楚 —— 这个动作不可撤销，但代价只是"历史列表变短"。
 *
 * @returns 无
 */
async function pruneRevoked(): Promise<void> {
  if (pruning.value || revokedDevices.value.length === 0) return;
  const count = revokedDevices.value.length;
  if (!window.confirm(`清理 ${count} 条已下线记录？\n\n只影响这份历史列表，不会退出任何正在登录的设备。`)) {
    return;
  }
  pruning.value = true;
  deviceNotice.value = '';
  devicesError.value = '';
  try {
    const { removed } = await pruneMyRevokedDevices();
    deviceNotice.value = removed > 0 ? `已清理 ${removed} 条已下线记录` : '没有需要清理的记录';
    // 清完回到「只看在线」：否则列表停在一片空行上，像是丢数据了
    showRevoked.value = false;
    await loadDevices();
  } catch (err) {
    devicesError.value = err instanceof Error ? err.message : '清理失败';
  } finally {
    pruning.value = false;
  }
}

onMounted(loadDevices);
</script>

<template>
  <div class="profile">
    <div class="page__head">
      <h2 class="page__title">个人设置</h2>
      <span class="page__sub">主题偏好与登录设备都只影响你自己的账号</span>
    </div>

    <section class="panel">
      <header class="panel__head">
        <span class="panel__title">个人资料</span>
        <span class="panel__sub">只影响后台管理内的显示</span>
      </header>

      <div class="panel__body">
        <div class="identity">
          <span class="identity__avatar">
            <!--
              加载失败（文件被清理 / 反向代理漏配）时回落到首字母，
              不要留一个裂图占位符 —— 那看起来像页面坏了，而不像"没设置头像"。
            -->
            <img v-if="avatar && !avatarBroken" :src="avatar" alt="" @error="avatarBroken = true" />
            <span v-else>{{ (nickname || auth.me?.username || 'U').slice(0, 1).toUpperCase() }}</span>
          </span>
          <div class="identity__fields">
            <label class="field">
              <span class="field__label">昵称（留空 = 用账号名）</span>
              <input v-model="nickname" class="input" maxlength="64" :placeholder="auth.me?.username || ''" />
            </label>
            <div class="field">
              <span class="field__label">头像</span>
              <div class="avatar-actions">
                <button class="btn btn--sm" type="button" :disabled="uploading" @click="fileInput?.click()">
                  {{ uploading ? '上传中…' : '上传图片' }}
                </button>
                <button v-if="avatar" class="btn btn--ghost btn--sm" type="button" @click="clearAvatar">移除</button>
                <span class="avatar-hint">JPG / PNG / WebP，≤ 2MB</span>
              </div>
              <input
                ref="fileInput"
                class="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                @change="onPickAvatar"
              />
              <p v-if="avatarError" class="status--error avatar-hint">{{ avatarError }}</p>
            </div>
          </div>
        </div>
        <p class="status" aria-live="polite">
          <template v-if="profileState === 'saving'">保存中…</template>
          <template v-else-if="profileState === 'saved'">已保存</template>
          <template v-else-if="profileState === 'error'">
            <span class="status--error">保存失败：{{ profileError }}</span>
          </template>
        </p>
      </div>
    </section>

    <section class="panel">
      <header class="panel__head">
        <span class="panel__title">主题设置</span>
        <span class="panel__sub">改完自动保存</span>
      </header>

      <div class="panel__body">
        <p class="hint">主题色影响按钮、链接、选中态与工作台图表；明暗仍走右上角切换。</p>

        <div class="accents" role="radiogroup" aria-label="主题色">
          <button
            v-for="item in accentStore.presets"
            :key="item.id"
            type="button"
            role="radio"
            :aria-checked="accentStore.currentId === item.id"
            :class="['accent-card', { 'is-on': accentStore.currentId === item.id }]"
            @click="accentStore.pick(item.id)"
          >
            <span class="accent-card__swatch" :style="{ background: item.primary }">
              <Check v-if="accentStore.currentId === item.id" :size="14" />
            </span>
            <span class="accent-card__name">{{ item.name }}</span>
          </button>
        </div>

        <p class="status" aria-live="polite">
          <template v-if="accentStore.saveState === 'saving'">保存中…</template>
          <template v-else-if="accentStore.saveState === 'saved'">已保存</template>
          <template v-else-if="accentStore.saveState === 'error'">
            <span class="status--error">保存失败：{{ accentStore.errorMessage }}</span>
          </template>
        </p>
      </div>
    </section>

    <!-- 登录设备：本人自助踢下线（管理员踢别人在用户管理 → 详情 → 设备） -->
    <section class="panel">
      <header class="panel__head">
        <span class="panel__title">登录设备</span>
        <span class="panel__sub">
          在线 {{ activeDevices.length }} 台 · 共 {{ devices.length }} 条记录（含已下线）
        </span>
        <button
          class="btn btn--ghost btn--sm panel__action"
          type="button"
          :disabled="kickingAll || devicesLoading"
          @click="kickOthers"
        >
          <LogOut :size="14" /> {{ kickingAll ? '处理中…' : '退出其他所有设备' }}
        </button>
      </header>

      <div class="panel__body">
        <p class="hint">
          同一设备在同一应用里只算一台。设备码用于识别设备（已打码）；「当前设备」就是你正在用的这一台，
          对它下线等于立即退出登录。
        </p>

        <div v-if="devicesLoading && devices.length === 0" class="empty">设备列表加载中…</div>
        <p v-else-if="devicesError" class="tag tag--off">{{ devicesError }}</p>
        <p v-else-if="!devices.length" class="hint">还没有任何设备会话记录。</p>
        <p v-else-if="!visibleDevices.length" class="hint">
          当前没有在线设备。下面是 {{ revokedDevices.length }} 条已下线记录，可展开查看或清理。
        </p>

        <ul v-if="visibleDevices.length" class="dev-list">
          <li v-for="row in visibleDevices" :key="row.id" class="dev" :class="{ 'is-current': row.isCurrent }">
            <MonitorSmartphone :size="18" class="dev__icon" />
            <div class="dev__body">
              <div class="dev__head">
                <span class="dev__kind">{{ deviceKind(row) }}</span>
                <span class="mono dev__code">{{ row.deviceId || '（无设备码）' }}</span>
                <!-- 当前设备必然活跃，不再叠一个「活跃」绿标签（两个同色标签并排只是噪音） -->
                <span v-if="row.isCurrent" class="tag tag--ok">当前设备</span>
                <!-- 三态：已下线 / 已过期（记录还在、会话已到 TTL）/ 活跃 -->
                <span v-else :class="['tag', isRevoked(row) ? 'tag--off' : row.stale ? 'tag--info' : 'tag--ok']">
                  {{ isRevoked(row) ? '已下线' : row.stale ? '已过期' : '活跃' }}
                </span>
              </div>
              <div class="dev__meta">
                <span class="mono">{{ row.ip || '—' }}</span>
                <span class="mono">{{ row.appId }}</span>
                <span class="dev__ua" :title="row.userAgent || ''">{{ uaSummary(row.userAgent) }}</span>
                <span class="mono">最后活跃 {{ when(row.lastActive) }}</span>
              </div>
            </div>
            <!-- 已失效的行没有会话可踢，留按钮只会点出一个 kicked=0 -->
            <button
              v-if="!isRevoked(row)"
              class="btn btn--ghost btn--sm"
              type="button"
              :disabled="kicking !== null"
              :title="row.isCurrent ? '当前设备：下线会立即退出登录' : `让设备 ${row.deviceId} 下线`"
              @click="kickDevice(row)"
            >
              <PowerOff :size="13" /> {{ kicking === row.id ? '处理中…' : row.isCurrent ? '退出本机' : '下线' }}
            </button>
          </li>
        </ul>

        <!--
          已下线是历史记录：默认收起来 —— 几十条灰行会把真正在线的设备埋掉，
          截图里 33 条记录里只有几条是有用的。需要留档时可展开，确认无用就清理。
        -->
        <div v-if="revokedDevices.length" class="dev-tools">
          <button class="btn btn--ghost btn--sm" type="button" @click="showRevoked = !showRevoked">
            {{ showRevoked ? '只看在线设备' : `显示已下线记录（${revokedDevices.length}）` }}
          </button>
          <button
            class="btn btn--ghost btn--sm dev-tools__prune"
            type="button"
            :disabled="pruning"
            title="只删除历史记录，不会退出任何正在登录的设备"
            @click="pruneRevoked"
          >
            <Trash2 :size="13" /> {{ pruning ? '清理中…' : '清理已下线记录' }}
          </button>
        </div>

        <p v-if="deviceNotice" class="dev__notice">{{ deviceNotice }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.profile {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--mauth-text-faint);
}

.accents {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(124px, 1fr));
  gap: 10px;
}

.accent-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.15s var(--ease),
    box-shadow 0.15s var(--ease);
}

.accent-card:hover {
  border-color: var(--mauth-border-strong);
  box-shadow: var(--e1);
}

.accent-card.is-on {
  border-color: var(--mauth-primary);
  box-shadow: inset 0 0 0 1px var(--mauth-primary);
}

.accent-card__swatch {
  display: grid;
  place-items: center;
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  color: #fff;
}

.accent-card__name {
  font-size: 12.5px;
  color: var(--mauth-text);
}

.status {
  margin: 12px 0 0;
  min-height: 16px;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.status--error {
  color: var(--mauth-danger);
}

/* 面板头右侧的操作键：标题/副标题在左，动作靠右 */
.panel__action {
  margin-left: auto;
}

/* 设备列表：一台设备一行，右侧是操作 —— 与用户详情抽屉的设备页同一视觉语言 */
.dev-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dev {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
}

/* 当前设备：主色描边 + 极浅底。不用左侧竖线（与详情摘要同一取舍：装饰条是噪音） */
.dev.is-current {
  border-color: color-mix(in srgb, var(--mauth-primary) 45%, var(--mauth-border));
  background: color-mix(in srgb, var(--mauth-primary) 3%, transparent);
}

.dev__icon {
  flex: none;
  color: var(--mauth-text-faint);
}

.dev__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dev__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.dev__kind {
  font-size: 12px;
  font-weight: 650;
  color: var(--mauth-text);
}

.dev__code {
  font-size: 12px;
  color: var(--mauth-text);
  overflow: hidden;
  text-overflow: ellipsis;
}

.dev__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.dev__ua {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 操作结果用主色一次性提示，不用红色 —— 踢下线是正常运维动作 */
.dev__notice {
  margin: 10px 0 0;
  padding: 8px 10px;
  border-radius: var(--mauth-radius-xs);
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
  font-size: 12px;
}

/* 已下线记录的操作行：与在线列表用虚线隔开，表达"这下面是历史" */
.dev-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--mauth-border);
}

/* 清理是不可逆的，靠右并只在悬停时泛红 —— 常红会让人对红色麻木 */
.dev-tools__prune {
  margin-left: auto;
  color: var(--mauth-text-soft);
}

.dev-tools__prune:hover:not(:disabled) {
  color: var(--mauth-danger);
  border-color: color-mix(in srgb, var(--mauth-danger) 34%, transparent);
  background: var(--mauth-danger-soft);
}

/* 窄屏：面板头允许换行，"退出其他所有设备" 落回标题下方，不把标题挤成两段 */
@media (max-width: 640px) {
  .panel__head {
    flex-wrap: wrap;
  }

  .panel__action {
    margin-left: 0;
  }
}

/* 个人资料：头像预览 + 两个字段 */
.identity {
  display: flex;
  align-items: center;
  gap: 16px;
}

.identity__avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
  font-size: 20px;
  font-weight: 650;
}

.identity__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.identity__fields {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
}

.avatar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.avatar-hint {
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

/* 隐藏的文件选择框：仍可被 click() 触发，但不占位（display:none 在部分浏览器会拒绝打开选择器） */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
</style>
