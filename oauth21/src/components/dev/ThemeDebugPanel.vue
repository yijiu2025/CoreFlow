<script setup lang="ts">
/**
 * 主题 / 版式调试面板
 *
 * 触发：URL 带 `?debug=theme`。不带该参数时**整体不渲染** —— 零外观影响、零额外请求，
 * 等同于这段代码不存在。
 *
 * === 为什么不限定只在开发构建里出现 ===
 * 真机上没有 DevTools（本项目的反复痛点）。线上排查「某个租户看到的颜色不对」时，
 * 能直接在手机上切主题看效果是刚需，比让人远程改后端配置快得多。面板内容只有主题名与
 * 色值 —— 它们本来就在前端产物里，不构成信息泄露。
 *
 * === 样式刻意不跟随主题 ===
 * 面板是拿来做**对比**的，如果自己也跟着换色，就没法当参照物。所以固定用深色外观，
 * 也不复用 `mauth-*` 类（那是移动端认证页的样式单一来源，不该被开发工具污染）。
 *
 * === 为什么要分「设备」这一栏 ===
 * 手机端与电脑端的配色/版式是**两套独立配置**（`<包>/mobile/` 与 `<包>/web/`）。
 * 面板按设备分区展示，才能回答"手机端现在有哪些配色可选、电脑端又有哪些"。
 * 当前设备由路由决定（`themeStore.activeDevice`），面板也会把它标出来。
 *
 * === 三处刻意的取舍 ===
 *   ① 配色走 `setTheme`（**落盘**），版式走 URL（**一次性**）——
 *      配色是"我要看这个"，看完还想留着；版式是"只想看一眼这套 UI"，
 *      用户按浏览器后退就该回到原样。
 *   ② 版式只能改 URL：容器判定读的就是 `route.query.view`，面板改 store 它读不到。
 *   ③ 当前版式高亮是**近似**的（与容器同优先级但不校验合法性）—— 面板只做展示，
 *      不做决策，真正的判定留在各页自己的 `pick*ViewId` 里。
 *
 * @author yijiu2025
 * @since 2026-09-23
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useThemeStore } from '@/stores/theme';
import {
  DEFAULT_THEME_DEVICE,
  getDefaultThemeId,
  listThemeGroups,
  THEME_DEVICES,
  type ThemeDevice
} from '@/theme';import { pageFromPath, viewsForPage } from '@/theme/views/pages';
import { MODE_CYCLE, MODE_LABELS } from '@/theme/mode';

const route = useRoute();
const router = useRouter();
const themeStore = useThemeStore();

/** 本次会话内手动关掉（URL 参数仍在，刷新会回来） */
const dismissed = ref(false);
/** 折叠态：点开链接多半就是要用它，默认展开 */
const collapsed = ref(false);

/** 只把「非空字符串」当有效参数 —— query 值可能是数组 */
function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const visible = computed(() => !dismissed.value && asText(route.query.debug) === 'theme');

/** 设备中文名（面板上要让人一眼分清两端） */
const DEVICE_LABELS: Record<ThemeDevice, string> = { mobile: '手机端', web: '电脑端' };

/** 当前路由对应的页面名（该页未接入版式机制时为 undefined） */
const page = computed(() => pageFromPath(route.path));
const pageViews = computed(() => viewsForPage(page.value));

/**
 * 面板上手动指定的设备（覆盖路由判定）
 *
 * 用途：在**同一台电脑上**预览"这套配色在手机端长什么样"。不做这个覆盖的话，
 * 要看手机端配色就必须真的去开移动端路由，联调很低效。
 * 传 null 表示"跟随路由"（默认）。
 */
const deviceOverride = ref<ThemeDevice | null>(null);

/** 当前生效设备：面板覆盖优先，否则用路由判定的 */
const device = computed(() => deviceOverride.value ?? themeStore.activeDevice);

/** 配色按「主题包 + 当前设备」分组展示 —— 面板要能看出"包 → 设备 → 配色"这三段 */
const themeGroups = computed(() => listThemeGroups(device.value));

/** 当前设备下的默认配色 id（"恢复默认"与"该端没这套配色时回落"都是它） */
const deviceDefaultThemeId = computed(
  () => getDefaultThemeId(device.value) ?? getDefaultThemeId(DEFAULT_THEME_DEVICE) ?? themeStore.themeId
);

