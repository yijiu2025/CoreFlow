<script setup lang="ts">
/**
 * 主题 / 版式调试面板
 *
 * 触发：URL 带 `?debug=theme`。不带该参数时**整体不渲染** —— 零外观影响、零额外请求，
 * 等同于这段代码不存在。宿主（posecraft）在拼 iframe URL 时会透传这个参数
 * （只放行 `theme` 这一个白名单值），所以弹窗里也能开。
 *
 * === 为什么不限定只在开发构建里出现 ===
 * 真机上没有 DevTools（本项目的反复痛点）。线上排查「某个租户看到的颜色不对」时，
 * 能直接在手机上切主题看效果是刚需，比让人远程改后端配置快得多。面板内容只有主题名与
 * 色值 —— 它们本来就在前端产物里，不构成信息泄露。
 *
 * === 样式刻意不跟随主题 ===
 * 面板是拿来做**对比**的，如果自己也跟着换色，就没法当参照物。所以固定用深色外观、
 * 且**完全不透明**（半透明会让页面文字透上来叠字，实测很难读），
 * 也不复用 `mauth-*` 类（那是移动端认证页的样式单一来源，不该被开发工具污染）。
 *
 * === 只控制**当前页面**（2026-09-24 重构）===
 * 面板**只管当前这一页**的两件事：
 *   • 版式 —— 当前页可选哪几套（`?view=`）
 *   • 配色 —— **当前生效的那套版式**支持哪几种颜色（`?theme=`）
 *
 * 早先的版本把所有页面 × 所有版式 × 所有配色全列出来，还能跨页跳转 —— 那是**调试器**
 * 的思路，不是使用者的。实际要的只有"我现在这一页，换个版式看看 / 换个颜色看看"。
 * 跨页跳转尤其有害：它会带着授权 query（`client_id` 等）跳到另一条路由，在宿主弹窗里
 * 把用户从登录流程中带跑。
 *
 * === 结构 ===
 * ```
 * ┌ 版式 ────────────────────┐   ← 当前页的可选版式，点即切
 * ├ 颜色 ────────────────────┤   ← **当前版式**支持的颜色（切版式后这份清单会变）
 * ├ 明暗 ────────────────────┤   ← 浅色 / 深色 / 跟随系统（与颜色正交）
 * └ 恢复默认 ────────────────┘
 * ```
 *
 * === 🔴 颜色与明暗是**两个正交维度**（2026-09-25 改）===
 * 早先这里有一张 `COLOR_MODE` 映射：点「黑」顺带把明暗设成 dark、点「白」设 light
 * —— 因为当时黑白是零 token 的，只能靠明暗档呈现深浅底。那造成两个问题
 * （用户实测后指出）：
 *   • **不等权**：黑白能改明暗、蓝青不能 →「先点黑再点蓝」拿到的是 blue 的**深色档**，
 *     用户看到"选了蓝但底色还是黑的"；
 *   • **命名会崩**：将来按"色彩搭配"给颜色命名时，明暗开关语义塞不进颜色里。
 *
 * 现在**每套配色自带底色**（各 `colors/<色>/index.ts` 里声明 `--mauth-canvas` 等），
 * 所以：
 *   • 点颜色 = 纯换一套配色，**不碰明暗**；
 *   • 明暗只由「明暗」那一行控制；
 *   • 黑 / 白 / 蓝 / 青 / 彩 是**完全并列的五个选项**，谁也不兼职开关。
 *
 * 直接的收益：`先黑后蓝` ≡ `先白后蓝` ≡ `直接点蓝`（三者底色完全一致），
 * 「蓝色」也就没有"白蓝 / 黑蓝"之分 —— 底色由蓝色自己决定。
 *
 * @author yijiu2025
 * @since 2026-09-23
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useThemeStore } from '@/stores/theme';
import {
  BASE_VIEW_ID,
  listColorsOf,
  listColorViews,
  THEME_DEVICES,
  type ThemeDevice
} from '@/theme';
import type { MauthThemeMeta } from '@/theme/types';
import { pageFromPath, viewsForPage } from '@/theme/views/pages';
import { MODE_LABELS } from '@/theme/mode';

const route = useRoute();
const router = useRouter();
const themeStore = useThemeStore();

/** 本次会话内手动关掉（URL 参数仍在，刷新会回来） */
const dismissed = ref(false);

