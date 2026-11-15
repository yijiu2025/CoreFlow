/**
 * 外观同步 —— 把「背景 / 颜色 / 版式」五个维度存到**账号**上（不只本机）
 *
 * === 为什么需要这一层 ===
 * 本地 localStorage 只解决"同一台设备记得住"：换电脑、换浏览器、换手机就回到默认。
 * 用户理解的"我的设置"是跟账号走的，所以这几个维度要上报到 `session/preferences`
 * （JSON 列，合并语义），登录时再读回来。
 *
 * === 五个维度与各自的口径 ===
 *   accent  主题色      —— 由 `stores/accent.ts` 自己同步（它是第一个做的，保留原路径）
 *   theme   配色 id     —— 本文件
 *   mode    明暗意图     —— 本文件
 *   view    版式（包）   —— 本文件（**按设备取**：桌面与手机可以不同，上报的是当前设备的）
 *   bg      背景        —— 本文件
 *
 * === 冲突规则 ===
 * 登录后**服务端优先**（账号是真相）；服务端没值（新账号）就把本地当前值上报一次，
 * 免得用户在新设备上"必须先点一下"才留下记录。
 *
 * 🔴 上报必须防抖 + 去重：拖一次设置面板会连改好几个维度，逐次 PUT 既费流量也容易乱序。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { watch } from 'vue';
import { savePreferences } from '@/api/session';
import { useBackgroundStore } from '@/stores/background';
import { useDensityStore } from '@/stores/density';
import { useThemeStore } from '@/stores/theme';

/** 一次上报的载荷（只带变化的键） */
type AppearancePayload = {
  theme?: string;
  mode?: 'system' | 'light' | 'dark';
  view?: string;
  bg?: string;
  density?: string;
};

/** 防抖时长：与主题色那边（400ms）同一档，避免拖面板时连打 */
const FLUSH_DELAY = 400;

/** 服务端下发的版式，等待"当前设备"就绪后再落（守卫阶段 activeDevice 是空串） */
let pendingView: string | null = null;

/** 上次上报成功的快照（用于去重，避免 watch 抖动时重复写同一份数据） */
let lastSent = '';
/** 待发定时器 */
let timer: ReturnType<typeof setTimeout> | null = null;
/** 服务端数据正在套用 —— 期间不回声上报（否则读回来的值会被当成用户改动再写一遍） */
let applying = false;

/**
 * 把服务端偏好套用到界面
 *
 * @param prefs 服务端返回的偏好（可能只有部分键）
 * @returns 无
 */
export function applyServerAppearance(prefs?: {
  theme?: string;
  mode?: 'system' | 'light' | 'dark';
  view?: string;
  bg?: string;
  density?: string;
}): void {
  if (!prefs) return;
  applying = true;
  try {
    const themeStore = useThemeStore();
    // 版式先落（它会连带重置配色），否则 setTheme 可能被版式切换覆盖
    if (prefs.view) {
      const device = themeStore.activeDevice;
      // 🔴 守卫阶段（`auth.load` 调到这里）还没有渲染，activeDevice 是空串 ——
      //    此时写盘会落到 `mauth:view:` 这个空设备键上。先记下来，等设备就绪再落。
      if (device) themeStore.setDeviceView(device, prefs.view);
      else pendingView = prefs.view;
    }
    if (prefs.mode) themeStore.setMode(prefs.mode);
    if (prefs.theme) themeStore.setTheme(prefs.theme);
    if (prefs.bg) useBackgroundStore().pick(prefs.bg);
    if (prefs.density) useDensityStore().pick(prefs.density);
  } finally {
    applying = false;
  }
}

/**
 * 装外观同步（根组件调一次）
 *
 * @returns 停止函数（HMR / 卸载时用）
 */
export function installAppearanceSync(): () => void {
  const themeStore = useThemeStore();
  const backgroundStore = useBackgroundStore();
  const densityStore = useDensityStore();

  /**
   * 版式取「用户显式选过的那个」而不是 `packageId`
   *
   * `packageId` 跟着 `activeView` 走，而 `activeView` 会被 URL 的 `?th=` 临时改写 ——
   * 直接上报它，等于把"看了一眼的预览"写成账号偏好：下次登录全站版式就变了
   * （实测：`/login?th=spotlight` 会 PUT `view=spotlight`）。
   */
  const viewOf = (): string => themeStore.persistedViewOf(themeStore.activeDevice) ?? 'default';

  const snapshot = (): string =>
    JSON.stringify([
      themeStore.themeId,
      themeStore.mode,
      viewOf(),
      backgroundStore.currentId,
      densityStore.currentId
    ]);

  /**
   * 收集当前外观并（防抖后）上报
   *
   * @returns 无
   */
  function schedule(): void {
    if (applying) return;
    const next = snapshot();
    if (next === lastSent) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const payload: AppearancePayload = {
        theme: themeStore.themeId,
        mode: themeStore.mode,
        view: viewOf(),
        bg: backgroundStore.currentId,
        density: densityStore.currentId
      };
      lastSent = next;
      // 失败静默：外观是"锦上添花"，网络不好不该弹错误打断操作；
      // 本地已经生效，下次改动会重试。
      void savePreferences(payload).catch(() => {
        lastSent = '';
      });
    }, FLUSH_DELAY);
  }

  /**
   * 把"等服务端版式"落地（设备就绪后调用）
   *
   * @returns 无
   */
  function flushPendingView(): void {
    if (!pendingView) return;
    const device = themeStore.activeDevice;
    if (!device) return;
    themeStore.setDeviceView(device, pendingView);
    pendingView = null;
  }

  flushPendingView();
  const stopDevice = watch(() => themeStore.activeDevice, () => flushPendingView());
  const stop = watch(
    () => snapshot(),
    () => schedule(),
    { flush: 'post' }
  );

  return () => {
    stop();
    stopDevice();
    if (timer) clearTimeout(timer);
  };
}
