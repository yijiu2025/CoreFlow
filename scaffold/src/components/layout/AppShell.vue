<script setup lang="ts">
/**
 * 应用外壳（**宿主**）
 *
 * 只做四件事：判设备 → 把菜单树过滤成导航数据 → 准备壳上下文 → 交给主题包的版式。
 * 长什么样已经不在这里决定了：珍珠玻璃与口袋版是两套版式，住在各自的主题包里
 * （`themes/<包>/<设备>/console/index.vue`），本文件一行 `if (包名 === …)` 都没有。
 *
 * 依赖单例：
 *   · 设备判定 → `useRenderDevice()`（≤820px 或 `?device=mobile`）
 *   · 壳版式 → `<ThemeView page="console">`（URL `?th=` > 包声明 > 当前包）
 *   · 上下文契约 → `theme/views/console.ts` 的 `ConsoleViewContext`
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, defineComponent, h, onBeforeUnmount, onMounted } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { ThemeView } from 'skinsuite/vue';
import { useRenderDevice } from '@/views/device/useRenderDevice';
import { useAuthStore } from '@/stores/auth';
import { useResponsiveTables } from '@/composables/useResponsiveTables';
import { useThemeStore } from '@/stores/theme';
import type { MenuNode } from '@/api/types';
import type { ConsoleNavGroup, ConsoleViewContext } from '@/theme/views/console';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const themeStore = useThemeStore();

/**
 * 设备判定（宿主职责）：`?device=mobile|std` 优先，否则按视口宽度。
 * 主题库只接收设备名、不做判定 —— 这里的结果决定 **token 作用域**与**版式目录**。
 *
 * 布局断点用同一个 820px 阈值写在 CSS 媒体查询里（`layout.css` 的侧栏抽屉、
 * `components.css` 的表格卡片化与弹窗抽屉）：CSS 读不到 JS 状态，两处必须同步改，
 * 阈值常量见 `views/device/useRenderDevice.ts` 的 `MOBILE_MAX_WIDTH`。
 */
const device = useRenderDevice();

/** 顶栏标题取当前路由 meta（菜单名可能因权限裁剪而缺失） */
const pageTitle = computed(() => (route.meta?.title as string) || '管理后台');

/**
 * 是否是"进新页面看详情"的栈页（`meta.stack`）
 *
 * 手机端从列表点进详情，左上角该出现的是「返回」而不是「打开导航」：
 * 这一层是"从上一屏压进来的"，用户的心智是退回去，不是换大栏目。
 */
const isStackPage = computed(() => route.meta?.stack === true);

/**
 * 返回上一屏
 *
 * 直接深链进来（历史里没有上一屏）时 `router.back()` 会把人留在原地或退出站点，
 * 那种情况按"这条详情属于哪个列表"回落 —— 不同版式的 tab 不同，但列表归属一致。
 */
function goBack(): void {
  if (window.history.state?.back) {
    router.back();
    return;
  }
  const path = route.path;
  // 回落按"这条详情属于哪个栏目"：口袋版壳里 /system/* 的父级是「通讯录」，
  // /monitor/* 的父级是「发现」；其余回工作台。
  const fallback = path.startsWith('/system/user')
    ? 'system-user'
    : path.startsWith('/system/')
      ? 'org'
      : path.startsWith('/monitor/')
        ? 'discover'
        : 'dashboard';
  router.push({ name: fallback });
}

/**
 * 这条路径当前账号进不进得去
 *
 * 🔴 判据取**路由 meta.permission** —— 那是守卫真正比对的那一份。不拿菜单自己的
 *    `permission` 字段判：它是库里可改的自由文本，改了菜单而路由没改时，侧栏会
 *    藏掉一个其实进得去的页面；反过来则是露出一条点进去被踢到 `/no-access` 的死链
 *    （观察者就踩过这个：菜单全量授权、policy 只有几个 read 码）。
 *    路由没声明权限（如个人设置）或路径没注册 → 注册了才放行，不替守卫做决定。
 *
 * @param path 目标路径
 * @returns 是否可进入
 */
function can(path: string): boolean {
  const resolved = router.resolve(path);
  // 指向一个没注册的页面：点进去只有 404。路由表是静态声明、菜单是库里数据，
  // 两者漂移时宁可让这条入口消失 —— 要修的是菜单管理里的那条数据，不是导航。
  if (resolved.name === 'not-found') return false;
  const code = (resolved.meta?.permission as string | undefined) ?? '';
  return !code || auth.hasPermission(code);
}

