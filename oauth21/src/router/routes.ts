import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router';
import { isDesktopViewport } from '@/utils/device';
import { preloadRegisterView } from '@/theme/views/register';
import { preloadLoginView } from '@/theme/views/login';
import { preloadForgotPasswordView } from '@/theme/views/forgot-password';
import { useThemeStore } from '@/stores/theme';

/**
 * 移动端路由 → 宽视口下应迁移到的电脑版路由名
 * 新增移动端路由时在此登记一行即可。
 */
export const MOBILE_TO_DESKTOP_ROUTE: Record<string, string> = {
  MobileLogin: 'login',
  MobileRegister: 'Register',
  MobileForgotPassword: 'ForgotPassword'
};

/**
 * 判定"当前这条路由 + 当前视口"是否应当迁到电脑版，命中则返回目标路由名
 *
 * 单一判定来源，被两处共用，避免"守卫一跳、视口监听另一跳"产生两套标准：
 *   1. 进入 `/m/*` 时的 beforeEnter（desktopWhenWide）
 *   2. 已停留在 `/m/*` 上、视口随后变宽（router/index.ts 的视口监听）
 *
 * 两个条件缺一不可：
 *   • 路由名登记在 MOBILE_TO_DESKTOP_ROUTE 里 —— 否则不是移动端页面，忽略
 *   • 视口已宽到 DESKTOP_MIN_WIDTH
 *
 * 并且**显式 `?isMobile=true` 时一律不迁**：这是调用方（App 内 WebView、分享链接）
 * 明确要求移动端版式的信号，优先级高于宽度自动判定 —— 与 useDeviceDetect
 * 文档中"显式 isMobile ＞ 自动识别 ＞ 桌面默认"的约定保持一致。
 */
export function resolveDesktopRedirectTarget(
  to: Pick<RouteLocationNormalized, 'name' | 'query'>
): string | undefined {
  if (String(to.query.isMobile) === 'true') return undefined;
  const target = MOBILE_TO_DESKTOP_ROUTE[String(to.name)];
  if (!target) return undefined;
  return isDesktopViewport() ? target : undefined;
}

/**
 * `/m/*` 宽屏跳电脑版（进入路由时的那一跳）
 *
 * "移动端入口"不等于"必须用移动端版式"：平板横屏、折叠屏展开、桌面浏览器
 * 直接打开这些地址时视口已有 1024px+，再把移动端页面铺满整屏只会得到被拉宽的
 * 输入框和按钮（2026-09-21 线上问题）。
 *
 * → 宽视口下改跳电脑版同名路由。**query 必须原样透传**：
 *   client_id / appName / redirect_uri / scope / state / lang / theme 一个都不能丢，
 *   否则登录页拿不到应用上下文（授权流会显示"应用标识缺失"而直接断掉）。
 *
 * ⚠️ 守卫只在**导航发生时**执行一次。用户已经打开 `/m/login` 再手动拉宽窗口时
 *    没有任何导航，本函数不会被调用 —— 那一跳由 router/index.ts 的视口监听补齐。
 *
 * 注意：这里刻意不做窄屏反向跳转 —— 窄屏下 `/login` 由分发器直接渲染移动端组件
 * （见 view/web/login/index.vue），不产生路由跳转，因此不存在 "login ⇄ m/login" 循环。
 */
function desktopWhenWide(to: RouteLocationNormalized) {
  const target = resolveDesktopRedirectTarget(to);
  return target ? { name: target, query: to.query, hash: to.hash } : undefined;
}

/**
 * 组装一个 `beforeEnter`：先做宽视口跳电脑版，不跳时顺手预取该页**版式**的 chunk
 *
 * 三个移动端页面（登录 / 注册 / 重置密码）的 UI 都是动态加载的（见各页容器）：
 * 容器首帧先渲染静态引入的内置包基础版式，chunk 到了再接管。在本页导航阶段就把请求
 * 发出去（与路由组件自身的 chunk 并行），容器挂载时通常已在模块缓存里 ——
 * 用户看不到切换。预取失败无所谓：容器自己还会再拉一次，拉不到就回退基础版式。
 *
 * ⚠️ 预取必须知道**当前主题包**：版式只在包内查找（见 `theme/views/registry.ts`），
 *    包不同则同一个 `?view=` 指向的 chunk 也不同。这里读一次 theme store —— 用
 *    `try/catch` 包住：预取是"提前把请求发出去"的优化，拿不到上下文宁可不发，
 *    绝不能因为预取而挡住导航。
 *
 * 抽成工厂函数而不是把这段写在三个路由里：三处各抄一遍，迟早有一处忘了同时做
 * 「宽视口跳转」或忘了预取，而这两种疏漏都只在真机/特定视口下才现形。
 */
function withViewPreload(
  preload: (source: { url?: unknown; theme?: unknown; pkg?: unknown; device?: unknown }) => void
) {
  return (to: RouteLocationNormalized) => {
    const target = desktopWhenWide(to);
    if (target) return target;
    preload({ url: to.query.view, pkg: readPackageId(), device: 'mobile' });
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
    path: 'm/login',
    name: 'MobileLogin',
    component: () => import('@/view/app/login/index.vue'),
    meta: { title: '移动端登录', device: 'mobile' },
    beforeEnter: withViewPreload(preloadLoginView)
  },
  {
    path: 'm/register',
    name: 'MobileRegister',
    component: () => import('@/view/app/register/index.vue'),
    meta: { title: '移动端注册', device: 'mobile' },
    // 宽视口跳电脑版；不跳时顺手把「变体版式」的 chunk 预取下来（**不 await**）
    beforeEnter: withViewPreload(preloadRegisterView)
  },
  {
    path: 'm/forgot-password',
    name: 'MobileForgotPassword',
    component: () => import('@/view/app/forgot-password/index.vue'),
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
