/**
 * 认证状态管理
 * 接入 CoreFlow Session 认证（Cookie 模式）
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useCache } from '@/composables/useCache';

const cache = useCache('localStorage', 'posecraft_');

/** 本地 SVG 默认头像（data URI，零网络请求） */
export const DEFAULT_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 150 150'%3E%3Crect width='150' height='150' fill='%23e2e8f0'/%3E%3Ccircle cx='75' cy='60' r='25' fill='%2394a3b8'/%3E%3Cellipse cx='75' cy='130' rx='40' ry='30' fill='%2394a3b8'/%3E%3C/svg%3E";

export const useAuthStore = defineStore('auth', () => {
  const isLoggedIn = ref(false);
  const user = ref<any>(null);
  const token = ref<string | null>(null);
  const roles = ref<string[]>([]);
  const permissions = ref<{ allows: string[]; denies: string[] }>({ allows: [], denies: [] });
  const initialized = ref(false);

  // 全局登录弹窗开关（401 刷新失败 / 未登录点头像 → 内联弹窗，不跳页）
  const showLoginModal = ref(false);
  // 登录成功后需跳回的原路由（受保护路由未登录时记录，登录后 redirect 回去）
  const pendingRedirect = ref<string | null>(null);
  function openLoginModal(redirect?: string) {
    if (redirect) pendingRedirect.value = redirect;
    showLoginModal.value = true;
  }
  function closeLoginModal() {
    showLoginModal.value = false;
  }
  function consumePendingRedirect(): string | null {
    const r = pendingRedirect.value;
    pendingRedirect.value = null;
    return r;
  }

  // ── 已登录账号清单（抖音式多账号免切）：{[accountKey]: {username, avatar}} ──
  // key=accountKey（= uid 明文，后端用 HMAC(uid) 派生 HttpOnly cookie 名读 refreshToken），不含凭证
  const savedAccounts = ref<Record<string, { username: string; avatar: string }>>({});

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

  /** 登录/绑定成功后记录账号到清单（供下次免切） */
  function addSavedAccount(user: any, accountKey: string | null | undefined) {
    if (!accountKey || !user) return;
    savedAccounts.value[accountKey] = {
      username: user.username || user.name || '用户',
      avatar: user.avatar || ''
    };
    persistSavedAccounts();
  }

  /** 免密切换到指定账号（发 accountKey=uid，后端用 HMAC(uid) 派生 cookie 名读 HttpOnly refreshToken 验证轮转） */
  async function switchAccount(accountKey: string) {
    try {
      const { authApi } = await import('@/api/auth');
      const res: any = await authApi.switchAccount(accountKey);
      if (res?.user) {
        savedAccounts.value[accountKey] = {
          username: res.user.username || res.user.name || '用户',
          avatar: res.user.avatar || ''
        };
        persistSavedAccounts();
        setLoggedIn(true, res.user);
        await fetchPermissions();
        return { ok: true, user: res.user };
      }
      // need_password：凭证失效，删该项
      delete savedAccounts.value[accountKey];
      persistSavedAccounts();
      return { ok: false };
    } catch (err) {
      console.warn('🔒 切换账号失败:', err);
      return { ok: false };
    }
  }

  /** 彻底撤销某账号记住我凭证（"忘掉该账号"，发 accountKey=uid） */
  async function revokeSavedAccount(accountKey: string) {
    try {
      const { authApi } = await import('@/api/auth');
      await authApi.revokeSavedAccount(accountKey);
    } catch (err) {
      console.warn('撤销账号凭证失败:', err);
    }
    delete savedAccounts.value[accountKey];
    persistSavedAccounts();
  }

  // ── 对外展示的个人统计（关注/粉丝/互关/获赞/作品/模板/收藏/推荐）──
  const followingCount = ref(0);
  const followersCount = ref(0);
  const worksCount = ref(0);
  const likesCount = ref(0);
  const mutualCount = ref(0);
  const templatesCount = ref(0);
  const collectsCount = ref(0);
  const recommendationsCount = ref(0);

  /** 本地递增作品数（创建成功后调用） */
  const incrementWorksCount = () => {
    worksCount.value++;
  };
  /** 本地递增模板数（创建成功后调用） */
  const incrementTemplatesCount = () => {
    templatesCount.value++;
  };

  const userProfile = ref<any>(null);

  /** 带兜底的头像 URL（空值时返回本地默认头像，零网络请求） */
  const safeAvatar = computed(() => userProfile.value?.avatar || DEFAULT_AVATAR);

  const likedWorksCount = ref(0);
  const watchLaterCount = ref(0);
  const historyText = ref('30天内');
  // 保持登录默认关闭（防公共设备残留长期凭证）；仅用户显式勾选过才开
  const saveLoginInfo = ref(cache.get('save_login_info') === true);

  async function updateSaveLoginInfo(value: boolean) {
    saveLoginInfo.value = value;
    cache.set('save_login_info', value);
    if (isLoggedIn.value) {
      try {
        const { authApi } = await import('@/api/auth');
        await authApi.updateRememberMe(value);
      } catch (err) {
        console.warn('同步保存登录信息状态失败:', err);
      }
    }
  }

  const myWorks = ref<any[]>([]);
  const myTemplates = ref<any[]>([]);

  const myLikes = ref<any[]>([]);
  const myCollects = ref<any[]>([]);
  const myHistory = ref<any[]>([]);

  const isAdmin = computed(() => roles.value.includes('admin') || roles.value.includes('posecraft_admin'));

  /**
   * 从缓存恢复状态（仅用于快速 UI 显示，不验证有效性）
   * 安全说明：缓存的角色/权限仅影响 UI 展示，所有实际操作均由后端 session 验证。
   * 下次 API 调用（checkSession）会从后端拉取最新权威数据覆盖。
   */
  function restoreFromCache() {
    const savedUser = cache.get<any>('user');
    if (savedUser) {
      user.value = savedUser;
      isLoggedIn.value = true;
      roles.value = cache.get('roles') || [];
      permissions.value = cache.get('permissions') || { allows: [], denies: [] };
    }
    token.value = cache.get<string>('token');
  }

  /** 设置登录状态（登录时恢复用户信息，登出时清空所有个人数据） */
  function setLoggedIn(status: boolean, userData: any = null, tokenStr?: string) {
    isLoggedIn.value = status;
    user.value = userData;

    if (status) {
      // 保存用户信息到缓存（无论是否有 token）
      if (userData) cache.set('user', userData);
      if (tokenStr) {
        token.value = tokenStr;
        cache.set('token', tokenStr);
      }
    } else {
      // 登出：清空所有个人数据与缓存
      token.value = null;
      roles.value = [];
      permissions.value = { allows: [], denies: [] };
      followingCount.value = 0;
      followersCount.value = 0;
      worksCount.value = 0;
      likesCount.value = 0;
      mutualCount.value = 0;
      templatesCount.value = 0;
      collectsCount.value = 0;
      recommendationsCount.value = 0;
      likedWorksCount.value = 0;
      myWorks.value = [];
      myTemplates.value = [];
      myLikes.value = [];
      myCollects.value = [];
      myHistory.value = [];
      myRecommendations.value = [];
      userProfile.value = null;
      cache.del('user');
      cache.del('token');
      cache.del('roles');
      cache.del('permissions');
    }
  }

  /** 获取权限 */
  async function fetchPermissions() {
    try {
      const { authApi } = await import('@/api/auth');
      const res: any = await authApi.getPermissions();
      roles.value = res.roles || [];
      permissions.value = res.permissions || { allows: [], denies: [] };
      cache.set('roles', roles.value);
      cache.set('permissions', permissions.value);
    } catch (err) {
      console.error('获取权限失败:', err);
    }
  }

  async function checkSession(): Promise<boolean> {
    try {
      const { authApi } = await import('@/api/auth');
      const userData: any = await authApi.getUserInfo();

      if (!userData) {
        // Session 无效，清除所有状态
        setLoggedIn(false, null);
        initialized.value = true;
        return false;
      }

      // Session 有效，恢复用户身份
      user.value = { uid: userData.uid, ...userData };
      isLoggedIn.value = true;
      cache.set('user', user.value);

      // 权限 + 资料加载失败时不影响登录态，分别捕获
      await fetchPermissions().catch(() => {});
      await fetchUserProfile().catch(() => {});

      initialized.value = true;
      return true;
    } catch {
      // 顶层保险：任何未知错误视为未登录
      setLoggedIn(false, null);
      initialized.value = true;
      return false;
    }
  }

  /**
   * 获取当前登录用户的完整统计（统一接口）
   * 返回：following / followers / mutual / likes_received / works_count / templates_count / collects_count / recommendations_count
   * 注意：API 失败时保留旧值不清零
   */
  async function fetchMyStats() {
    try {
      const { profileApi } = await import('@/api/profile');
      const res = (await profileApi.getMyStats()) as any;
      const stats = res?.data || res;
      if (stats) {
        if (stats.following !== undefined) followingCount.value = stats.following;
        if (stats.followers !== undefined) followersCount.value = stats.followers;
        if (stats.works_count !== undefined) worksCount.value = stats.works_count;
        if (stats.likes_received !== undefined) likesCount.value = stats.likes_received;
        if (stats.mutual !== undefined) mutualCount.value = stats.mutual;
        if (stats.templates_count !== undefined) templatesCount.value = stats.templates_count;
        if (stats.collects_count !== undefined) collectsCount.value = stats.collects_count;
        if (stats.recommendations_count !== undefined) recommendationsCount.value = stats.recommendations_count;
      }
    } catch (e) {
      // 静默失败：保持旧值，不清零
      console.warn('获取个人统计失败', e);
    }
  }

  async function fetchMyHistory() {
    try {
      const { interactionApi } = await import('@/api/interaction');
      const res = (await interactionApi.getHistoryList({ page: 1, pageSize: 100 })) as any;
      myHistory.value = res.list || [];
    } catch (e) {
      console.warn('获取浏览历史失败', e);
    }
  }

  /** 获取当前登录用户自己的作品（后端从 session 识别用户） */
  async function fetchMyWorks() {
    try {
      const { workApi } = await import('@/api/work');
      const res = (await workApi.getMyWorks({ page: 1, pageSize: 100 })) as any;
      myWorks.value = res?.list || [];
    } catch (e) {
      console.warn('获取我的作品失败', e);
    }
  }

  /** 获取当前登录用户自己上传的模板（后端从 session 识别用户） */
  async function fetchMyTemplates() {
    try {
      const { templateApi } = await import('@/api/template');
      const res = (await templateApi.getMyTemplates({ page: 1, pageSize: 100 })) as any;
      myTemplates.value = res?.list || [];
    } catch (e) {
      console.warn('获取我的模板失败', e);
    }
  }

  async function fetchMyLikes() {
    try {
      const { interactionApi } = await import('@/api/interaction');
      const res = (await interactionApi.getLikesList({ page: 1, pageSize: 100 })) as any;
      myLikes.value = res.list || [];
    } catch (e) {
      console.warn('获取点赞列表失败', e);
    }
  }

  async function fetchMyCollects() {
    try {
      const { interactionApi } = await import('@/api/interaction');
      const res = (await interactionApi.getCollectsList({ page: 1, pageSize: 100 })) as any;
      myCollects.value = res.list || [];
    } catch (e) {
      console.warn('获取收藏列表失败', e);
    }
  }

  // 我的推荐列表
  const myRecommendations = ref<any[]>([]);

  async function fetchMyRecommendations(options = { page: 1, pageSize: 20 }) {
    try {
      const { recommendationApi } = await import('@/api/recommendation');
      const res = (await recommendationApi.getMyList(options)) as any;
      myRecommendations.value = res?.list || [];
    } catch (e) {
      console.warn('获取推荐列表失败', e);
    }
  }

  async function cancelRecommendation(params: { workId?: number; templateId?: number }) {
    try {
      const { recommendationApi } = await import('@/api/recommendation');
      if (params.workId) {
        await recommendationApi.cancelRecommendWork(params.workId);
      } else if (params.templateId) {
        await recommendationApi.cancelRecommendTemplate(params.templateId);
      }
      // 更新本地列表和计数
      myRecommendations.value = myRecommendations.value.filter(
        r =>
          !(params.workId && r.target_id === params.workId) && !(params.templateId && r.target_id === params.templateId)
      );
      recommendationsCount.value = Math.max(0, recommendationsCount.value - 1);
    } catch (e) {
      console.warn('取消推荐失败', e);
    }
  }

  async function recordHistoryAction(params: { workId?: number; templateId?: number }) {
    if (!isLoggedIn.value) return;
    try {
      const { interactionApi } = await import('@/api/interaction');
      await interactionApi.recordHistory(params);
      fetchMyHistory();
    } catch (e) {
      console.error('记录历史失败', e);
    }
  }

  async function toggleLikeAction(params: { workId?: number; templateId?: number; like: boolean }) {
    if (!isLoggedIn.value) return false;
    try {
      const { interactionApi } = await import('@/api/interaction');
      const res = (await interactionApi.toggleLike(params)) as any;
      if (res && res.liked !== undefined) {
        // 同步更新本地喜欢的列表，不重新拉全部统计
        fetchMyLikes();
        return true;
      }
    } catch (e) {
      console.error('点赞操作失败', e);
    }
    return false;
  }

  async function toggleCollectAction(params: { workId?: number; templateId?: number; collect: boolean }) {
    if (!isLoggedIn.value) return false;
    try {
      const { interactionApi } = await import('@/api/interaction');
      const res = (await interactionApi.toggleCollect(params)) as any;
      if (res && res.collected !== undefined) {
        fetchMyCollects();
        return true;
      }
    } catch (e) {
      console.error('收藏操作失败', e);
    }
    return false;
  }

  async function fetchUserProfile() {
    try {
      const { userApi } = await import('@/api/user');
      const profileRes = (await userApi.getProfile()) as any;
      if (!profileRes) return;

      userProfile.value = profileRes;
      // user.id 来自 session sub（数字），profileRes 不包含 id，直接用 fallback
      user.value = { ...user.value, ...profileRes, id: user.value?.sub || user.value?.id };

      // 加载完整统计（关注/粉丝/互关/获赞/作品/模板/收藏/推荐），个人内容列表在切换到对应 Tab 时才加载
      await fetchMyStats();
    } catch (e) {
      // 静默失败：保持旧值，不清零
      console.warn('获取用户资料失败', e);
    }
  }

  async function updateUserProfile(data: any) {
    try {
      const { userApi } = await import('@/api/user');
      const res = (await userApi.updateProfile(data)) as any;
      if (res) {
        userProfile.value = { ...userProfile.value, ...res };
        user.value = { ...user.value, ...res };
        return true;
      }
    } catch (e) {
      console.error('更新资料失败', e);
    }
    return false;
  }

  /** 权限检查 */
  function hasPermission(permission: string): boolean {
    if (isAdmin.value) return true;
    const { allows, denies } = permissions.value;
    if (denies.some(p => isPermissionMatch(p, permission))) return false;
    return allows.some(p => isPermissionMatch(p, permission));
  }

  function hasRole(role: string): boolean {
    return roles.value.includes(role);
  }

  function isPermissionMatch(pattern: string, target: string): boolean {
    if (pattern === '*') return true;
    if (pattern === target) return true;
    if (pattern.endsWith(':*')) return target.startsWith(pattern.slice(0, -1));
    return false;
  }

  function logout() {
    setLoggedIn(false, null);
  }

  // 启动时从缓存恢复（快速显示 UI）
  restoreFromCache();
  loadSavedAccounts();

  return {
    isLoggedIn,
    user,
    token,
    roles,
    permissions,
    isAdmin,
    initialized,
    savedAccounts,
    setLoggedIn,
    checkSession,
    fetchPermissions,
    hasPermission,
    hasRole,
    logout,
    addSavedAccount,
    switchAccount,
    revokeSavedAccount,
    followingCount,
    followersCount,
    worksCount,
    templatesCount,
    incrementWorksCount,
    incrementTemplatesCount,
    likesCount,
    mutualCount,
    recommendationsCount,
    userProfile,
    fetchUserProfile,
    fetchMyStats,
    updateUserProfile,
    likedWorksCount,
    collectsCount,
    watchLaterCount,
    historyText,
    myWorks,
    myTemplates,
    myLikes,
    myCollects,
    myHistory,
    myRecommendations,
    fetchMyWorks,
    fetchMyTemplates,
    fetchMyHistory,
    fetchMyLikes,
    fetchMyCollects,
    fetchMyRecommendations,
    cancelRecommendation,
    recordHistoryAction,
    toggleLikeAction,
    toggleCollectAction,
    saveLoginInfo,
    updateSaveLoginInfo,
    safeAvatar,
    showLoginModal,
    openLoginModal,
    closeLoginModal,
    pendingRedirect,
    consumePendingRedirect
  };
});
