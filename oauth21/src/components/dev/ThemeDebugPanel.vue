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
 * === 配色区为什么是「一格一色卡」而不是列表 ===
 * 「黑白」在实现上只是一套普通配色（`colors/mono/`），不是"默认档"——
 * 早先的列表式布局容易让人把它读成"默认 + 可选皮肤"两层结构。改成并列色卡后，
 * 黑白 / 海蓝 / 天青 在视觉上就是**同一层的三个互斥选项**，点哪个切哪个，
 * 与 `?theme=<id>` 的语义一一对应。色卡用 `preview.primary/accent` 上色，
 * 与真实渲染取的是同一份 meta（不是另写一套色值）。
 *
 * === 为什么明暗挂在色卡上 ===
 * 明暗（mode）与配色是**正交**的两个维度，但界面上分成两块时，
 * 用户看不到"这套配色在深色下是什么样"这个信息 —— 而它恰恰是挑配色时最需要的。
 * 所以每张色卡画两格采样（浅 / 深），点格子直接切到那个组合。
 * 「跟随系统」不属于任何一套配色，单独放在下面一行。
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
} from '@/theme';
import { pageFromPath, listPageViews, viewsForPage } from '@/theme/views/pages';
import type { ViewRegistry } from '@/theme/views/registry';
import { MODE_CYCLE, MODE_LABELS } from '@/theme/mode';

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

/**
 * 当前**生效**的配色 id（按当前设备校正过的）
 *
 * 不能直接用 `themeStore.themeId`：它是"上次选的那套"，可能属于另一端
 * （在手机端选了 ocean 再切到电脑端看，themeId 仍是 ocean，但实际渲染已回落到 mono）。
 * 色卡高亮必须跟"真正在渲染的那套"走，否则面板会指着一套没生效的配色说"当前"。
 */
const activeThemeId = computed(() => themeStore.themeRecordFor(device.value).meta.id);

/** 当前配色所属的主题包 —— 版式只在包内查找，所以版式列表要跟着它走 */
const activePkg = computed(() => themeStore.packageId);

/**
 * 全部已接入版式机制的页面，各自在「当前包 × 当前设备」下的版式清单
 *
 * 版式是**每页一套**的（登录页只有 base，注册页才有 compact），所以面板要按页列出
 * 全部可选值 —— 只列当前页的话，想对比就得手动跳路由，而弹窗里的路由不由使用者控制。
 * 当前页用 `isCurrent` 标出来，第一次看到面板的人才知道"这堆按钮里哪些是这一页的"。
 *
 * 保留 `registry` 与 `page`：切版式时要拿 `registry.baseId` 判断"是不是基础版式"
 * （是的话把 `view` 参数删掉而不是写成 `view=base`），只传个 id 数组是不够的。
 */
interface LayoutGroup {
  page: string;
  isCurrent: boolean;
  ids: string[];
  registry: ViewRegistry;
}

const layoutGroups = computed<LayoutGroup[]>(() =>
  listPageViews().map(item => ({
    page: item.page,
    isCurrent: item.page === page.value,
    ids: [item.registry.baseId, ...item.registry.list(activePkg.value, device.value)],
    registry: item.registry
  }))
);

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

/**
 * 色卡里「浅色 / 深色」两格的底色
 *
 * 用 `preview` 的主色**混出**一个浅底与深底，而不是去读每套配色的真实 token：
 *   • 真实 token 要等 `theme.scss` 惰性 chunk 到货才有，面板不该为画预览去拉它；
 *   • `preview` 本来就是这个用途（见 `MauthThemeMeta.preview` 注释）。
 *
 * 混白/混黑的系数是手调的：保证 4 套配色下"浅格看得清、深格也看得清"，
 * 同时两格对比明显到一眼能分辨。取不到 `preview` 时给中性灰兜底。
 */

/** 把 #rrggbb 解析成三元组；非法值返回 null */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 与 target(0~255) 按 ratio(0~1) 混合 */
function mix(rgb: [number, number, number], target: number, ratio: number): string {
  const ch = rgb.map(v => Math.round(v + (target - v) * ratio));
  return `rgb(${ch[0]} ${ch[1]} ${ch[2]})`;
}

/** 浅色档底色：主色混大量白 */
function lightSurfaceOf(item: { preview?: { primary: string } }): string {
  const rgb = item.preview ? parseHex(item.preview.primary) : null;
  return rgb ? mix(rgb, 255, 0.88) : 'rgb(241 245 249)';
}

/** 深色档底色：主色混大量黑 */
function darkSurfaceOf(item: { preview?: { primary: string } }): string {
  const rgb = item.preview ? parseHex(item.preview.primary) : null;
  return rgb ? mix(rgb, 0, 0.72) : 'rgb(30 41 59)';
}

/** 头部展示的当前配色名（列表里查不到时退回 id） */
const currentThemeName = computed(
  () => themeStore.themes.find(item => item.id === activeThemeId.value)?.name ?? activeThemeId.value
);

