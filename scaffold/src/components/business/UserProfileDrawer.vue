<script setup lang="ts">
/**
 * 用户详情（整页）
 *
 * 回答五件事：这个人是谁 / 注册了哪些应用 / 有哪些角色和权限 / 最近干了什么 /
 * 在哪些设备上登录着。
 *
 * 前四页来自单个聚合接口（`GET /users/:id/profile`）—— 职级可见性在后端判，
 * 前端不做第二套判断。设备页单独取（`/admin/user/v1/sessions/list`）：
 * 会话是高频变动数据，塞进聚合接口会让每次进这一页都为它多查一次。
 *
 * === 尺度 ===
 * 这一屏与用户列表**同一条内容带**（外层 `.page` 给的宽度），不再是居中的 820 卡片：
 * 从列表点进详情时宽度不该变窄一圈 —— 那看起来像跳进了一个弹窗。内容宽度交给外壳，
 * 这里只负责"一页内容"的排版，长段落单独用 `.hint` 收在 46em 内。
 *
 * === 页签 ===
 * ≥821 是下划线式二级导航（`.profile-nav`，页面级），≤820 是通栏横滑胶囊（`.tabbar`）。
 * 两者语义都是"这一页的五个区块"，但手机上五个带图标的胶囊必须能滑，桌面上则更该像
 * 一条安静的导航条 —— 同一个控件在两种宽度下长得不一样，是因为用法不一样。
 * 页签深链走 `?tab=`（仅整页模式）：能分享、能刷新、能按返回键回到上一个页签。
 *
 * @author yijiu2025
 * @since 2026-11-12
 */
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  AppWindow,
  ChevronRight,
  History,
  KeyRound,
  MoreHorizontal,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  MonitorSmartphone,
  PowerOff,
  UserCheck,
  UserRound,
  UserX
} from 'lucide-vue-next';
import { kickUserSession, listUserSessions, updateUserStatus, userOptions, userProfile } from '@/api/system';
import { ApiError } from '@/api/http';
import type { UserEditTarget, UserOptions, UserProfile, UserRow, UserSessionRow } from '@/api/types';
import UserEditDialog from '@/components/business/UserEditDialog.vue';
import GrantHistoryDialog from '@/components/business/GrantHistoryDialog.vue';
import UserDangerDialog from '@/components/business/UserDangerDialog.vue';
import { canManageUser, indexRoles } from '@/utils/scope';
import { appText, summarizeOperEvent } from '@/utils/operLogSummary';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useConfirmStore } from '@/stores/confirm';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

/**
 * `mode` 保留但只认整页
 *
 * 这张内容原先有"抽屉"与"整页"两档外壳（桌面抽屉 / 手机压栈页）。抽屉那档已删除：
 * 同一份内容在两套外壳里各自维护一套遮罩、关闭与滚动逻辑，收益是零（列表页已经能
 * 看全一行），代价是每次改版面都要改两遍。现在只有整页 —— `mode` 仍保留，因为
 * 主题包会显式传 `page`，且"非整页"时不该去改写 URL 上的 `?tab=`。
 */
const props = withDefaults(defineProps<{ userId: number | null; mode?: 'page' | 'drawer' }>(), {
  mode: 'page'
});
const emit = defineEmits<{ (e: 'changed'): void }>();

/** 整页模式（决定是否把页签同步进 URL） */
const isPage = computed(() => props.mode === 'page');

/* ── 页签 ─────────────────────────────────────────────────── */

type Tab = 'overview' | 'apps' | 'perms' | 'devices' | 'records';

/** 页签顺序与文案（桌面上划线导航与手机胶囊共用一份，避免两处文案漂移） */
const TABS: Array<{ key: Tab; label: string; icon: typeof UserRound }> = [
  { key: 'overview', label: '概览', icon: UserRound },
  { key: 'apps', label: '应用', icon: Smartphone },
  { key: 'perms', label: '权限', icon: ShieldCheck },
  { key: 'devices', label: '设备', icon: MonitorSmartphone },
  { key: 'records', label: '记录', icon: History }
];

/** 页签白名单（URL 上的 `?tab=` 只认这五个） */
const TAB_KEYS = TABS.map(item => item.key);

/** 非整页模式下的本地页签（整页模式以 URL 为准） */
const localTab = ref<Tab>('overview');

/**
 * 当前页签
 *
 * 整页模式从 `route.query.tab` 派生：换人、刷新、前进后退都以 URL 为准。
 * 非法值渲染概览，但**不改写** URL —— 用户手改地址栏时不该被我们偷偷改回去。
 */
const tab = computed<Tab>(() => {
  if (!isPage.value) return localTab.value;
  const raw = route.query.tab;
  if (typeof raw !== 'string') return 'overview';
  return (TAB_KEYS as string[]).includes(raw) ? (raw as Tab) : 'overview';
});

/**
 * 切页签
 *
 * 只把非默认值写进 URL（概览是默认值，写成 `?tab=overview` 只会让地址栏更长）。
 *
 * @param next 目标页签
 */
function selectTab(next: Tab): void {
  if (next === tab.value) return;
  if (!isPage.value) {
    localTab.value = next;
    return;
  }
  void router.replace({ query: { ...route.query, tab: next === 'overview' ? undefined : next } });
}

/* ── 返回列表（面包屑与错误页共用同一条 fallback） ─────────── */

/**
 * 回用户列表
 *
 * 有历史就后退（保留列表的筛选与页码），没有历史（直接开链接 / F5）就 push ——
 * `router.back()` 在无历史时会把用户留在原地，看起来像点了没反应。
 */
function backToList(): void {
  if (window.history.state?.back) router.back();
  else void router.push('/system/user');
}

/* ── 详情数据 ─────────────────────────────────────────────── */

const loading = ref(false);
const errorMessage = ref('');
/** 失败状态码（403 / 404 的文案与动作不同，需要保留它） */
const errorStatus = ref(0);
const data = ref<UserProfile | null>(null);

/* ── 设备会话 ───────────────────────────────────────────────
 * 懒加载：只有真正切到「设备」页才请求。进来就预取等于让"看一眼是谁"
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
 * 写在 watch 里。`reset` 只给"换人"用：同一个人刷新时不该把设备列表打回去 ——
 * 用户在「设备」页点了下线、或刚保存完资料，视线应当留在原地。
 *
 * @param id 用户 ID
 * @param reset 是否丢弃上一个人的数据与设备
 * @returns 无
 */
