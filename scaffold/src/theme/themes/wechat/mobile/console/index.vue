<script setup lang="ts">
/**
 * 微信 · 手机端 · 后台壳版式
 *
 * 一套"手机上像 App"的壳，和珍珠玻璃最大的区别不在配色，而在**操作方式**：
 *
 *   · 顶部：44px 居中标题；二级页左侧「‹ 返回」，右侧「⋯」打开底部面板
 *   · 底部：四档 TabBar（工作台 / 通讯录 / 发现 / 我），只在 tab 根页出现 ——
 *     微信的二级页是没有 TabBar 的，退回去才回到栏目
 *   · 手势：从屏幕左缘往右滑 = 返回上一屏（二级页才响应，和微信一致）
 *   · 内容：灰底 + 白色 cell 块 + 发丝线，不用卡片间距
 *     —— 视觉语言在 `./kit/`（七个域文件），本文件只管骨架
 *
 * 页面身份：根节点 `data-page` = 路由 name，`kit/pages.css` 按它写逐页差异。
 * 因此**页面文件不需要为微信主题改任何一行**。
 *
 * 版式只读 `ctx`（契约见 `theme/views/console.ts`），不碰路由守卫、不发请求。
 * TabBar 的四条目标是**固定路径**：它们是"这一套设计的骨架"，不是菜单数据 ——
 * 菜单只在里面决定"进不进得去"（`ctx.groups` 已经过滤过权限）。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  ChevronLeft,
  ChevronRight,
  Compass,
  LayoutGrid,
  LogOut,
  Moon,
  MoreHorizontal,
  Settings,
  Sun,
  UserRound,
  Users,
  X
} from 'lucide-vue-next';
import type { ConsoleViewContext } from '@/theme/views/console';

const props = defineProps<{
  /** 壳上下文（宿主准备，本组件只读） */
  ctx: ConsoleViewContext;
}>();

const route = useRoute();

/**
 * 当前页面身份（挂在根节点 `data-page` 上）
 *
 * 主题包要"按页适配"，就必须有个稳定的页面标识。用路由 name 而不是路径：
 * name 是声明式的事实（`system-user`），路径会随参数变形（`system/user/42`）。
 *
 * 🔴 页面**不参与**标识的生成 —— 它们一行都不用改，这正是把适配收在主题包里的前提。
 */
