/**
 * 设备清单 —— **设备维度的唯一声明处**（2026-09-27 起）
 *
 * === 这个文件解决什么 ===
 * 「有哪些设备」原先散在四个地方，且每处都是**代码里的 if-链**：
 *   ① `mauth-theme-core` 的 `THEME_DEVICES = ['mobile','standard','mini']`（词汇表）
 *   ② 三个分发器各自的 `activeForm`（判定 + 渲染哪个组件）
 *   ③ `router/routes.ts` 手写的三条路由（`/login`、`/m/login`、`/mini-login`）
 *   ④ 调试面板的 `DEVICE_LABELS`
 * ⇒ 加一种设备（如未来的 `tablet`）要同时改四处，漏一处就是**静默的一半生效**
 *   （典型症状：路由能进、但主题作用域永远回落到 mobile，且零报错）。
 *
 * 现在：**一个设备 = 本文件里一条声明**，其余四处全部从它派生
 * （词汇表、判定、容器、路由、面板标签）。
 *
 * === 加一种设备要做什么（三步，缺一会被关卡拦下）===
 *   1. 本文件加一条 `ThemeDeviceDef`（id / label / routePath / match / containers）
 *   2. 写它的容器：`view/<设备 id>/<页面>/index.vue`
 *      （或复用既有目录，像 `mini` 那样在 `containers` 里指定自己的 glob 与文件名规则）
 *   3. 在主题包里加该设备的目录：`themes/<包>/<设备>/<页面>/{index.vue,colors/}`
 *      （只覆盖部分设备/页面是允许的；包可用 `coverage.json` 把范围写成契约）
 *
 * ⚠️ **判定顺序就是本清单的顺序**（先命中先用），**最后一条必须无条件成立**
 *    —— 它是兜底设备。`.tmp-probe/verify-device-registry.mjs` 会核这一条。
 *
 * === 为什么判定必须收在一处（三个分发器曾经各写一份）===
 * 三个分发器（login / register / forgot-password）对"mini 来源"的口径**并不一致**：
 * login 认 `?from=mini` 与 `mini-login` 路径，register 认 `?from=mini` 与 `mini-register`，
 * forgot-password 认 `?fromLogin=mini`。三种写法各自都"能用"，但新增一条 mini 入口时
 * 极容易只改一处 → 同一个链接在不同页面落到不同设备，表现是"切换形态后样式半对半错"。
 * 现在 `mini` 的判定只有一份，三个页面自然同形。
 *
 * @author yijiu2025
 * @since 2026-09-27
 */
import type { Component } from 'vue';
import { THEME_ID_RE } from 'mauth-theme-core';

/** 设备容器的惰性加载器（与 `import.meta.glob` 的取值形态一致） */
export type DeviceContainerLoader = () => Promise<{ default: Component }>;

/**
 * 判定上下文 —— 判定所需的**全部**外部信息
 *
 * 刻意只放"与页面无关"的原始事实：设备判定不该知道"当前是哪一页"（那是页面自己的事），
 * 否则三个分发器又会各自长出特例。
 */
export interface DeviceMatchContext {
  /** `?isMobile=true` —— 显式意图，优先级最高（联调/父应用指定） */
  explicitMobile: boolean;
  /** 路由 path（不含 query / hash） */
  path: string;
  /** `?from=` 的取值（iframe 来源标记，空串表示没给） */
  from: string;
  /** `?fromLogin=` 的取值（历史键：从 mini 登录页跳来，空串表示没给） */
  fromLogin: string;
  /** 视口/UA 判定结果（口径见 `utils/device.ts`，只此一份） */
  viewportIsMobile: boolean;
}

export interface ThemeDeviceDef {
  /** 设备 id = 主题包内的目录名（`themes/<包>/<设备>/`），只允许 `[a-z0-9-]` */
  id: string;
  /** 中文名（调试面板 / 日志用） */
  label: string;
  /**
   * 该设备在某页的容器（分发器渲染它）
   *
   * 返回 undefined 表示"该设备没有这一页的容器" —— 分发器会退到兜底设备。
   */
  containers: ReadonlyMap<string, DeviceContainerLoader>;
  /**
   * 该设备在路由表里占的 path（相对根，`{page}` 由页面名替换）
   *
   * 例：`mobile` → `m/{page}`（`/m/login`）、`mini` → `mini-{page}`（`/mini-login`）。
   * ⚠️ 已发出的 URL 不能改：`/m/login` 用的是斜杠、`/mini-login` 用的是连字符，
   *    这个不一致是历史事实，所以**每条声明自带 path 形态**，而不是强行统一。
   */
  routePath(page: string): string;
  /** 本次访问是否属于这台设备（清单顺序 = 优先级，先命中先用） */
  match(ctx: DeviceMatchContext): boolean;
}