async function fetchProfile(id: number, reset: boolean): Promise<void> {
  errorMessage.value = '';
  errorStatus.value = 0;
  if (reset) {
    data.value = null;
    // 换人必须清掉上一个人的设备：留着会让人以为"这个人也在这台机器上登录过"
    sessions.value = [];
    kickNotice.value = '';
    sessionsError.value = '';
  }
  loading.value = true;
  try {
    data.value = await userProfile(id);
  } catch (err) {
    // 403 / 404 是"看不了 / 没有这个人"，与"网络抖了"不是一回事，文案与出口都不同
    errorStatus.value = err instanceof ApiError ? err.status : 0;
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

/*
 * 设备数据跟着「页签 + 详情」一起判：
 *   · 深链 `?tab=devices` 进来时页签本身没变过，只 watch 页签永远不触发；
 *   · 换人后 sessions 被清空，也要重新取。
 * 详情成功之前不请求：403/404 时多打一次会话接口毫无意义。
 */
watch(
  [tab, () => data.value],
  () => {
    if (tab.value === 'devices' && data.value && !sessions.value.length && !sessionsError.value) {
      void loadSessions();
    }
  },
  { immediate: true }
);

/** 切页签后把视线送回内容顶部：整页模式滚动在 window 上，不是内部容器 */
watch(tab, () => {
  if (typeof window === 'undefined') return;
  window.scrollTo({ top: 0 });
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
  const ok = await confirmStore.ask({
    title: row.is_current ? '下线当前设备' : '下线设备',
    message: tip.replace(/\n\n确定继续？$/, ''),
    confirmText: '下线',
    danger: true
  });
  if (!ok) {
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

/** 权限码的来源（只读标注：角色继承 / 个人允许 / 个人拒绝） */
type Effect = 'allow' | 'deny' | 'inherit';

/**
 * 权限码的所属应用（域）
 *
 * 权限码按 `域:模块:动作` 命名，**域**才是后端写个人策略时用的 appId（`inline[].appId`），
 * 也是权限目录里的 `domain`。用域分组才能和"个人策略写在哪"对齐；拿角色的
 * `app_id`（应用 ID，如 `console`）分，会让同一批码裂成两组（域 `admin` 与应用 `console`）。
 *
 * @param code 权限码
 * @returns 域（通配与空值归到 GLOBAL）
 */
function domainOf(code: string): string {
  if (!code || code === '*') return 'GLOBAL';
  return code.split(':')[0] || 'GLOBAL';
}

/**
 * 权限行：角色带来的码 + 个人单独授予/拒绝的码（去重）
 *
 * 只显示角色带来的码会看不到"单独允许"；只显示后者又会漏掉大半。
 */
const permissionRows = computed<Array<{ code: string; effect: Effect }>>(() => {
  const codes = new Set(data.value?.access.permissionCodes ?? []);
  inlineState.value.allow.forEach(code => codes.add(code));
  inlineState.value.deny.forEach(code => codes.add(code));
  return [...codes].sort().map(code => ({
    code,
    effect: inlineState.value.deny.has(code) ? 'deny' : inlineState.value.allow.has(code) ? 'allow' : 'inherit'
  }));
});

/**
 * 权限读数（页头与权限页共用一份）
 *
 * 口径：通配即用为「全部」；否则数**已授予的权限码**。两处读同一个 computed，
 * 不会出现"页头写 12、点进权限页写 14"这种自相矛盾。
 */
const permCount = computed(() =>
  data.value?.access.wildcard ? '全部' : String(data.value?.access.permissionCodes.length ?? 0)
);

/**
 * 权限码按应用分组
 *
 * 组头标的是"这批码属于哪个应用"，所以一个应用一组 —— 权限码平铺成一张长表时，
 * 想确认"他在这个应用能干什么"只能逐条读前缀。
 *
 * 应用名从三处取（先到先得）：个人策略的 `appLabel`（最直接）、角色所属应用的
 * `app_label`、都没有就退化到域本身的字符串 —— 不编一个好看但不真的名字。
 */
const permGroups = computed<Array<{ appId: string; label: string; rows: Array<{ code: string; effect: Effect }> }>>(() => {
  const labels = new Map<string, string>();
  for (const item of data.value?.inline ?? []) {
    if (!labels.has(item.appId)) labels.set(item.appId, item.appLabel || item.appId);
  }
  for (const role of data.value?.access.roles ?? []) {
    const label = role.app_label || role.app_id;
    for (const code of role.permissions) {
      const key = domainOf(code);
      if (!labels.has(key)) labels.set(key, label);
    }
  }

  const buckets = new Map<string, Array<{ code: string; effect: Effect }>>();
  for (const row of permissionRows.value) {
    const key = domainOf(row.code);
    const list = buckets.get(key);
    if (list) list.push({ code: row.code, effect: row.effect });
    else buckets.set(key, [{ code: row.code, effect: row.effect }]);
  }
  return [...buckets.entries()]
    .map(([appId, rows]) => ({
      appId,
      label: labels.get(appId) || (appId === 'GLOBAL' ? '公共' : appId),
      rows
    }))
    .sort((a, b) => {
      if (a.appId === 'GLOBAL') return b.appId === 'GLOBAL' ? 0 : -1;
      if (b.appId === 'GLOBAL') return 1;
      return a.label.localeCompare(b.label, 'zh-CN');
    });
});

/**
 * 来源文案
 *
 * @param effect 来源
 * @returns 文案
 */
function effectLabel(effect: Effect): string {
  if (effect === 'deny') return '个人拒绝';
  if (effect === 'allow') return '个人允许';
  return '角色继承';
}

/** 时间显示（本地时区） */
/**
 * 从登录日志的 details 里取失败原因
 *
 * 不同来源写的键不一样（`reason` / `message`），取到哪个用哪个；都没有就返回空串，
 * 不构造"未知原因"这种假话。
 *
 * @param detail details 原始 JSON 串
 * @returns 失败原因（可能为空）
 */
function failReason(detail?: string): string {
  if (!detail) return '';
  try {
    const d = JSON.parse(detail) as Record<string, unknown>;
    const text = d.reason ?? d.message ?? d.error;
    return typeof text === 'string' ? text : '';
  } catch {
    return '';
  }
}

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

/* ── 页头读数 ─────────────────────────────────────────────── */

/** 头像首字母（没有字符时给 ?，别渲染成空白圆圈） */
const initial = computed(() => {
  const name = data.value?.user.username?.trim() ?? '';
  const first = name.charAt(0).toUpperCase();
  /*
   * 纯数字账号（如 `33464525`）取首字只会得到一个"3"，看起来像编号碎片，
   * 还不如没有 —— 这种情况返回空串，让模板退回头像图标。
   */
  return first && !/^[0-9]$/.test(first) ? first : '';
});

/** 副行：邮箱 · 部门 · 职级 N（缺项直接不出现，不留一串空的分隔点） */
const headSub = computed(() => {
  const u = data.value?.user;
  if (!u) return '';
  const rank = u.rankLevel === null || u.rankLevel === undefined ? '' : `职级 ${u.rankLevel}`;
  return [u.email, u.deptName, rank].filter(Boolean).join(' · ');
});

/** 读数：角色 / 权限 / 应用（≥1200 才显示，窄屏让位给名字与按钮） */
const statRoles = computed(() => data.value?.access.roles.length ?? 0);
const statApps = computed(() => data.value?.apps.length ?? 0);

/** 概览字段（6 项；未设置的显示 `—` 且带 title，不能看起来像"真的写了一横"） */
const facts = computed(() => {
  const u = data.value?.user;
  if (!u) return [];
  return [
    { label: '账号', value: u.username || '', mono: true },
    { label: '邮箱', value: u.email || '', mono: true },
    { label: '部门', value: u.deptName || '', mono: false },
    { label: '岗位', value: u.postNames.join('、'), mono: false },
    { label: '职级', value: u.rankLevel === null || u.rankLevel === undefined ? '' : String(u.rankLevel), mono: true },
    { label: '注册时间', value: u.createdAt ? when(u.createdAt) : '', mono: true }
  ];
});

/* ── 最近动态（概览右栏） ───────────────────────────────────
   概览只有 6 个字段，铺满宽屏会显得空。右栏把"最近登录 + 最近操作"
   合成一条时间线：第一屏就有"这个人最近做了什么"，而不是五个静态字段加一片空白。 */
interface FeedItem {
  key: string;
  title: string;
  meta: string;
  tone: 'ok' | 'danger' | 'info';
  at: string;
}

const recentFeed = computed<FeedItem[]>(() => {
  const d = data.value;
  if (!d) return [];
  const logins: FeedItem[] = (d.recentLogins ?? []).map(row => ({
    key: `login-${row.createdAt}-${row.appId}-${row.ip}`,
    title: row.failed ? '登录失败' : '登录成功',
    meta: [row.appId, row.location, row.ip, when(row.createdAt)].filter(Boolean).join(' · '),
    tone: row.failed ? 'danger' : 'ok',
    at: row.createdAt ?? ''
  }));
  const ops: FeedItem[] = (d.recentOps ?? []).map(row => ({
    key: `op-${row.createdAt}-${row.event}-${row.ip}`,
    title: row.event,
    meta: [row.appId, row.ip, when(row.createdAt)].filter(Boolean).join(' · '),
    tone: 'info',
    at: row.createdAt ?? ''
  }));
  return [...logins, ...ops].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
});

/* ── 操作区 ───────────────────────────────────────────────── */

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
  /*
   * 后端 `manageable` 是**一票否决**（操作者职级 > 目标职级，超管恒真）。
   * 下面那套 `canManageUser` 是拿详情里的角色信息粗算的，只用来补 reason 文案。
   */
  if (d.manageable === false) {
    return { ok: false, reason: '你的职级不高于该账号，无法操作' };
  }
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
const canDeleteUser = computed(
  () =>
    options.value.scope?.isSuper === true &&
    auth.hasPermission('admin:user:purge') &&
    data.value?.manageable !== false
);
const canTempPassword = computed(
  () =>
    options.value.scope?.isSuper === true &&
    auth.hasPermission('admin:user:temp-password') &&
    data.value?.manageable !== false
);
const canDeactivateApp = computed(
  () => auth.hasPermission('admin:user:deactivate') && data.value?.manageable !== false
);
/** 是否有「更多」里的动作可点 */
const hasMoreActions = computed(
  () => canToggleStatus.value || canViewGrants.value || canDeleteUser.value || canTempPassword.value || canDeactivateApp.value
);

/**
 * 不能编辑时的原因
 *
 * 按钮保持可见但禁用，旁边一行写清为什么 —— 直接隐藏按钮，用户会以为"这个页面没有
 * 编辑功能"，然后去别处找。
 */
const editDenyReason = computed(() => {
  if (canEditUser.value) return '';
  if (!auth.hasPermission('admin:user:update')) return '没有「编辑用户」权限，只能查看';
  return manageVerdict.value.reason || '不能编辑这个账号';
});

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
    rankLevel: u.rankLevel ?? 0,
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
const toastStore = useToastStore();
const confirmStore = useConfirmStore();

/**
 * 提示
 *
 * @param message 文案
 */
function notify(message: string): void {
  toastStore.push(message);
}

/** 刷新详情（保持当前页签；页签来自 URL，这里不碰它） */
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

/** 失败块的标题（403 / 404 各说一句人话，其余按"加载失败"） */
const errorTitle = computed(() => {
  if (errorStatus.value === 403) return '你的职级不高于该账号，看不到他的角色、权限与设备';
  if (errorStatus.value === 404) return '这个用户不存在或已被删除';
  return '这一页没能加载出来';
});

/** 失败块是否给「重试」（403/404 重试也没用，只给返回列表） */
const canRetry = computed(() => errorStatus.value !== 403 && errorStatus.value !== 404);

/** 重试 */
function retry(): void {
  if (props.userId !== null) void fetchProfile(props.userId, true);
}

/*
 * 首次挂载即拉取
 *
 * 放在脚本末尾：watch 是 `immediate`，组件初始化时就执行，而 `options` / `loadOptions`
 * 都声明在上面 —— 提前写会撞上 TDZ（`Cannot access before initialization`）。
 */
watch(
  () => props.userId,
  id => {
    if (id === null) return;
    void fetchProfile(id, true);
    // 选项只在还没拉到过时取一次：反复进出不该重复打 /users/options
    if (options.value.roles.length === 0) void loadOptions();
  },
  { immediate: true }
);
</script>

<template>
  <div v-if="userId !== null" class="profile-page">
    <div class="drawer drawer--page">
      <!-- ── 页头：面包屑 + 身份 + 读数 + 操作 ───────────────── -->
      <header class="profile-head">
        <nav class="profile-crumb" aria-label="面包屑">
          <button class="profile-crumb__link" type="button" @click="backToList">用户管理</button>
          <ChevronRight class="profile-crumb__sep" :size="12" aria-hidden="true" />
          <span class="profile-crumb__here" aria-current="page">{{ data?.user.username || '用户详情' }}</span>
        </nav>

        <!-- 加载中：页头骨架。操作区此刻不渲染（按钮出现在数据之后） -->
        <div v-if="loading" class="profile-head__skel" aria-hidden="true">
          <span class="profile-skel profile-skel--avatar"></span>
          <span class="profile-skel profile-skel--title"></span>
          <span class="profile-skel profile-skel--sub"></span>
        </div>

        <div v-else-if="data" class="profile-hero">
          <div class="profile-hero__id">
            <span class="profile-avatar" aria-hidden="true">
              <img v-if="data.user.avatar" :src="data.user.avatar" alt="" />
              <span v-else-if="initial">{{ initial }}</span>
              <UserRound v-else :size="26" />
            </span>
            <div class="profile-hero__text">
              <div class="profile-hero__name-row">
                <h1 class="profile-hero__name">{{ data.user.username }}</h1>
                <span :class="['tag', data.user.status === 1 ? 'tag--ok' : 'tag--off']">{{ statusText }}</span>
              </div>
              <p class="profile-hero__sub">{{ headSub }}</p>
            </div>
          </div>

          <!--
            三个读数从"一行小字"升级成指标块：这一页第一眼要回答的是
            "这个人的权限规模有多大"，等宽 mono 小字挤在名字右边时，
            它和邮箱、部门同级，读者扫不到。0 也照常显示（弱化数字），
            因为"0 个角色"本身就是这条记录最重要的信息。
          -->
          <div class="profile-stats" role="group" aria-label="账号规模">
            <div class="profile-stat">
              <span :class="['profile-stat__n', { 'is-zero': statRoles === 0 }]">{{ statRoles }}</span>
              <span class="profile-stat__k">角色</span>
            </div>
            <div class="profile-stat">
              <span :class="['profile-stat__n', { 'is-zero': permCount === '0' }]">{{ permCount }}</span>
              <span class="profile-stat__k">权限</span>
            </div>
            <div class="profile-stat">
              <span :class="['profile-stat__n', { 'is-zero': statApps === 0 }]">{{ statApps }}</span>
              <span class="profile-stat__k">应用</span>
            </div>
          </div>

          <div class="profile-hero__actions">
            <span v-if="!canEditUser" class="profile-head__reason">{{ editDenyReason }}</span>
            <button
              class="btn btn--primary"
              type="button"
              :disabled="!canEditUser"
              :title="canEditUser ? '编辑这个账号的资料与角色' : editDenyReason"
              @click="openEdit"
            >
              <Pencil :size="15" aria-hidden="true" /> 编辑资料
            </button>
            <button
              v-if="hasMoreActions"
              class="btn btn--ghost btn--icon"
              type="button"
              aria-label="更多操作"
              @click="sheetOpen = true"
            >
              <MoreHorizontal :size="18" aria-hidden="true" />
            </button>
          </div>
        </div>

        <p v-else class="page__title profile-head__void">用户详情</p>
      </header>

      <!-- ── 页签（≥821）：页面级二级导航 ─────────────────────
           仅用于页面级二级导航，筛选控件仍用 .tabbar -->
      <nav v-if="data" class="profile-nav" aria-label="用户详情页签">
        <button
          v-for="item in TABS"
          :key="item.key"
          :class="['profile-nav__item', { 'is-on': tab === item.key }]"
          type="button"
          :aria-current="tab === item.key ? 'page' : undefined"
          @click="selectTab(item.key)"
        >
          {{ item.label }}
        </button>
      </nav>

      <!-- ── 页签（≤820）：通栏横滑胶囊（形态不变） ──────────── -->
      <div v-if="data" class="tabbar" role="tablist" aria-label="用户详情页签">
        <button
          v-for="item in TABS"
          :key="item.key"
          type="button"
          role="tab"
          :aria-selected="tab === item.key"
          :class="['tab', { 'is-on': tab === item.key }]"
          @click="selectTab(item.key)"
        >
          <component :is="item.icon" :size="14" aria-hidden="true" />
          {{ item.label }}
        </button>
      </div>

      <div class="drawer__body" :aria-busy="loading || undefined">
        <!-- 加载中：3 行骨架 -->
        <div v-if="loading" class="profile-skeletons">
          <div class="skeleton-row"></div>
          <div class="skeleton-row"></div>
          <div class="skeleton-row"></div>
        </div>

        <!-- 加载失败 / 无权查看：一句人话 + 出口 + 小字原因 -->
        <div v-else-if="errorMessage" class="profile-error" role="alert">
          <p class="profile-error__title">
            <ShieldAlert :size="16" aria-hidden="true" />
            {{ errorTitle }}
          </p>
          <p class="profile-error__reason">{{ errorMessage }}</p>
          <div class="profile-error__actions">
            <button v-if="canRetry" class="btn btn--primary" type="button" @click="retry">重试</button>
            <button class="btn" type="button" @click="backToList">返回用户列表</button>
          </div>
        </div>

        <template v-else-if="data">
          <!-- 概览：左「账号信息」+ 右「最近动态」。宽屏两栏，窄屏堆叠 -->
          <template v-if="tab === 'overview'">
            <div class="overview-grid">
              <section class="panel">
                <header class="panel__head">
                  <span class="panel__title">账号信息</span>
                </header>
                <div class="panel__body">
                  <dl class="fact-grid">
                    <div v-for="fact in facts" :key="fact.label" class="fact">
                      <dt class="fact__label">{{ fact.label }}</dt>
                      <dd
                        :class="['fact__value', { mono: fact.mono, 'is-empty': !fact.value }]"
                        :title="fact.value ? undefined : '未设置'"
                      >
                        {{ fact.value || '未设置' }}
                      </dd>
                    </div>
                  </dl>
                  <!--
                    只在"看不到编辑权"时补一句：这是权限说明，不是使用提示。
                    「点页签看明细」那句已删 —— 下划线页签本身就是"可点"的明示，
                    每屏常驻一句话，等于用一条噪音换零信息。
                  -->
                  <p v-if="!data.canEdit" class="hint hint--panel">
                    职级低于对方的账号看不到这里的任何内容。
                  </p>
                </div>
              </section>

              <section class="panel">
                <header class="panel__head">
                  <span class="panel__title">最近动态</span>
                  <span v-if="recentFeed.length" class="panel__note">最近 {{ recentFeed.length }} 条</span>
                </header>
                <div class="panel__body">
                  <ul v-if="recentFeed.length" class="feed">
                    <li v-for="item in recentFeed" :key="item.key" class="feed__item">
                      <span class="feed__dot" :data-tone="item.tone" aria-hidden="true"></span>
                      <span class="feed__title">{{ item.title }}</span>
                      <span class="feed__meta mono">{{ item.meta }}</span>
                    </li>
                  </ul>
                  <div v-else class="profile-empty profile-empty--sm">
                    <History :size="22" aria-hidden="true" />
                    <p class="profile-empty__title">还没有活动记录</p>
                    <span class="profile-empty__sub">登录与操作会在产生后出现在这里</span>
                  </div>
                </div>
              </section>
            </div>
          </template>

          <!-- 应用：表头常驻，空数据给一行「空表格」而不是一句灰字 ——
               空态缩成一句话时，整块内容会塌掉，读者也看不出"这里本该有什么列" -->
          <template v-else-if="tab === 'apps'">
            <section class="panel">
              <div class="table-wrap">
                <table class="table">
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
                    <tr v-if="!data.apps.length">
                      <td colspan="3" class="table-empty-cell">
                        <div class="table-empty">
                          <AppWindow :size="24" aria-hidden="true" />
                          <p class="table-empty__title">该账号还没有任何应用账号</p>
                          <span class="table-empty__sub">首次登录某个应用后，这里会出现它的授权状态与最近活跃时间</span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </template>

          <!-- 角色与权限 -->
          <template v-else-if="tab === 'perms'">
            <div class="panel-stack">
              <section class="panel">
                <header class="panel__head">
                  <span class="panel__title">角色（{{ data.access.roles.length }}）</span>
                </header>
                <div class="table-wrap">
                  <table class="table">
                    <colgroup>
                      <col />
                      <col style="width: 150px" />
                      <col style="width: 104px" />
                    </colgroup>
                    <!--
                      不设表头：上面的面板标题已经是「角色（N）」，再来一行「角色 / 应用 / 职级」
                      就是同一个头说两遍。三列各自自解释 —— 角色名 + 编码、应用标签芯片、
                      「门槛 80」自带量词，去掉表头不影响读。
                    -->
                    <tbody>
                      <tr v-for="role in data.access.roles" :key="role.role_id">
                        <td>
                          <span class="role-cell__name">{{ role.role_name }}</span>
                          <span class="mono role-cell__code">{{ role.role_code }}</span>
                        </td>
                        <td><span class="tag tag--info" title="角色所属应用">{{ role.app_label }}</span></td>
                        <!-- 与角色管理页同一说法：「门槛」= 要多大职级才能把这个角色授出去，
                             不是持有者的职级（写 Lv 80 会被读成"这人 80 级"） -->
                        <td class="mono" :title="`授予门槛 ${role.rank_level}：要 ${role.rank_level} 级以上才能授予此角色`">
                          门槛 {{ role.rank_level }}
                        </td>
                      </tr>
                      <tr v-if="!data.access.roles.length">
                        <td colspan="3" class="table-empty-cell">
                          <div class="table-empty">
                            <ShieldCheck :size="24" aria-hidden="true" />
                            <p class="table-empty__title">这个账号还没有任何角色</p>
                            <span class="table-empty__sub">没有角色就没有任何权限，只能看到登录页；请到「角色管理」授予</span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section class="panel">
                <header class="panel__head">
                  <span class="panel__title">权限码（{{ permCount }}）</span>
                  <span v-if="!data.canEdit" class="panel__note">只读：只能调整职级低于自己的账号</span>
                </header>
                <div class="panel__body">
                  <!--
                    🔴 **只读**。这里以前是「继承 / 允许 / 拒绝」三态开关，点一下就直接
                       写个人策略 —— 而这是一个"看一眼这个人是谁"的页面，不是编辑面。
                       详情页里放可写控件有两个具体问题：
                       ① 误触无声生效（没有保存步骤，点错即落库）；
                       ② 权限的来源被藏起来了 —— 三态只表达"当前处置"，看不出这条码是
                          角色给的、还是个人额外授予、还是被单独拒绝。
                       现在只读：把**来源**直接写在行上，要改去角色侧。
                  -->
                  <div v-if="permGroups.length" class="perm-groups">
                    <section v-for="group in permGroups" :key="group.appId" class="perm-group">
                      <h4 class="perm-group__head">
                        <span class="perm-group__label">{{ group.label }}</span>
                        <span class="perm-group__count mono">{{ group.rows.length }}</span>
                      </h4>
                      <div class="perm-grid">
                        <div v-for="row in group.rows" :key="row.code" class="perm">
                          <span class="mono perm__code" :title="row.code">{{ row.code }}</span>
                          <span class="perm__effect" :data-effect="row.effect">{{ effectLabel(row.effect) }}</span>
                        </div>
                      </div>
                    </section>
                  </div>
                  <div v-else class="table-empty">
                    <KeyRound :size="24" aria-hidden="true" />
                    <p class="table-empty__title">这个账号没有任何权限码</p>
                    <span class="table-empty__sub">权限码来自角色授予；给他一个角色后，这里会列出实际生效的码</span>
                  </div>
                  <!-- 文案只说**现在真能去的地方**。写"到编辑页处理"会指向一个
                       目前并不存在的入口（用户编辑弹窗里没有个人策略）。 -->
                  <p v-if="permGroups.length" class="hint">
                    权限来自角色授予；标「个人拒绝」的会覆盖角色，「个人允许」是角色之外的额外授权。
                    要调整请到「角色管理」修改对应角色。
                  </p>
                </div>
              </section>
            </div>
          </template>

          <!-- 设备：这个账号在哪些设备上登录着，可单独踢某一台下线 -->
          <template v-else-if="tab === 'devices'">
            <section class="panel">
              <header class="panel__head">
                <span class="panel__title">设备（{{ sessions.length }}）</span>
                <span class="panel__note">同一设备在同一应用里只算一台</span>
              </header>
              <div class="panel__body">
                <div v-if="sessionsLoading" class="empty">设备列表加载中…</div>
                <p v-else-if="sessionsError" class="tag tag--off">{{ sessionsError }}</p>
                <div v-else-if="!sessions.length" class="table-empty">
                  <MonitorSmartphone :size="24" aria-hidden="true" />
                  <p class="table-empty__title">这个账号没有任何设备会话</p>
                  <span class="table-empty__sub">登录任意应用后，设备、IP 与最后活跃时间会出现在这里</span>
                </div>

                <ul v-else class="dev-grid">
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
                      class="btn btn--ghost btn--sm dev__kick"
                      type="button"
                      :disabled="kicking === row.device_id"
                      :title="row.is_current ? '当前设备：下线会立即退出登录' : `让设备 ${row.device_id} 下线`"
                      @click="kickSession(row)"
                    >
                      <PowerOff :size="13" aria-hidden="true" />
                      {{ kicking === row.device_id ? '处理中…' : row.is_current ? '退出本机' : '下线' }}
                    </button>
                  </li>
                </ul>

                <p v-if="sessions.length" class="hint">
                  踢下线只影响这一台设备，该账号的其他设备不受影响。设备码是识别设备的依据；
                  「活跃」表示会话仍有效，「已过期」表示记录还在但会话已到期 —— 点下线会清掉这条记录。
                </p>

                <p v-if="kickNotice" class="dev__notice">{{ kickNotice }}</p>
              </div>
            </section>
          </template>

          <!-- 记录：宽屏并排，窄屏上下堆叠。两张都是表格 —— 即便没有记录，
               表头也照常渲染，空行里放空状态，页面骨架不会塌 -->
          <template v-else>
            <div class="record-grid">
              <section class="panel">
                <header class="panel__head">
                  <span class="panel__title">最近操作（{{ data.recentOps.length }}）</span>
                </header>
                <div class="table-wrap flat-list">
                  <table class="table">
                    <colgroup>
                      <!-- 时间列要放得下 `2026-11-20 20:44`（16 字），132px 时会截成 `2026-11-20 2…` -->
                      <col style="width: 152px" />
                      <col />
                      <col style="width: 150px" />
                    </colgroup>
                    <!-- 表头与面板标题重复（时间/事件/来源 vs 最近操作），故不设 thead；
                         三列自解释：时间戳、事件描述、"应用 · IP" -->
                    <tbody>
                      <tr v-for="(row, i) in data.recentOps" :key="`op-${i}`">
                        <td class="mono">{{ when(row.createdAt) }}</td>
                        <!-- 事件码翻译成「删除了部门 X」这类人话：与操作日志页同一份 summarize -->
                        <td :title="`${row.event} · ${row.userAgent || ''}`">
                          {{ summarizeOperEvent({ action: row.event, detail: row.detail ?? '' }) }}
                        </td>
                        <!--
                          来源拆两行：`管理后台 · 127.0.0.1` 挤在 150px 里会被截成
                          「管理后台 · 127.0.0…」—— 数字断在中间最难读，且看不出是 IP。
                          应用名在上（弱色）、IP 在下（等宽），两行都在 row-h 内。
                        -->
                        <td class="source-cell">
                          <span class="source-cell__app">{{ appText(row.appId) }}</span>
                          <span class="source-cell__ip mono">{{ row.ip }}</span>
                        </td>
                      </tr>
                      <tr v-if="!data.recentOps.length">
                        <td colspan="3" class="table-empty-cell">
                          <div class="table-empty">
                            <History :size="24" aria-hidden="true" />
                            <p class="table-empty__title">没有操作记录</p>
                            <span class="table-empty__sub">这个账号还没有产生被审计的后台操作</span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section class="panel">
                <header class="panel__head">
                  <span class="panel__title">最近登录（{{ data.recentLogins.length }}）</span>
                </header>
                <div class="table-wrap flat-list">
                  <table class="table">
                    <colgroup>
                      <!-- 时间列要放得下 `2026-11-20 20:44`（16 字），132px 时会截成 `2026-11-20 2…` -->
                      <col style="width: 152px" />
                      <col />
                      <col style="width: 150px" />
                    </colgroup>
                    <!-- 表头与面板标题重复（时间/事件/来源 vs 最近操作），故不设 thead；
                         三列自解释：时间戳、事件描述、"应用 · IP" -->
                    <tbody>
                      <tr v-for="(row, i) in data.recentLogins" :key="`lg-${i}`" :title="row.userAgent || ''">
                        <td class="mono">{{ when(row.createdAt) }}</td>
                        <td :class="{ 'text-danger': row.failed }">
                          {{ row.failed ? '登录失败' : '登录成功' }}
                          <span v-if="row.failed && failReason(row.detail)" class="record-reason">
                            · {{ failReason(row.detail) }}
                          </span>
                        </td>
                        <td class="mono">
                          {{ row.ip }}{{ row.location ? ` · ${row.location}` : '' }}
                        </td>
                      </tr>
                      <tr v-if="!data.recentLogins.length">
                        <td colspan="3" class="table-empty-cell">
                          <div class="table-empty">
                            <UserCheck :size="24" aria-hidden="true" />
                            <p class="table-empty__title">没有登录记录</p>
                            <span class="table-empty__sub">该账号还没有通过任何应用登录</span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </template>
        </template>
      </div>

      <!--
        底部操作条（仅 ≤820）

        列表行上那排图标按钮（授权记录 / 高危 / 编辑 / 冻结）在 390px 上放不下，
        全部收进这一屏：一个主按钮「编辑」，其余进「更多」。
        ≥821 时这条整体隐藏 —— 同一动作不能在页头与页脚同时出现。
      -->
      <footer v-if="data" class="page-actions">
        <p v-if="!canEditUser" class="page-actions__reason">{{ editDenyReason }}</p>
        <button
          class="btn btn--primary page-actions__main"
          type="button"
          :disabled="!canEditUser"
          :title="canEditUser ? '编辑这个账号的资料与角色' : editDenyReason"
          @click="openEdit"
        >
          <Pencil :size="15" aria-hidden="true" /> 编辑资料
        </button>
        <button
          v-if="hasMoreActions"
          class="btn page-actions__more"
          type="button"
          aria-label="更多操作"
          @click="sheetOpen = true"
        >
          <MoreHorizontal :size="18" aria-hidden="true" />
        </button>
      </footer>
    </div>

    <!-- 「更多」面板：从底部升起 -->
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
  </div>
</template>

<style scoped>
/* 登录失败的原因：跟在红色"登录失败"后面，色弱一档，避免整行都是警告色 */
.record-reason {
  color: var(--mauth-text-faint);
  font-size: 11.5px;
}

/*
 * 整页：与用户列表同一条内容带
 *
 * 外层 `.page` 已经给了内边距与可用宽度，这里**不再**限宽或画卡片边框 ——
 * 从列表点进来时宽度不该变窄一圈（那看起来像跳进了一个弹窗）。
 *
 * 🔴 `drawer` / `drawer--page` 这两个类名保留（虽然抽屉模式已删除）：手机主题包
 *    （pocket/mobile/console/kit）按 `.wx .wxbody .drawer.drawer--page` 与
 *    `.drawer--page .tabbar` 覆盖这一页的外观，改名会让那套覆盖静默失效。
 */
.profile-page {
  display: block;
  padding: 0;
  background: transparent;
}

.drawer--page {
  display: block;
  width: 100%;
  max-width: none;
  height: auto;
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: visible;
}

.drawer__body {
  min-width: 0;
}

/* ── 页头 ─────────────────────────────────────────────────── */
.profile-head {
  padding: 0 0 14px;
}

/* 面包屑：整页的"从这里点进来、点这里退出去"。≤820 交给外壳的返回箭头 */
.profile-crumb {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--mauth-text-faint);
}

.profile-crumb__link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--mauth-text-soft);
  font: inherit;
  cursor: pointer;
  transition: color 0.16s var(--ease);
}

.profile-crumb__link:hover {
  color: var(--mauth-primary);
}

.profile-crumb__sep {
  flex: none;
  color: var(--mauth-text-faint);
}

.profile-crumb__here {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * ── 身份 Hero ────────────────────────────────────────────────
 * 这一页第一眼要回答两件事：这是谁、他有多大权限。
 * 所以名字、状态、三个读数各自成为视觉块，而不是排成一串同级小字 ——
 * 一排 12px 灰字里没有主角，读者扫过去只会看到"一片字"。
 * 极淡的主色渐变只负责给这块定住范围，不做装饰性大色块。
 */
.profile-hero {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px 18px;
  padding: 16px 18px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-md);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--mauth-primary) 5%, var(--mauth-surface)),
    var(--mauth-surface) 42%
  );
  box-shadow: var(--e1);
}