/**
 * 折叠态：默认展开；但**小视口下默认折叠**
 *
 * 面板最常被用在两个地方：① 桌面浏览器整屏（视口很大，展开正好）；
 * ② 宿主 app 的登录弹窗 iframe（实测内宽 854px、内高仅 484px）。
 * 后者如果默认展开，`max-h` 一卡就只剩一半内容还要滚动，而且会盖住登录表单
 * —— 弹窗本来就是为了看"这套主题在真实宿主里长什么样"，盖住表单等于白开。
 *
 * 判定用高度而不是宽度：弹窗场景真正的约束是**高度**（484px），
 * 宽 854px 比面板宽得多，按宽度判会误判成"空间充足"。
 */
const COMPACT_MAX_HEIGHT = 560;
const collapsed = ref(
  typeof window !== 'undefined' ? window.innerHeight < COMPACT_MAX_HEIGHT : false
);

/** 只把「非空字符串」当有效参数 —— query 值可能是数组 */
function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const visible = computed(() => !dismissed.value && asText(route.query.debug) === 'theme');

/** 设备中文名（面板上要让人一眼分清两端） */
const DEVICE_LABELS: Record<ThemeDevice, string> = { mobile: '手机端', web: '电脑端' };

/* ============================================================================
   当前页 / 当前设备 / 当前版式
   ========================================================================== */

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

/** 当前生效页面 */
const activePage = computed(() => page.value ?? themeStore.activePage);

/**
 * 当前生效的版式 id
 *
 * 与容器里的 `pick*ViewId` 同优先级：URL 显式值 > 声明 > base。
 * ⚠️ 只做展示不做决策（真正的判定在各页的 `pick*ViewId` 里），但**查找范围必须与容器一致**：
 *    版式跟随主题包与设备，所以要在"当前包 × 当前设备"内解析。
 *
 * ⚠️ 必须定义在 `viewOptions` **之前**：后者在它的求值里读本值，
 *    顺序颠倒会在 computed 首次求值时踩 TDZ（现象是面板整个不渲染）。
 */
const activeViewId = computed(() => {
  const registry = pageViews.value?.registry;
  if (!registry) return BASE_VIEW_ID;
  const pkg = themeStore.packageId;
  const dev = device.value;
  const fromUrl = asText(route.query.view);
  if (fromUrl) return registry.resolve(fromUrl, pkg, dev) ?? registry.baseId;
  const declared = page.value ? themeStore.viewFor(page.value, dev) : undefined;
  return (declared ? registry.resolve(declared, pkg, dev) : null) ?? registry.baseId;
});

/**
 * 当前页的**可选版式**（当前包 × 当前设备内，基础版式在最前）
 *
 * 该页没接入版式机制时返回空数组 —— 面板上只显示颜色区，不显示空的版式行。
 */
const viewOptions = computed<string[]>(() => {
  const registry = pageViews.value?.registry;
  const p = page.value;
  if (!registry || !p) return [];
  const variants = registry.list(themeStore.packageId, device.value);
  const ids = [registry.baseId, ...variants];
  // 当前生效的版式也一定列出来（即使该范围内没扫到它，例如写了个未知 id）
  if (!ids.includes(activeViewId.value)) ids.push(activeViewId.value);
  return ids;
});

/**
 * **当前版式**支持的颜色（这是面板主体）
 *
 * 直接问注册表「这个页面的这个版式下挂了哪几套配色」，所以**切版式后这份清单会变**
 * —— 这正是"每个版式各自可选的颜色不同"的落点。
 */
const colors = computed<MauthThemeMeta[]>(() => {
  const p = activePage.value;
  if (!p) return [];
  return listColorsOf(device.value, p, activeViewId.value);
});

/** 该页在该设备下挂了配色的版式清单（用于提示"这页还有哪些版式有颜色"） */
const viewsWithColors = computed<string[]>(() =>
  activePage.value ? listColorViews(device.value, activePage.value) : []
);

/* ============================================================================
   色卡渲染
   ========================================================================== */

/** 把 #rrggbb 解析成三元组；非法值返回 null */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 色卡底色：直接取 `preview.primary`；取不到时给中性灰兜底（不透明，避免穿帮） */
function swatchBg(item: MauthThemeMeta): string {
  return item.preview?.primary ?? 'rgb(51 65 85)';
}

/** 色块上的文字色：按底色亮度选黑/白，保证任何色卡上都读得清 */
function swatchFg(item: MauthThemeMeta): string {
  const rgb = item.preview ? parseHex(item.preview.primary) : null;
  if (!rgb) return 'rgb(226 232 240)';
  // 相对亮度（sRGB 感知近似：0.299R + 0.587G + 0.114B）
  const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return lum > 150 ? 'rgb(15 23 42)' : 'rgb(248 250 252)';
}

