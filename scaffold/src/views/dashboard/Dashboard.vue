<script setup lang="ts">
/**
 * 工作台 · Bento 主次布局
 *
 * 结构参考 scaffold-master 的工作台：12 列网格，登录脉搏作 span-8 主卡，
 * 两块侧卡、三块等分卡、最近登录与常用入口收尾。数据全部来自
 * `/dashboard/summary` 与 `/login-logs/stats`，没有一处前端估算或写死。
 *
 *   ① 页头：日期眉标 + 问候 + 一句话状态（透明层，不占卡片）；
 *   ② 主卡：登录脉搏（独立组件，自带 24h/7d/30d 时间档）；
 *   ③ 侧卡：在线用户 / 今日操作 —— 大数字 + 一句解释；
 *   ④ 等分卡：近 7 日操作趋势（失败贴底堆叠柱）、操作成功率（刻度环）、系统资源；
 *   ⑤ 收尾：最近登录（相对时间）+ 常用入口（图标瓦片）。
 *
 * 刻意不引图表库：柱/环/曲线 SVG 就够，不为首屏多下一个 chunk。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { dashboardSummary } from '@/api/monitor';
import { useAuthStore } from '@/stores/auth';
import { useRenderDevice } from '@/views/device/useRenderDevice';
import type { DashboardSummary, MenuNode } from '@/api/types';
import type { ShortcutItem } from '@/theme/views/dashboard';
import { ThemeView } from 'skinsuite/vue';
import type { DashboardViewContext } from '@/theme/views/dashboard';

const auth = useAuthStore();
/** 解析入口是否可达用（`router.resolve(path)`） */
const router = useRouter();
/** 用来把"当前这一页"从入口里排掉 */
const route = useRoute();

/** 当前渲染设备：本页版式只靠 CSS 断点适配，但要告知主题（版式目录按设备查） */
const device = useRenderDevice();

const data = ref<DashboardSummary | null>(null);
const loading = ref(true);
const errorMessage = ref('');

/**
 * 加载概览
 *
 * @returns 无
 */
async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    data.value = await dashboardSummary();
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

/** 问候语：按小时分档，比"欢迎回来"更像人说的话 */
const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 6) return '凌晨好';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
});

/** 今天（本地时区，带星期；不写年份 —— 天天看的东西越短越好） */
const today = computed(() => {
  const now = new Date();
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];
  return `${now.getMonth() + 1}月${now.getDate()}日 ${week}`;
});

/** 一句话状态：把"今天发生了什么"讲清楚，而不是堆四个数字 */
const statusLine = computed(() => {
  if (!data.value) return '';
  const { todayLogins, failedLogins, todayOps } = data.value;
  if (todayLogins === 0 && todayOps === 0) return '今天还没有活动，系统安静待命中。';
  const fail = failedLogins > 0 ? `，其中 ${failedLogins} 次失败` : '，全部成功';
  return `今天已有 ${todayLogins} 次登录${fail}，累计 ${todayOps} 次操作。`;
});

/** 近 7 天操作量：归一高度 + 今天索引（柱状图按参考项目 BarChart 风格渲染） */
const trendBars = computed(() => {
  const series = data.value?.trend || [];
  const max = Math.max(1, ...series.map(item => item.total));
  return series.map((item, index) => {
    const failed = Math.max(0, Math.min(item.failed, item.total));
    return {
      ...item,
      failed,
      // 空数据给 2px 占位，保证"有这一天"仍看得见
      height: `${Math.max(item.total ? 4 : 2, (item.total / max) * 100)}%`,
      failedShare: item.total === 0 ? 0 : Math.min(100, (failed / item.total) * 100),
      label: item.bucket.slice(5),
      // 序列最后一天即"今天"（后端按天生成、以当前日期收尾）
      isToday: index === series.length - 1
    };
  });
});

/** 峰值柱：无悬停时默认显示它的读数（参考项目行为） */
const trendPeakIndex = computed(() => {
  const series = data.value?.trend || [];
  if (!series.length) return null;
  return series.reduce((best, item, index) => (item.total > series[best].total ? index : best), 0);
});

/** 趋势峰值（标在卡头右侧，省一条 y 轴） */
/**
 * 在线人数
 *
 * 优先用后端按 Redis 有效会话算出的 `onlineUsers`；Redis 不可用时该字段为 null，
 * 回落到"近 24 小时成功登录数"，并把副标题换成对应口径 —— 数字和文案必须同源。
 */
const onlineCount = computed(() => data.value?.onlineUsers ?? data.value?.activeUsers ?? 0);

const trendMax = computed(() => Math.max(1, ...(data.value?.trend || []).map(item => item.total)));

/** 柱悬停索引：null 时显示峰值读数 */
const trendHover = ref<number | null>(null);

/* ── 操作成功率刻度环（参考项目 TickRing 的做法） ──
   60 根径向刻度按顺时针逐根点亮，每 5 根加长一档；末端一枚青柠点收口。
   比一整条粗弧更像仪表：能读出"走到圆周的哪个位置"。 */
const RING_TICKS = 60;
const RING_RATE = computed(() => Math.max(0, Math.min(100, data.value?.successRate ?? 0)));
const ringLit = computed(() => Math.round((RING_RATE.value / 100) * RING_TICKS));

