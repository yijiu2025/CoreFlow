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
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-vue-next';
import AppIcon from '@/components/ui/AppIcon.vue';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import type { MenuNode } from '@/api/types';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const themeStore = useThemeStore();

const collapsed = ref(false);
const drawerOpen = ref(false);

/** 顶栏标题取当前路由 meta（菜单名可能因权限裁剪而缺失） */
const pageTitle = computed(() => (route.meta?.title as string) || '管理后台');

/** 主题按钮图标：深色显示太阳（切回浅色），浅色显示月亮 */
const isDark = computed(() => themeStore.isDark);

/**
 * 侧栏结构：顶层 `dir` 作为分组标题，`menu` 作为链接
 *
 * @returns 分组列表（无目录归属的菜单放在「导航」组）
 */
const groups = computed(() => {
  const out: Array<{ key: string; title: string; items: MenuNode[] }> = [];
  const loose: MenuNode[] = [];
  for (const node of auth.menus) {
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

// 路由变化时收起抽屉（键盘导航 / 后退按钮同样生效）
watch(
  () => route.fullPath,
  () => {
    drawerOpen.value = false;
  }
);
</script>

<template>
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

        <button class="btn btn--ghost btn--sm" type="button" :aria-label="isDark ? '切换到浅色' : '切换到深色'" @click="toggleMode">
          <Sun v-if="isDark" :size="17" />
          <Moon v-else :size="17" />
        </button>

        <span class="tag tag--info">{{ auth.me?.username || '未登录' }}</span>

        <button class="btn btn--ghost btn--sm" type="button" @click="signOut">
          <LogOut :size="16" />
          退出
        </button>
      </header>

      <main class="page">
        <router-view />
      </main>
    </div>
  </div>
</template>
