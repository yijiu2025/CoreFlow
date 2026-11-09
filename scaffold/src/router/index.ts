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

/** 公开路由（不需要登录） */
const PUBLIC_PATHS = ['/login'];

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/Login.vue'),
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
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '工作台', permission: 'admin:dashboard:read' }
      },
      {
        path: 'system/user',
        name: 'system-user',
        component: () => import('@/views/Users.vue'),
        meta: { title: '用户管理', permission: 'admin:user:read' }
      },
      {
        path: 'system/role',
        name: 'system-role',
        component: () => import('@/views/Roles.vue'),
        meta: { title: '角色管理', permission: 'admin:role:read' }
      },
      {
        path: 'system/menu',
        name: 'system-menu',
        component: () => import('@/views/Menus.vue'),
        meta: { title: '菜单管理', permission: 'admin:menu:read' }
      },
      {
        path: 'system/dept',
        name: 'system-dept',
        component: () => import('@/views/Depts.vue'),
        meta: { title: '部门管理', permission: 'admin:dept:read' }
      },
      {
        path: 'system/post',
        name: 'system-post',
        component: () => import('@/views/Posts.vue'),
        meta: { title: '岗位管理', permission: 'admin:post:read' }
      },
      {
        path: 'system/dict',
        name: 'system-dict',
        component: () => import('@/views/Dict.vue'),
        meta: { title: '字典管理', permission: 'admin:dict:read' }
      },
      {
        path: 'system/config',
        name: 'system-config',
        component: () => import('@/views/Configs.vue'),
        meta: { title: '参数管理', permission: 'admin:config:read' }
      },
      {
        path: 'monitor/oper-log',
        name: 'monitor-oper-log',
        component: () => import('@/views/OperLog.vue'),
        meta: { title: '操作日志', permission: 'admin:log:read' }
      },
      {
        path: 'monitor/login-log',
        name: 'monitor-login-log',
        component: () => import('@/views/LoginLog.vue'),
        meta: { title: '登录日志', permission: 'admin:log:read' }
      },
      {
        path: 'monitor/firewall',
        name: 'monitor-firewall',
        component: () => import('@/views/Firewall.vue'),
        meta: { title: '防火墙监控', permission: 'admin:firewall:read' }
      },
      {
        path: 'tool/generator',
        name: 'tool-generator',
        component: () => import('@/views/Generator.vue'),
        meta: { title: '代码生成', permission: 'admin:gen:read' }
      },
      {
        path: 'no-access',
        name: 'no-access',
        component: () => import('@/views/NoAccess.vue'),
        meta: { title: '无访问权限' }
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFound.vue'),
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
    return { path: '/login', query: { redirect: to.fullPath } };
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