.profile-hero__id {
  display: flex;
  flex: 1 1 320px;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.profile-hero__text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.profile-hero__name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.profile-hero__name {
  margin: 0;
  overflow: hidden;
  color: var(--mauth-text);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.022em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * 状态标签是这一行里最容易被压扁的东西
 *
 * `.tag` 是 inline-flex + 内边距，放进 flex 行里默认 `flex-shrink: 1`：空间不够时
 * 它会被压到只剩一个字宽，「正常」就竖着排了（390 宽实测）。所以它是**刚性单行**，
 * 宁可让名字截断、或让它自己换行，也不许压缩文字。
 */
.profile-hero__name-row > .tag {
  flex: none;
  white-space: nowrap;
}

.profile-hero__sub {
  margin: 0;
  overflow: hidden;
  color: var(--mauth-text-soft);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 头像 56：页头的锚点。纯数字账号没有首字母，退回头像图标 */
.profile-avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 56px;
  height: 56px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--mauth-primary) 16%, var(--mauth-border));
  border-radius: 50%;
  background: color-mix(in srgb, var(--mauth-primary) 9%, var(--mauth-surface));
  color: var(--mauth-primary);
  font-size: 22px;
  font-weight: 700;
}

.profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 指标块：数字是主体，标签是说明。0 用弱色，但不隐藏 —— "0 个角色"本身是信息 */
.profile-stats {
  display: flex;
  flex: none;
  align-items: stretch;
  margin: 0;
}

