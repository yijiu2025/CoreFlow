<script setup lang="ts">
/**
 * 用户详情抽屉
 *
 * 回答五件事：这个人是谁 / 注册了哪些应用 / 有哪些角色和权限 / 最近干了什么 /
 * 在哪些设备上登录着。
 *
 * 前四页来自单个聚合接口（`GET /users/:id/profile`）—— 职级可见性在后端判，
 * 前端不做第二套判断。设备页单独取（`/admin/user/v1/sessions/list`）：
 * 会话是高频变动数据，塞进聚合接口会让每次开抽屉都为它多查一次。
 *
 * @author yijiu2025
 * @since 2026-11-12
 */
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  Loader2,
  MoreHorizontal,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  History,
  MonitorSmartphone,
  PowerOff,
  UserCheck,
  UserRound,
  UserX,
  X
} from 'lucide-vue-next';
import { kickUserSession, listUserSessions, updateUserStatus, userOptions, userProfile } from '@/api/system';
import type { UserEditTarget, UserOptions, UserProfile, UserRow, UserSessionRow } from '@/api/types';
import UserEditDialog from '@/components/business/UserEditDialog.vue';
import GrantHistoryDialog from '@/components/business/GrantHistoryDialog.vue';
import UserDangerDialog from '@/components/business/UserDangerDialog.vue';
import { canManageUser, indexRoles } from '@/utils/scope';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

/**
 * `mode`：`drawer` 侧滑抽屉（桌面）/ `page` 整页（手机端从列表点进来的"新页面"）
 *
 * 两档共用同一套内容（五个页签、设备会话、踢下线），只是外壳不同：
 * 抽屉有遮罩与右上角关闭，整页没有遮罩、关闭交给外壳顶栏的返回箭头。
 * 这样手机端不必再写一遍"这个人是谁 / 有哪些角色 / 在哪登录着"。
 */
const props = defineProps<{ userId: number | null; mode?: 'drawer' | 'page' }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'changed'): void }>();

/** 整页模式：不画遮罩、不接 Esc/点击遮罩关闭（返回由外壳负责） */
const isPage = computed(() => props.mode === 'page');

/** 遮罩点击 / Esc：只有抽屉模式才关，整页模式下这两个手势不该把页面关掉 */
function closeIfDrawer(): void {
  if (!isPage.value) emit('close');
}

type Tab = 'overview' | 'apps' | 'perms' | 'records' | 'devices';

const tab = ref<Tab>('overview');
const loading = ref(false);
const errorMessage = ref('');
const data = ref<UserProfile | null>(null);

/* ── 设备会话 ───────────────────────────────────────────────────
 * 懒加载：只有真正切到「设备」页才请求。开抽屉就预取等于让"看一眼是谁"
 * 每次都多一次不必要的查询。
 */
const sessions = ref<UserSessionRow[]>([]);
const sessionsLoading = ref(false);
const sessionsError = ref('');
/** 正在踢下线的设备码（防连点） */
const kicking = ref('');
/** 踢完的一次性提示 */
const kickNotice = ref('');

/**
 * 拉这个人详情
 *
 * 编辑保存后要再拉一次（资料/角色/设备都可能在一次保存里变），所以抽成函数而不是
 * 写在 watch 里。`reset` 只给"换人"用：同一个人刷新时不该把页签打回概览 ——
 * 用户在「设备」页点了下线、或刚保存完资料，视线应当留在原地。
 *
 * @param id 用户 ID
 * @param reset 是否复位页签与设备列表
 * @returns 无
 */
