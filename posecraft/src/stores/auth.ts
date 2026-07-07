/**
 * 认证状态管理
 * 接入 CoreFlow Session 认证（Cookie 模式）
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useCache } from '@/composables/useCache'

const cache = useCache('localStorage', 'posecraft_')

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
    avatar: 'https://picsum.photos/seed/avatar_wang/150/150',
    gender: 0,
    age: 27,
    city: '北京 · 朝阳',
    bio: '✈️已飞0个国家❗️ | 梦想是环游世界🌍 | 中国留子👧...',
    personal_id: 'pose_craft_wang'
  })

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

  const myWorks = ref<any[]>([
    {
      id: 'my-1',
      title: '我的WebGL 3D人体动作模板',
      description: '我自己设计保存的3D骨骼姿势，可以免费导出',
      username: '摄影小王',
      likes_count: 23,
      thumbnail_url: 'https://picsum.photos/seed/my1/400/490',
      type: 'template',
      is_private: false,
      created_at: '2026-07-04'
    },
    {
      id: 'my-2',
      title: '午后书房阅读抓拍瞬间',
      description: '在阳光照进书架时，安静阅读的自然动作',
      username: '摄影小王',
      likes_count: 15,
      thumbnail_url: 'https://picsum.photos/seed/my2/400/390',
      type: 'work',
      is_private: false,
      created_at: '2026-06-20'
    },
    {
      id: 'my-3',
      title: '[私密] 2026年7月室内私享构图',
      description: '仅限个人可见的复古法式卧室打光姿势',
      username: '摄影小王',
      likes_count: 0,
      thumbnail_url: 'https://picsum.photos/seed/my3/400/520',
      type: 'work',
      is_private: true,
      created_at: '2026-07-02'
    },
    {
      id: 'my-4',
      title: '我的首发胶片合集 · 经典港风',
      description: '打包汇总 10 组港风人像经典抓拍要点',
      username: '摄影小王',
      likes_count: 120,
      thumbnail_url: 'https://picsum.photos/seed/my4/400/450',
      type: 'collection',
      is_private: false,
      created_at: '2026-06-10'
    },
    {
      id: 'my-5',
      title: '短剧 1 - 摄影大师养成之路',
      description: '如何从零入门，摆姿设光一贴搞定',
      username: '摄影小王',
      likes_count: 320,
      thumbnail_url: 'https://picsum.photos/seed/my5/400/310',
      type: 'series',
      is_private: false,
      created_at: '2026-07-01'
    },
    {
      id: 'my-6',
      title: '老屋檐瓦当构图之美',
      description: '北京胡同古建筑屋顶的细节抓拍',
      username: '摄影小王',
      likes_count: 157,
      thumbnail_url: 'https://picsum.photos/seed/pose11/400/500',
      type: 'work',
      is_private: false,
      created_at: '2026-05-12'
    },
    {
      id: 'my-7',
      title: '黄昏逆光人像拍摄技巧',
      description: '利用黄金时段的逆光拍出梦幻氛围感',
      username: '摄影小王',
      likes_count: 89,
      thumbnail_url: 'https://picsum.photos/seed/my7/400/460',
      type: 'work',
      is_private: false,
      created_at: '2026-07-03'
    },
    {
      id: 'my-8',
      title: '城市天际线延时摄影合集',
      description: '从日出到日落，记录城市光影变化',
      username: '摄影小王',
      likes_count: 203,
      thumbnail_url: 'https://picsum.photos/seed/my8/400/350',
      type: 'collection',
      is_private: false,
      created_at: '2026-06-25'
    },
    {
      id: 'my-9',
      title: '日系清新色调调色分享',
      description: '低饱和高光偏青的日系后期思路',
      username: '摄影小王',
      likes_count: 312,
      thumbnail_url: 'https://picsum.photos/seed/my9/400/480',
      type: 'work',
      is_private: false,
      created_at: '2026-06-18'
    },
    {
      id: 'my-10',
      title: '咖啡馆文艺人像摆姿',
      description: '在咖啡馆场景下的12种自然坐姿',
      username: '摄影小王',
      likes_count: 76,
      thumbnail_url: 'https://picsum.photos/seed/my10/400/520',
      type: 'work',
      is_private: false,
      created_at: '2026-05-30'
    },
    {
      id: 'my-11',
      title: '雨天街拍情绪大片',
      description: '雨中漫步的电影感构图与色彩',
      username: '摄影小王',
      likes_count: 145,
      thumbnail_url: 'https://picsum.photos/seed/my11/400/400',
      type: 'work',
      is_private: true,
      created_at: '2026-07-01'
    },
    {
      id: 'my-12',
      title: '短剧 2 - 街头摄影日记',
      description: '跟着镜头探索城市角落的故事',
      username: '摄影小王',
      likes_count: 456,
      thumbnail_url: 'https://picsum.photos/seed/my12/400/330',
      type: 'series',
      is_private: false,
      created_at: '2026-06-08'
    }
  ])
  
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
    updateSaveLoginInfo
  }
})