/** 当前配色所属的主题包 —— 版式只在包内查找，所以版式列表要跟着它走 */
const activePkg = computed(() => themeStore.packageId);

/** 当前包在**当前设备**下该页可选的版式 id（base 在最前；该页未接入则为空） */
const viewIds = computed(() => {
  const registry = pageViews.value?.registry;
  if (!registry) return [];
  return [registry.baseId, ...registry.list(activePkg.value, device.value)];
});

/**
 * 当前生效的版式 id（近似值）
 *
 * 与容器里的 `pick*ViewId` 同优先级：URL 显式值 > 声明 > base。
 * ⚠️ 只做展示不做决策（真正的判定在各页的 `pick*ViewId` 里），但**查找范围必须与容器一致**：
 *    版式跟随主题包与设备，所以要在"当前包 × 当前设备"内解析 —— 否则高亮会指向一个
 *    这里根本不存在的 id，`?view=typo` 时容器其实渲染的是 base，面板却高亮 typo。
 */
const activeView = computed(() => {
  const registry = pageViews.value?.registry;
  if (!registry) return 'base';
  const pkg = activePkg.value;
  const dev = device.value;
  const fromUrl = asText(route.query.view);
  if (fromUrl) return registry.resolve(fromUrl, pkg, dev) ?? registry.baseId;
  const declared = page.value ? themeStore.viewFor(page.value, dev) : undefined;
  return (declared ? registry.resolve(declared, pkg, dev) : null) ?? registry.baseId;
});

/** 头部展示的当前配色名（列表里查不到时退回 id） */
const currentThemeName = computed(
  () => themeStore.themes.find(item => item.id === themeStore.themeId)?.name ?? themeStore.themeId
);

/** 覆盖配色：走 store 的 setTheme（会落盘，刷新后仍在） */
function pickTheme(id: string): void {
  themeStore.setTheme(id);
}

/** 切换版式：改 URL 的 `?view=`，其余 query 原样保留（丢了 client_id 会断授权流） */
function pickView(id: string): void {
  const query = { ...route.query };
  if (id === pageViews.value?.registry.baseId) delete query.view;
  else query.view = id;
  void router.replace({ query });
}

/**
 * 一键回默认：清掉落盘的配色与明暗偏好
 *
 * 配色回到**当前设备的默认档**（通常是 mono 黑白）而不是某个写死的 id ——
 * 每端的默认配色由目录顺序决定，面板不该替它做主。
 */
function resetAll(): void {
  themeStore.setTheme(deviceDefaultThemeId.value);
  themeStore.setMode('system');
}
</script>