/**
 * 从「一批容器文件」建「页面 → 加载器」表
 *
 * 位置约定：`<...>/<页面名>/<文件名>.vue` —— **页面名 = 文件所在目录名**。
 * 该约定对三端都成立：
 *   • mobile   `view/app/login/index.vue`
 *   • standard `view/web/login/StandardLogin.vue`
 *   • mini     `view/web/login/MiniLogin.vue`
 *   • 新设备    `view/tablet/login/index.vue`（推荐用这个，与 mobile 同形）
 *
 * 各设备用自己的 glob + 文件名规则调它（见下方清单），于是"容器放在哪、叫什么"
 * 是**该设备自己的声明**，不是散在分发器里的 import 语句。
 */
function pageContainers(
  mods: Record<string, DeviceContainerLoader>,
  fileRe: RegExp
): ReadonlyMap<string, DeviceContainerLoader> {
  const map = new Map<string, DeviceContainerLoader>();
  for (const [key, loader] of Object.entries(mods)) {
    const parts = key.split('/');
    const file = parts[parts.length - 1];
    // 页面名 = 文件上一级目录名（`/src/view/app/login/index.vue` → `login`）
    const page = parts[parts.length - 2];
    if (!page || !file || !fileRe.test(file)) continue;
    // 页面名同样进 data-* / 路由，走同一份白名单；不合规目录静默跳过
    if (!THEME_ID_RE.test(page)) continue;
    if (!map.has(page)) map.set(page, loader);
  }
  return map;
}

/** 手机端容器：`view/app/<页面>/index.vue`（本应用最早的形态，保持不动） */
const mobileContainers = pageContainers(
  import.meta.glob<{ default: Component }>('/src/view/app/*/index.vue'),
  /^index\.vue$/
);

/** 桌面 / 紧凑端容器：`view/web/<页面>/<Xxx><Page>.vue`（同一个目录，靠文件名前缀区分设备） */
const webContainers = import.meta.glob<{ default: Component }>('/src/view/web/*/*.vue');

/** 路由 path 里是否出现了该设备的路径前缀（`mini-login` 这类，按**整段**匹配） */
function pathHasDeviceSegment(path: string, prefix: string): boolean {
  return path
    .split('/')
    .filter(Boolean)
    .some(seg => seg === prefix || seg.startsWith(`${prefix}-`));
}

/**
 * 设备清单（**加一种设备就在这里加一条**）
 *
 * ⚠️ 顺序即优先级；最后一条 `standard` 是兜底（无条件命中），别在它后面加东西。
 *
 * ⚠️ **mini 排在 mobile 之前**（2026-09-27 定）：mini 是"iframe 嵌入弹窗"的**显式
 *    来源**（`?from=mini` / 路径前缀），它的意图比"视口窄"更明确 —— iframe 列宽窄
 *    不代表是手机。三个分发器（login/register/forgot-password）早先的顺序也是
 *    「显式 isMobile → mini 来源 → 视口」—— 本清单复刻这一顺序，只是把"视口"与
 *    "显式 isMobile"合并进 mobile 的 match，而 mini 的 match 里**排除显式 isMobile**
 *    （`?isMobile=true` 是比 `?from=mini` 更明确的意图，必须压过它）。
 */
export const THEME_DEVICE_DEFS = [
  {
    id: 'mini',
    label: '紧凑版',
    containers: pageContainers(webContainers, /^Mini/),
    routePath: (page: string) => `mini-${page}`,
    /**
     * mini 来源：三个历史键都认（`from=mini` / `fromLogin=mini` / 路径前缀 `mini-`）
     *
     * `fromLogin` 是"从 mini 登录页点『忘记密码』"留下的键（见 MiniLogin.vue），
     * 与 `from` 是同义词的两个历史写法，都要继续认 —— 在途链接不能失效。
     *
     * 🔴 排除 `explicitMobile`：`?isMobile=true&from=mini` 时按显式 isMobile 走手机端
     *    （显式意图 > 来源标记），否则"联调时想强制手机端"会被一个残留的 from=mini 顶掉。
     */
    match: (ctx: DeviceMatchContext) =>
      !ctx.explicitMobile &&
      (ctx.from === 'mini' ||
        ctx.fromLogin === 'mini' ||
        pathHasDeviceSegment(ctx.path, 'mini'))
  },
  {
    id: 'mobile',
    label: '手机端',
    containers: mobileContainers,
    routePath: (page: string) => `m/${page}`,
    // 显式 `?isMobile=true` 或视口/UA 判定为移动端（mini 来源已在上一档被拦截）
    match: (ctx: DeviceMatchContext) => ctx.explicitMobile || ctx.viewportIsMobile
  },
  {
    id: 'standard',
    label: '桌面端',
    containers: pageContainers(webContainers, /^Standard/),
    routePath: (page: string) => page,
    // 兜底：前面都没命中就是桌面主窗口（**必须无条件 true**，且必须是最后一条）
    match: () => true
  }
] as const satisfies readonly ThemeDeviceDef[];

