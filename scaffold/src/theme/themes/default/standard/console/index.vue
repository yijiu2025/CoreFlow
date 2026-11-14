/**
 * 珍珠玻璃 · 后台壳版式（桌面 / 手机共用同一份 DOM）
 *
 * 这份 DOM 原先住在 `components/layout/ConsoleChrome.vue`：位置在"组件层"，语义上却是一套
 * 版式 —— 它只吃 `ctx`、不带任何业务。按主题分层规范（机制 / 契约 / 版式 / 容器），
 * 壳的 DOM 属于主题包：`theme/themes/<包>/<设备>/console/index.vue`。
 *
 * 现在它就是本包的实现，其他包（含本包的 mobile 端）转发到这里：
 *   · `default/mobile/console` → 转发（窄屏侧栏改抽屉靠 CSS 断点，不是另一套 DOM）
 *   · `wechat/standard/console` → 转发（微信的"App 感"在手机端，桌面沿用本骨架）
 *   · `wechat/mobile/console`   → **自己一套**（导航栏 + 底部 TabBar + cell 列表）
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
<script setup lang="ts">
/**
 * 珍珠玻璃壳（侧栏 + 顶栏 + 内容区）
 *
 * 从 `AppShell.vue` 搬来的**纯展示**实现：它不再知道菜单从哪来、路由怎么跳、
 * 当前账号有什么权限 —— 那些都在宿主里算完，通过 `ctx` 递进来（契约见
 * `theme/views/console.ts`）。所以它可以直接当主题包版式用：
 * `themes/default/{standard,mobile}/console/index.vue` 都是这一行。
 *
 * 820px 以下侧栏改抽屉（`layout.css` 的媒体查询），选中菜单后自动收起 ——
 * 抽屉的开合是"这一屏的临时状态"，不上升到 ctx。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowLeft, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, UserRound } from 'lucide-vue-next';
import AppIcon from '@/components/ui/AppIcon.vue';
import { useResponsiveTables } from '@/composables/useResponsiveTables';
import type { ConsoleNavItem, ConsoleViewContext } from '@/theme/views/console';

const props = defineProps<{
  /** 壳上下文（宿主准备，本组件只读） */
  ctx: ConsoleViewContext;
}>();

/** 侧栏是否收起（宽屏） */
const collapsed = ref(false);
/** 窄屏抽屉是否打开 */
const drawerOpen = ref(false);

/**
 * 顶栏头像加载失败标记
 *
 * 文件可能已被换头像时的清理逻辑删掉、或静态目录没被代理到 —— 那时 `<img>` 会
 * 显示成裂图。置位后回落到图标，并且在地址变化时复位（否则换了新头像也显示不出来）。
 */
const avatarBroken = ref(false);
watch(
  () => props.ctx.user?.avatar,
  () => {
    avatarBroken.value = false;
  }
);

/** 路由变化时收起抽屉（键盘导航 / 后退按钮同样生效） */
watch(
  () => props.ctx.activePath,
  () => {
    drawerOpen.value = false;
  }
);

/**
 * 点击菜单
 *
 * @param node 导航条目
 */
function go(node: ConsoleNavItem): void {
  drawerOpen.value = false;
  props.ctx.nav(node.path);
}

/**
 * 窄屏表格卡片化
 *
 * 全站只需在这里装一次：它把 `<thead>` 的列名抄到单元格 `data-label` 上，
 * 由 CSS 在 ≤820px 时渲染成卡片（详见 composable 文件头）。
 */
let uninstallTables: (() => void) | null = null;
onMounted(() => {
  uninstallTables = useResponsiveTables();
});
onBeforeUnmount(() => uninstallTables?.());
</script>

<template>
  <div class="shell">
    <aside class="rail" :data-collapsed="collapsed" :data-open="drawerOpen">
      <div class="rail__brand">
        <span class="rail__mark">C</span>
        <span v-show="!collapsed">管理后台</span>
      </div>

      <nav class="rail__nav" aria-label="主导航">
        <template v-for="group in ctx.groups" :key="group.key">
          <div v-if="!collapsed && group.title !== '导航'" class="rail__group">{{ group.title }}</div>
          <a
            v-for="node in group.items"
            :key="node.id"
            class="rail__link"
            href="javascript:void(0)"
            :aria-current="ctx.activePath === node.path ? 'page' : undefined"
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
        <button
          v-if="ctx.stack"
          class="btn btn--ghost btn--sm"
          type="button"
          aria-label="返回上一页"
          @click="ctx.back()"
        >
          <ArrowLeft :size="18" />
        </button>
        <button v-else class="btn btn--ghost btn--sm" type="button" aria-label="打开导航" @click="drawerOpen = true">
          <Menu :size="18" />
        </button>

        <strong>{{ ctx.title }}</strong>
        <span class="topbar__spacer"></span>

        <button
          class="btn btn--ghost btn--sm"
          type="button"
          :aria-label="ctx.isDark ? '切换到浅色' : '切换到深色'"
          @click="ctx.toggleTheme()"
        >
          <Sun v-if="ctx.isDark" :size="17" />
          <Moon v-else :size="17" />
        </button>

        <!-- 个人设置入口：主题色与界面风格都收在设置页，这里只留一个入口 -->
        <RouterLink v-if="ctx.user" class="btn btn--ghost btn--sm" to="/settings/profile">
          <img
            v-if="ctx.user.avatar && !avatarBroken"
            class="topbar__avatar"
            :src="ctx.user.avatar"
            alt=""
            @error="avatarBroken = true"
          />
          <UserRound v-else :size="16" />
          <!-- 昵称是 console 内的展示身份，用户没设时后端已回落到 username -->
          <span class="topbar__label">{{ ctx.user.name }}</span>
        </RouterLink>

        <button class="btn btn--ghost btn--sm" type="button" aria-label="退出登录" @click="ctx.signOut()">
          <LogOut :size="16" />
          <span class="topbar__label">退出</span>
        </button>
      </header>

      <main class="page" :class="{ 'page--stack': ctx.stack }">
        <component :is="ctx.content" />
      </main>
    </div>
  </div>
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