.profile-stat {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 62px;
  padding: 2px 16px;
  border-left: 1px solid color-mix(in srgb, var(--mauth-border) 85%, transparent);
}

.profile-stat:first-child {
  padding-left: 0;
  border-left: 0;
}

.profile-stat__n {
  color: var(--mauth-text);
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.profile-stat__n.is-zero {
  color: var(--mauth-text-faint);
  font-weight: 600;
}

.profile-stat__k {
  color: var(--mauth-text-soft);
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: var(--mauth-track-eyebrow);
}

.profile-hero__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

/* 不能编辑的原因：贴在按钮左边一行 12px —— 不是错误，所以不用危险色 */
.profile-head__reason {
  max-width: 22em;
  font-size: 12px;
  color: var(--mauth-text-soft);
  text-align: right;
  line-height: 1.4;
}

/* 失败态只留一句标题，不摆一个空的身份栏 */
.profile-head__void {
  margin: 0;
}

/* 页头骨架：与真实页头同高，加载完不跳版 */
.profile-head__skel {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: center;
  gap: 4px 12px;
}

.profile-skel {
  border-radius: 999px;
  background: linear-gradient(90deg, var(--mauth-hover), var(--mauth-press), var(--mauth-hover));
  background-size: 200% 100%;
  animation: profile-skel 1.2s ease infinite;
}

.profile-skel--avatar {
  grid-row: 1 / span 2;
  width: 44px;
  height: 44px;
  border-radius: 50%;
}

.profile-skel--title {
  width: 168px;
  height: 18px;
}

.profile-skel--sub {
  width: 240px;
  max-width: 100%;
  height: 12px;
}

@keyframes profile-skel {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

/* ── 页签（≥821 下划线二级导航） ─────────────────────────────
 * 仅用于页面级二级导航，筛选控件仍用 .tabbar。
 */
.profile-nav {
  display: none;
  gap: 2px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--mauth-border);
  overflow-x: auto;
  scrollbar-width: none;
}

.profile-nav::-webkit-scrollbar {
  display: none;
}

.profile-nav__item {
  position: relative;
  flex: none;
  height: 36px;
  padding: 0 12px;
  border: 0;
  background: none;
  color: var(--mauth-text-mid);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: color 0.16s var(--ease);
}

.profile-nav__item:hover {
  color: var(--mauth-text);
}

.profile-nav__item.is-on {
  color: var(--mauth-primary);
  font-weight: 620;
}

/* 2px 底部指示条：压在分隔线上，与侧栏的选中竖条同一套"位置即状态"的语言。
   `bottom: 0` 而不是 -1px —— 容器 overflow-x:auto 会裁掉溢出的 1px */
.profile-nav__item.is-on::after {
  content: '';
  position: absolute;
  right: 10px;
  bottom: 0;
  left: 10px;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--mauth-primary);
}