/* ============================================================================
   当前状态
   ========================================================================== */

/** 当前**生效**的配色 id（按当前设备/页面/版式校正过的） */
const activeThemeId = computed(
  () => themeStore.themeRecordFor(device.value, activePage.value, activeViewId.value).meta.id
);

/** 头部展示的当前配色名（查不到时退回 id） */
const currentColorName = computed(
  () => colors.value.find(c => c.id === activeThemeId.value)?.name ?? activeThemeId.value
);

/** 面板头部状态串 */
const headerState = computed(
  () => `${currentColorName.value} · ${MODE_LABELS[themeStore.mode]}`
);

/* ============================================================================
   动作（**只动当前页**，不跨页跳转）
   ========================================================================== */

/**
 * 把当前 query 复制一份（保留 `client_id` 等授权上下文）
 *
 * 丢了 `client_id` 会断授权流，所以任何 URL 改动都只增删目标那一项。
 */
function cloneQuery(): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(route.query)) {
    if (typeof v === 'string') query[k] = v;
    else if (Array.isArray(v)) query[k] = v.filter((x): x is string => typeof x === 'string');
  }
  return query;
}

/**
 * 切换版式（**只改 URL 的 `view`，path 不动**）
 *
 * 选基本版式时把参数**删掉**而不是写成 `view=base`：URL 干净，
 * 也与容器「无参数即基础版式」的判定一致。
 */
function pickView(id: string): void {
  const query = cloneQuery();
  if (id === (pageViews.value?.registry.baseId ?? BASE_VIEW_ID)) delete query.view;
  else query.view = id;
  void router.replace({ query });
}

/**
 * 选颜色
 *
 * **只换色，不碰明暗**（2026-09-25 改）。
 *
 * 早先这里还有一套 `COLOR_MODE`：点「黑」顺带把明暗设成 dark、点「白」设成 light，
 * 因为当时黑白是**零 token** 的、只能靠明暗档来呈现深浅底。那条联动有两个毛病
 * （用户实测后指出）：
 *   ① **不等权** —— 黑白能改明暗、蓝青不能，于是「先点黑再点蓝」会拿到 blue 的
 *      **深色档**，用户看到的是"选了蓝但底色还是黑的"；
 *   ② **命名会崩** —— 将来按"色彩搭配"给颜色命名时，明暗开关语义塞不进颜色里。
 *
 * 现在每套配色**自带底色**（见各 `colors/<色>/index.ts` 的 `--mauth-canvas` 等），
 * 所以选颜色是纯粹的"换一套配色"；明暗由下面那一行单独控制 —— 两者正交。
 *
 * **不改 URL**：配色是运行时状态（store + localStorage），与 `?theme=` 是两套入口，
 * 面板改的是当前会话的观感，不该往 URL 上写。
 */
function pickColor(id: string): void {
  themeStore.setTheme(id);
}

/** 一键回默认：清掉落盘的配色与明暗偏好 */
function resetAll(): void {
  themeStore.setMode('system');
  const first = colors.value[0];
  if (first) themeStore.setTheme(first.id);
}
</script>

