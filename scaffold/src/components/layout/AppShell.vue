<script setup lang="ts">
/**
 * 应用外壳：侧栏 + 顶栏 + 内容区
 *
 * 侧栏条目来自 `/session/routes`（菜单只决定可见性）；当前路由高亮按 path 精确匹配。
 * 820px 以下侧栏改抽屉式，选中菜单后自动收起。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, UserRound } from 'lucide-vue-next';
import { ThemeScope } from 'skinsuite/vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { useRenderDevice } from '@/views/device/useRenderDevice';
import { useAuthStore } from '@/stores/auth';
import { useResponsiveTables } from '@/composables/useResponsiveTables';
import { useThemeStore } from '@/stores/theme';
import type { MenuNode } from '@/api/types';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const themeStore = useThemeStore();

/**
 * 顶栏头像加载失败标记
 *
 * 文件可能已被换头像时的清理逻辑删掉、或静态目录没被代理到 —— 那时 `<img>` 会
 * 显示成裂图。置位后回落到图标，并且在地址变化时复位（否则换了新头像也显示不出来）。
 */
const avatarBroken = ref(false);
watch(
  () => auth.me?.profile?.avatar,
  () => {
    avatarBroken.value = false;
  }
);
/**
 * 设备判定（宿主职责）：`?device=mobile|std` 优先，否则按视口宽度。
 * 主题库只接收设备名、不做判定 —— 这里的结果决定 **token 作用域**。
 *
 * 布局断点用同一个 820px 阈值写在 CSS 媒体查询里（`layout.css` 的侧栏抽屉、
 * `components.css` 的表格卡片化与弹窗抽屉）：CSS 读不到 JS 状态，两处必须同步改，
 * 阈值常量见 `views/device/useRenderDevice.ts` 的 `MOBILE_MAX_WIDTH`。
 */
const device = useRenderDevice();

const collapsed = ref(false);
const drawerOpen = ref(false);

/** 顶栏标题取当前路由 meta（菜单名可能因权限裁剪而缺失） */
const pageTitle = computed(() => (route.meta?.title as string) || '管理后台');

/** 主题按钮图标：深色显示太阳（切回浅色），浅色显示月亮 */
const isDark = computed(() => themeStore.isDark);

/**
 * 这条菜单对应的页面，当前账号进不进得去
 *
 * 🔴 判据取**路由 meta.permission** —— 那是守卫真正比对的那一份。不拿菜单自己的
 *    `permission` 字段判：它是库里可改的自由文本，改了菜单而路由没改时，侧栏会
 *    藏掉一个其实进得去的页面；反过来则是露出一条点进去被踢到 `/no-access` 的死链
 *    （观察者就踩过这个：菜单全量授权、policy 只有几个 read 码）。
 *    路由没声明权限（如个人设置）或路径没注册 → 一律放行，不替守卫做决定。
 *
 * @param node 菜单节点
 * @returns 是否可进入
 */
function canEnter(node: MenuNode): boolean {
  if (!node.path) return true;
  const resolved = router.resolve(node.path);
  // 菜单指向一个没注册的页面：点进去只有 404。路由表是静态声明、菜单是库里数据，
  // 两者漂移时宁可让这条入口消失 —— 要修的是菜单管理里的那条数据，不是导航。
  if (resolved.name === 'not-found') return false;
  const code = (resolved.meta?.permission as string | undefined) ?? '';
  return !code || auth.hasPermission(code);
}

/**
 * 侧栏结构：顶层 `dir` 作为分组标题，`menu` 作为链接
 *
 * @returns 分组列表（无目录归属的菜单放在「导航」组）
 */
const groups = computed(() => {
  const out: Array<{ key: string; title: string; items: MenuNode[] }> = [];
  const loose: MenuNode[] = [];
  /*
   * 已下架（visible=0）的节点不进导航。
   *
   * 后端 `/session/routes` 已经滤过一遍，这里再滤一次：这个字段是"强制下架"，
   * 宁可重复也不要因为某条老数据漏滤而在侧栏里露出来。
   *
   * 第二刀按**权限码**：菜单只决定"想不想给人看"，能不能进由守卫决定 ——
   * 把进不去的入口留在侧栏，就是让每一次点击都换一个 `/no-access`。
   * 目录在子项被筛空后整组消失：只剩标题的空分组比死链更让人摸不着头脑。
   */
  const shown = (nodes: MenuNode[]): MenuNode[] =>
    nodes
      .filter(node => node.visible !== 0)
      .map(node => ({ ...node, children: shown(node.children || []) }))
      .filter(node => (node.type === 'dir' ? (node.children || []).length > 0 : canEnter(node)));
  for (const node of shown(auth.menus)) {
    if (node.type === 'dir') {
      out.push({ key: `dir-${node.id}`, title: node.name, items: node.children || [] });
    } else if (node.type === 'menu') {
      loose.push(node);
    }
  }
  if (loose.length > 0) out.unshift({ key: 'root', title: '导航', items: loose });
  return out;
});