/** 刻度端点：viewBox 归一化到 0..1，外径 .48、内径 .40（整五加长到 .37） */
const ringTicks = computed(() =>
  Array.from({ length: RING_TICKS }, (_, i) => {
    const angle = (i / RING_TICKS) * Math.PI * 2 - Math.PI / 2;
    const major = i % 5 === 0;
    const inner = major ? 0.37 : 0.4;
    return {
      key: i,
      x1: 0.5 + Math.cos(angle) * inner,
      y1: 0.5 + Math.sin(angle) * inner,
      x2: 0.5 + Math.cos(angle) * 0.48,
      y2: 0.5 + Math.sin(angle) * 0.48,
      major,
      on: i < ringLit.value
    };
  })
);

/** 点亮到位的末端收口点（落在刻度外侧一点，像秒针尖） */
const ringCap = computed(() => {
  if (!ringLit.value) return null;
  const angle = ((ringLit.value - 0.5) / RING_TICKS) * Math.PI * 2 - Math.PI / 2;
  return { x: 0.5 + Math.cos(angle) * 0.53, y: 0.5 + Math.sin(angle) * 0.53 };
});

/** 系统资源：四格读数（用户/角色/部门/菜单） */
const resources = computed(() => [
  { label: '用户总数', value: data.value?.users ?? 0 },
  { label: '角色', value: data.value?.roles ?? 0 },
  { label: '部门', value: data.value?.depts ?? 0 },
  { label: '菜单项', value: data.value?.menus ?? 0 }
]);

/**
 * 把菜单树压平成入口
 *
 * 只取「能点的页面」：`type === 'menu'` 且有 `path`。目录不下钻成入口（它自己不可点），
 * 但它的名字会作为副标 —— 工作台上「系统管理」这类分组信息比"系统/监控"的硬编码更准。
 *
 * 顶层直接挂的页面（工作台 `#1` 就是这种）没有父目录，副标用「总览」。
 *
 * @param nodes 菜单节点
 * @param dirName 上一层目录名（副标）
 * @returns 入口列表
 */
function flattenMenuEntries(nodes: MenuNode[], dirName = '总览'): ShortcutItem[] {
  const out: ShortcutItem[] = [];
  for (const node of nodes) {
    // 隐藏菜单不进侧栏，也就不该出现在这里
    if (Number(node.visible) === 0) continue;
    if (node.type === 'dir') {
      out.push(...flattenMenuEntries(node.children || [], node.name));
      continue;
    }
    if (node.type !== 'menu' || !node.path) continue;
    out.push({ label: node.name, path: node.path, sub: dirName, icon: node.icon });
  }
  return out;
}

/**
 * 常用入口 = 会话菜单树里"我这个账号进得去"的页面
 *
 * 为什么改成从菜单树来，而不是再维护一份清单：
 *   · 菜单树（`/session/routes`）已经按角色的 `sys_role_menu` 裁剪过，**它就是
 *     "这个账号能看见哪些页面"的权威答案**；再写一份清单等于同一件事两处表达，
 *     迟早出现"侧栏没有、工作台却有"或反过来。
 *   · 之前那份硬编码清单五项固定，卡片上却写着"按权限可见的页面" —— 名副其实不了。
 *
 * 两条过滤：
 *   · 不把**当前这一页**列成入口（在工作台上放一个"工作台"入口很怪）；
 *   · 菜单配了前端没有的 path 时不显示（点进去是 404，宁可少一项）。
 */
const shortcuts = computed(() =>
  flattenMenuEntries(auth.menus).filter(
    item => item.path !== route.path && router.resolve(item.path).name !== 'not-found'
  )
);

/**
 * 相对时间：日志里"3 分钟前"比一串日期更容易判断新鲜度
 *
 * @param iso 时间串
 * @returns 形如 `刚刚` / `12 分钟前` / `3 天前`
 */
function ago(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '—';
  const diff = Date.now() - time;
  if (diff < 60000) return '刚刚';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

/**
 * 首字母（无头像时的兜底）
 *
 * @param name 账号
 * @returns 单个字符
 */
function initial(name: string | null): string {
  return (name || '?').trim().charAt(0).toUpperCase();
}

onMounted(load);
/** 顶栏问候语里的账号名（版式不碰 store，这里算好再给） */
const userName = computed(() => auth.me?.username || '管理员');


/**
 * 版式上下文
 *
 * 字段分两类：容器算好的结论（`*` 布尔、格式化后的文案）与容器持有的状态/动作。
 * 版式只读它们，不再自己判权限、不再自己取数。
 */
const ctx: DashboardViewContext = {
  data,
  loading,
  errorMessage,
  userName,
  greeting,
  today,
  statusLine,
  trendBars,
  trendPeakIndex,
  onlineCount,
  trendMax,
  trendHover,
  ringTicks,
  ringCap,
  resources,
  shortcuts,
  load,
  ago,
  initial
};
</script>

<template>
  <!-- 页面长什么样在主题包里（`themes/<包>/<设备>/dashboard/`），容器只准备 ctx -->
  <ThemeView page="dashboard" :device="device" :ctx="ctx" scope="inherit" />
</template>
