/**
 * 认证状态管理
 * 接入 CoreFlow Session 认证（Cookie 模式）
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useCache } from '@/composables/useCache'

const cache = useCache('localStorage', 'posecraft_')

/** 本地 SVG 默认头像（data URI，零网络请求） */
export const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 150 150'%3E%3Crect width='150' height='150' fill='%23e2e8f0'/%3E%3Ccircle cx='75' cy='60' r='25' fill='%2394a3b8'/%3E%3Cellipse cx='75' cy='130' rx='40' ry='30' fill='%2394a3b8'/%3E%3C/svg%3E"

export const useAuthStore = defineStore('auth', () => {
  const isLoggedIn = ref(false)
  const user = ref<any>(null)
  const token = ref<string | null>(null)
  const roles = ref<string[]>([])
  const permissions = ref<{ allows: string[]; denies: string[] }>({ allows: [], denies: [] })
  const initialized = ref(false)

  const followingCount = ref(0)
  const followersCount = ref(0)
  const worksCount = ref(0)
  const likesCount = ref(0)
  const userProfile = ref<any>({
    username: '摄影小王',
    avatar: DEFAULT_AVATAR,
    gender: 0,
    age: 27,
    city: '北京 · 朝阳',
    bio: '✈️已飞0个国家❗️ | 梦想是环游世界🌍 | 中国留子👧...',
    personal_id: 'pose_craft_wang'
  })

  /** 带兜底的头像 URL（空值时返回本地默认头像，零网络请求） */
  const safeAvatar = computed(() => userProfile.value?.avatar || DEFAULT_AVATAR)

  const likedWorksCount = ref(280)
  const collectsCount = ref(246)
  const watchLaterCount = ref(1)
  const historyText = ref('30天内')
  const saveLoginInfo = ref(cache.get('save_login_info') !== false)

  async function updateSaveLoginInfo(value: boolean) {
    saveLoginInfo.value = value
    cache.set('save_login_info', value)
    if (isLoggedIn.value) {
      try {
        const { authApi } = await import('@/api/auth')
        await authApi.updateRememberMe(value)
      } catch (err) {
        console.warn('同步保存登录信息状态失败:', err)
      }
    }
  }

  const myWorks = ref<any[]>([])
  
  const myLikes = ref<any[]>([])
  const myCollects = ref<any[]>([])
  const myHistory = ref<any[]>([])

  const isAdmin = computed(() => roles.value.includes('admin') || roles.value.includes('posecraft_admin'))

  /** 从缓存恢复状态（不验证有效性） */
  function restoreFromCache() {
    const savedUser = cache.get<any>('user')
    if (savedUser) {
      user.value = savedUser
      isLoggedIn.value = true
      roles.value = cache.get('roles') || []
      permissions.value = cache.get('permissions') || { allows: [], denies: [] }
    }
    token.value = cache.get<string>('token')
  }

  /** 设置登录状态 */
  function setLoggedIn(status: boolean, userData: any = null, tokenStr?: string) {
    isLoggedIn.value = status
    user.value = userData

    if (status) {
      // 保存用户信息到缓存（无论是否有 token）
      if (userData) {
        cache.set('user', userData)
      }
      if (tokenStr) {
        token.value = tokenStr
        cache.set('token', tokenStr)
      }
    }

    if (!status) {
      token.value = null
      roles.value = []
      permissions.value = { allows: [], denies: [] }
      cache.del('user')
      cache.del('token')
      cache.del('roles')
      cache.del('permissions')
    }
  }

  /** 获取权限 */
  async function fetchPermissions() {
    try {
      const { authApi } = await import('@/api/auth')
      const res: any = await authApi.getPermissions()
      roles.value = res.roles || []
      permissions.value = res.permissions || { allows: [], denies: [] }
      cache.set('roles', roles.value)
      cache.set('permissions', permissions.value)
    } catch (err) {
      console.error('获取权限失败:', err)
    }
  }

  async function checkSession(): Promise<boolean> {
    try {
      const { authApi } = await import('@/api/auth')
      const userData = await authApi.getUserInfo()

      if (userData) {
        user.value = { ...userData, id: (userData as any).sub }
        isLoggedIn.value = true
        cache.set('user', user.value)
        await fetchPermissions()
        await fetchUserProfile()
        initialized.value = true
        return true
      }
    } catch {
      // Session 无效，清除状态
      setLoggedIn(false, null)
    }

    initialized.value = true
    return false
  }

  async function fetchFollowStats(userId: string) {
    try {
      const { followApi } = await import('@/api/follow')
      const statsRes = await followApi.getFollowStatsOnly(userId) as any
      if (statsRes) {
        followingCount.value = statsRes.followingCount || 0
        followersCount.value = statsRes.followersCount || 0
      }
    } catch (e) {
      console.warn('获取关注统计失败', e)
    }
  }

  async function fetchWorkStats(userId: string) {
    try {
      const { followApi } = await import('@/api/follow')
      const statsRes = await followApi.getWorkStatsOnly(userId) as any
      if (statsRes) {
        worksCount.value = statsRes.worksCount || 0
        likesCount.value = statsRes.likesCount || 0
      }
    } catch (e) {
      console.warn('获取作品统计失败', e)
    }
  }

  async function fetchMyHistory() {
    try {
      const { interactionApi } = await import('@/api/interaction')
      const res = await interactionApi.getHistoryList({ page: 1, pageSize: 100 }) as any
      myHistory.value = res.list || []
    } catch (e) {
      console.warn('获取浏览历史失败', e)
    }
  }

  async function fetchMyLikes() {
    try {
      const { interactionApi } = await import('@/api/interaction')
      const res = await interactionApi.getLikesList({ page: 1, pageSize: 100 }) as any
      myLikes.value = res.list || []
    } catch (e) {
      console.warn('获取点赞列表失败', e)
    }
  }

  async function fetchMyCollects() {
    try {
      const { interactionApi } = await import('@/api/interaction')
      const res = await interactionApi.getCollectsList({ page: 1, pageSize: 100 }) as any
      myCollects.value = res.list || []
    } catch (e) {
      console.warn('获取收藏列表失败', e)
    }
  }

  async function recordHistoryAction(params: { workId?: number; templateId?: number }) {
    if (!isLoggedIn.value) return
    try {
      const { interactionApi } = await import('@/api/interaction')
      await interactionApi.recordHistory(params)
      fetchMyHistory()
    } catch (e) {
      console.error('记录历史失败', e)
    }
  }

  async function toggleLikeAction(params: { workId?: number; templateId?: number; like: boolean }) {
    if (!isLoggedIn.value) return false
    try {
      const { interactionApi } = await import('@/api/interaction')
      const res = await interactionApi.toggleLike(params) as any
      if (res && res.liked !== undefined) {
        if (user.value?.uid) {
          fetchWorkStats(user.value.uid)
        }
        fetchMyLikes()
        return true
      }
    } catch (e) {
      console.error('点赞操作失败', e)
    }
    return false
  }

  async function toggleCollectAction(params: { workId?: number; templateId?: number; collect: boolean }) {
    if (!isLoggedIn.value) return false
    try {
      const { interactionApi } = await import('@/api/interaction')
      const res = await interactionApi.toggleCollect(params) as any
      if (res && res.collected !== undefined) {
        fetchMyCollects()
        return true
      }
    } catch (e) {
      console.error('收藏操作失败', e)
    }
    return false
  }

  async function fetchUserProfile() {
    try {
      const { userApi } = await import('@/api/user')
      const profileRes = await userApi.getProfile() as any
      if (profileRes) {
        userProfile.value = profileRes
        user.value = { ...user.value, ...profileRes, id: user.value?.sub || user.value?.id }

        const userUid = profileRes.uid
        if (userUid) {
          await fetchFollowStats(userUid)
          await fetchWorkStats(userUid)
          await fetchMyHistory()
          await fetchMyLikes()
          await fetchMyCollects()
        }
      }
    } catch (e) {
      console.warn('获取用户资料失败，降级展示默认数据', e)
    }
  }

  async function updateUserProfile(data: any) {
    try {
      const { userApi } = await import('@/api/user')
      const res = await userApi.updateProfile(data) as any
      if (res) {
        userProfile.value = { ...userProfile.value, ...res }
        user.value = { ...user.value, ...res }
        return true
      }
    } catch (e) {
      console.error('更新资料失败', e)
    }
    return false
  }

  /** 权限检查 */
  function hasPermission(permission: string): boolean {
    if (isAdmin.value) return true
    const { allows, denies } = permissions.value
    if (denies.some((p) => isPermissionMatch(p, permission))) return false
    return allows.some((p) => isPermissionMatch(p, permission))
  }

  function hasRole(role: string): boolean {
    return roles.value.includes(role)
  }

  function isPermissionMatch(pattern: string, target: string): boolean {
    if (pattern === '*') return true
    if (pattern === target) return true
    if (pattern.endsWith(':*')) return target.startsWith(pattern.slice(0, -1))
    return false
  }

  function logout() {
    setLoggedIn(false, null)
  }

  // 启动时从缓存恢复（快速显示 UI）
  restoreFromCache()

  return {
    isLoggedIn,
    user,
    token,
    roles,
    permissions,
    isAdmin,
    initialized,
    setLoggedIn,
    checkSession,
    fetchPermissions,
    hasPermission,
    hasRole,
    logout,
    followingCount,
    followersCount,
    worksCount,
    likesCount,
    userProfile,
    fetchUserProfile,
    fetchFollowStats,
    fetchWorkStats,
    updateUserProfile,
    likedWorksCount,
    collectsCount,
    watchLaterCount,
    historyText,
    myWorks,
    myLikes,
    myCollects,
    myHistory,
    fetchMyHistory,
    fetchMyLikes,
    fetchMyCollects,
    recordHistoryAction,
    toggleLikeAction,
    toggleCollectAction,
    saveLoginInfo,
    updateSaveLoginInfo,
    safeAvatar
  }
})
