<script setup lang="ts">
/**
 * 应用根组件 —— 只负责路由器舞台 + 主题外壳
 *
 * 主题的一切（`.dark` 类、body 底色、调试面板）在 `ThemeRoot` 里；
 * 这里不出现任何主题判断逻辑，避免与状态机形成两套真相。
 *
 * @author yijiu2025
 */
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue';
import { ThemeRoot } from 'skinsuite/vue';
import { useThemeStore } from '@/stores/theme';
import { useAccentStore } from '@/stores/accent';
import { useOverridesStore } from '@/stores/overrides';
import { alignAccentToPackage } from '@/composables/useThemePackage';
import { installAppearanceSync } from '@/composables/useAppearance';
import ToastHost from '@/components/ui/ToastHost.vue';
import CommandPalette from '@/components/layout/CommandPalette.vue';
import { openCommandPalette } from '@/composables/useCommandPalette';
import ConfirmHost from '@/components/ui/ConfirmHost.vue';

/** <ThemeRoot> 的 props 类型（库未导出 ThemeStoreLike，从其 props 反推最稳妥） */
type ThemeRootProps = InstanceType<typeof ThemeRoot>['$props'];

/**
 * Pinia store → 库结构契约的一次类型适配
 *
 * `createThemeState` 返回的是 ref/computed，Pinia 包一层后对外**自动解包**成标量，
 * 运行时正是契约期望的形态；但 TS 推断出的是 store 的解包类型，与
 * `ThemeStoreLike` 的只读标量声明不完全一致（`packageId` 被推断成 ComputedRef）。
 * 这里只做类型桥接，不改运行时行为。
 */
const themeStore = useThemeStore() as unknown as ThemeRootProps['themeStore'];

/**
 * 全局快捷键：Ctrl / ⌘ + K 唤起命令面板
 *
 * 挂在 `window` 而不是某个元素上 —— 用户焦点可能在表格里、输入框里、甚至刚点完按钮，
 * 命令面板都该唤得起来（这正是它与"页面内的搜索框"的区别）。
 *
 * @param event 键盘事件
 */
function onGlobalKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openCommandPalette();
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown));

/**
 * 主题色的写入时机
 *
 * 主题包把 `--mauth-*` 写成 `document.documentElement` 的 inline 变量，我们覆盖主色是
 * **同一层、后写者胜**。所以不能只在启动时写一次：换明暗或换主题包时，ThemeRoot 会整批
 * 重写，主色会被主题默认值顶回去。
 *
 * `flush: 'post'` 保证在 DOM 更新（也就是 ThemeRoot 写入变量）之后执行，再加一个
 * `nextTick` 兜住「子组件 onMounted 里才注入」的情况。
 */
// 外观（配色 / 明暗 / 版式 / 背景）上报账号：装一次，改动防抖后自动同步
installAppearanceSync();

const accentStore = useAccentStore();
const overridesStore = useOverridesStore();
watch(
  /*
   * 三个源都要盯：
   *   mode     —— 明暗切换会整批重写 token；
   *   packageId —— 换版式（包）同理；
   *   themeId  —— **换配色**也必须重跑。漏了它，「跟随配色」会一直显示上一套配色的主色
   *               （2026-11-15 实测：选石墨夜后主色仍是珍珠白的蓝）；
   *   activePage —— 首帧它还是空串（壳还没渲染），此时读不到配色记录，等它落定再同步一次。
   */
  () => [themeStore.mode, themeStore.packageId, themeStore.themeId, themeStore.activePage].join('|'),
  async () => {
    await nextTick();
    // 先让"主色跟上主题包"（用户没选过色时），再写变量 —— 顺序反了就白写一次
    alignAccentToPackage();
    accentStore.sync();
    /*
     * 🔴 自定义覆盖必须**最后**写：三层都是 `html` 的 inline 声明，后写者胜。
     *    顺序 = 配色（theme-runtime）→ 主色（accent）→ 覆盖（overrides）。
     *    这里换配色/明暗/版式时也要重跑：被取消的覆盖要还原成**新**配色的基值。
     */
    overridesStore.apply();
  },
  { immediate: true, flush: 'post' }
);
</script>

<template>
  <ThemeRoot :theme-store="themeStore">
    <router-view />
    <!-- 全局反馈宿主：提示与确认框各只有一份，业务侧调 store 即可（见 stores/toast.ts / confirm.ts） -->
    <ToastHost />
    <ConfirmHost />
    <!-- 命令面板（⌘ / Ctrl + K）：全局浮层，与页面版式无关，靠 token 适配所有主题 -->
    <CommandPalette />
  </ThemeRoot>
</template>