/** 是否跟随系统（明暗）—— 色卡高亮时要留出"未指定具体档"的状态 */
const isSystemMode = computed(() => themeStore.mode === 'system');

/**
 * 选配色
 *
 * 点色卡 = 选一套配色。若当前是「跟随系统」，这里**只换配色、不动明暗**：
 * 用户是在挑颜色，不该顺手把他的明暗偏好从"跟随系统"改成写死的某一档。
 */
function pickTheme(id: string): void {
  themeStore.setTheme(id);
}

/**
 * 选「配色 + 明暗」的具体组合（点色卡里的浅/深格子）
 *
 * 先设配色再设明暗：两个 store action 各自落盘，顺序不影响最终结果，
 * 但先配色能保证中途重渲染时看到的是新配色的浅色/深色，不会闪一下旧色。
 */
function pickThemeWithMode(id: string, mode: 'light' | 'dark'): void {
  themeStore.setTheme(id);
  themeStore.setMode(mode);
}

/**
 * 切换**当前页**的版式：改 URL 的 `?view=`，其余 query 原样保留
 *
 * 丢了 `client_id` 会断授权流，所以只增删 `view` 一项。
 * 选中的是基础版式时把参数**删掉**而不是写成 `view=base`：URL 干净，
 * 也与容器「无参数即基础版式」的判定一致。
 */
function pickView(id: string): void {
  const query = { ...route.query };
  if (id === pageViews.value?.registry.baseId) delete query.view;
  else query.view = id;
  void router.replace({ query });
}

/**
 * 从任意页面的版式清单里挑一个 —— 支持**跨页面**切换
 *
 * 为什么要允许切到别的页面：版式是「每个页面各自一套」的，登录页只有 base、
 * 注册页才有 compact。只列当前页的话，想对比两页的版式就得先在宿主里手动跳路由，
 * 而弹窗场景下路由不在我们手里（分发器按设备判定）。
 *
 * 做法：沿用当前 query（保住 client_id / appName 等授权上下文），只把 path 换成
 * 目标页面对应的路由，并带上 `view`。目标 path 由「当前是不是移动端路由」决定：
 * 面板在 `/m/*` 上就继续用 `/m/*`，否则用桌面分发器那一套 —— 保持设备语义不变。
 */
