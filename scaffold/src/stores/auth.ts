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
import { applyServerAppearance } from '@/composables/useAppearance';
import { useOverridesStore } from '@/stores/overrides';
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
  /**
   * 是否「服务暂时不可达」（网络故障 / 5xx / 超时）
   *
   * 🔴 与「未登录」是两件事，必须分开：
   *    后端重启、网线拔了、网关 502 的时候，`sid` Cookie 多半还有效（它有自己的
   *    有效期，与本次请求成不成功无关）。旧实现把所有异常都 `reset()`，于是刷新一下
   *    就落到登录页；而服务器恢复后再访问同一路径又能直接进 —— 用户被逼着重登一次，
   *    明明是"服务抖了一下"。
   *    现在这一类错误只置标记、**不清身份**，由守卫决定是放行还是稍后重试。
   */
  const unavailable = ref(false);
  /**
   * 身份（`/session/me`）是否已拿到
   *
   * 与 `menusLoaded` 分开：两条链路走不同的接口，一条挂了不该把另一条的结果作废。
   */
  const meLoaded = ref(false);
  /** 可见菜单（`/session/routes`）是否已拿到 */
  const menusLoaded = ref(false);
  /** 两者都齐才算"整体加载完成"（缺菜单时下次导航会补，见 `load`） */
  const loaded = computed(() => meLoaded.value && menusLoaded.value);
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
    // 并发保护：身份拿到就算"可以放行"，菜单没齐不值得把导航再拦一次
    if (loading.value) return meLoaded.value;

    loading.value = true;
    challengeBlocked.value = false;
    challengeCapped.value = false;
    denied.value = false;
    unavailable.value = false;

    const needMe = force || !meLoaded.value;
    const needMenus = force || !menusLoaded.value;
    try {
      /*
       * 🔴 两条链路**独立 settle**，不用 Promise.all。
       *
       * 身份（me）与可见菜单是两个接口；用 all 的话，一个 5xx 会把另一个已经拿到的
       * 结果一起丢掉 —— 表现为"用户名、权限码都拿到了，却因为菜单请求失败被当成
       * 加载失败"。两者的重要程度也不同：没有身份就什么都做不了，没有菜单只是侧栏空。
       */
      const [meRes, menusRes] = await Promise.allSettled([
        needMe ? fetchMe() : Promise.resolve(me.value),
        needMenus ? fetchRoutes() : Promise.resolve(menus.value)
      ]);

      /* ① 身份：决定"能不能进"，失败按错误分类处理（与会话失效的判据完全独立） */
      if (meRes.status === 'rejected') {
        return handleLoadError(meRes.reason);
      }
      if (needMe) {
        const user = meRes.value;
        if (user) {
          me.value = user;
          // 登录/刷新后把服务端偏好同步到界面（外观跟账号走，不跟浏览器走）
          useAccentStore().hydrate(user.preferences?.accent);
          // 其余四维（配色 / 明暗 / 版式 / 背景）：服务端有值就覆盖本地，没有则保持本地
          applyServerAppearance(user.preferences);
          // 逐令牌覆盖单独水合：它的语义是"覆盖式"，不能跟其它键一起合并
          useOverridesStore().hydrate(user.preferences?.overrides);
          meLoaded.value = true;
        }
      }

      /*
       * ② 菜单：失败只影响侧栏，**不影响放行**。
       *
       * `menusLoaded` 保持 false ⇒ 下次导航会自动补一次（`needMenus` 为真时只打
       * 这一个接口，身份不会重复请求）。这就是"半加载"的语义：
       * 身份是硬条件，菜单是软条件。
       */
      if (menusRes.status === 'fulfilled' && needMenus) {
        menus.value = menusRes.value || [];
        menusLoaded.value = true;
      } else if (menusRes.status === 'rejected') {
        const err = menusRes.reason;
        // 网络/服务端问题标记一下：守卫据此决定"别急着跳登录"，与身份那条同一个标记
        if (err instanceof ApiError && (err.status === 0 || err.status >= 500)) {
          unavailable.value = true;
        }
        // 其余错误（401 已由 http 拦截器统一处理）不回滚身份
      }

      return true;
    } catch (err) {
      return handleLoadError(err);
    } finally {
      loading.value = false;
    }
  }

  /**
   * 加载失败的错误分类
   *
   * 人机验证 / 无权限 / 服务不可达 / 真的失效 —— 四类各有各的落点，
   * 混成一句"加载失败"就会把"服务抖了一下"演成"请重新登录"。
   *
   * @param err 异常
   * @returns 恒为 false（调用方据此不再继续）
   */
  function handleLoadError(err: unknown): boolean {
    // 人机验证：会话没坏，只是这次请求被边界防护拦下。
    // 此时**不清空**登录态 —— 整页跳转已经由 http 拦截器发出，这里只负责让守卫别把人踢去登录页。
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
      meLoaded.value = false;
      return false;
    }
    /*
     * 🔴 网络故障 / 服务端异常：**不能 reset**。
     *
     * `status === 0` 是 axios 拿不到响应（断网、后端进程没起、网关拒绝连接）；
     * `>= 500` 是后端活着但内部炸了。两种情况下会话状态都无从判断 ——
     * 而 `sid` 是 Cookie，不随这次请求失败而消失。清掉内存里的 `me` 只会让守卫
     * 把人送去登录页，可服务器一恢复又能直接进（用户实测：/ 跳登录，/dashboard 正常）。
     *
     * 真未登录的情况不会漏：页面自己的请求会拿 401，走 http 拦截器的
     * `unauthorizedHandler` → 跳登录。这里放行是安全的。
     */
    if (err instanceof ApiError && (err.status === 0 || err.status >= 500)) {
      unavailable.value = true;
      return false;
    }
    // 其余（401 / 404 / 参数错误…）才是真的"这个身份用不了"
    reset();
    return false;
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
    meLoaded.value = false;
    menusLoaded.value = false;
    denied.value = false;
    deniedMessage.value = '';
    unavailable.value = false;
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
    unavailable,
    isAuthenticated,
    load,
    hasPermission,
    reset,
    logout
  };
});