async function fetchProfile(id: number, reset: boolean): Promise<void> {
  errorMessage.value = '';
  if (reset) {
    data.value = null;
    tab.value = 'overview';
    // 换人必须清掉上一个人的设备：留着会让人以为"这个人也在这台机器上登录过"
    sessions.value = [];
    kickNotice.value = '';
    sessionsError.value = '';
  }
  loading.value = true;
  try {
    data.value = await userProfile(id);
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

/** 拉设备会话 */
async function loadSessions(): Promise<void> {
  if (!props.userId || sessionsLoading.value) return;
  sessionsLoading.value = true;
  sessionsError.value = '';
  try {
    sessions.value = await listUserSessions({ userId: props.userId });
  } catch (err) {
    sessionsError.value = err instanceof Error ? err.message : '设备列表加载失败';
  } finally {
    sessionsLoading.value = false;
  }
}

watch(tab, next => {
  if (next === 'devices' && !sessions.value.length && !sessionsError.value) void loadSessions();
});

/** 能否踢设备下线
 *
 * 刻意**不用** `data.canEdit`：那是"能否改这个人的权限"，而设备踢出的后端闸门是
 * admin_operator 及以上角色 —— 两套判据。管理员查看自己时 canEdit 可能为 false
 * （超管保护/职级判断），但"把自己的设备踢下线"必须允许，否则功能对他自己失效。
 */
const canKickDevice = computed(() => auth.hasPermission('admin:user:update'));

/**
 * 踢某台设备下线
 *
 * 只影响这一台：后端按 `userId + appId + deviceId` 精确匹配，同类型的其它设备不受影响。
 * `kicked = 0` 不是失败 —— 该设备可能已经过期或被踢过了，如实说明即可。
 *
 * @param row 设备会话行
 */
async function kickSession(row: UserSessionRow): Promise<void> {
  if (!props.userId || kicking.value) return;
  const tip = row.is_current
    ? '这是你当前正在使用的设备，下线后本次登录会立即退出。\n\n确定继续？'
    : `确认让设备「${row.device_id}」下线？\n\n只会踢掉这一台，该账号的其他设备不受影响。`;
  if (!window.confirm(tip)) {
    return;
  }
  kicking.value = row.device_id;
  kickNotice.value = '';
  try {
    const { kicked, revoked } = await kickUserSession({
      userId: props.userId,
      appId: row.app_id,
      deviceId: row.device_id
    });
    /*
     * kicked=0 不等于失败：会话可能早已过期，但后端仍会把这台设备的 DB 令牌一并撤销
     * （设备列表的徽标读的就是它）。所以有 revoked 时同样算"已下线"。
     */
    kickNotice.value =
      kicked > 0
        ? `已让「${row.device_id}」下线（${kicked} 个会话）`
        : revoked > 0
          ? `「${row.device_id}」的会话已过期，已撤销 ${revoked} 条历史令牌`
          : `「${row.device_id}」没有需要下线的会话`;
    // 踢的就是当前这台：会话已经没了，主动回登录页。等 401 才跳会让页面停在原地，
    // 用户看到的是"点了没反应"。
    if (row.is_current && kicked > 0) {
      window.setTimeout(() => {
        auth.reset();
        void router.replace('/login');
      }, 700);
      return;
    }
    await loadSessions();
  } catch (err) {
    sessionsError.value = err instanceof Error ? err.message : '踢下线失败';
  } finally {
    kicking.value = '';
  }
}

/**
 * 会话是否已失效
 *
 * 后端在不同路径下可能给 `boolean` 或 `0/1`（raw 查询与模型查询混用），两种都要认。
 *
 * @param row 会话行
 * @returns 是否已失效
 */
function isRevoked(row: UserSessionRow): boolean {
  return row.revoked === true || Number(row.revoked) === 1;
}

/**
 * 设备类型
 *
 * 优先看设备码前缀（`WEB-` / `MOBILE-` / `MINI-` 是本仓的约定，见 auth/device），
 * 没有前缀再退回 UA 判断。返回值只用于显示，不参与任何判定。
 *
 * @param row 会话行
 * @returns 类型名
 */
function deviceKind(row: UserSessionRow): string {
  const code = String(row.device_id || '').toUpperCase();
  if (code.startsWith('MINI')) return '小程序';
  if (code.startsWith('MOBILE') || code.startsWith('APP') || code.startsWith('ANDROID')) return '手机';
  if (code.startsWith('WEB') || code.startsWith('BROWSER')) return '浏览器';
  const ua = String(row.user_agent || '').toLowerCase();
  if (/iphone|android|mobile/.test(ua)) return '手机';
  if (/ipad|tablet/.test(ua)) return '平板';
  return row.device_id ? '浏览器' : '未知';
}

/**
 * UA 摘要（`Chrome · Windows` 这种短名）
 *
 * 不引 UA 解析库：这里只是给人快速分辨"这台是哪台"，认不出来的部分宁可留空，
 * 也不要猜一个具体版本号。
 *
 * @param ua User-Agent
 * @returns 摘要
 */
function uaSummary(ua: string | null): string {
  const text = String(ua || '');
  if (!text) return '未记录 UA';
  const os = /windows/i.test(text)
    ? 'Windows'
    : /iphone|ipad|ios/i.test(text)
      ? 'iOS'
      : /android/i.test(text)
        ? 'Android'
        : /mac os x|macintosh/i.test(text)
          ? 'macOS'
          : /linux/i.test(text)
            ? 'Linux'
            : '';
  const browser = /edg\//i.test(text)
    ? 'Edge'
    : /chrome\//i.test(text)
      ? 'Chrome'
      : /firefox\//i.test(text)
        ? 'Firefox'
        : /safari\//i.test(text)
          ? 'Safari'
          : '';
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(' · ') : text.slice(0, 40);
}

/** 权限码 → 所属应用（个人策略按应用落库，必须知道写哪个 app） */
const appOfCode = computed(() => {
  const map = new Map<string, string>();
  for (const role of data.value?.access.roles ?? []) {
    for (const code of role.permissions) {
      if (!map.has(code)) map.set(code, role.app_id);
    }
  }
  return map;
});

/** 个人策略的扁平索引：code → allow/deny */
const inlineState = computed(() => {
  const allow = new Set<string>();
  const deny = new Set<string>();
  for (const item of data.value?.inline ?? []) {
    item.allow.forEach(code => allow.add(code));
    item.deny.forEach(code => deny.add(code));
  }
  return { allow, deny };
});

/**
 * 权限行：角色带来的码 + 个人单独授予的码（去重）
 *
 * 只显示角色带来的码会看不到"单独允许"；只显示后者又会漏掉大半。
 */
const permissionRows = computed(() => {
  const codes = new Set(data.value?.access.permissionCodes ?? []);
  inlineState.value.allow.forEach(code => codes.add(code));
  inlineState.value.deny.forEach(code => codes.add(code));
  return [...codes].sort().map(code => ({
    code,
    appId: appOfCode.value.get(code) || 'GLOBAL',
    effect: inlineState.value.deny.has(code) ? 'deny' : inlineState.value.allow.has(code) ? 'allow' : 'inherit'
  }));
});

/** 时间显示（本地时区） */
function when(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const statusText = computed(() => {
  const status = data.value?.user.status;
  if (status === 1) return '正常';
  if (status === -2) return '待注销';
  if (status === -1) return '已注销';
  return '已禁用';
});

/* ── 操作区（仅整页模式） ──────────────────────────────────────
 *
 * 手机端列表只留「谁 + 是否可用」，行内那排图标按钮（授权记录 / 高危 / 编辑 /
 * 冻结）在 390px 上根本放不下 —— 它们现在都收在详情页底部：一个主按钮「编辑」，
 * 其余进「更多」面板。
 *
 * 抽屉模式不显示这排按钮：桌面上同一行已经有它们，抽屉里再来一套等于同一动作
 * 两个入口，还容易被误点（抽屉是"看一眼就走"的地方）。
 */

/** 角色 / 部门 / 岗位选项（判定"能不能改这个人"要用职级） */
const options = ref<UserOptions>({ depts: [], roles: [], posts: [] });

/**
 * 拉选项
 *
 * 失败就保持空 —— `canManageUser` 拿不到 `scope` 时会放行（交给后端裁决），
 * 最坏是多一次 403 提示，而不是把按钮全灰掉让人以为没权限。
 */
async function loadOptions(): Promise<void> {
  try {
    options.value = await userOptions();
  } catch {
    options.value = { depts: [], roles: [], posts: [] };
  }
}

/**
 * 当前操作者能否管理这个人
 *
 * 用详情数据拼一个最小 `UserRow`（只喂 `canManageUser` 需要的字段）：
 * 判定口径与列表行**同一份实现**，不在这里重写一遍职级规则。
 */
const manageVerdict = computed(() => {
  const d = data.value;
  if (!d) return { ok: false, reason: '' };
  const row: UserRow = {
    id: d.user.id,
    uid: d.user.uid,
    username: d.user.username,
    email: d.user.email,
    avatar: d.user.avatar,
    status: d.user.status,
    dept_id: d.user.deptId,
    dept_name: d.user.deptName,
    role_names: null,
    post_names: null,
    // 完整角色 ID：裁剪过的 `access.roles` 会让职级判定偏低，把"其实不能改"判成能改
    role_ids: (d.user.roleIds ?? []).join(','),
    post_ids: (d.user.postIds ?? []).join(','),
    created_at: d.user.createdAt ?? ''
  };
  return canManageUser(options.value.scope, row, indexRoles(options.value.roles), auth.me?.id, '操作');
});

/** 能否编辑（权限码 + 可管理；待注销的人不让改资料，改要走撤销注销） */
const canEditUser = computed(() => auth.hasPermission('admin:user:update') && manageVerdict.value.ok);
/** 能否冻结 / 启用 */
const canToggleStatus = computed(() => canEditUser.value && data.value?.user.status !== -2);
/** 能否看授权记录 */
const canViewGrants = computed(() => auth.hasPermission('admin:user:grants'));
/** 高危操作的三项能力（与列表页同一判据：超管 + 权限码） */
const canDeleteUser = computed(() => options.value.scope?.isSuper === true && auth.hasPermission('admin:user:purge'));
const canTempPassword = computed(
  () => options.value.scope?.isSuper === true && auth.hasPermission('admin:user:temp-password')
);
const canDeactivateApp = computed(() => auth.hasPermission('admin:user:deactivate'));
/** 是否有「更多」里的动作可点 */
const hasMoreActions = computed(
  () => canToggleStatus.value || canViewGrants.value || canDeleteUser.value || canTempPassword.value || canDeactivateApp.value
);

/** 编辑弹窗开关 */
const editOpen = ref(false);
/** 编辑目标（详情数据 → 表单初值） */
const editTarget = computed<UserEditTarget | null>(() => {
  const u = data.value?.user;
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    deptId: u.deptId,
    status: u.status,
    roleIds: u.roleIds ?? [],
    postIds: u.postIds ?? []
  };
});

/** 授权记录弹窗开关 */
const grantOpen = ref(false);
/** 高危操作弹窗开关 */
const dangerOpen = ref(false);
/** 「更多」底部面板开关 */
const sheetOpen = ref(false);
/** 一次性提示（操作成功后 2.6 秒消失） */
const toast = ref('');

/**
 * 提示
 *
 * @param message 文案
 */
function notify(message: string): void {
  toast.value = message;
  window.setTimeout(() => (toast.value = ''), 2600);
}

/** 刷新详情（保持当前页签） */
async function reload(): Promise<void> {
  if (props.userId !== null) await fetchProfile(props.userId, false);
}

/** 打开编辑 */
function openEdit(): void {
  sheetOpen.value = false;
  editOpen.value = true;
}

/**
 * 编辑保存完成
 *
 * @param message 弹窗给的提示语
 */
async function onSaved(message: string): Promise<void> {
  editOpen.value = false;
  notify(message);
  await reload();
  // 状态可能被改（冻结 / 启用），列表页那边要跟着刷新
  emit('changed');
}

/**
 * 切换启用 / 冻结
 *
 * 待注销是系统状态，不该用"冻结/启用"去改它 —— 要走「高危操作」里的撤销注销。
 */
async function toggleStatus(): Promise<void> {
  const user = data.value?.user;
  if (!user) return;
  if (user.status === -2) {
    notify('该账号处于待注销状态，请先在「高危操作」里撤销注销');
    return;
  }
  const next = user.status === 1 ? 0 : 1;
  try {
    await updateUserStatus(user.id, next);
    notify(next === 1 ? '已启用' : '已冻结');
    await reload();
    emit('changed');
  } catch (err) {
    notify(err instanceof Error ? err.message : '操作失败');
  }
}

/** 高危操作完成后刷新 */
async function refreshAfterDanger(): Promise<void> {
  await reload();
  emit('changed');
}
/*
 * 首次挂载即拉取
 *
 * 放在脚本末尾：watch 是 `immediate`，组件初始化时就执行，而 `options` / `loadOptions`
 * 都声明在下面 —— 提前写会撞上 TDZ（`Cannot access before initialization`）。
 */
watch(
  () => props.userId,
  id => {
    if (id === null) return;
    void fetchProfile(id, true);
    // 选项只在还没拉到过时取一次：抽屉反复开关不该重复打 /users/options
    if (options.value.roles.length === 0) void loadOptions();
  },
  { immediate: true }
);
</script>

<template>
  <div v-if="userId !== null" :class="isPage ? 'profile-page' : 'drawer-mask'" v-mask-close="closeIfDrawer">
    <aside :class="['drawer', { 'drawer--page': isPage }]" :role="isPage ? undefined : 'dialog'" aria-label="用户详情">
      <header class="drawer__head">
        <div class="who">
          <span class="who__avatar">
            <img v-if="data?.user.avatar" :src="data.user.avatar" alt="" />
            <UserRound v-else :size="18" />
          </span>
          <div class="who__text">
            <strong>{{ data?.user.username || '加载中…' }}</strong>
            <span class="who__sub mono">{{ data?.user.email || data?.user.uid || '' }}</span>
          </div>
        </div>
        <div class="drawer__actions">
          <span v-if="data" :class="['tag', data.user.status === 1 ? 'tag--ok' : 'tag--off']">{{ statusText }}</span>
          <button
            v-if="!isPage"
            class="btn btn--ghost btn--sm btn--icon"
            type="button"
            aria-label="关闭"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>
      </header>

      <div class="tabbar" :class="{ 'tabbar--sticky': isPage }" role="tablist">
        <button type="button" role="tab" :class="['tab', { 'is-on': tab === 'overview' }]" @click="tab = 'overview'">
          <UserRound :size="14" /> 概览
        </button>
        <button type="button" role="tab" :class="['tab', { 'is-on': tab === 'apps' }]" @click="tab = 'apps'">
          <Smartphone :size="14" /> 应用
        </button>
        <button type="button" role="tab" :class="['tab', { 'is-on': tab === 'perms' }]" @click="tab = 'perms'">
          <ShieldCheck :size="14" /> 权限
        </button>
        <button type="button" role="tab" :class="['tab', { 'is-on': tab === 'devices' }]" @click="tab = 'devices'">
          <MonitorSmartphone :size="14" /> 设备
        </button>
        <button type="button" role="tab" :class="['tab', { 'is-on': tab === 'records' }]" @click="tab = 'records'">
          <History :size="14" /> 记录
        </button>
      </div>

      <div class="drawer__body">
        <div v-if="loading" class="drawer__loading"><Loader2 class="spin" :size="14" /> 加载中…</div>
        <p v-else-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

        <template v-else-if="data">
          <!-- 概览 -->
          <template v-if="tab === 'overview'">
            <dl class="kv">
              <div>
                <dt>账号</dt>
                <dd class="mono">{{ data.user.username }}</dd>
              </div>
              <div>
                <dt>邮箱</dt>
                <dd class="mono">{{ data.user.email || '—' }}</dd>
              </div>
              <div>
                <dt>部门</dt>
                <dd>{{ data.user.deptName || '—' }}</dd>
              </div>
              <div>
                <dt>岗位</dt>
                <dd>{{ data.user.postNames.join('、') || '—' }}</dd>
              </div>
              <div>
                <dt>注册时间</dt>
                <dd class="mono">{{ when(data.user.createdAt) }}</dd>
              </div>
              <div>
                <dt>角色数</dt>
                <dd class="mono">{{ data.access.roles.length }}</dd>
              </div>
              <div>
                <dt>权限码</dt>
                <dd class="mono">{{ data.access.wildcard ? '全部（通配 *）' : data.access.permissionCodes.length }}</dd>
              </div>
              <div>
                <dt>应用数</dt>
                <dd class="mono">{{ data.apps.length }}</dd>
              </div>
            </dl>
            <p class="hint">点「应用 / 权限 / 记录」看明细。职级低于对方的账号看不到这里的任何内容。</p>
          </template>

          <!-- 应用 -->
          <template v-else-if="tab === 'apps'">
            <table v-if="data.apps.length" class="table">
              <colgroup>
                <col style="width: 120px" />
                <col style="width: 190px" />
                <col style="width: 150px" />
              </colgroup>
              <thead>
                <tr>
                  <th>应用</th>
                  <th>状态</th>
                  <th>最近活跃</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in data.apps" :key="row.app_id">
                  <td>{{ row.app_label }}</td>
                  <td class="mono">
                    {{
                      [row.authorized ? '已授权' : '', row.has_token ? '有令牌' : '', row.has_session ? '在线' : '']
                        .filter(Boolean)
                        .join(' · ') || '无凭据'
                    }}
                  </td>
                  <td class="mono">{{ when(row.last_active_at) }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="hint">该账号还没有任何应用账号。</p>
          </template>

          <!-- 角色与权限 -->
          <template v-else-if="tab === 'perms'">
            <section class="block">
              <h4 class="block__title">角色（{{ data.access.roles.length }}）</h4>
              <ul v-if="data.access.roles.length" class="role-list">
                <li v-for="role in data.access.roles" :key="role.role_id">
                  <span class="role-list__name">{{ role.role_name }}</span>
                  <span class="tag tag--info">{{ role.app_label }}</span>
                  <span class="mono role-list__meta">职级 {{ role.rank_level }}</span>
                </li>
              </ul>
              <p v-else class="hint">没有任何角色。</p>
            </section>

            <section class="block">
              <h4 class="block__title">
                权限码（{{ data.access.wildcard ? '全部' : permissionRows.length }}）
                <span v-if="!data.canEdit" class="block__note">只读：只能调整职级低于自己的账号</span>
              </h4>
              <!-- 🔴 **只读**。这里以前是「继承 / 允许 / 拒绝」三态开关，点一下就直接
                   写个人策略 —— 而这是一个"看一眼这个人是谁"的抽屉，不是编辑面。
                   详情页里放可写控件有两个具体问题：
                   ① 误触无声生效（没有保存步骤，点错即落库）；
                   ② 权限的来源被藏起来了 —— 三态只表达"当前处置"，看不出这条码是
                      角色给的面板、还是个人额外授予、还是被单独拒绝。
                   现在改成只读：把**来源**直接写在行上，要改去角色侧。 -->
              <div class="perm-list">
                <div v-for="row in permissionRows" :key="row.code" class="perm">
                  <span class="mono perm__code">{{ row.code }}</span>
                  <span class="perm__app">{{ row.appId }}</span>
                  <span class="perm__effect" :data-effect="row.effect">
                    {{ row.effect === 'deny' ? '个人拒绝' : row.effect === 'allow' ? '个人允许' : '角色继承' }}
                  </span>
                </div>
              </div>
              <!-- 文案只说**现在真能去的地方**。写"到编辑页处理"会指向一个
                   目前并不存在的入口（用户编辑弹窗里没有个人策略），
                   那句话比不写更糟：会让人找半天。 -->
              <p class="hint">
                权限来自角色授予；标「个人拒绝」的会覆盖角色，「个人允许」是角色之外的额外授权。
                要调整请到「角色管理」修改对应角色。
              </p>
            </section>
          </template>

          <!-- 设备：这个账号在哪些设备上登录着，可单独踢某一台下线 -->
          <template v-else-if="tab === 'devices'">
            <section class="block">
              <h4 class="block__title">
                设备（{{ sessions.length }}）
                <span class="block__note">同一设备在同一应用里只算一台</span>
              </h4>

              <div v-if="sessionsLoading" class="empty">设备列表加载中…</div>
              <p v-else-if="sessionsError" class="tag tag--off">{{ sessionsError }}</p>
              <p v-else-if="!sessions.length" class="hint">这个账号没有任何设备会话记录。</p>

              <ul v-else class="dev-list">
                <li v-for="row in sessions" :key="row.id" class="dev">
                  <div class="dev__body">
                    <div class="dev__head">
                      <span class="dev__kind">{{ deviceKind(row) }}</span>
                      <span class="mono dev__code">{{ row.device_id || '（无设备码）' }}</span>
                      <!-- 当前设备必然活跃，不再叠一个「活跃」绿标签 -->
                      <span v-if="row.is_current" class="tag tag--ok">当前设备</span>
                      <!--
                        三态：已下线（被踢/登出）/ 已过期（记录还在但会话 TTL 已到）/ 活跃。
                        之前只有两态，过期会话会被标成「活跃」—— 用户点下线却被告知
                        "没有活跃会话"，两句话互相矛盾。
                      -->
                      <span v-else :class="['tag', isRevoked(row) ? 'tag--off' : row.stale ? 'tag--info' : 'tag--ok']">
                        {{ isRevoked(row) ? '已下线' : row.stale ? '已过期' : '活跃' }}
                      </span>
                    </div>
                    <div class="dev__meta">
                      <span class="mono">{{ row.ip || '—' }}</span>
                      <span class="mono">{{ row.app_id }}</span>
                      <span class="dev__ua" :title="row.user_agent || ''">{{ uaSummary(row.user_agent) }}</span>
                      <span class="mono">最后活跃 {{ when(row.last_active) }}</span>
                    </div>
                  </div>
                  <!-- 只给「活跃」的提供按钮：已下线的没有会话可踢，
                       留着按钮只会点出一个 kicked=0，让人以为操作失败。
                       显隐用 canKickDevice 而不是 data.canEdit —— 后者是"能否改权限"，
                       会把管理员自己的设备藏掉（看自己时 canEdit 常为 false） -->
                  <button
                    v-if="canKickDevice && !isRevoked(row)"
                    class="btn btn--ghost btn--sm"
                    type="button"
                    :disabled="kicking === row.device_id"
                    :title="row.is_current ? '当前设备：下线会立即退出登录' : `让设备 ${row.device_id} 下线`"
                    @click="kickSession(row)"
                  >
                    <PowerOff :size="13" />
                    {{ kicking === row.device_id ? '处理中…' : row.is_current ? '退出本机' : '下线' }}
                  </button>
                </li>
              </ul>

              <p class="hint">
                踢下线只影响这一台设备，该账号的其他设备不受影响。设备码是识别设备的依据；
                「活跃」表示会话仍有效，「已过期」表示记录还在但会话已到期 —— 点下线会清掉这条记录。
              </p>

              <p v-if="kickNotice" class="dev__notice">{{ kickNotice }}</p>
            </section>
          </template>

          <!-- 记录 -->
          <template v-else>
            <section class="block">
              <h4 class="block__title">最近操作（{{ data.recentOps.length }}）</h4>
              <ul v-if="data.recentOps.length" class="feed">
                <li v-for="(row, i) in data.recentOps" :key="`op-${i}`">
                  <span class="feed__time mono">{{ when(row.createdAt) }}</span>
                  <span class="feed__main mono">{{ row.event }}</span>
                  <span class="feed__meta mono">{{ row.appId }} · {{ row.ip }}</span>
                </li>
              </ul>
              <p v-else class="hint">没有操作记录。</p>
            </section>

            <section class="block">
              <h4 class="block__title">最近登录（{{ data.recentLogins.length }}）</h4>
              <ul v-if="data.recentLogins.length" class="feed">
                <li v-for="(row, i) in data.recentLogins" :key="`lg-${i}`">
                  <span class="feed__time mono">{{ when(row.createdAt) }}</span>
                  <span :class="['feed__main', 'mono', { 'is-bad': row.failed }]">{{ row.event }}</span>
                  <span class="feed__meta mono">{{ row.ip }}{{ row.location ? ` · ${row.location}` : '' }}</span>
                </li>
              </ul>
              <p v-else class="hint">没有登录记录。</p>
            </section>
          </template>
        </template>
      </div>

      <!--
        底部操作条（仅整页模式）

        列表行上那排图标按钮（授权记录 / 高危 / 编辑 / 冻结）在 390px 上放不下，
        全部收进这一屏：一个主按钮「编辑」，其余进「更多」。
        没有可点的动作时整条不渲染 —— 一条空白的白条只会盖住内容。
      -->
      <footer v-if="isPage && (canEditUser || hasMoreActions)" class="page-actions">
        <button v-if="canEditUser" class="btn btn--primary page-actions__main" type="button" @click="openEdit">
          <Pencil :size="15" /> 编辑资料
        </button>
        <button
          v-if="hasMoreActions"
          class="btn page-actions__more"
          type="button"
          aria-label="更多操作"
          @click="sheetOpen = true"
        >
          <MoreHorizontal :size="18" />
        </button>
      </footer>
    </aside>

    <!-- 「更多」面板：从底部升起，与 App 的操作单一致 -->
    <div v-if="sheetOpen" class="sheet-mask" @click="sheetOpen = false">
      <div class="sheet" role="menu" aria-label="更多操作" @click.stop>
        <span class="sheet__grip" aria-hidden="true"></span>
        <p class="sheet__title">{{ data?.user.username }}</p>

        <button
          v-if="canToggleStatus"
          class="sheet__item"
          type="button"
          role="menuitem"
          @click="sheetOpen = false; void toggleStatus()"
        >
          <UserX v-if="data?.user.status === 1" :size="16" />
          <UserCheck v-else :size="16" />
          <span>{{ data?.user.status === 1 ? '冻结账号' : '启用账号' }}</span>
          <span class="sheet__note">{{ data?.user.status === 1 ? '会话立即失效，可随时恢复' : '恢复登录' }}</span>
        </button>

        <button v-if="canViewGrants" class="sheet__item" type="button" role="menuitem" @click="sheetOpen = false; grantOpen = true">
          <ShieldCheck :size="16" />
          <span>授权记录</span>
          <span class="sheet__note">谁在什么时候授了什么</span>
        </button>

        <button
          v-if="canDeleteUser || canTempPassword || canDeactivateApp"
          class="sheet__item sheet__item--danger"
          type="button"
          role="menuitem"
          @click="sheetOpen = false; dangerOpen = true"
        >
          <ShieldAlert :size="16" />
          <span>高危操作</span>
          <span class="sheet__note">删除 / 应用注销 / 临时密码</span>
        </button>

        <button class="sheet__cancel" type="button" @click="sheetOpen = false">取消</button>
      </div>
    </div>

    <!-- 编辑资料：与用户列表共用一个表单组件 -->
    <UserEditDialog :open="editOpen" :target="editTarget" @close="editOpen = false" @saved="onSaved" />

    <!-- 授权记录：单个用户的时间线 -->
    <GrantHistoryDialog
      :user-id="grantOpen ? userId : null"
      :username="data?.user.username ?? ''"
      :adjustable="canEditUser"
      @close="grantOpen = false"
      @adjust="grantOpen = false; editOpen = true"
    />

    <!-- 账号高危操作：删除（缓冲期）/ 应用注销 / 临时密码 -->
    <UserDangerDialog
      :user-id="dangerOpen ? userId : null"
      :username="data?.user.username ?? ''"
      :can-delete="canDeleteUser"
      :can-deactivate-app="canDeactivateApp"
      :can-temp="canTempPassword"
      @close="dangerOpen = false"
      @changed="refreshAfterDanger"
    />

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
/*
 * 整页模式（手机端从列表压栈进来的那一屏）
 *
 * 抽屉的手感是"盖住半屏、点外面关掉"；整页是"这一屏就是这个人"：
 * 不透明、无遮罩、无圆角与投影，页签横向可滑（五个带图标的页签在 390px 上放不下）。
 *
 * 🔴 所有整页规则都带 `.drawer--page` 作用域：`.drawer` 是抽屉的基础样式，
 *    同权重时靠"谁在后面"决胜，写在前面等于一条都没生效（实测量到 470px 宽）。
 */
.profile-page {
  display: block;
  background: var(--mauth-bg);
}

.drawer.drawer--page {
  width: 100%;
  border-left: 0;
  box-shadow: none;
  background: var(--mauth-bg);
  animation: none;
}

/* 页头：整页模式把它当"头像 + 名字"的封面，比抽屉里放大一号 */
.drawer--page .drawer__head {
  gap: 12px;
  padding: 18px 16px 16px;
  background: var(--mauth-surface);
}

.drawer--page .who__avatar {
  width: 52px;
  height: 52px;
  font-size: 19px;
}

.drawer--page .who__text strong {
  font-size: 17px;
  letter-spacing: -0.012em;
}

.drawer--page .who__sub {
  margin-top: 2px;
  font-size: 12px;
}

.drawer--page .drawer__body {
  /* 底部给固定操作条留位：96px = 操作条高度 + 安全区 + 一点余量 */
  padding: 12px 16px calc(96px + env(safe-area-inset-bottom));
}

/*
 * 页签：抽屉里那枚分段控件在整页里改成"通栏胶囊 + 可横滑"。
 *
 * 五个带图标的页签在 390px 上装不下，既然放不下就让它滑，而不是换行成两排
 * （两排会把下面的内容顶走半屏）。吸顶是为了在「设备」页滚到第十台时还能换页签。
 */
.drawer--page .tabbar {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  height: auto;
  margin: 0;
  padding: 8px 12px;
  position: sticky;
  top: 0;
  z-index: 3;
  border: 0;
  border-bottom: 1px solid var(--mauth-border);
  border-radius: 0;
  background: var(--mauth-surface);
  overflow-x: auto;
  scrollbar-width: none;
}

.drawer--page .tabbar::-webkit-scrollbar {
  display: none;
}

.drawer--page .tabbar .tab {
  flex: none;
  height: 30px;
  padding: 0 11px;
  border: 1px solid var(--mauth-border);
  border-radius: 999px;
  background: var(--mauth-surface);
  color: var(--mauth-text-mid);
  font-size: 12px;
  box-shadow: none;
}

/* 选中用主色实底：手机上"浅底 + 主色字"在强光下几乎看不出选中 */
.drawer--page .tabbar .tab.is-on {
  border-color: var(--mauth-primary);
  background: var(--mauth-primary);
  color: #fff;
  font-weight: 600;
  box-shadow: none;
}

.drawer--page .tabbar .tab.is-on:hover {
  color: #fff;
}

/*
 * 概览字段：手机上改成「左标签 / 右值」一行一项。
 *
 * 抽屉里两列网格在 560px 上没问题，但手机 390px 每列只剩 170px：
 * 邮箱、部门全名、岗位串基本都要换行或省略成「3346…」。一行一项装得下，
 * 也更好扫 —— 和系统设置的列表同一个读法。
 */
@media (max-width: 820px) {
  .drawer--page .kv {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
    margin-bottom: 14px;
  }

  .drawer--page .kv > div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 2px;
    border-bottom: 1px solid color-mix(in srgb, var(--mauth-border) 78%, transparent);
  }

  .drawer--page .kv > div:last-child {
    border-bottom: 0;
  }

  .drawer--page .kv dt {
    flex: none;
    font-size: 12px;
  }

  .drawer--page .kv dd {
    margin: 0;
    min-width: 0;
    text-align: right;
  }
}

/* ── 底部操作条（仅整页） ─────────────────────────────────────
   手机上一屏只放得下内容，操作要靠拇指够得到：固定在底部、主按钮占满，
   「更多」收其余动作。桌面整页把它变回普通页脚（见下面的 ≥821 段）。 */
.page-actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
  background: color-mix(in srgb, var(--mauth-bg) 90%, transparent);
  backdrop-filter: blur(14px);
  border-top: 1px solid var(--mauth-border);
}

.page-actions__main {
  flex: 1;
  height: 42px;
  font-size: 14px;
}

.page-actions__more {
  flex: none;
  width: 42px;
  height: 42px;
  padding: 0;
}

/* ── 「更多」底部面板 ───────────────────────────────────────── */
.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: flex-end;
  background: color-mix(in srgb, var(--mauth-text) 32%, transparent);
  animation: sheet-fade 0.18s var(--ease) both;
}