<template>
  <div
    v-if="visible"
    data-mauth-debug="theme"
    class="fixed bottom-3 right-3 z-[9999] flex max-h-[72vh] w-[272px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900/95 text-slate-200 shadow-xl"
  >
    <div class="flex items-center gap-1 border-b border-slate-700/70 px-3 py-2">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-2 text-left"
        @click="collapsed = !collapsed"
      >
        <span class="shrink-0 text-slate-400">{{ collapsed ? '▸' : '▾' }}</span>
        <span class="shrink-0 text-[12px] font-medium text-slate-100">主题调试</span>
        <span class="truncate text-[11px] text-slate-400">
          {{ currentThemeName }} · {{ MODE_LABELS[themeStore.mode] }}
        </span>
      </button>
      <button
        type="button"
        class="shrink-0 rounded px-1 text-[14px] leading-none text-slate-500 hover:text-slate-200"
        title="收起面板（URL 参数仍在，刷新会回来）"
        @click="dismissed = true"
      >
        ×
      </button>
    </div>

    <div v-if="!collapsed" class="flex-1 overflow-y-auto px-3 pb-3">
      <p class="mt-3 mb-1.5 text-[11px] font-medium text-slate-400">
        设备（决定看哪一套配色与版式）
      </p>
      <div class="flex flex-wrap gap-1">
        <button
          type="button"
          class="rounded-full border px-2 py-0.5 text-[11px] transition-colors"
          :class="
            deviceOverride === null
              ? 'border-sky-400/70 bg-sky-400/15 text-slate-100'
              : 'border-slate-700 text-slate-400 hover:bg-slate-100/10'
          "
          data-device="auto"
          @click="deviceOverride = null"
        >
          跟随路由（{{ DEVICE_LABELS[themeStore.activeDevice] }}）
        </button>
        <button
          v-for="d in THEME_DEVICES"
          :key="d"
          type="button"
          class="rounded-full border px-2 py-0.5 text-[11px] transition-colors"
          :class="
            deviceOverride === d
              ? 'border-sky-400/70 bg-sky-400/15 text-slate-100'
              : 'border-slate-700 text-slate-400 hover:bg-slate-100/10'
          "
          :data-device="d"
          @click="deviceOverride = d"
        >
          {{ DEVICE_LABELS[d] }}
        </button>
      </div>

      <p class="mt-3 mb-1.5 text-[11px] font-medium text-slate-400">
        配色（颜色 / 圆角 / 背景图）· 当前设备 {{ DEVICE_LABELS[device] }}
      </p>
      <p class="mb-1 text-[11px] leading-snug text-slate-500">
        手机端与电脑端的配色各自独立配置；换页面到另一端时本区会跟着切换
      </p>
      <template v-for="group in themeGroups" :key="group.pkg">
        <p class="mt-2 mb-1 text-[11px] text-slate-500" :data-pkg="group.pkg">
          包 · {{ group.pkg }}{{ group.pkg === activePkg ? '（当前）' : '' }}
        </p>
        <ul class="space-y-1">
          <li v-for="item in group.themes" :key="item.id">
            <button
              type="button"
              class="flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors"
              :class="
                themeStore.themeId === item.id
                  ? 'border-sky-400/70 bg-sky-400/15'
                  : 'border-transparent bg-slate-100/5 hover:bg-slate-100/10'
              "
              :data-theme-id="item.id"
              @click="pickTheme(item.id)"
            >
              <span
                class="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border"
                :style="{
                  background: item.preview?.primary,
                  borderColor: item.preview?.accent ?? 'transparent'
                }"
              />
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-1.5">
                  <span class="text-[12px] text-slate-100">{{ item.name }}</span>
                  <code class="text-[11px] text-slate-500">{{ item.id }}</code>
                </span>
                <span v-if="item.description" class="mt-0.5 block text-[11px] leading-snug text-slate-500">
                  {{ item.description }}
                </span>
              </span>
            </button>
          </li>
        </ul>
      </template>

      <p class="mt-3 mb-1.5 text-[11px] font-medium text-slate-400">明暗（与配色正交）</p>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="m in MODE_CYCLE"
          :key="m"
          type="button"
          class="rounded-full border px-2 py-0.5 text-[11px] transition-colors"
          :class="
            themeStore.mode === m
              ? 'border-sky-400/70 bg-sky-400/15 text-slate-100'
              : 'border-slate-700 text-slate-400 hover:bg-slate-100/10'
          "
          :data-mode="m"
          @click="themeStore.setMode(m)"
        >
          {{ MODE_LABELS[m] }}
        </button>
      </div>

      <template v-if="pageViews && viewIds.length">
        <p class="mt-3 mb-1.5 text-[11px] font-medium text-slate-400">
          版式 · {{ pageViews.page }}（DOM 结构，取自 包 {{ activePkg }} × {{ DEVICE_LABELS[device] }}）
        </p>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="id in viewIds"
            :key="id"
            type="button"
            class="rounded-full border px-2 py-0.5 text-[11px] transition-colors"
            :class="
              activeView === id
                ? 'border-sky-400/70 bg-sky-400/15 text-slate-100'
                : 'border-slate-700 text-slate-400 hover:bg-slate-100/10'
            "
            :data-view-id="id"
            @click="pickView(id)"
          >
            {{ id }}
          </button>
        </div>
        <p class="mt-1 text-[11px] leading-snug text-slate-500">
          版式只在「当前包 × 当前设备」内查找：切包或换端都会换成那一档自己的版式
        </p>
      </template>

      <div class="mt-3 flex items-center justify-between border-t border-slate-700/70 pt-2">
        <button
          type="button"
          class="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400 hover:bg-slate-100/10"
          @click="resetAll"
        >
          恢复默认
        </button>
        <span class="text-[11px] text-slate-500">?debug=theme</span>
      </div>
    </div>
  </div>
</template>
