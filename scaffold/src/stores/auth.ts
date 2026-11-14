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
import { useAccentStore } from '@/stores/accent';
import { matchPermission } from '@/utils/permission';

/**
 * 权限码匹配（支持 `*` 与 `admin:*` 通配）
 *
 * 实现收拢在 `utils/permission.ts`：角色授权弹窗与权限矩阵判"这个角色有没有这个码"，
 * 这里判"当前用户有没有"—— 语义必须是同一份，否则前端两处会给出不同答案。
 */

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
  /**
   * 是否「已认证但没有本应用权限」
   *
   * 与「未登录」的区别：SSO 身份是有效的，只是这个账号没被授予后台角色
   * （后端在 `/session/me` 前置了准入判定）。此时**不能**把用户当未登录踢回
   * 登录页 —— 他再登一次还是同样结果，会形成"登录 → 空白 → 再登录"的死循环。
   * 守卫据此改送 `/no-access`，由那一页说明原因并提供退出。
   */
  const denied = ref(false);
  /** 无权限时的服务端文案（展示给用户，含"请联系管理员"） */
  const deniedMessage = ref('');
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
    denied.value = false;
    try {
      const [user, routes] = await Promise.all([fetchMe(), fetchRoutes()]);
      me.value = user;
      menus.value = routes;
      // 登录/刷新后把服务端偏好同步到界面（主题色跟账号走，不跟浏览器走）
      useAccentStore().hydrate(user.preferences?.accent);
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
      // 403 = 身份有效但无后台权限（登录闸门 / me 的兜底判定）。保留服务端文案，
      // 让 `/no-access` 能说清"不是密码错、也不是掉线"，并给出下一步。
      if (err instanceof ApiError && err.status === 403) {
        denied.value = true;
        deniedMessage.value = err.message;
        loaded.value = false;
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
   * 🔴 **只认一份清单**：`/session/me` 下发的 `permissions` 已经是"最终生效"的码 ——
   *    后端在下发前就把"角色有码、但菜单授权没勾（或按钮停用/下架）"的按钮码摘掉了。
   *    所以这里只做一次匹配，不再区分"按钮码 / 页面码"，也不持有第二套判据。
   *
   *    这正是两边不会分叉的原因：前端猜错的空间没有了。守卫用的是同一份口径
   *    （`button-grant.service.js`），所以"按钮看不见"与"接口 403"永远同时成立。
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
    denied.value = false;
    deniedMessage.value = '';
  }

  /** 退出登录：先清 Cookie，再清本地状态 */
  async function logout(): Promise<void> {
    try {
      await apiLogout();
    } finally {
      reset();
    }
  }

  return {
    me,
    menus,
    loaded,
    loading,
    challengeBlocked,
    challengeCapped,
    denied,
    deniedMessage,
    isAuthenticated,
    load,
    hasPermission,
    reset,
    logout
  };
});