/** 设备 id 清单（顺序即优先级）—— 词汇表的**唯一来源**，别在别处再写一份数组 */
export const THEME_DEVICES = THEME_DEVICE_DEFS.map(def => def.id);

/** 设备 id 联合类型（由清单派生：加一条声明就多一个合法取值） */
export type ThemeDevice = (typeof THEME_DEVICE_DEFS)[number]['id'];

/** 兜底设备：判定不出来时按手机端处理（与 `utils/device.ts` 的口径一致） */
export const DEFAULT_THEME_DEVICE: ThemeDevice = 'mobile';

/** 设备 id → 中文名（调试面板用；加设备不必再改面板） */
export function deviceLabel(id: string): string {
  return THEME_DEVICE_DEFS.find(def => def.id === id)?.label ?? id;
}

/**
 * 归一化外部传入的设备名
 *
 * 不认识的取值返回 null（**不是**落默认设备）—— 调用方各有自己的兜底口径
 * （各页 `pick*ViewId` 落默认设备，面板等场景可能直接忽略）。
 *
 * ⚠️ 白名单来自**本清单**，不是另写一份数组：设备集合改这里就够。
 */
export function asThemeDevice(raw: unknown): ThemeDevice | null {
  return typeof raw === 'string' && (THEME_DEVICES as readonly string[]).includes(raw)
    ? (raw as ThemeDevice)
    : null;
}

/**
 * 从外部输入判定"本次访问属于哪台设备"
 *
 * 清单顺序 = 优先级，**先命中先用**；最后一条是兜底，所以返回值永远非空。
 * 三个分发器都调它 —— 设备判定只有这一份实现。
 */
export function pickDeviceId(ctx: DeviceMatchContext): ThemeDevice {
  for (const def of THEME_DEVICE_DEFS) {
    if (def.match(ctx)) return def.id as ThemeDevice;
  }
  // 清单被改坏（末条不再无条件成立）时的保底：宁可落默认设备，也不让页面起不来。
  // 这条路径不该发生 —— `.tmp-probe/verify-device-registry.mjs` 会把它钉住。
  return DEFAULT_THEME_DEVICE;
}

/**
 * 取某设备的容器表；未知设备返回空表（调用方退到兜底设备）
 */
export function containersOf(id: string): ReadonlyMap<string, DeviceContainerLoader> {
  return THEME_DEVICE_DEFS.find(def => def.id === id)?.containers ?? new Map();
}

/**
 * 取某设备在某页的容器加载器；该设备没写这一页时返回 undefined
 */
export function containerOf(id: string, page: string): DeviceContainerLoader | undefined {
  return containersOf(id).get(page);
}

/**
 * 从当前访问信息构造判定上下文
 *
 * ⚠️ `viewportIsMobile` 由**调用方传入**，而不是在这里非响应式地算一次：分发器的
 *    设备判定必须是**响应式**的（视口拉宽要能自动切回桌面），而 `utils/device.ts`
 *    的 `isMobileViewport()` 是一次性快照，塞进来会丢掉 matchMedia 的响应能力。
 *    分发器手里正好有响应式值（`useDeviceDetect().isMobileDevice.value`），传进来即可；
 *    守卫等非响应式场景可直接传 `isMobileViewport()`。
 *
 * @param query           路由 query（`route.query`）
 * @param path            路由 path（`route.path`）
 * @param viewportIsMobile 视口/UA 判定结果（**响应式**：分发器传 computed 的值）
 */
export function deviceContext(
  query: Record<string, unknown> | undefined,
  path: string,
  viewportIsMobile: boolean
): DeviceMatchContext {
  const text = (key: string): string => (typeof query?.[key] === 'string' ? (query[key] as string) : '');
  return {
    explicitMobile: text('isMobile') === 'true',
    path: path.split(/[?#]/)[0],
    from: text('from'),
    fromLogin: text('fromLogin'),
    viewportIsMobile
  };
}