<template>
  <div
    v-if="visible"
    data-mauth-debug="theme"
    class="fixed bottom-3 right-3 z-[9999] flex max-h-[calc(100vh-24px)] w-[264px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-slate-200 shadow-2xl ring-1 ring-black/50"
  >
    <!-- 头部：标题 + 当前状态 + 折叠/关闭 -->
    <div class="flex items-center gap-1 border-b border-slate-700/70 px-2.5 py-2">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        @click="collapsed = !collapsed"
      >
        <span class="shrink-0 text-slate-400">{{ collapsed ? '▸' : '▾' }}</span>
        <span class="shrink-0 text-[12px] font-medium text-slate-100">主题调试</span>
        <span class="truncate text-[11px] text-slate-400">{{ headerState }}</span>
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

    <div v-if="!collapsed" class="flex-1 overflow-y-auto px-2.5 pb-2.5">
      <!-- 设备：同一台电脑上预览另一端（不必真去开移动端路由） -->
      <div class="mt-2.5 mb-1.5 flex items-center justify-between">
        <span class="text-[11px] text-slate-500">设备</span>
        <div class="flex items-center gap-0.5">
          <button
            type="button"
            class="rounded px-1.5 py-0.5 text-[10px] transition-colors"
            :class="deviceOverride === null ? 'bg-sky-400/20 text-slate-100' : 'text-slate-500 hover:text-slate-300'"
            data-device="auto"
            :title="`跟随路由（当前 ${DEVICE_LABELS[themeStore.activeDevice]}）`"
            @click="deviceOverride = null"
          >
            跟随
          </button>
          <button
            v-for="d in THEME_DEVICES"
            :key="d"
            type="button"
            class="rounded px-1.5 py-0.5 text-[10px] transition-colors"
            :class="deviceOverride === d ? 'bg-sky-400/20 text-slate-100' : 'text-slate-500 hover:text-slate-300'"
            :data-device="d"
            @click="deviceOverride = d"
          >
            {{ DEVICE_LABELS[d] }}
          </button>
        </div>
      </div>

      <!-- ① 版式（当前页） -->
      <div v-if="viewOptions.length" class="mt-2">
        <div class="mb-1 flex items-baseline justify-between">
          <span class="text-[11px] text-slate-400">版式</span>
          <span class="truncate pl-2 text-[10px] text-slate-500">
            {{ activePage }}{{ viewOptions.length > 1 ? '' : '（暂无变体）' }}
          </span>
        </div>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="id in viewOptions"
            :key="id"
            type="button"
            class="rounded-full border px-2 py-0.5 text-[11px] transition-colors"
            :class="
              activeViewId === id
                ? 'border-sky-400/70 bg-sky-400/15 text-slate-100'
                : 'border-slate-700 text-slate-400 hover:bg-slate-100/10'
            "
            :data-view-id="id"
            :title="`切到版式 ${id}`"
            @click="pickView(id)"
          >
            {{ id }}
          </button>
        </div>
        <!-- 提示：这页还有别的版式挂了颜色（切过去颜色清单会变） -->
        <p
          v-if="viewsWithColors.length && !viewsWithColors.includes(activeViewId)"
          class="mt-1 text-[10px] leading-snug text-slate-500"
        >
          另有版式 {{ viewsWithColors.filter(v => v !== activeViewId).join('、') }} 可选
        </p>
      </div>

      <!-- ② 颜色（**当前版式**支持的那几种） -->
      <div class="mt-2.5">
        <div class="mb-1 flex items-baseline justify-between">
          <span class="text-[11px] text-slate-400">颜色</span>
          <span class="text-[10px] text-slate-500">
            版式 {{ activeViewId }} · {{ colors.length }} 种
          </span>
        </div>
        <div v-if="colors.length" class="flex flex-wrap gap-1">
          <button
            v-for="c in colors"
            :key="c.id"
            type="button"
            class="flex w-[46px] flex-col items-center gap-0.5 rounded-md border py-0.5 transition-colors"
            :class="
              activeThemeId === c.id
                ? 'border-sky-400/80 ring-1 ring-sky-400/60'
                : 'border-slate-700 hover:border-slate-500'
            "
            :data-color-pick="c.id"
            :data-color-active="activeThemeId === c.id ? c.id : undefined"
            :title="`${c.name}（${c.id}）`"
            @click="pickColor(c.id)"
          >
            <span
              class="flex h-[26px] w-[38px] items-center justify-center rounded text-[11px] font-medium"
              :style="{ background: swatchBg(c), color: swatchFg(c) }"
            >
              {{ c.name }}
            </span>
            <span class="max-w-[42px] truncate text-[9px] leading-none text-slate-500">{{ c.id }}</span>
          </button>
        </div>
        <p v-else class="text-[10px] leading-snug text-slate-500">
          这个版式还没有配色目录（`themes/…/{{ activePage }}/…/colors/`）
        </p>
      </div>

      <!-- ③ 明暗（黑/白会自动带档，这里管其余颜色） -->
      <div class="mt-2.5 flex items-center justify-between rounded-lg border border-slate-700/60 px-2 py-1">
        <span class="text-[11px] text-slate-400">明暗</span>
        <div class="flex items-center gap-0.5">
          <button
            v-for="m in (['system', 'light', 'dark'] as const)"
            :key="m"
            type="button"
            class="rounded px-1.5 py-0.5 text-[10px] transition-colors"
            :class="themeStore.mode === m ? 'bg-sky-400/20 text-slate-100' : 'text-slate-500 hover:text-slate-300'"
            :data-mode="m"
            @click="themeStore.setMode(m)"
          >
            {{ MODE_LABELS[m] }}
          </button>
        </div>
      </div>

      <div class="mt-2.5 flex items-center justify-between border-t border-slate-700/70 pt-2">
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