function pickViewOnPage(target: LayoutGroup, id: string): void {
  const query: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(route.query)) {
    // 只搬字符串 / 字符串数组：query 里理论上也可能是 null，丢掉而不是硬塞给 router
    if (typeof v === 'string') query[k] = v;
    else if (Array.isArray(v)) query[k] = v.filter((x): x is string => typeof x === 'string');
  }
  if (id === target.registry.baseId) delete query.view;
  else query.view = id;

  // 当前在 /m/xxx 上 → 目标也用 /m/xxx；否则用桌面路由（分发器会按设备再决定渲染谁）
  const onMobileRoute = /^\/m\//.test(route.path);
  const path = onMobileRoute ? `/m/${target.page}` : `/${target.page}`;

  void router.replace({ path, query });
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
    class="fixed bottom-3 right-3 z-[9999] flex max-h-[calc(100vh-24px)] w-[268px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900/95 text-slate-200 shadow-xl"
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
      <!-- 配色：一格一张色卡，黑白与其它配色并列 -->
      <div class="mt-3 mb-2 flex items-baseline justify-between">
        <p class="text-[11px] font-medium text-slate-400">配色</p>
        <!-- 设备切换：在同一个屏幕上预览另一端的配色（不必真去开移动端路由） -->
        <div class="flex items-center gap-0.5">
          <button
            type="button"
            class="rounded px-1.5 py-0.5 text-[10px] transition-colors"
            :class="
              deviceOverride === null
                ? 'bg-sky-400/20 text-slate-100'
                : 'text-slate-500 hover:text-slate-300'
            "
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
            :class="
              deviceOverride === d
                ? 'bg-sky-400/20 text-slate-100'
                : 'text-slate-500 hover:text-slate-300'
            "
            :data-device="d"
            @click="deviceOverride = d"
          >
            {{ DEVICE_LABELS[d] }}
          </button>
        </div>
      </div>

      <template v-for="group in themeGroups" :key="group.pkg">
        <!-- 只有一个包时不必显示分组标题（当前就是这种情况），多包才需要区分 -->
        <p v-if="themeGroups.length > 1" class="mt-2 mb-1 text-[11px] text-slate-500" :data-pkg="group.pkg">
          包 · {{ group.pkg }}{{ group.pkg === activePkg ? '（当前）' : '' }}
        </p>
        <ul class="space-y-1.5">
          <li v-for="item in group.themes" :key="item.id">
            <div
              class="rounded-lg border p-1.5 transition-colors"
              :class="
                activeThemeId === item.id
                  ? 'border-sky-400/70 bg-sky-400/10'
                  : 'border-slate-700/60 bg-slate-100/5 hover:bg-slate-100/10'
              "
              :data-theme-id="item.id"
            >
              <!-- 第一行：点名字 = 套用这套配色（保持当前明暗档） -->
              <button
                type="button"
                class="flex w-full items-center gap-2 text-left"
                :data-theme-pick="item.id"
                @click="pickTheme(item.id)"
              >
                <span class="min-w-0 flex-1 truncate text-[12px] text-slate-100">{{ item.name }}</span>
                <code class="shrink-0 text-[10px] text-slate-500">{{ item.id }}</code>
                <span
                  v-if="activeThemeId === item.id"
                  class="shrink-0 text-[10px] text-sky-300"
                  :data-theme-active="item.id"
                >
                  使用中
                </span>
              </button>

              <!-- 第二行：两格明暗采样，点哪格切到「该配色 + 该明暗」 -->
              <div class="mt-1.5 grid grid-cols-2 gap-1">
                <button
                  v-for="m in (['light', 'dark'] as const)"
                  :key="m"
                  type="button"
                  class="flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[10px] transition-colors"
                  :class="[
                    m === 'light' ? 'border-slate-600/70' : 'border-slate-600/70',
                    item.id === activeThemeId && themeStore.mode === m
                      ? 'ring-1 ring-sky-400/80'
                      : 'hover:border-slate-400/70'
                  ]"
                  :style="{ background: m === 'light' ? lightSurfaceOf(item) : darkSurfaceOf(item) }"
                  :data-theme-mode="`${item.id}:${m}`"
                  :title="`切到「${item.name} · ${MODE_LABELS[m]}」`"
                  @click="pickThemeWithMode(item.id, m)"
                >
                  <span
                    class="h-2.5 w-2.5 shrink-0 rounded-full border"
                    :style="{
                      background: item.preview?.primary ?? 'transparent',
                      borderColor: item.preview?.accent ?? 'transparent'
                    }"
                  />
                  <span :class="m === 'light' ? 'text-slate-800' : 'text-slate-100'">
                    {{ MODE_LABELS[m] }}
                  </span>
                </button>
              </div>
            </div>
          </li>
        </ul>
      </template>

      <!-- 跟随系统：不属于任何一套配色，单独一行 -->
      <div class="mt-2 flex items-center justify-between rounded-lg border border-slate-700/60 px-1.5 py-1">
        <span class="text-[11px] text-slate-400">明暗跟随系统</span>
        <button
          type="button"
          class="rounded-md border px-2 py-0.5 text-[10px] transition-colors"
          :class="
            isSystemMode
              ? 'border-sky-400/70 bg-sky-400/15 text-slate-100'
              : 'border-slate-600 text-slate-400 hover:bg-slate-100/10'
          "
          data-mode="system"
          @click="themeStore.setMode(MODE_CYCLE[0])"
        >
          {{ isSystemMode ? '已启用' : '启用' }}
        </button>
      </div>

      <!-- 版式：按页面并列列出，点即切换（含跨页跳转） -->
      <div v-if="layoutGroups.length" class="mt-3">
        <div class="mb-1.5 flex items-baseline justify-between">
          <p class="text-[11px] font-medium text-slate-400">版式</p>
          <p class="text-[11px] text-slate-500">包 {{ activePkg }} × {{ DEVICE_LABELS[device] }}</p>
        </div>
        <div
          v-for="group in layoutGroups"
          :key="group.page"
          class="mb-1.5 rounded-lg border px-1.5 py-1.5"
          :class="group.isCurrent ? 'border-sky-400/50 bg-sky-400/5' : 'border-slate-700/50 bg-slate-100/5'"
          :data-view-page="group.page"
        >
          <div class="mb-1 flex items-center gap-1.5">
            <span class="text-[11px] text-slate-300">{{ group.page }}</span>
            <span v-if="group.isCurrent" class="text-[10px] text-sky-300" data-view-current="1">
              当前页
            </span>
            <span v-if="group.ids.length === 1" class="text-[10px] text-slate-500">（暂无变体）</span>
          </div>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="id in group.ids"
              :key="id"
              type="button"
              class="rounded-full border px-2 py-0.5 text-[11px] transition-colors"
              :class="
                group.isCurrent && activeView === id
                  ? 'border-sky-400/70 bg-sky-400/15 text-slate-100'
                  : 'border-slate-700 text-slate-400 hover:bg-slate-100/10'
              "
              :data-view-id="`${group.page}:${id}`"
              :title="group.isCurrent ? `切到版式 ${id}` : `跳到 ${group.page} 并用版式 ${id}`"
              @click="group.isCurrent ? pickView(id) : pickViewOnPage(group, id)"
            >
              {{ id }}
            </button>
          </div>
        </div>
        <p class="mt-1 text-[11px] leading-snug text-slate-500">
          点其它页面的版式会连页面一起切过去（query 原样保留）
        </p>
      </div>

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
