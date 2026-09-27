import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router';
import { listPageViews } from '@/theme/views/pages';
import { useThemeStore } from '@/stores/theme';
import { readDeviceParam } from '@/theme/views/params';
import type { ThemeDevice } from '@/theme';

/**
 * 组装一个 `beforeEnter`：顺手预取该页**移动端版式**的 chunk
 *
 * `/m/*` 现在挂的是**电脑端分发器**（view/web/<page>/index.vue）—— 窄视口下它
 * 渲染手机端容器（view/app/<page>/index.vue），宽视口下渲染桌面卡片。窄视口那条
 * 路径才需要版式 chunk，宽视口用不到，但提前发一次请求是无害的优化：容器挂载时
 * chunk 通常已在模块缓存里，用户看不到切换。预取失败也无所谓，容器自己还会再拉。
 *
 * ⚠️ 预取必须知道**当前主题包**：版式只在包内查找（见 `theme/views/registry.ts`），
 *    包不同则同一个 `?view=` 指向的 chunk 也不同。这里读一次 theme store —— 用
 *    `try/catch` 包住：预取是"提前把请求发出去"的优化，拿不到上下文宁可不发，
 *    绝不能因为预取而挡住导航。
 *
 * === 为什么不再做"宽视口跳电脑版"重定向（2026-09-25 移除）===
 * 早先 `/m/*` 挂的是移动端容器，宽视口下它会被拉满整屏（输入框/按钮被拉伸），
 * 于是加了一道重定向把 `/m/login` 改写成 `/login`。这带来两个问题：
 *   ① URL 不稳定 —— 用户停在 `/m/login` 拉宽窗口就被改写 URL，刷新 `/login`
 *      窄屏又被改写回 `/m/login`，来回跳；
 *   ② "切不回电脑路由" —— 一旦落到 `/m/login`，宽屏重定向把它推到 `/login`，
 *      但用户其实想停在 `/m/login`。
 * 现在 `/m/*` 与 `/login` 共用同一套分发器：**视图自适应视口，URL 永远不变**。
 * 窄屏渲染手机端容器、宽屏渲染桌面卡片，两种 URL 都成立、都对。
 */
/**
 * 版式预取的设备身份
 *
 * 这些 `beforeEnter` 只挂在 `/m/*` 上（`mobileRoutes`，都带 `meta.device='mobile'`），
 * 所以设备固定是 mobile —— 预取该读的键是 `?view.mobile=`，不是通用的 `?view=`
 * （设备维度参数：`?view.mobile=default&view.standard=compact` 时，这里预取的必须是
 * 手机端那一套，否则会白拉一个用不上的 chunk）。
 */
const PRELOAD_DEVICE = 'mobile' as const;

function withViewPreload(
  preload: (source: { url?: unknown; theme?: unknown; pkg?: unknown; device?: unknown }) => void,
  page: string
) {
  return (to: RouteLocationNormalized) => {
    preload({
      url: readDeviceParam(to.query, 'view', PRELOAD_DEVICE),
      // 🔴 声明档（`views.<page>`）**必须和容器用同一个来源**：容器的 `viewId` 是
      //    `pick({ url, theme: themeStore.viewFor(page), … })`，守卫漏传 `theme` 就会
      //    算出一个**不同**的 id —— 白拉一个用不上的 chunk，真正要用的那个仍得现场等
      //    （症状与不预取一样，却多花一次请求）。目前三个包都没声明 `views`，所以这是
      //    潜伏缺口；一旦有包声明就会显形。
      //    设备固定在 mobile：这些守卫只挂在 `/m/*` 上，取的是该设备的声明。
      theme: readDeclaredView(page, PRELOAD_DEVICE),
      pkg: readPackageId(),
      device: PRELOAD_DEVICE
    });
    return undefined;
  };
}

/** 读当前主题包；拿不到（Pinia 尚未安装 / store 初始化异常）返回 undefined，由预取函数落内置包 */
function readPackageId(): string | undefined {
  try {
    return useThemeStore().packageId;
  } catch {
    return undefined;
  }
}

/**
 * 读该页当前的**声明式版式**（`views.<page>`）
 *
 * 与容器同源（`themeStore.viewFor`），失败同样吞掉 —— 预取是"提前把请求发出去"的优化，
 * 拿不到上下文宁可不发，绝不能因为预取而挡住导航。
 */
function readDeclaredView(page: string, device: ThemeDevice): string | undefined {
  try {
    return useThemeStore().viewFor(page, device);
  } catch {
    return undefined;
  }
}