const pageKey = computed(() => {
  const name = route.name;
  if (typeof name === 'string' && name) return name;
  // 没命名的路由（理论上不存在）：拿路径兜一个，保证选择器还活着
  return route.path.replace(/^\/+/, '').replace(/\//g, '-') || 'root';
});

/**
 * 给 `body` 打本包标记
 *
 * 为什么需要：UserPicker 的下拉、权限矩阵的弹层都 `Teleport to="body"`，
 * 它们不在 `.wx` 子树里，主题包的选择器够不到。挂在 body 上之后，
 * kit 里用 `body[data-wx] .upick__list` 命中它们 —— 比在每个组件里判主题干净。
 */
onMounted(() => {
  document.body.setAttribute('data-wx', '1');
});

onBeforeUnmount(() => {
  document.body.removeAttribute('data-wx');
});

/** TabBar 一格 */
interface WxTab {
  key: string;
  label: string;
  /** 点击后去哪 */
  path: string;
  /** 图标 */
  icon: typeof LayoutGrid;
}

/**
 * 四档（顺序 = 微信的顺序：消息 / 通讯录 / 发现 / 我）
 *
 * 「工作台」对应微信的"微信"那一格：进来第一眼看到的东西。
 */
const TABS: WxTab[] = [
  { key: 'home', label: '工作台', path: '/dashboard', icon: LayoutGrid },
  { key: 'org', label: '通讯录', path: '/org', icon: Users },
  { key: 'discover', label: '发现', path: '/discover', icon: Compass },
  { key: 'me', label: '我', path: '/me', icon: UserRound }
];

/**
 * 当前账号能看到哪几格
 *
 * 判据交给宿主（`ctx.can` = 路由 `meta.permission` + 账号权限码，与守卫同一份）：
 * 进不去的格子直接不出现，而不是点了被踢到 `/no-access`。版式自己不做权限判断。
 */
const tabs = computed(() => TABS.filter(tab => props.ctx.can(tab.path)));

/** 是否站在某个栏目根页上（决定 TabBar 出不出现、导航栏左侧是返回还是空） */
const isTabRoot = computed(() => TABS.some(tab => tab.path === route.path));

/** 当前高亮的格子（专栏根页才高亮；二级页没有 TabBar，也就无所谓高亮） */
const activeKey = computed(() => TABS.find(tab => tab.path === route.path)?.key ?? '');

/* ── 右滑返回 ─────────────────────────────────────────────────
   微信的手势是"从左边缘往里拖"，不是屏幕任意位置横滑 —— 后者会和列表横滑、
   图表拖拽打架。所以只在起手点 x < 28px 时开始跟踪，且要求横向位移明显大于纵向。 */
/** 起手点（null = 不在跟踪） */
let start: { x: number; y: number } | null = null;
/** 判定阈值（px）：位移够大且以横向为主才算一次返回 */
const SWIPE_EDGE = 28;
const SWIPE_MIN = 64;

/**
 * 触摸开始：只在左缘、且当前是二级页时记录起点
 *
 * @param event 触摸事件
 */
function onTouchStart(event: TouchEvent): void {
  if (isTabRoot.value) return;
  const touch = event.touches[0];
  if (!touch || touch.clientX > SWIPE_EDGE) return;
  start = { x: touch.clientX, y: touch.clientY };
}

/**
 * 触摸移动：位移达标就返回
 *
 * 不调 `preventDefault()` —— 这是"额外入口"，不是唯一入口（导航栏还有返回箭头），
 * 拦截默认行为只会让纵向滚动在边缘变得发涩。
 *
 * @param event 触摸事件
 */
function onTouchMove(event: TouchEvent): void {
  if (!start) return;
  const touch = event.touches[0];
  if (!touch) return;
  const dx = touch.clientX - start.x;
  const dy = Math.abs(touch.clientY - start.y);
  if (dx < 0) {
    start = null;
    return;
  }
  if (dx > SWIPE_MIN && dx > dy * 1.6) {
    start = null;
    props.ctx.back();
  }
}

/** 触摸结束：丢弃跟踪（不够阈值就当没发生） */
function onTouchEnd(): void {
  start = null;
}

/** 离开当前页时丢弃跟踪，避免"上一页的手势"跨页生效 */
watch(
  () => route.path,
  () => {
    start = null;
    sheetOpen.value = false;
  }
);

/* ── 「⋯」底部面板 ───────────────────────────────────────── */
const sheetOpen = ref(false);

/** 关闭面板 */
function closeSheet(): void {
  sheetOpen.value = false;
}

/**
 * 面板里的动作：先关面板再执行
 *
 * 不关的话，跳走之后面板还挂在新页面上（`v-if` 绑的是本组件状态，而本组件不卸载）。
 *
 * @param action 动作
 */
function runFromSheet(action: 'theme' | 'profile' | 'signout'): void {
  sheetOpen.value = false;
  if (action === 'theme') props.ctx.toggleTheme();
  else if (action === 'profile') props.ctx.nav('/settings/profile');
  else props.ctx.signOut();
}

/* ── 手势监听器收尾 ─────────────────────────────────────────── */
onBeforeUnmount(() => {
  start = null;
});
</script>

<template>
  <div
    class="wx"
    :data-page="pageKey"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend="onTouchEnd"
  >
    <!--
      导航栏：三栏网格（左 56 / 中自适应 / 右 56），标题永远居中。
      用 `<h1>` 而不是 div：一个 App 的一屏应当只有一个一级标题，读屏也靠它定位。
    -->
    <header class="wxnav">
      <div class="wxnav__side">
        <button v-if="!isTabRoot" class="wxnav__back" type="button" aria-label="返回上一页" @click="ctx.back()">
          <ChevronLeft :size="24" />
          <span>返回</span>
        </button>
      </div>

      <h1 class="wxnav__title">{{ ctx.title }}</h1>

      <div class="wxnav__side wxnav__side--right">
        <!--
          根页不给「⋯」：微信的栏目根页右上角是空的（通讯录那格是"+添加"，这里是
          管理后台没有对应动作）。而且根页已经有「我」这一档承接设置与退出，
          再放一个同功能的面板只是把同一批动作摆两遍。
        -->
        <button v-if="!isTabRoot" class="wxnav__more" type="button" aria-label="更多" @click="sheetOpen = true">
          <MoreHorizontal :size="22" />
        </button>
      </div>
    </header>

    <div class="wxbody" :class="{ 'wxbody--tabs': isTabRoot }">
      <component :is="ctx.content" />
    </div>

    <!-- 底部四档：只在栏目根页出现（二级页靠左上角返回，和微信一致） -->
    <nav v-if="isTabRoot" class="wxtab" aria-label="主导航">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="wxtab__item"
        type="button"
        :class="{ 'is-on': activeKey === tab.key }"
        :aria-current="activeKey === tab.key ? 'page' : undefined"
        @click="ctx.nav(tab.path)"
      >
        <component :is="tab.icon" :size="23" :stroke-width="activeKey === tab.key ? 2.1 : 1.7" />
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <!-- 「⋯」面板：外观 / 设置 / 退出，与微信右上角菜单同一位置同一手感 -->
    <Transition name="wx-sheet">
      <div v-if="sheetOpen" class="wxmask" @click="closeSheet">
        <div class="wxsheet" role="dialog" aria-label="更多操作" @click.stop>
          <div class="wxsheet__grip"></div>
          <button class="wxsheet__item" type="button" @click="runFromSheet('theme')">
            <Sun v-if="ctx.isDark" :size="18" />
            <Moon v-else :size="18" />
            <span>外观</span>
            <span class="wxsheet__note">{{ ctx.isDark ? '当前：深色' : '当前：浅色' }}</span>
          </button>
          <button class="wxsheet__item" type="button" @click="runFromSheet('profile')">
            <Settings :size="18" />
            <span>个人设置</span>
            <ChevronRight :size="16" class="wxsheet__chev" />
          </button>
          <button class="wxsheet__item wxsheet__item--danger" type="button" @click="runFromSheet('signout')">
            <LogOut :size="18" />
            <span>退出登录</span>
          </button>
          <button class="wxsheet__cancel" type="button" @click="closeSheet">
            <X :size="15" />
            取消
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<!--
  设计层：本包的全部视觉规则都在 `kit/` 下，按域拆开。

  为什么用 7 个 `<style src>` 而不是一个大文件或 `@import`：
    · 一个大文件改一行也要滚 900 行；
    · `@import` 在 SFC 里由构建器内联，路径写错时开发期报错点很远；
    · 拆成 `<style src>` 后，**哪一个域生效、哪一行来的**，看 import 顺序就清楚。

  这些块**不能带 scoped**：它们要命中子组件的内部元素（`:deep()` 的替代方案）。
  隔离靠的是前缀而不是 scoped —— 每条规则都以 `.wx` 开头，别的包没有这个根节点。
-->
<style src="./kit/tokens.css"></style>
<style src="./kit/surfaces.css"></style>
<style src="./kit/controls.css"></style>
<style src="./kit/lists.css"></style>
<style src="./kit/overlays.css"></style>
<style src="./kit/components.css"></style>
<style src="./kit/pages.css"></style>

<style scoped>
/* ── 骨架 ─────────────────────────────────────────────────────
   整屏 flex 纵向：导航栏（吸顶）+ 内容 + TabBar（固定）。
   内容不在内部滚动 —— 用文档滚动，才有一致的"下滚收起惯性"与地址栏联动。 */
.wx {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--mauth-bg);
  color: var(--mauth-text);
  /* 禁止 iOS 双击缩放导致的整页放大（微信 App 的观感前提） */
  -webkit-text-size-adjust: 100%;
}

