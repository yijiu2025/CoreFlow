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
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
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
import { useThemePackage } from '@/composables/useThemePackage';
import { useAuthStore } from '@/stores/auth';
import { useRenderDevice } from '@/views/device/useRenderDevice';
import { ThemeView } from 'skinsuite/vue';
import type { ProfileViewContext } from '@/theme/views/profile';

const accentStore = useAccentStore();

/**
 * 界面风格（主题包）选择器
 *
 * 与主题色的分工：**风格**决定壳长什么样（侧栏 / TabBar / cell 列表），
 * **主题色**只换主色。两者互不冲突，但"微信"包会顺手把主色切到配套绿
 * （见 `useThemePackage` 文件头）。
 */
const { packages: stylePackages, current: currentStyle, pick: pickStyle } = useThemePackage();
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
/** 当前渲染设备：本页只靠 CSS 断点适配，但要告知主题（版式目录按设备查） */
const device = useRenderDevice();

/** 主色视图：直接给 store 实例（结构上满足 `AccentView`，读到的都是响应式值） */
const accent = accentStore;

/**
 * 界面风格视图
 *
 * `reactive` 包一层：`current` 是 computed，包成响应式对象后模板里的
 * `styles.current` 才会自动解包（普通对象里的 Ref 不会，比较永远不相等）。
 */
const styles = reactive({ packages: stylePackages, current: currentStyle, pick: pickStyle });


/**
 * 版式上下文
 *
 * 字段分两类：容器算好的结论（`*` 布尔、格式化后的文案）与容器持有的状态/动作。
 * 版式只读它们，不再自己判权限、不再自己取数。
 */
const ctx: ProfileViewContext = {
  userName: auth.me?.username || '管理员',
  nickname,
  avatar,
  avatarBroken,
  profileState,
  profileError,
  fileInput,
  uploading,
  avatarError,
  styles,
  accent,
  devices,
  devicesLoading,
  devicesError,
  deviceNotice,
  kicking,
  kickingAll,
  showRevoked,
  pruning,
  activeDevices,
  revokedDevices,
  visibleDevices,
  onPickAvatar,
  clearAvatar,
  isRevoked,
  deviceKind,
  uaSummary,
  when,
  kickDevice,
  kickOthers,
  pruneRevoked
};
</script>

<template>
  <!-- 页面长什么样在主题包里（`themes/<包>/<设备>/profile/`），容器只准备 ctx -->
  <ThemeView page="profile" :device="device" :ctx="ctx" scope="inherit" />
</template>
