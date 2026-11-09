/**
 * 认证/会话 store
 *
 * 只保存「当前用户 + 可见菜单」两件事：
 *   • `me`   —— 权限码用于按钮可见性与路由守卫（**不是安全边界**，后端才是）；
 *   • `menus` —— 侧栏渲染来源，来自 `/session/routes`（菜单 ≠ 接口权限）。
 *
 * 🔴 `load()` 幂等：路由守卫在每次跳转前调用，重复请求会被 `loaded` 短路。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { fetchMe, fetchRoutes, logout as apiLogout } from '@/api/session';
import type { CurrentUser, MenuNode } from '@/api/types';

/**
 * 权限码匹配（支持 `*` 与 `admin:*` 通配）
 *
 * @param patterns 当前用户权限码
 * @param code 待判定权限码
 * @returns 是否命中
 */
function matchPermission(patterns: string[], code: string): boolean {
  return patterns.some(pattern => {
    if (pattern === '*' || pattern === code) return true;
    if (pattern.endsWith('*')) return code.startsWith(pattern.slice(0, -1));
    return false;
  });
}

export const useAuthStore = defineStore('auth', () => {
  const me = ref<CurrentUser | null>(null);
  const menus = ref<MenuNode[]>([]);
  const loaded = ref(false);
  const loading = ref(false);

  /** 是否已登录（有用户信息即视为已登录） */
  const isAuthenticated = computed(() => !!me.value);

  /**
   * 加载当前用户与可见菜单
   *
   * @param force 是否强制重新加载（切换账号后使用）
   * @returns 是否加载成功
   */
  async function load(force = false): Promise<boolean> {
    if (loaded.value && !force) return true;
    if (loading.value) return loaded.value;

    loading.value = true;
    try {
      const [user, routes] = await Promise.all([fetchMe(), fetchRoutes()]);
      me.value = user;
      menus.value = routes;
      loaded.value = true;
      return true;
    } catch {
      reset();
      return false;
    } finally {
      loading.value = false;
    }
  }

  /**
   * 判断是否拥有某权限码
   *
   * @param code 权限码，如 `admin:user:create`
   * @returns 是否拥有
   */
  function hasPermission(code: string): boolean {
    return matchPermission(me.value?.permissions || [], code);
  }

  /** 清空会话状态（退出登录 / 401 时调用） */
  function reset(): void {
    me.value = null;
    menus.value = [];
    loaded.value = false;
  }

  /** 退出登录：先清 Cookie，再清本地状态 */
  async function logout(): Promise<void> {
    try {
      await apiLogout();
    } finally {
      reset();
    }
  }

  return { me, menus, loaded, loading, isAuthenticated, load, hasPermission, reset, logout };
});