/**
 * 分发器（`view/web/<page>/index.vue`）—— 页面名 → 惰性加载器
 *
 * glob 路径是**字面量**（Vite 编译期静态分析，不能用变量拼），但键是页面目录名，
 * 与页面注册表（`theme/views/pages.ts` 的 `listPageViews()`）的页面名字面一致。
 * 于是「加一个页面」只需写契约文件 + 分发器目录 + 主题目录，路由由下面两段自动生成。
 */
const dispatchers = import.meta.glob('/src/view/web/*/index.vue');

/** 路由名规范：`login` 保持小写（`router/index.ts` 的 `redirect: { name: 'login' }` 依赖它），其余与页面名一致 */
function routeNameOf(page: string): string {
  return page;
}

/**
 * 页面路由（`/<page>`）—— 由页面注册表**自动生成**，不再手写每页一条
 *
 * 每个页面（login / register / forgot-password / 将来的新页）都在 `listPageViews()`
 * 里，标题取自页面声明（`title`），组件取自分发器 glob。加页面 = 写文件，不改这里。
 */
const pageRoutes: RouteRecordRaw[] = listPageViews().map(pv => ({
  path: pv.page,
  name: routeNameOf(pv.page),
  component: dispatchers[`/src/view/web/${pv.page}/index.vue`],
  meta: { title: pv.title }
}));

/**
 * 移动端页面路由（`/m/<page>`）—— 同样由页面注册表自动生成
 *
 * `/m/*` 与 `/<page>` 共用同一套分发器（`view/web/<page>/index.vue`）：窄视口渲染
 * 手机端容器、宽视口渲染桌面卡片，**URL 不被视口改写**（2026-09-25）。
 * `meta.device='mobile'` 只是给主题 store 的基线，分发器会按实际渲染形态纠正。
 * `beforeEnter` 用页面对象自带的 `preload`（`pv.preload`）—— 预取函数不再手写。
 */
const mobilePageRoutes: RouteRecordRaw[] = listPageViews().map(pv => ({
  path: `m/${pv.page}`,
  name: `Mobile-${pv.page}`,
  component: dispatchers[`/src/view/web/${pv.page}/index.vue`],
  meta: { title: pv.titleOf('mobile'), device: 'mobile' },
  beforeEnter: withViewPreload(pv.preload, pv.page)
}));

export const authRoutes: RouteRecordRaw[] = [
  ...pageRoutes,
  {
    /*
     * 邮件里的重置链接指向 `/reset-password?token=…`（后端 src/api/user/v1/open.js
     * 的 send-reset-link 就是这么拼的），而前端页面是 `/forgot-password`。
     * 两边不一致 → 用户点邮件链接会落到 NotFound，且这个断点在桌面版同样存在。
     * 这里做一次兼容重定向：不改后端（在途邮件里的旧链接继续有效），
     * query 原样透传（token 丢了整条流程就废了）。
     */
    path: 'reset-password',
    redirect: to => ({ path: '/forgot-password', query: to.query, hash: to.hash })
  },
  {
    // mini-login 是 login 的「紧凑版」独立路由（mini 设备）。只有 login 有这条
    // 独立入口（MiniLogin 内跳转用的是 `/mini-login` 路径，见 MiniLogin.vue），
    // register / forgot-password 的 mini 形态由分发器按 `?from=mini` 判定，不单开路由。
    path: 'mini-login',
    name: 'MiniLogin',
    component: dispatchers['/src/view/web/login/index.vue'],
    meta: { title: '快捷登录' }
  }
];

export const mobileRoutes: RouteRecordRaw[] = mobilePageRoutes;

export const authFlowRoutes: RouteRecordRaw[] = [
  {
    path: 'authorize',
    name: 'Authorize',
    component: () => import('@/view/web/auth/Authorize.vue'),
    meta: {
      title: '应用授权',
      guestOnly: false, // 需要登录才能访问
      requiresAuth: true
    }
  },
  {
    // 独立授权确认页（全屏可达）：authorize 流带 session_id、login 流带 consent_key
    path: 'consent',
    name: 'Consent',
    component: () => import('@/view/web/auth/Consent.vue'),
    meta: {
      title: '授权确认',
      guestOnly: false,
      requiresAuth: true
    }
  }
];

export const errorRoutes: RouteRecordRaw[] = [
  {
    path: ':pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/view/web/NotFound.vue'),
    meta: { title: '页面未找到' },
    beforeEnter: (to) => {
      // 上报 404，可用于发现死链/扫描探测行为
      console.warn('[404]', to.fullPath, document.referrer);
    }
  }
];