.wxnav {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  /* 左右等宽（64）：标题永远居中；64 是「‹ 返回」在 15px 下放得下不换行的最小值 */
  grid-template-columns: 64px minmax(0, 1fr) 64px;
  align-items: center;
  height: 44px;
  padding-top: env(safe-area-inset-top);
  background: color-mix(in srgb, var(--mauth-bg) 94%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--mauth-border);
}

.wxnav__side {
  display: flex;
  align-items: center;
  padding-left: 4px;
}

.wxnav__side--right {
  justify-content: flex-end;
  padding: 0 4px 0 0;
}

/* 返回键：图标 + "返回" 两个字，热区撑满 44px 高（比只有箭头好点得多） */
.wxnav__back {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  height: 44px;
  padding: 0 4px 0 0;
  border: 0;
  background: transparent;
  color: var(--mauth-text);
  font-size: 15px;
  white-space: nowrap;
  cursor: pointer;
}

.wxnav__back:active {
  opacity: 0.55;
}

.wxnav__more {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  color: var(--mauth-text);
  cursor: pointer;
}

.wxnav__more:active {
  opacity: 0.55;
}

.wxnav__title {
  margin: 0;
  overflow: hidden;
  font-size: 17px;
  font-weight: 600;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * 内容区
 *
 * 左右 12px 是"块"的边距（微信 cell 组不是贴边的）；底部留给 TabBar。
 * TabBar 高度 52 + 安全区，这里给 68 是为了最后一行不至于被完全压住。
 */
.wxbody {
  flex: 1 1 auto;
  min-width: 0;
  padding: 8px 12px calc(24px + env(safe-area-inset-bottom));
}

.wxbody--tabs {
  padding-bottom: calc(68px + env(safe-area-inset-bottom));
}

/* ── 底部 TabBar ───────────────────────────────────────────── */
.wxtab {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 25;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  padding-bottom: env(safe-area-inset-bottom);
  background: color-mix(in srgb, var(--mauth-surface) 96%, transparent);
  backdrop-filter: blur(16px);
  border-top: 1px solid var(--mauth-border);
}

.wxtab__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: 52px;
  border: 0;
  background: transparent;
  color: var(--mauth-text-soft);
  font-size: 10px;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: color 0.14s var(--ease);
}