.sheet {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 6px 12px calc(12px + env(safe-area-inset-bottom));
  border-radius: 18px 18px 0 0;
  background: var(--mauth-surface);
  box-shadow: 0 -14px 36px color-mix(in srgb, var(--mauth-text) 16%, transparent);
  animation: sheet-up 0.24s var(--ease-out) both;
}

/* 顶部小横条：告诉手指"这块可以往下拖"（实际靠点遮罩关，不做好像少了个把手） */
.sheet__grip {
  width: 36px;
  height: 4px;
  margin: 4px auto 10px;
  border-radius: 999px;
  background: var(--mauth-border-strong);
}

.sheet__title {
  margin: 0 0 4px;
  padding: 0 8px;
  overflow: hidden;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sheet__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 13px 10px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--mauth-text);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.sheet__item:active {
  background: var(--mauth-press);
}

.sheet__item :deep(svg) {
  flex: none;
  color: var(--mauth-text-mid);
}

/* 说明文字靠右：手机宽度下最多占一半，长了就省略 */
.sheet__note {
  margin-left: auto;
  max-width: 50%;
  overflow: hidden;
  font-size: 11px;
  color: var(--mauth-text-faint);
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sheet__item--danger,
.sheet__item--danger :deep(svg) {
  color: var(--mauth-danger);
}

.sheet__cancel {
  margin-top: 6px;
  padding: 14px;
  border: 0;
  border-top: 1px solid var(--mauth-border);
  border-radius: 0;
  background: transparent;
  color: var(--mauth-text-mid);
  font-size: 14px;
  cursor: pointer;
}

@keyframes sheet-up {
  from {
    transform: translateY(100%);
  }
}

@keyframes sheet-fade {
  from {
    opacity: 0;
  }
}

/*
 * 桌面端也可能是这个 URL（直接开链接 / 手机端在详情页时把窗口拉宽 / F5）：
 * 这一屏必须变回"一页内容"，而不是一条 760px 宽、无边框、与底色同色的长条 ——
 * 那会看起来像内容被裁掉了一半（顶栏白条只铺到中间，两侧漏出底色）。
 *
 * 所以桌面给卡片边界 + 限宽居中 + 静态页脚，视觉上与列表页的 panel 同一族。
 */
@media (min-width: 821px) {
  .drawer.drawer--page {
    max-width: 820px;
    margin: 0 auto;
    height: auto;
    min-height: 62vh;
    border: 1px solid var(--mauth-border);
    border-radius: var(--mauth-radius-lg);
    background: var(--mauth-surface);
    box-shadow: var(--e1);
    overflow: hidden;
  }

  /* 固定操作条会横跨整个窗口，与居中的卡片错位 —— 桌面变回普通页脚 */
  .page-actions {
    position: static;
    justify-content: flex-end;
    padding: 12px 16px;
    background: var(--mauth-surface);
    backdrop-filter: none;
  }

  /* 桌面不需要"拇指够得到"：按钮收到内容宽度，不拉成一条 800px 的长条 */
  .page-actions__main {
    flex: 0 0 auto;
    min-width: 132px;
  }

  .drawer--page .drawer__body {
    padding: 14px 18px 18px;
  }

  .drawer--page .tabbar {
    position: static;
    padding: 8px 16px;
  }

  /* 桌面没有"拇指够不到"的问题，页签用回分段控件的样子更省空间 */
  .drawer--page .tabbar .tab {
    height: 28px;
    border: 0;
    background: transparent;
  }

  .drawer--page .tabbar .tab.is-on {
    background: var(--mauth-primary-soft);
    color: var(--mauth-primary);
  }

  .drawer--page .tabbar .tab.is-on:hover {
    color: var(--mauth-primary);
  }
}

.drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: color-mix(in srgb, var(--mauth-text) 26%, transparent);
  display: flex;
  justify-content: flex-end;
}