/* ── 页签（≤820 通栏横滑胶囊，形态沿用） ───────────────────── */
@media (max-width: 820px) {
  .tabbar {
    display: flex;
    flex-wrap: nowrap;
    gap: 6px;
    height: auto;
    margin: 0 0 12px;
    padding: 8px 0;
    position: sticky;
    /* 吸在顶栏之下（外壳顶栏 64 高且 sticky）：top:0 会让它滑到顶栏底下藏起来 */
    top: var(--topbar-h);
    z-index: 3;
    border: 0;
    border-bottom: 1px solid var(--mauth-border);
    border-radius: 0;
    background: var(--mauth-bg);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .tabbar::-webkit-scrollbar {
    display: none;
  }

  .tabbar .tab {
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

  /* 选中用主色实底：手机上"浅底 + 主色字"在强光下几乎看不出选中。
     字色只读 `--mauth-on-primary`（48 份配色表全都有这一项），不留写死的白色兜底 */
  .tabbar .tab.is-on {
    border-color: var(--mauth-primary);
    background: var(--mauth-primary);
    color: var(--mauth-on-primary);
    font-weight: 600;
    box-shadow: none;
  }

  .tabbar .tab.is-on:hover {
    color: var(--mauth-on-primary);
  }

  /* 面包屑与页头操作在手机上撤掉：退回列表靠外壳的返回箭头，操作在底部条 */
  .profile-crumb {
    display: none;
  }

  .profile-hero__actions {
    display: none;
  }

  /*
   * 页头在 390 宽：Hero 拆成三行 —— 身份 / 指标 / （操作已撤）
   * 状态标签靠右收口；名字过长就截断，标签整枚换行也不许压成竖排。
   */
  .profile-hero {
    gap: 12px;
    padding: 14px;
  }

  .profile-hero__id {
    flex: 1 1 100%;
  }

  .profile-hero__name {
    font-size: 20px;
  }

  .profile-avatar {
    width: 48px;
    height: 48px;
    font-size: 19px;
  }

  .profile-hero__name-row > .tag {
    margin-left: auto;
  }

  /* 指标块在手机上均分一行：三个数字 + 标签，是"一眼看到规模"的最小单位 */
  .profile-stats {
    width: 100%;
    padding-top: 12px;
    border-top: 1px solid color-mix(in srgb, var(--mauth-border) 85%, transparent);
  }

  .profile-stat {
    flex: 1;
    align-items: flex-start;
    min-width: 0;
    padding: 0 12px;
  }

  .profile-stat:first-child {
    padding-left: 0;
  }

  /* 手机上单列行式：一行一项，左标签右值，和系统设置的列表同一个读法 */
  .fact {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 2px;
    border-bottom: 1px solid color-mix(in srgb, var(--mauth-border) 78%, transparent);
  }

  .fact:last-child {
    border-bottom: 0;
  }

  .fact__label {
    flex: none;
    font-size: 12px;
  }

  .fact__value {
    min-width: 0;
    text-align: right;
  }

  /* 底部给固定操作条留位：两行（原因 + 按钮）也要放得下 */
  .drawer__body {
    padding-bottom: calc(120px + env(safe-area-inset-bottom));
  }
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* ── 概览字段网格 ─────────────────────────────────────────── */
.fact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 28px;
  margin: 0;
}

/* 概览在宽屏只占左栏（约 660），两列是这一栏的正确密度；三列会把邮箱挤成两行 */
@media (max-width: 820px) {
  .fact-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.fact {
  min-width: 0;
}

/*
 * 标签从 faint 提到 soft
 *
 * faint 是 2.6:1，只够做装饰性文字；「部门」「职级」这类字段名是必读信息，
 * 用 faint 时整页看起来像"没写标签"—— 这是"一眼看不到重点"的直接原因之一。
 */
.fact__label {
  color: var(--mauth-text-soft);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: var(--mauth-track-eyebrow);
}

.fact__value {
  margin: 3px 0 0;
  color: var(--mauth-text);
  font-size: 13.5px;
  font-weight: 500;
  word-break: break-word;
}

/* 空值写「未设置」而不是一个破折号：破折号看起来像"这一项坏了" */
.fact__value.is-empty {
  color: var(--mauth-text-faint);
  font-weight: 400;
}

@media (min-width: 821px) {
  .fact {
    padding: 10px 0 11px;
    border-bottom: 1px solid color-mix(in srgb, var(--mauth-border) 78%, transparent);
  }

  /* 两列时最后两项不再画线，否则表格看起来"没画完" */
  .fact:nth-last-child(-n + 2) {
    border-bottom: 0;
  }
}

/* ── 概览：账号信息 + 最近动态 ───────────────────────────────
   只有 6 个字段时，单栏铺满宽屏就是"几行字 + 一片空白"。
   给它配一条最近动态，宽屏两栏：左边是"他是谁"，右边是"他最近做了什么"。 */
.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

@media (max-width: 1199px) {
  .overview-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.feed {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.feed__item {
  display: grid;
  grid-template-columns: 8px auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 9px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--mauth-border) 78%, transparent);
}

.feed__item:last-child {
  border-bottom: 0;
}

.feed__dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--mauth-text-faint);
}

.feed__dot[data-tone='ok'] {
  background: var(--mauth-success);
}

.feed__dot[data-tone='danger'] {
  background: var(--mauth-danger);
}

.feed__dot[data-tone='info'] {
  background: var(--mauth-primary);
}

.feed__title {
  color: var(--mauth-text);
  font-size: 13px;
  font-weight: 550;
  white-space: nowrap;
}

.feed__meta {
  overflow: hidden;
  color: var(--mauth-text-soft);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 空态：图标 + 一句主文 + 一句解释。只有一行灰字时，空态看起来像"还没加载" */
.profile-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 26px 12px;
  color: var(--mauth-text-faint);
  text-align: center;
}

.profile-empty--sm {
  padding: 18px 8px;
}

.profile-empty__title {
  margin: 4px 0 0;
  color: var(--mauth-text-mid);
  font-size: 13px;
  font-weight: 600;
}

.profile-empty__sub {
  color: var(--mauth-text-soft);
  font-size: 11.5px;
}

/* ── 空表格 ─────────────────────────────────────────────────
   空态不缩成一句灰字：表头照常渲染，空行里给「图标 + 标题 + 一句解释」。
   这样任何页签都有骨架，读者也能看出"这里本该有哪些列、为什么是空的"。 */
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

/* 表格里的角色单元格：名称一行、编码一行，长列表也扫得动 */
.role-cell__name {
  display: block;
  color: var(--mauth-text);
  font-size: 13px;
}

.role-cell__code {
  display: block;
  margin-top: 1px;
  color: var(--mauth-text-soft);
  font-size: 10.5px;
}

.text-danger {
  color: var(--mauth-danger);
}

/* ── 面板 ─────────────────────────────────────────────────── */
.panel-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel__pad {
  padding: 14px 16px;
}

.panel__note {
  margin-left: auto;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.panel__title {
  margin-right: auto;
}

.record-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

/* ── 权限：按应用分组 ─────────────────────────────────────── */
.perm-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 组头 28 高：比正文行矮，读起来是"分区标题"而不是内容 */
.perm-group__head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  margin: 0;
  padding: 0 10px;
  border-radius: var(--mauth-radius-xs);
  background: var(--mauth-surface-2);
}

.perm-group__label {
  font-size: 11.5px;
  font-weight: 620;
  color: var(--mauth-text-mid);
}

.perm-group__count {
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

.perm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 2px 12px;
  padding: 4px 0 0;
}

.perm {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 5px 2px;
  border-bottom: 1px dashed var(--mauth-border);
}

.perm__code {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  color: var(--mauth-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 只读来源徽标：三种来源各一色，但视觉重量要小 ——
   它回答"这条权限从哪来"，不是让人点的操作。
   「角色继承」是绝大多数情况，用最淡的灰，不抢眼。 */
.perm__effect {
  flex: none;
  margin-left: auto;
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
  background: color-mix(in srgb, var(--mauth-danger) 9%, transparent);
  color: color-mix(in srgb, var(--mauth-danger) 78%, var(--mauth-text));
}

/* ── 角色表 ───────────────────────────────────────────────── */
.role-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.role-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-bottom: 1px dashed var(--mauth-border);
  font-size: 13px;
}

.role-list li:last-child {
  border-bottom: 0;
}

.role-list__name {
  min-width: 0;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-list__meta {
  margin-left: auto;
  flex: none;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

/* ── 设备卡片网格 ─────────────────────────────────────────── */
.dev-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 一台设备一张小卡，右侧是操作 —— 行内信息多但不该挤成一坨 */
.dev {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
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

.dev__kick {
  flex: none;
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

/* ── 记录 ─────────────────────────────────────────────────── */
.feed {
  list-style: none;
  margin: 0;
  padding: 0;
}

.feed li {
  display: grid;
  grid-template-columns: 108px minmax(0, 1fr) auto;
  gap: 10px;
  padding: 5px 0;
  border-bottom: 1px dashed var(--mauth-border);
  font-size: 12px;
}

.feed li:last-child {
  border-bottom: 0;
}

.feed__time {
  color: var(--mauth-text-faint);
}

.feed__main {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed__main.is-bad {
  color: var(--mauth-danger);
}

.feed__meta {
  color: var(--mauth-text-faint);
  text-align: right;
}

/* ── 失败块 ───────────────────────────────────────────────── */
.profile-error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  max-width: 46em;
  padding: 18px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-md);
  background: var(--mauth-surface);
}

.profile-error__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  font-weight: 620;
  color: var(--mauth-text);
}

/* 小字原因：给想追问的人看，不给所有人添一屏红字 */
.profile-error__reason {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--mauth-text-soft);
  word-break: break-word;
}

.profile-error__actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

/* 骨架行：借全局 .skeleton-row，只把左右外边距收齐到内容带 */
.profile-skeletons .skeleton-row {
  margin: 0 0 14px;
}

/* ── 底部操作条（仅 ≤820；≥821 时页头已有同一动作） ────────── */
.page-actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
  background: color-mix(in srgb, var(--mauth-bg) 90%, transparent);
  backdrop-filter: blur(14px);
  border-top: 1px solid var(--mauth-border);
}

/* 原因占满一整行，按钮不被挤成一枚小方块 */
.page-actions__reason {
  flex: 1 1 100%;
  margin: 0 2px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--mauth-text-soft);
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

/* ── 提示文字 ─────────────────────────────────────────────── */
.hint {
  max-width: 46em;
  margin: 10px 0 0;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--mauth-text-faint);
}

/* 面板内的说明：与字段网格之间用一条细虚线隔开，读起来是"这张卡的脚注"，
   而不是页面末尾飘着的一行字 */
.hint--panel {
  padding-top: 10px;
  border-top: 1px dashed var(--mauth-border);
}

/* ── 断点：≥821 桌面 ──────────────────────────────────────── */
@media (min-width: 821px) {
  /* 桌面：页签换下划线二级导航，胶囊条整条撤掉（同一页签不能有两个入口） */
  .profile-nav {
    display: flex;
  }

  .tabbar {
    display: none;
  }

  /* 操作在页头；页脚整条隐藏 */
  .page-actions {
    display: none;
  }

  /* 两列字段：821-1199 两列，够宽才谈得上"一行读完六个字段" */
  .fact-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px 24px;
  }

  .fact {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 0;
  }

  .fact__label {
    font-size: 11px;
  }

  .fact__value {
    text-align: left;
  }
}

/* ── 断点：≥1200 宽屏 ─────────────────────────────────────── */
@media (min-width: 1200px) {
  /*
   * 记录两块并排：宽屏下"操作"和"登录"是同一件事的两个面，对着看最省视线。
   * 概览的字段网格不跟着变三列 —— 它现在在左栏（约 660 宽）里，三列会把
   * 邮箱这种长值挤成两行；两列是这一栏的正确密度。
   */
  .record-grid {
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }
}
</style>
