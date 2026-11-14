/**
 * 路由表与守卫
 *
 * 路由是**静态声明**的（路径固定、页面固定），侧栏由 `/session/routes` 下发的
 * 菜单树渲染 —— 菜单只决定「看得见什么」，`meta.permission` 决定「进不进得去」，
 * 接口放行仍由后端 PBAC 判定。
 *
 * 🔴 不做「按后端菜单动态 addRoute」：菜单与页面文件是两套事实，动态注册一旦
 *    出现菜单指向不存在的页面，报错时机在运行期且难归因（白屏 / 404 二选一）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { setUnauthorizedHandler } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import { intendedPackageId } from '@/theme/packages';

/** 公开路由（不需要登录） */
const PUBLIC_PATHS = ['/login', '/access-denied'];

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/auth/Login.vue'),
    meta: { plain: true, title: '登录' }
  },
  {
    path: '/',
    component: () => import('@/components/layout/AppShell.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/dashboard/Dashboard.vue'),
        meta: { title: '工作台', permission: 'admin:dashboard:read' }
      },
      {
        /*
         * 通讯录 / 发现 / 我 —— 手机端「微信」外壳的三个栏目根页
         *
         * 它们**住在微信主题包里**（`theme/themes/wechat/mobile/console/pages/`），
         * 不在 `views/`：这一屏是版式骨架的一部分，用的是微信的 cell 语言，
         * 与"业务页面不知道自己长什么样"是相反的两类东西。路由仍然在这里静态声明 ——
         * 页面文件的位置可以跟着主题走，路由表不行（见文件头"不做动态 addRoute"）。
         *
         * `meta.themePkg` 标出归属包：当前生效的包不是它时，这三条路径在本主题下
         * 不存在（守卫送回工作台）。判据写在 meta 上而不是页面里，页面才能一行
         * 主题判断都没有。
         *
         * 它们**不在菜单表里**，所以桌面侧栏不会出现（菜单只决定"看得见什么"，
         * 而这三页是版式骨架的一部分，由微信壳的 TabBar 带过来）。深链进来照样能开：
         * 页面内部自己按权限码过滤入口，进不去的条目不渲染。
         *
         * 不给 `meta.permission`：能否进入由页面里的入口决定，而不是"整页踢到 /no-access"。
         */
        path: 'org',
        name: 'org',
        component: () => import('@/theme/themes/wechat/mobile/console/pages/org/index.vue'),
        meta: { title: '通讯录', themePkg: 'wechat' }
      },
      {
        path: 'discover',
        name: 'discover',
        component: () => import('@/theme/themes/wechat/mobile/console/pages/discover/index.vue'),
        meta: { title: '发现', themePkg: 'wechat' }
      },
      {
        path: 'me',
        name: 'me',
        component: () => import('@/theme/themes/wechat/mobile/console/pages/me/index.vue'),
        meta: { title: '我', themePkg: 'wechat' }
      },
      {
        path: 'system/user',
        name: 'system-user',
        component: () => import('@/views/system/Users.vue'),
        meta: { title: '用户管理', permission: 'admin:user:read' }
      },
      {
        /*
         * 用户详情（手机端的"进新页面看完整信息"）
         *
         * 桌面上详情是抽屉（`UserProfileDrawer`），手机上抽屉只会盖住半屏、
         * 而且退不回"刚才那一屏" —— 换成真路由：能深链、能按返回键、能进历史栈。
         * `meta.stack: true` 让外壳把左上角的汉堡换成返回箭头（见 AppShell）。
         *
         * 与列表用同一个权限码：能看列表就能看这条详情，接口仍由后端 PBAC 判定。
         */
        path: 'system/user/:id(\\d+)',
        name: 'system-user-detail',
        component: () => import('@/views/system/UserDetail.vue'),
        meta: { title: '用户详情', permission: 'admin:user:read', stack: true }
      },
      {
        path: 'system/role',
        name: 'system-role',
        component: () => import('@/views/system/Roles.vue'),
        meta: { title: '角色管理', permission: 'admin:role:read' }
      },
      {
        path: 'system/menu',
        name: 'system-menu',
        component: () => import('@/views/system/Menus.vue'),
        meta: { title: '菜单管理', permission: 'admin:menu:read' }
      },
      {
        path: 'system/dept',
        name: 'system-dept',
        component: () => import('@/views/system/Depts.vue'),
        meta: { title: '部门管理', permission: 'admin:dept:read' }
      },
      {
        path: 'system/post',
        name: 'system-post',
        component: () => import('@/views/system/Posts.vue'),
        meta: { title: '岗位管理', permission: 'admin:post:read' }
      },
      {
        path: 'monitor/oper-log',
        name: 'monitor-oper-log',
        component: () => import('@/views/monitor/OperLog.vue'),
        meta: { title: '操作日志', permission: 'admin:log:read' }
      },
      {
        path: 'monitor/login-log',
        name: 'monitor-login-log',
        component: () => import('@/views/monitor/LoginLog.vue'),
        meta: { title: '登录日志', permission: 'admin:log:read' }
      },
      {
        path: 'monitor/firewall',
        name: 'monitor-firewall',
        component: () => import('@/views/monitor/Firewall.vue'),
        meta: { title: '防火墙监控', permission: 'admin:firewall:read' }
      },
      {
        // 个人设置：只改自己的界面偏好，不挂权限码 —— 任何登录用户都该能改自己的主题色
        path: 'settings/profile',
        name: 'settings-profile',
        component: () => import('@/views/settings/Profile.vue'),
        meta: { title: '个人设置' }
      },
      {
        path: 'no-access',
        name: 'no-access',
        component: () => import('@/views/error/NoAccess.vue'),
        meta: { title: '无访问权限' }
      }
    ]
  },
  {
    // 「已认证但无后台权限」独立成页（不在 AppShell 内）：此时 `/session/me` 已被
    // 403 拒绝，没有用户信息与菜单，壳子渲染出来只是一副空架子
    path: '/access-denied',
    name: 'access-denied',
    component: () => import('@/views/error/AccessDenied.vue'),
    meta: { plain: true, title: '无访问权限' }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/error/NotFound.vue'),
    meta: { plain: true, title: '页面不存在' }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
});

