import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { firewallApi } from '@/api/firewall';
import { useCache } from '@/composables/useCache';

const cache = useCache('localStorage');

/**
 * 认证模式：
 * - JWT 模式：token 存 localStorage，请求带 Authorization header
 * - Session 模式（默认）：Cookie 自动携带，无需存 token
 *
 * 通过 checkSession 中的 getUserInfo 调用自动适配两种模式
 */
export const useAuthStore = defineStore('auth', () => {
  const isLoggedIn = ref(false);
  const user = ref<any>(null);
  const token = ref<string | null>(null);
  const roles = ref<string[]>([]);
  const permissions = ref<{ allows: string[]; denies: string[] }>({ allows: [], denies: [] });
  /** 控制登录弹窗显示（API 层 401 时自动设为 true） */
  const showLoginModal = ref(false);

  /** 已登录账号清单（抖音式多账号免切）：{[uid]: {refreshToken, username, avatar, rememberMe}} */
  const savedAccounts = ref<
    Record<string, { refreshToken: string; username: string; avatar: string; rememberMe: boolean }>
  >({});

  /** 从 localStorage 恢复已登录账号清单 */
  function loadSavedAccounts() {
    const saved = cache.get<any>('saved_accounts');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      savedAccounts.value = saved;
    }
  }

  /** 持久化已登录账号清单到 localStorage */
  function persistSavedAccounts() {
    cache.set('saved_accounts', savedAccounts.value);
  }

  /**
   * 登录/绑定成功后记录账号到清单（供下次免切）
   * @param user - {id, uid?, username, name?, avatar}
   * @param refreshToken - 记住我凭证（非记住我为 null，不记录）
   */
  function addSavedAccount(user: any, refreshToken: string | null | undefined) {
    if (!refreshToken || !user) return;
    const uid = user.uid || String(user.id);
    if (!uid) return;
    savedAccounts.value[uid] = {
      refreshToken,
      username: user.username || user.name || '用户',
      avatar: user.avatar || '',
      rememberMe: true
    };
    persistSavedAccounts();
  }

  /**
   * 免密切换到指定账号
   * @returns 成功返回 {ok:true, user}；失败（refreshToken 失效）返回 {ok:false}
   */
  async function switchAccount(refreshToken: string) {
    try {
      const res: any = await firewallApi.switchAccount(refreshToken);
      // 后端 switched 返回 {user, refreshToken(新)}；need_password 无 user
      if (res?.user && res?.refreshToken) {
        const uid = res.user.uid || String(res.user.id);
        savedAccounts.value[uid] = {
          refreshToken: res.refreshToken,
          username: res.user.username || res.user.name || '用户',
          avatar: res.user.avatar || '',
          rememberMe: true
        };
        persistSavedAccounts();
        setLoggedIn(true, res.user);
        await fetchPermissions();
        return { ok: true, user: res.user };
      }
      // need_password：refreshToken 失效，按 rt 反查并移除该项
      for (const [uid, acct] of Object.entries(savedAccounts.value)) {
        if (acct.refreshToken === refreshToken) delete savedAccounts.value[uid];
      }
      persistSavedAccounts();
      return { ok: false };
    } catch (err) {
      console.warn('🔒 切换账号失败:', err);
      return { ok: false };
    }
  }

  /** 彻底撤销某账号记住我凭证（"忘掉该账号"） */
  async function revokeSavedAccount(refreshToken: string) {
    try {
      await firewallApi.revokeSavedAccount(refreshToken);
    } catch (err) {
      console.warn('撤销账号凭证失败:', err);
    }
    for (const [uid, acct] of Object.entries(savedAccounts.value)) {
      if (acct.refreshToken === refreshToken) delete savedAccounts.value[uid];
    }
    persistSavedAccounts();
  }

  /** 是否为管理员（GLOBAL 或 firewall 超管） */
  const isAdmin = computed(
    () => roles.value.includes('admin') || roles.value.includes('superadmin') || roles.value.includes('fw_admin')
  );

  /** 主要角色显示名称 */
  const roleName = computed(() => {
    if (roles.value.includes('superadmin') || roles.value.includes('admin')) return '超级管理员';
    if (roles.value.includes('fw_admin')) return '防火墙管理员';
    if (roles.value.includes('fw_operator')) return '防火墙操作员';
    if (roles.value.includes('fw_viewer')) return '观察者';
    return '访客';
  });

  /** 从缓存恢复状态 */
  function restore() {
    const savedUser = cache.get<any>('user');
    const savedRoles = cache.get<string[]>('roles');
    const savedPerms = cache.get<any>('permissions');
    const savedToken = cache.get<string>('token');

    // 有缓存的用户信息就恢复（Session 模式下可能没有 token）
    if (savedUser) {
      user.value = savedUser;
      isLoggedIn.value = true;
    }
    if (savedToken) token.value = savedToken;
    if (savedRoles) roles.value = savedRoles;
    if (savedPerms) permissions.value = savedPerms;
  }

  function setLoggedIn(status: boolean, userData: any = null, tokenStr?: string) {
    isLoggedIn.value = status;
    user.value = userData;

    if (status) {
      if (userData) cache.set('user', userData);
      if (tokenStr) {
        token.value = tokenStr;
        cache.set('token', tokenStr);
      }
    }

    if (!status) {
      token.value = null;
      roles.value = [];
      permissions.value = { allows: [], denies: [] };
      cache.del('token');
      cache.del('user');
      cache.del('roles');
      cache.del('permissions');
      cache.del('refresh_token');
    }
  }

  /**
   * 获取当前用户权限
   */
  async function fetchPermissions() {
    try {
      const res: any = await firewallApi.getPermissions();
      if (res) {
        roles.value = res.roles || [];
        permissions.value = res.permissions || { allows: [], denies: [] };
        cache.set('roles', roles.value);
        cache.set('permissions', permissions.value);
      }
    } catch (err) {
      console.warn('🔒 获取权限失败:', err);
    }
  }

  /**
   * 检查会话有效性
   * 自动适配 JWT 和 Session 两种模式：
   * - JWT 模式：带 Bearer token 请求
   * - Session 模式：Cookie 自动携带
   */
  async function checkSession() {
    restore();

    try {
      const userInfo: any = await firewallApi.getUserInfo();
      if (userInfo && userInfo.sub) {
        const merged = {
          id: userInfo.sub || user.value?.id,
          username: userInfo.preferred_username || userInfo.name || user.value?.username,
          name: userInfo.name || user.value?.name,
          email: userInfo.email || user.value?.email,
          avatar: userInfo.avatar || user.value?.avatar
        };
        isLoggedIn.value = true;
        user.value = merged;
        cache.set('user', merged);
        await fetchPermissions();
        return true;
      }
    } catch (err) {
      console.log('🔒 未登录或会话已过期');
    }

    setLoggedIn(false, null);
    return false;
  }

  /**
   * 刷新 Access Token（仅 JWT 模式使用）
   */
  async function refreshAccessToken(): Promise<string> {
    const refreshToken = cache.get<string>('refresh_token');
    if (!refreshToken) throw new Error('无 Refresh Token');

    const { createHttp } = await import('@/api/firewall');
    const http = createHttp();
    const res: any = await http.post('/oauth2.1/token', {
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });

    const newToken = res.access_token;
    if (!newToken) throw new Error('刷新失败：未返回新 Token');

    token.value = newToken;
    cache.set('token', newToken);

    if (res.refresh_token) {
      cache.set('refresh_token', res.refresh_token, { exp: 86400 });
    }

    return newToken;
  }

  /**
   * 检查是否拥有指定权限
   * deny 永远优先于 admin 放行
   */
  function hasPermission(permission: string): boolean {
    const { allows, denies } = permissions.value;
    // 1. deny 优先：即使 admin 也拒绝
    if (denies.some(p => isPermissionMatch(p, permission))) return false;
    // 2. admin 放行（deny 未命中时）
    if (isAdmin.value) return true;
    // 3. allow 匹配
    return allows.some(p => isPermissionMatch(p, permission));
  }

  /**
   * 检查是否拥有指定角色
   */
  function hasRole(role: string): boolean {
    return roles.value.includes(role);
  }

  /**
   * 权限通配符匹配
   */
  function isPermissionMatch(pattern: string, target: string): boolean {
    if (pattern === '*') return true;
    if (pattern === target) return true;
    if (pattern.endsWith(':*')) {
      return target.startsWith(pattern.slice(0, -1));
    }
    return false;
  }

  async function logout() {
    setLoggedIn(false, null);
    try {
      await firewallApi.clearCookie();
    } catch {}
  }

  /** 更新头像 URL */
  function updateAvatar(url: string) {
    if (!user.value) return;
    // 直接使用相对路径，由 Vite 代理或 Nginx 转发
    user.value.avatar = url;
    cache.set('user', user.value);
  }

  // 初始化时恢复状态
  restore();
  loadSavedAccounts();

  return {
    isLoggedIn,
    user,
    token,
    roles,
    permissions,
    isAdmin,
    roleName,
    showLoginModal,
    savedAccounts,
    setLoggedIn,
    checkSession,
    fetchPermissions,
    refreshAccessToken,
    hasPermission,
    hasRole,
    updateAvatar,
    addSavedAccount,
    switchAccount,
    revokeSavedAccount,
    logout
  };
});
