import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router';
import { preloadRegisterView } from '@/theme/views/register';
import { preloadLoginView } from '@/theme/views/login';
import { preloadForgotPasswordView } from '@/theme/views/forgot-password';
import { useThemeStore } from '@/stores/theme';
import { readDeviceParam } from '@/theme/views/params';

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
  preload: (source: { url?: unknown; theme?: unknown; pkg?: unknown; device?: unknown }) => void
) {
  return (to: RouteLocationNormalized) => {
    preload({
      url: readDeviceParam(to.query, 'view', PRELOAD_DEVICE),
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

export const authRoutes: RouteRecordRaw[] = [
  {
    path: 'login',
    name: 'login',
    component: () => import('@/view/web/login/index.vue'),
    meta: { title: '安全登录' }
  },
  {
    path: 'register',
    name: 'Register',
    component: () => import('@/view/web/register/index.vue'),
    meta: { title: '账户注册' }
  },
  {
    path: 'forgot-password',
    name: 'ForgotPassword',
    component: () => import('@/view/web/forgot-password/index.vue'),
    meta: { title: '忘记密码' }
  },
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
    path: 'mini-login',
    name: 'MiniLogin',
    component: () => import('@/view/web/login/index.vue'),
    meta: { title: '快捷登录' }
  }
];

export const mobileRoutes: RouteRecordRaw[] = [
  {
    // `/m/*` 与 `/<page>` 共用同一套分发器（view/web/<page>/index.vue）：
    // 窄视口渲染手机端容器、宽视口渲染桌面卡片，**URL 不被视口改写**（2026-09-25）。
    // `meta.device='mobile'` 只是给主题 store 的基线，分发器会按实际渲染形态纠正。
    path: 'm/login',
    name: 'MobileLogin',
    component: () => import('@/view/web/login/index.vue'),
    meta: { title: '移动端登录', device: 'mobile' },
    beforeEnter: withViewPreload(preloadLoginView)
  },
  {
    path: 'm/register',
    name: 'MobileRegister',
    component: () => import('@/view/web/register/index.vue'),
    meta: { title: '移动端注册', device: 'mobile' },
    beforeEnter: withViewPreload(preloadRegisterView)
  },
  {
    path: 'm/forgot-password',
    name: 'MobileForgotPassword',
    component: () => import('@/view/web/forgot-password/index.vue'),
    meta: { title: '移动端重置密码', device: 'mobile' },
    beforeEnter: withViewPreload(preloadForgotPasswordView)
  }
];

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