.drawer {
  width: min(560px, 94vw);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--mauth-surface);
  border-left: 1px solid var(--mauth-border);
  box-shadow: -12px 0 32px color-mix(in srgb, var(--mauth-text) 12%, transparent);
  animation: drawer-in 0.22s var(--ease-out) both;
}

@keyframes drawer-in {
  from {
    transform: translateX(24px);
    opacity: 0;
  }
}

.drawer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--mauth-border);
}

.who {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.who__avatar {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 50%;
  overflow: hidden;
  background: var(--mauth-surface-2);
  color: var(--mauth-text-mid);
}

.who__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.who__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.who__text strong {
  font-size: 14px;
}

.who__sub {
  font-size: 11.5px;
  color: var(--mauth-text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.drawer__body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px 24px;
}

.drawer__loading {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--mauth-text-mid);
  font-size: 13px;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.kv {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 18px;
  margin: 0 0 12px;
}

.kv dt {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.kv dd {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--mauth-text);
  word-break: break-all;
}

.block + .block {
  margin-top: 18px;
}

.block__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--mauth-text-mid);
}

.block__note {
  font-size: 11px;
  font-weight: 400;
  color: var(--mauth-text-faint);
}

.role-list,
.feed {
  list-style: none;
  margin: 0;
  padding: 0;
}

