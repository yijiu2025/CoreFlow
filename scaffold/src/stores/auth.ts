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
import { ApiError } from '@/api/http';
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
  /**
   * 最近一次 `load()` 是否因「人机验证拦截」失败
   *
   * 🔴 必须与「未登录」区分：428 只是边界防护要求先验证，会话本身仍然有效。
   *    旧实现把两者都当成"加载失败 → reset()"，于是被挑战的瞬间就地登出，
   *    用户看到登录页、以为掉线了，而实际上什么都没过期。
   *    路由守卫据此决定「跳登录」还是「原地等挑战页接管」。
   */
  const challengeBlocked = ref(false);
  /**
   * 是否「验证反复不生效、已停止跳转」
   *
   * 与 `challengeBlocked` 的区别：那个是"正在跳去挑战页"（守卫应中止导航，
   * 页面马上要被整页替换）；这个是"跳太多次了，停在原地"——此时应当**放行**，
   * 让页面渲染出来并把「请刷新重试」显示给用户，而不是留一张白屏。
   */
  const challengeCapped = ref(false);
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
    challengeBlocked.value = false;
    challengeCapped.value = false;
    try {
      const [user, routes] = await Promise.all([fetchMe(), fetchRoutes()]);
      me.value = user;
      menus.value = routes;
      loaded.value = true;
      return true;
    } catch (err) {
      // 人机验证：会话没坏，只是这次请求被边界防护拦下。
      // 此时**不清空**登录态、也不置 challengeBlocked 之外的任何东西 ——
      // 整页跳转已经由 http 拦截器发出，这里只负责让守卫别把人踢去登录页。
      if (err instanceof ApiError && err.challenge) {
        challengeBlocked.value = !err.challengeCapped;
        challengeCapped.value = err.challengeCapped;
        return false;
      }
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

  return { me, menus, loaded, loading, challengeBlocked, challengeCapped, isAuthenticated, load, hasPermission, reset, logout };
});