/**
 * 判断菜单是否对应当前路由
 *
 * @param node 菜单节点
 * @returns 是否为当前页
 */
function isActive(node: MenuNode): boolean {
  return !!node.path && route.path === node.path;
}

/**
 * 点击菜单：窄屏收起抽屉
 *
 * @param node 菜单节点
 */
function go(node: MenuNode): void {
  if (!node.path) return;
  drawerOpen.value = false;
  if (route.path !== node.path) router.push(node.path);
}

/** 切换明暗（三态里点击只在 light/dark 之间切） */
function toggleMode(): void {
  themeStore.toggleTheme();
}

/** 退出登录 */
async function signOut(): Promise<void> {
  await auth.logout();
  router.replace('/login');
}

/**
 * 窄屏表格卡片化
 *
 * 全站只需在这里装一次：它把 `<thead>` 的列名抄到单元格 `data-label` 上，
 * 由 CSS 在 ≤720px 时渲染成卡片（详见 composable 文件头）。
 */
let uninstallTables: (() => void) | null = null;
onMounted(() => {
  uninstallTables = useResponsiveTables();
});
onBeforeUnmount(() => uninstallTables?.());

// 路由变化时收起抽屉（键盘导航 / 后退按钮同样生效）
watch(
  () => route.fullPath,
  () => {
    drawerOpen.value = false;
  }
);
</script>

<template>
  <!--
    ThemeScope：只锚定「包 × 设备 × 页面」的 token 作用域，不渲染版式组件。
    console 只有一套设计（pearl），页面之间换的是业务内容而不是 DOM 结构，
    因此不用 <ThemeView>；要换版式请新建主题包（见 stores/theme.ts 文件头）。
  -->
  <ThemeScope page="console" :device="device">
    <div class="shell">
      <aside class="rail" :data-collapsed="collapsed" :data-open="drawerOpen">
        <div class="rail__brand">
          <span class="rail__mark">C</span>
          <span v-show="!collapsed">管理后台</span>
        </div>

        <nav class="rail__nav" aria-label="主导航">
          <template v-for="group in groups" :key="group.key">
            <div v-if="!collapsed && group.title !== '导航'" class="rail__group">{{ group.title }}</div>
            <a
              v-for="node in group.items"
              :key="node.id"
              class="rail__link"
              href="javascript:void(0)"
              :aria-current="isActive(node) ? 'page' : undefined"
              :title="collapsed ? node.name : undefined"
              @click="go(node)"
            >
              <AppIcon :name="node.icon" />
              <span v-show="!collapsed">{{ node.name }}</span>
            </a>
          </template>
        </nav>

        <div class="rail__foot">
          <button class="btn btn--ghost btn--sm" type="button" @click="collapsed = !collapsed">
            <PanelLeftOpen v-if="collapsed" :size="16" />
            <PanelLeftClose v-else :size="16" />
            <span v-show="!collapsed">收起</span>
          </button>
        </div>
      </aside>

      <div class="rail-mask" :data-open="drawerOpen" @click="drawerOpen = false"></div>

      <div class="main">
        <header class="topbar">
          <button class="btn btn--ghost btn--sm" type="button" aria-label="打开导航" @click="drawerOpen = true">
            <Menu :size="18" />
          </button>

          <strong>{{ pageTitle }}</strong>
          <span class="topbar__spacer"></span>

          <button
            class="btn btn--ghost btn--sm"
            type="button"
            :aria-label="isDark ? '切换到浅色' : '切换到深色'"
            @click="toggleMode"
          >
            <Sun v-if="isDark" :size="17" />
            <Moon v-else :size="17" />
          </button>

          <!-- 只有拿到用户信息才显示：被边界防护拦下时 me 为空，但那不等于"未登录" -->
          <!-- 个人设置入口：主题色已收进设置页，这里只留一个入口 -->
          <RouterLink v-if="auth.me" class="btn btn--ghost btn--sm" to="/settings/profile">
            <img
              v-if="auth.me.profile?.avatar && !avatarBroken"
              class="topbar__avatar"
              :src="auth.me.profile.avatar"
              alt=""
              @error="avatarBroken = true"
            />
            <UserRound v-else :size="16" />
            <!-- 昵称是 console 内的展示身份，用户没设时后端已回落到 username -->
            <span class="topbar__label">{{ auth.me.profile?.nickname || auth.me.username }}</span>
          </RouterLink>

          <button class="btn btn--ghost btn--sm" type="button" aria-label="退出登录" @click="signOut">
            <LogOut :size="16" />
            <span class="topbar__label">退出</span>
          </button>
        </header>

        <main class="page">
          <router-view />
        </main>
      </div>
    </div>
  </ThemeScope>
</template>

<style scoped>
/* 顶栏头像：与图标同尺寸，圆形裁切，避免撑高按钮 */
.topbar__avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
  flex: none;
}
</style>
