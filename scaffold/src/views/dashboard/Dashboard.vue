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
import { computed, onMounted, ref, type Component } from 'vue';
import { useRouter } from 'vue-router';
import { Building2, LogIn, ScrollText, ShieldCheck, Users } from 'lucide-vue-next';
import { dashboardSummary } from '@/api/monitor';
import { useAuthStore } from '@/stores/auth';
import { useRenderDevice } from '@/views/device/useRenderDevice';
import type { DashboardSummary } from '@/api/types';
import { ThemeView } from 'skinsuite/vue';
import { filterByRoutePermission } from '@/utils/permission';
import type { DashboardViewContext } from '@/theme/views/dashboard';

const auth = useAuthStore();
/** 解析入口所需权限码用（`router.resolve(to).meta.permission`） */
const router = useRouter();

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
 * 常用入口清单（产品精选的五个，不是"全部页面"）
 *
 * 这里只写**去哪**和怎么显示，不写权限码 —— 权限从路由的 `meta.permission` 解析。
 * 两条理由：
 *   1. 单一来源：路由改了权限码，入口自动跟着变，不会出现"入口还在、点进去 403"；
 *   2. 与守卫同源：守卫的判据正是 `meta.permission`，同一个码决定"能不能进"和
 *      "要不要显示"，两边不可能分叉。
 *
 * 之前这里是一份写死的数组，而卡片标题旁写着"按权限可见的页面" ——
 * 于是没权限的人照样看到五个入口，点进去被弹回无权限页。
 */
const SHORTCUTS: Array<{ label: string; path: string; sub: string; icon: Component }> = [
  { label: '用户管理', path: '/system/user', sub: '系统', icon: Users },
  { label: '角色管理', path: '/system/role', sub: '系统', icon: ShieldCheck },
  { label: '部门管理', path: '/system/dept', sub: '系统', icon: Building2 },
  { label: '操作日志', path: '/monitor/oper-log', sub: '监控', icon: ScrollText },
  { label: '登录日志', path: '/monitor/login-log', sub: '监控', icon: LogIn }
];

/**
 * 按权限过滤后的入口
 *
 * 🔴 必须是 `computed`：`auth.me` 是异步拉取的（`/session/me`），
 *    在 setup 阶段直接过滤会把五个入口全滤掉（那时 permissions 还是空的），
 *    表现为"刷新工作台后入口区一片空白"。
 *
 * 未声明 `permission` 的路由**保持可见**——与路由守卫的判据一致
 * （守卫也是 `if (permission && !has)` 才拦）。这一条很重要：如果这里 fail-closed，
 * 就会出现"工作台不显示入口、手动输 URL 却能进"的矛盾。
 */
const shortcuts = computed(() => filterByRoutePermission(SHORTCUTS, router, auth.hasPermission));

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