// 401 统一收口：清状态并跳登录（带 redirect，登录后回跳）
setUnauthorizedHandler(() => {
  const auth = useAuthStore();
  auth.reset();
  const current = router.currentRoute.value;
  if (!PUBLIC_PATHS.includes(current.path)) {
    router.replace({ path: '/login', query: { redirect: current.fullPath } });
  }
});

router.beforeEach(async to => {
  if (PUBLIC_PATHS.includes(to.path)) return true;

  const auth = useAuthStore();
  const ok = await auth.load();
  if (!ok) {
    // 🔴 被人机验证拦下 ≠ 未登录：会话仍然有效，只是这次请求被边界防护挡住。
    //    此时整页跳转已由 http 拦截器发出（→ challenge.html），守卫必须**中止导航**
    //    而不是跳登录页 —— 否则用户会在验证前就被"登出"，验证完还得重新登录。
    if (auth.challengeBlocked) return false;
    // 已停止跳转（验证反复不生效）：放行让页面渲染，由页面把提示显示出来，
    // 否则初始加载会被中止成一张白屏，用户连"该刷新"都看不到
    if (auth.challengeCapped) return true;
    // 身份有效但没后台权限：送独立说明页，**不要**回登录页 —— 再登一次结果相同，
    // 用户只会以为是自己密码错了（见 views/error/AccessDenied.vue 文件头）
    if (auth.denied) return { path: '/access-denied' };
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  /*
   * 主题私有页面（`meta.themePkg`）：当前生效的版式不是它的归属包时，这条路径在本
   * 主题下**不存在** —— 送回工作台。
   *
   * 为什么要有这一条：通讯录 / 发现 / 我住在微信主题包里，用的是微信的导航结构与
   * cell 语言。如果在珍珠玻璃下还能打开，用户会看到"一个不属于这个主题的页面"，
   * 而且它没有任何入口能到达（菜单表里没有），只能靠手输地址或旧收藏撞进来。
   *
   * 🔴 判据必须走 `intendedPackageId()`，不能用 `themeStore.packageId`：后者由
   *    `activeView` 解析而来，而 `activeView` 是 `<ThemeView>` **渲染时**才写进去的。
   *    守卫跑在渲染之前，读到的是上一个页面的值 —— `?th=wechat` 深链会被误判成
   *    default，把用户弹回工作台（踩过一次）。
   *
   * 🔴 跳转要带上 `query`：不带的话 `?th=wechat&device=mobile` 会一起丢掉 ——
   *    用户看到的是"跳回工作台并且主题变了"。
   */
  const themePkg = to.meta?.themePkg as string | undefined;
  if (themePkg && intendedPackageId() !== themePkg) {
    return { path: '/dashboard', query: to.query };
  }

  const permission = to.meta?.permission as string | undefined;
  if (permission && !auth.hasPermission(permission)) {
    return { path: '/no-access' };
  }
  return true;
});

router.afterEach(to => {
  const title = (to.meta?.title as string) || '';
  document.title = title ? `${title} · 管理后台` : '管理后台';
});

export default router;