/**
 * 菜单项是否可进入（导航条目都带 path，空 path 的目录节点交给上层筛）
 *
 * @param node 菜单节点
 * @returns 是否可进入
 */
function canEnter(node: MenuNode): boolean {
  return !node.path || can(node.path);
}

/**
 * 导航结构：顶层 `dir` 作为分组标题，`menu` 作为链接
 *
 * @returns 分组列表（无目录归属的菜单放在「导航」组）
 */
const groups = computed<ConsoleNavGroup[]>(() => {
  const out: ConsoleNavGroup[] = [];
  const loose: MenuNode[] = [];
  /*
   * 已下架（visible=0）的节点不进导航。
   *
   * 后端 `/session/routes` 已经滤过一遍，这里再滤一次：这个字段是"强制下架"，
   * 宁可重复也不要因为某条老数据漏滤而在侧栏里露出来。
   *
   * 第二刀按**权限码**：菜单只决定"想不想给人看"，能不能进由守卫决定 ——
   * 把进不去的入口留在导航里，就是让每一次点击都换一个 `/no-access`。
   * 目录在子项被筛空后整组消失：只剩标题的空分组比死链更让人摸不着头脑。
   */
  const shown = (nodes: MenuNode[]): MenuNode[] =>
    nodes
      .filter(node => node.visible !== 0)
      .map(node => ({ ...node, children: shown(node.children || []) }))
      .filter(node => (node.type === 'dir' ? (node.children || []).length > 0 : canEnter(node)));
  for (const node of shown(auth.menus)) {
    if (node.type === 'dir') {
      out.push({
        key: `dir-${node.id}`,
        title: node.name,
        items: (node.children || [])
          .filter(child => !!child.path)
          .map(child => ({
            id: child.id,
            name: child.name,
            path: child.path as string,
            icon: child.icon || ''
          }))
      });
    } else if (node.type === 'menu') {
      loose.push(node);
    }
  }
  if (loose.length > 0) {
    out.unshift({
      key: 'root',
      title: '导航',
      items: loose
        .filter(node => !!node.path)
        .map(node => ({ id: node.id, name: node.name, path: node.path as string, icon: node.icon || '' }))
    });
  }
  return out;
});

/**
 * 页面内容（内部一个 `<RouterView />`）
 *
 * 为什么由宿主造这个组件而不是让版式自己写 `<router-view>`：版式与 AppShell 处在
 * **同一嵌套深度**（都挂在这一层路由记录下），两处各写一个会把当前页渲染两遍 ——
 * 一遍在版式里、一遍在壳里。做成组件当 ctx 传下去，深度只算一次。
 */
const RouteContent = defineComponent({
  name: 'ConsoleRouteContent',
  setup: () => () => h(RouterView)
});

/** 壳上下文（版式只读它；换包 / 换设备 / 换路由都会重算） */
const ctx = computed<ConsoleViewContext>(() => ({
  title: pageTitle.value,
  groups: groups.value,
  activePath: route.path,
  stack: isStackPage.value,
  isDark: themeStore.isDark,
  user: auth.me
    ? {
        name: auth.me.profile?.nickname || auth.me.username,
        avatar: auth.me.profile?.avatar || ''
      }
    : null,
  content: RouteContent,
  nav: path => {
    if (route.path !== path) router.push(path);
  },
  can,
  back: goBack,
  toggleTheme: () => themeStore.toggleTheme(),
  signOut: () => {
    void signOut();
  }
}));

/** 退出登录 */
async function signOut(): Promise<void> {
  await auth.logout();
  router.replace('/login');
}

/**
 * 窄屏表格卡片化
 *
 * 装在宿主而不是版式里：两套版式（珍珠 / 口袋版）都需要，且它只依赖 DOM、与外观无关。
 * 负责把 `<thead>` 的列名抄到单元格 `data-label` 上，由 CSS 在 ≤820px 时渲染成卡片。
 */
let uninstallTables: (() => void) | null = null;
onMounted(() => {
  uninstallTables = useResponsiveTables();
});
onBeforeUnmount(() => uninstallTables?.());
</script>

<template>
  <!--
    ThemeView：按「包 × 设备」挑壳版式。默认包是同步 eager 的（首帧零请求），
    wechat 这类外部包是惰性 chunk，加载完成前先显示默认壳 —— 不会白屏。
  -->
  <ThemeView page="console" :device="device" :ctx="ctx" />
</template>