/* 选中 = 品牌绿（文字 + 图标同时变色，和微信一致） */
.wxtab__item.is-on {
  color: var(--mauth-primary);
}

.wxtab__item:active {
  background: var(--mauth-hover);
}

/* ── 「⋯」面板 ─────────────────────────────────────────────── */
.wxmask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  background: var(--mauth-overlay);
}

.wxsheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 6px 10px calc(10px + env(safe-area-inset-bottom));
  border-radius: 14px 14px 0 0;
  background: var(--mauth-surface);
  animation: wx-up 0.22s var(--ease-out) both;
}

.wxsheet__grip {
  width: 36px;
  height: 4px;
  margin: 4px auto 8px;
  border-radius: 999px;
  background: var(--mauth-border-strong);
}

.wxsheet__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 14px 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--mauth-text);
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}

.wxsheet__item:active {
  background: var(--mauth-press);
}

.wxsheet__item svg {
  flex: none;
  color: var(--mauth-text-mid);
}

.wxsheet__note {
  margin-left: auto;
  font-size: 12.5px;
  color: var(--mauth-text-soft);
}

.wxsheet__chev {
  margin-left: auto;
  color: var(--mauth-text-faint);
}

.wxsheet__item--danger,
.wxsheet__item--danger svg {
  color: var(--mauth-danger);
}

.wxsheet__cancel {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 6px;
  padding: 14px;
  border: 0;
  border-top: 1px solid var(--mauth-border);
  background: transparent;
  color: var(--mauth-text-mid);
  font-size: 15px;
  cursor: pointer;
}

@keyframes wx-up {
  from {
    transform: translateY(100%);
  }
}

.wx-sheet-enter-active,
.wx-sheet-leave-active {
  transition: opacity 0.18s var(--ease);
}

.wx-sheet-enter-from,
.wx-sheet-leave-to {
  opacity: 0;
}

/* ── 内容适配 ─────────────────────────────────────────────────
 *
 * 已**整体迁入本包的设计层**（`./kit/*.css`）：块、控件、列表、浮层、图表、逐页差异
 * 各一个文件。壳组件只负责骨架（导航栏 / TabBar / 手势 / 面板），不再用 `:deep()`
 * 逐条打补丁 —— 那种写法的下场是「漏掉一个类就露出珍珠玻璃的描边」。
 *
 * 要改某个页面的样子：改 `kit/pages.css` 里 `[data-page='xxx']` 那段。
 * 要改全站某类元素：改对应的域文件，别写回这里。
 */
</style>