.role-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--mauth-border);
  font-size: 13px;
}

.role-list__name {
  font-weight: 600;
}

.role-list__meta {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.perm-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.perm {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
  border-bottom: 1px dashed var(--mauth-border);
  font-size: 12.5px;
}

.perm__code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.perm__app {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

/* 只读来源徽标：三种来源各一色，但视觉重量要小 ——
   它回答"这条权限从哪来"，不是让人点的操作。
   「角色继承」是绝大多数情况，用最淡的灰，不抢眼。 */
.perm__effect {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  white-space: nowrap;
  background: color-mix(in srgb, var(--mauth-text) 5%, transparent);
  color: var(--mauth-text-faint);
}

/* 「个人允许」是角色之外的额外授予 —— 值得被看见 */
.perm__effect[data-effect='allow'] {
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
}

/* 「个人拒绝」会盖掉角色授予，是最需要被注意的一种 */
.perm__effect[data-effect='deny'] {
  background: color-mix(in srgb, #dc2626 9%, transparent);
  color: #b91c1c;
}

/* 设备列表：一台设备一张小卡，右侧是操作 —— 行内信息多但不该挤成一坨 */
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
  padding: 8px 10px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
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
  max-width: 150px;
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

.feed li {
  display: grid;
  grid-template-columns: 108px 1fr auto;
  gap: 10px;
  padding: 5px 0;
  border-bottom: 1px dashed var(--mauth-border);
  font-size: 12px;
}

.feed__time {
  color: var(--mauth-text-faint);
}

.feed__main.is-bad {
  color: var(--mauth-danger);
}

.feed__meta {
  color: var(--mauth-text-faint);
  text-align: right;
}

.hint {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
