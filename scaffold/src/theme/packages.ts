/**
 * 界面风格（主题包）清单 —— 用户可切换的**版式**入口
 *
 * 为什么要在这里再列一遍：skinsuite 的注册表对外只暴露「配色」元信息
 * （`listThemes()` 返回的是每个配色的 meta，同名包会被压成 white/black 几条），
 * 没有「包名 → 显示名」的查询接口。所以宿主自己维护这份可选清单 ——
 * **加一个主题包 = 这里加一条**（忘加的症状是"包里明明有版式，切换面板里看不到"）。
 *
 * `accent` 是联动项：主题包自己的主色会被用户的主色偏好（inline 变量，后写者胜）
 * 顶掉，所以选中某个包时顺手把主色切到配套的那个，否则「微信风格」一进来是蓝色。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */

/** 一个可选的界面风格 */
export interface ThemePackageOption {
  /** 主题包 id（= `themes/<包>/` 目录名） */
  id: string;
  /** 显示名 */
  name: string;
  /** 一句话说明（说清"换了什么"，而不是形容词） */
  description: string;
  /**
   * 选中时联动的主色预设 id（见 `theme/accent.ts`）
   *
   * 不写 = 不动用户当前主色（适用于"只换版式不换色"的包）。
   */
  accent?: string;
}

/**
 * 可选界面风格（顺序 = 面板里的顺序，第一条是默认）
 *
 * `description` 是**给用户看的**，不是给维护者看的：说清"换了之后什么变了"，
 * 不写实现（"导航栏 + TabBar + cell 列表"那种话只在代码注释里出现）。
 * 这条文案同时出现在个人设置与「我/设置」页，两边都得读得通。
 */
export const THEME_PACKAGES: ThemePackageOption[] = [
  {
    id: 'default',
    name: '珍珠玻璃',
    description: '桌面式布局，一屏放下更多内容'
  },
  {
    id: 'wechat',
    name: '微信',
    description: '手机 App 式布局，一屏一件事',
    accent: 'wechat'
  }
];

/** localStorage 键（与 `mauth:mode` / `mauth:theme` / `mauth:accent` 同一命名族） */
export const PACKAGE_STORAGE_KEY = 'mauth:package';

/** 兜底包 id（skinsuite 的 `DEFAULT_THEME_PACKAGE` 同名，这里不 import 是为了不把内核拖进纯数据模块） */
const DEFAULT_PACKAGE_ID = 'default';

/**
 * 当前"打算用哪个包" —— 供**早于渲染**的地方用（路由守卫）
 *
 * 为什么不能在守卫里读 `themeStore.packageId`：那个值由 `activeView` 解析而来，
 * 而 `activeView` 是 `<ThemeView>` 渲染时才写进 store 的。守卫跑在渲染之前，
 * 读到的永远是上一个页面的值/默认值，`?th=wechat` 深链会被误判成 default。
 *
 * 优先级与 `useThemePackage` 同一份：URL `?th` / `?th_<设备urlKey>` > 本地偏好 > 默认。
 * 设备维度不区分（守卫这一步还不知道渲染设备，两个设备的键谁在就用谁 —— 都是
 * "用户这次想要这个包"）。
 *
 * @returns 包 id（未知值原样返回，由调用方比对）
 */
export function intendedPackageId(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const explicit = params.get('th') || params.get('th_mobile') || params.get('th_std');
    if (explicit) return explicit;
    return localStorage.getItem(PACKAGE_STORAGE_KEY) || DEFAULT_PACKAGE_ID;
  } catch {
    // 隐私模式 / 非浏览器环境：当作默认包（比抛错好，守卫不该因为读存储失败而拦人）
    return DEFAULT_PACKAGE_ID;
  }
}
