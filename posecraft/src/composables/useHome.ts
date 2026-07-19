/**
 * 首页状态管理组合式函数
 *
 * 负责首页数据加载、频道切换、搜索、点赞收藏等交互逻辑
 * 通过 provide/inject 实现单例模式，避免重复初始化
 *
 * @author Claude
 * @since 2026-07-13
 */
import { ref, onMounted, onUnmounted, computed, watch, type Ref, provide, inject } from 'vue'
import { useUserSettings } from '@/stores/userSettings'
import { useRouter, useRoute } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import { workApi } from '@/api/work'
import { followApi } from '@/api/follow'
import { bannerConfigApi } from '@/api/bannerConfig'
import { channelApi } from '@/api/channel'
import { useLocation } from '@/composables/useLocation'

const HomeStateSymbol = Symbol('HomeState')

/**
 * 首页组合式函数
 * 提供首页所需的全部响应式状态和业务逻辑
 * @returns 首页状态对象
 */
export function useHome() {
  const injected = inject<any>(HomeStateSymbol, null)
  if (injected) {
    return injected
  }

  const router = useRouter()
  const route = useRoute()
  const themeStore = useThemeStore()
  const authStore = useAuthStore()

  // 响应式状态
  const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1200)
  const isMobile = computed(() => windowWidth.value <= 1024)
  const sidebarOpen = ref(false)
  const showNavSearch = ref(false) // 搜索框滚出视野 → topnav 显示搜索
  const showBackToTop = ref(false) // 右下角回到顶部按钮

  const searchQuery = ref('')
  const searchFocused = ref(false)
  const activeNav = ref('recommend')
  const activeChannel = ref('recommend')

  // DOM refs
  const searchStickyHeader = ref<HTMLElement | null>(null)
  const searchSentinel = ref<HTMLElement | null>(null)
  // 骨骼线图层显隐：从用户设置 store 读取（缓存优先 + 登录后同步后端）
  const userSettings = useUserSettings()
  const showTemplate = computed({
    get: () => userSettings.settings.showTemplate,
    set: (v) => userSettings.setSetting('showTemplate', v)
  })
  const showSettingsModal = ref(false)
  const showAboutModal = ref(false)
  const settingsActiveSection = ref('general')

  // 用户数据及状态
  const saveLoginInfo = computed({
    get: () => authStore.saveLoginInfo,
    set: (v) => { authStore.updateSaveLoginInfo(v) }
  })
  const isVip = ref(true) // Mock VIP status
  const followingCount = computed({
    get: () => authStore.followingCount,
    set: (v) => { authStore.followingCount = v }
  })
  const followersCount = computed({
    get: () => authStore.followersCount,
    set: (v) => { authStore.followersCount = v }
  })
  const worksCount = computed({
    get: () => authStore.worksCount,
    set: (v) => { authStore.worksCount = v }
  })
  const likesCount = computed({
    get: () => authStore.likesCount,
    set: (v) => { authStore.likesCount = v }
  })
  const mutualCount = computed({
    get: () => authStore.mutualCount,
    set: (v) => { authStore.mutualCount = v }
  })
  const templatesCount = computed({
    get: () => authStore.templatesCount,
    set: (v) => { authStore.templatesCount = v }
  })
  const recommendationsCount = computed({
    get: () => authStore.recommendationsCount,
    set: (v) => { authStore.recommendationsCount = v }
  })
  const collectsCount = computed({
    get: () => authStore.collectsCount,
    set: (v) => { authStore.collectsCount = v }
  })
  const userProfile = computed({
    get: () => authStore.userProfile,
    set: (v) => { authStore.userProfile = v }
  })

  // Toast 提示
  const toastMsg = ref('')
  /**
   * 显示 Toast 提示
   * @param msg - 提示消息
   */
  const showToast = (msg: string) => {
    toastMsg.value = msg
    setTimeout(() => {
      if (toastMsg.value === msg) {
        toastMsg.value = ''
      }
    }, 2000)
  }

  /** 按 nav + channel 缓存的作品数据
   *  键格式："channel:<channelValue>"（FeaturedView 子频道）/ "nav:<navValue>"（独立导航页） */
  const channelCache = ref<Record<string, {
    works: any[]
    hasMore: boolean
    currentPage: number
    banners: any[]
  }>>({})

  /** 计算缓存键：featured 页按频道键，其他 nav 页按导航键 */
  const getCacheKey = (): string => {
    if (activeNav.value === 'featured') return `channel:${activeChannel.value}`
    return `nav:${activeNav.value}`
  }

  const templates = ref<any[]>([])
  const works = ref<any[]>([])
  const activeBanners = ref<any[]>([])
  const currentPage = ref(1)
  const hasMore = ref(true)
  const loading = ref(false)

  // 用户位置（用于"附近"Tab 数据加载）
  const { autoLocate } = useLocation()
  const userLocation = ref<{ lat: number; lng: number } | null>(null)

  // 搜索建议词（猜你想搜）
  const searchSuggestions = [
    '画图编程代码', '画图生成建模', '画图出数模', 'mermaid代码',
    '画图自动生成模型', '画图生成电子签名', '画图生成设计', '画图生成3d代码',
    '画图生成图纸', '画图制作文字', '人体骨骼姿势提取', 'WebGL 3D人体建模'
  ]

  // 频道配置（从后端 /config/channels 拉取，含 value/label/icon/type/url/route/category/has_banner）
  const channels = ref<any[]>([])

  /** 当前激活的频道对象 */
  const currentChannel = computed(() => {
    return channels.value.find(c => c.value === activeChannel.value) || null
  })

  /** 当前频道外链 URL（iframe / external 类型） */
  const currentChannelUrl = computed(() => currentChannel.value?.url || '')

  /** 当前频道是否展示 Banner */
  const currentChannelShowBanner = computed(() => {
    return currentChannel.value?.has_banner === true && activeChannel.value === 'recommend'
  })

  /** 当前频道的分类筛选值（直接读 channel.category，替代旧的 if/else 映射） */
  const currentCategoryFilter = computed(() => {
    if (!currentChannel.value) return 'all'
    return currentChannel.value.category || 'all'
  })

  /** 根据当前导航项获取页面标题 */
  const getNavTitle = () => {
    switch (activeNav.value) {
      case 'featured': return '精选姿势'
      case 'recommend': return '推荐内容'
      case 'nearby': return '附近创作者'
      case 'ai-search': return 'AI 智能探索'
      case 'following': return '我的关注'
      case 'friends': return '朋友动态'
      case 'mine': return '我的空间'
      default: return 'PoseCraft'
    }
  }

  // 合并模板和作品并映射标识（API 无数据时用模拟推荐数据）
  // _key 用 "type-id" 拼接，避免 templates 与 works 数字 id 重复导致 Vue duplicate key 警告
  // 注意：已移除所有 mock/模拟数据；API 无数据时走骨架屏 + 空状态
  const allItems = computed(() => {
    const tplList = templates.value.map(t => ({ ...t, type: 'template', _key: `template-${t.id}` }))
    const workList = works.value.map(w => ({ ...w, type: 'work', _key: `work-${w.id}` }))
    return [...tplList, ...workList]
  })

  // 过滤后的列表（数据已由后端按 channel 参数过滤，前端只做搜索关键字过滤）
  const filteredItems = computed(() => {
    // _key = "type-id" 保证跨数据源唯一，防止 Vue v-for :key 重复警告
    const tplList = templates.value.map(t => ({ ...t, type: 'template', _key: `template-${t.id}` }))
    const workList = works.value.map(w => ({ ...w, type: 'work', _key: `work-${w.id}` }))
    let list: any[] = [...tplList, ...workList]

    // 搜索关键字筛选（本地过滤，仅用于当前已加载数据的搜索体验）
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase()
      list = list.filter(item =>
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q))
      )
    }

    return list
  })

  /** 格式化点赞数（万为单位） */
  const formatLikes = (num: number) => {
    if (!num) return '0'
    if (num >= 10000) return (num / 10000).toFixed(1) + '万'
    return num.toString()
  }

  /** 开始创作（已登录跳编辑器，未登录跳登录页） */
  const handleStartCreate = () => {
    if (authStore.isLoggedIn) {
      router.push('/editor')
    } else {
      router.push('/login')
    }
  }

  /** 打开作品/模板详情页 */
  const openDetail = (item: any) => {
    if (item.type === 'template') {
      router.push(`/template/${item.id}`)
    } else {
      router.push(`/work/${item.id}`)
    }
  }

  /**
   * 点赞/取消点赞（调后端 API + 乐观更新）
   * 注意：必须改 works.value 源数据，filteredItems 是 computed 副本无法触发响应式
   * @param {object} item - 作品对象
   */
  /**
   * 在多个数据源中查找同一个作品（首页 / 我的作品 / 模板 / 点赞 / 收藏列表）
   */
  const findInAllSources = (id: number | string) => {
    const sources = [works.value, authStore.myWorks, authStore.myTemplates, authStore.myLikes, authStore.myCollects]
    for (const src of sources) {
      const found = src.find((w: any) => w.id === id)
      if (found) return found
    }
    return null
  }

  /** 获取所有数据源的扁平列表 */
  const getAllItemRefs = () => [
    ...works.value,
    ...authStore.myWorks,
    ...authStore.myTemplates,
    ...authStore.myLikes,
    ...authStore.myCollects
  ]

  const handleLike = async (item: any) => {
    if (!authStore.isLoggedIn) return router.push('/login')
    const original = findInAllSources(item.id)
    if (!original) return
    const newLiked = !original.liked
    // 乐观更新所有数据源中该作品
    getAllItemRefs().filter((w: any) => w.id === item.id).forEach((w: any) => {
      w.liked = newLiked
      w.likes_count = (w.likes_count || 0) + (newLiked ? 1 : -1)
    })
    try {
      const { interactionApi } = await import('@/api/interaction')
      await interactionApi.toggleLike({ workId: item.id, like: newLiked })
    } catch (err) {
      getAllItemRefs().filter((w: any) => w.id === item.id).forEach((w: any) => {
        w.liked = !newLiked
        w.likes_count = (w.likes_count || 0) + (newLiked ? -1 : 1)
      })
      showToast('操作失败，请重试')
    }
  }

  const handleCollect = async (item: any) => {
    if (!authStore.isLoggedIn) return router.push('/login')
    const original = findInAllSources(item.id)
    if (!original) return
    const newCollected = !original.collected
    // 乐观更新所有数据源中该作品
    getAllItemRefs().filter((w: any) => w.id === item.id).forEach((w: any) => {
      w.collected = newCollected
    })
    try {
      const { interactionApi } = await import('@/api/interaction')
      await interactionApi.toggleCollect({ workId: item.id, collect: newCollected })
    } catch (err) {
      getAllItemRefs().filter((w: any) => w.id === item.id).forEach((w: any) => {
        w.collected = !newCollected
      })
      showToast('操作失败，请重试')
    }
  }

  /** 打开登录页（未登录时点击头像） */
  const toggleProfileModal = () => {
    router.push('/login')
  }

  /** 搜索框失焦（延迟 150ms 避免点击建议词失效） */
  const onSearchBlur = () => {
    setTimeout(() => { searchFocused.value = false }, 150)
  }

  /** 跳转搜索（PC 端聚焦搜索框，移动端跳搜索页） */
  const goToSearch = () => {
    if (!isMobile.value) {
      searchFocused.value = true
    } else {
      router.push('/search')
    }
  }

  /** 滚动到页面顶部 */
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }



  /**
   * 构建当前频道的后端请求参数（仅 FeaturedView 子频道使用）
   * - 姿势/创意/运动等：category=<channel.category>（按分类过滤）
   * - 无特殊配置：不传额外参数
   * 注：recommend 排序由 fetchWorksForNav() 按 activeNav 分发到 API 端点处理
   */
  const buildChannelParams = () => {
    const ch = currentChannel.value
    if (!ch) return {}
    const params: any = {}
    // 内容频道：按 category 字段过滤（姿势/创意/运动/构图/技巧）
    if (ch.category && ch.category !== 'all') {
      params.category = ch.category
    }
    return params
  }

  /**
   * 首页数据加载（频道识别后调用）
   * - has_banner 频道：Banner 与作品并行加载（提升首屏速度）
   * - 其他频道：仅加载作品
   * 请求参数由 buildChannelParams() 按 channel 配置自动构建
   */
  /** 根据 activeNav 分发到不同的 API 端点 */
  const fetchWorksForNav = async (opts: { page: number; pageSize: number }) => {
    const nav = activeNav.value
    let res: any

    switch (nav) {
      case 'friends':
        if (!authStore.isLoggedIn) { res = { list: [] }; break }
        res = await workApi.getFriendsWorks({ page: opts.page, pageSize: opts.pageSize })
        break

      case 'following':
        if (!authStore.isLoggedIn) { res = { list: [] }; break }
        res = await workApi.getFollowingWorks({ page: opts.page, pageSize: opts.pageSize })
        break

      case 'mine':
        if (!authStore.isLoggedIn || !authStore.user?.id) { res = { list: [] }; break }
        res = await workApi.getMyWorks({ page: opts.page, pageSize: opts.pageSize })
        break

      case 'nearby': {
        const loc = userLocation.value
        if (!loc) { res = { list: [] }; break }
        res = await workApi.getNearbyWorks({
          page: opts.page, pageSize: opts.pageSize,
          lat: loc.lat, lng: loc.lng, radius: 50
        })
        break
      }

      case 'recommend':
        res = await workApi.getList({ page: opts.page, pageSize: opts.pageSize, sort: 'recommended' })
        break

      default:
        // featured 及其他：使用 channel 参数（category/sort）
        res = await workApi.getList(opts)
        break
    }

    // 统一返回结构，屏蔽 axios response 和空结果的类型差异
    return {
      list: res?.list || [],
      totalPages: res?.totalPages || 1,
      page: res?.page || opts.page,
      pageSize: res?.pageSize || opts.pageSize
    }
  }

  const loadData = async (page: number) => {
    if (loading.value) return
    loading.value = true
    try {
      let newWorks: any[] = []
      let totalPages = 1

      // 按当前频道配置自动构建请求参数（sort/category）
      const channelParams = buildChannelParams()
      const workQueryOptions = { page, pageSize: 12, ...channelParams }

      // ★ has_banner=true 的频道（推荐页）：Banner 与作品并行加载
      if (currentChannel.value?.has_banner && activeNav.value === 'featured') {
        const [workResult, bannerResult] = await Promise.allSettled([
          fetchWorksForNav(workQueryOptions),
          bannerConfigApi.getActive().catch(() => null)
        ])

        if (workResult.status === 'fulfilled') {
          const workRes = workResult.value as any
          newWorks = workRes?.list || []
          totalPages = workRes?.totalPages || 1
        }

        if (bannerResult.status === 'fulfilled' && bannerResult.value) {
          activeBanners.value = Array.isArray(bannerResult.value) ? bannerResult.value : []
        } else {
          activeBanners.value = []
        }
      } else {
        // ★ 普通频道 / 独立导航页：仅加载作品
        const workRes = await fetchWorksForNav(workQueryOptions)
        newWorks = workRes?.list || []
        totalPages = workRes?.totalPages || 1
        activeBanners.value = []
      }

      if (page === 1) {
        works.value = newWorks
      } else {
        works.value = [...works.value, ...newWorks]
      }

      hasMore.value = page < totalPages

      // 加载完成后保存到缓存
      const cacheKey = getCacheKey()
      channelCache.value[cacheKey] = {
        works: [...works.value],
        hasMore: hasMore.value,
        currentPage: page,
        banners: [...activeBanners.value]
      }
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      loading.value = false
    }
  }

  /** 从缓存恢复数据，未缓存时返回 false */
  const restoreFromCache = (): boolean => {
    const cacheKey = getCacheKey()
    const cached = channelCache.value[cacheKey]
    if (!cached) return false
    works.value = [...cached.works]
    hasMore.value = cached.hasMore
    currentPage.value = cached.currentPage
    activeBanners.value = cached.banners ? [...cached.banners] : []
    return true
  }

  /** 刷新首页数据（切换频道 Tab 或 Nav Tab 时调用）
   *  优先从缓存恢复，无缓存时首次请求 */
  const refreshData = () => {
    // 有缓存直接恢复，不请求后端
    if (restoreFromCache()) return

    currentPage.value = 1
    hasMore.value = true
    works.value = []
    activeBanners.value = []
    // 重置 loading，避免前一次未完成的请求阻塞本次加载
    loading.value = false
    loadData(1)
  }

  /** 加载更多（下一页数据追加） */
  const loadMore = () => {
    if (!hasMore.value || loading.value) return
    currentPage.value++
    loadData(currentPage.value)
  }

  /** 获取用户资料（未初始化时先检查 session） */
  const fetchUserProfile = async () => {
    if (!authStore.initialized) {
      await authStore.checkSession()
    } else if (authStore.isLoggedIn && !authStore.userProfile?.uid) {
      await authStore.fetchUserProfile()
    }
  }

  /** 获取当前用户完整统计（代理 authStore.fetchMyStats） */
  const fetchMyStats = () => authStore.fetchMyStats()

  /**
   * 更新用户资料
   * @param data - 更新的资料数据
   * @returns 是否成功
   */
  const updateUserProfile = async (data: any) => {
    const success = await authStore.updateUserProfile(data)
    if (success) {
      showToast('个人资料更新成功')
      return true
    }
    showToast('更新资料失败，请重试')
    return false
  }

  /** 加载频道配置（首页渲染前调用，决定 Tab 结构）
   * 加载完毕后触发首次数据请求 → 整个生命周期只自动加载这一次
   * 切换菜单不刷新，只有 pull-to-refresh / loadMore 才重新请求
   */
  // 兜底频道（API 全失败时使用，保证基本可用）
  const FALLBACK_CHANNELS = [
    { value: 'recommend', label: '推荐', icon: 'flame', type: 'content', has_banner: true },
    { value: 'pose', label: '姿势', icon: 'user', type: 'content', category: 'pose' },
    { value: 'creative', label: '创意', icon: 'lightbulb', type: 'content', category: 'creative' },
    { value: 'scenery', label: '风景', icon: 'camera', type: 'iframe', url: 'https://cn.bing.com/images/search?q=%E9%A3%8E%E6%99%AF' },
    { value: 'sports', label: '运动', icon: 'trophy', type: 'content', category: 'sports' },
    { value: 'composition', label: '构图', icon: 'ruler', type: 'content', category: 'composition' },
    { value: 'technique', label: '技巧', icon: 'wrench', type: 'content', category: 'technique' }
  ]

  const loadChannels = async () => {
    try {
      const res = await channelApi.getList()
      if (Array.isArray(res) && res.length > 0) {
        channels.value = res
      } else {
        channels.value = FALLBACK_CHANNELS
      }
    } catch (err) {
      console.warn('获取动态频道配置失败，使用默认配置', err)
      channels.value = FALLBACK_CHANNELS
    } finally {
      // 频道加载完毕后，按当前激活频道触发首次数据加载
      refreshData()
    }
  }

  /**
   * 监听 activeChannel 切换，切换时重置数据并按新频道参数重新请求后端
   * 跳过初始化阶段（channels 尚未加载完毕时不触发）
   */
  watch(activeChannel, () => {
    if (channels.value.length === 0) return // 频道列表尚未初始化，跳过
    refreshData()
  })

  /** 监听路由变化，同步 activeNav 并触发数据加载（解决 keep-alive 缓存导致 activeNav 不更新 + 精选页回退时数据不加载的问题） */
  watch(() => route.path, (path) => {
    const navMap: Record<string, string> = {
      '/': 'featured',
      '/recommend': 'recommend',
      '/nearby': 'nearby',
      '/following': 'following',
      '/friends': 'friends',
      '/mine': 'mine'
    }
    const target = navMap[path]
    if (target && target !== activeNav.value) {
      activeNav.value = target
    }
    // 精选页由 activeChannel 驱动数据，但回退时 activeChannel 不变不会触发加载，需要主动刷新
    if (path === '/' && channels.value.length > 0) {
      refreshData()
    }
  })

  /** 监听 activeNav 切换：切到不同导航页时从缓存恢复或请求数据 */
  watch(activeNav, (newNav, oldNav) => {
    if (channels.value.length === 0 || newNav === oldNav) return
    // featured 页由 activeChannel watch 触发数据加载，此处跳过
    if (newNav === 'featured') return
    activeBanners.value = []
    refreshData()
  })

  onMounted(async () => {
    // ① 先加载频道配置（决定 Tab 结构，完成后自动触发首次 refreshData）
    await loadChannels()

    // ② 加载用户资料（并行不影响首屏）
    await fetchUserProfile()

    // ③ 后台异步获取用户位置（不阻塞首屏，用于\"附近\"页）
    autoLocate().then(loc => {
      if (loc) userLocation.value = { lat: loc.lat, lng: loc.lng }
    }).catch(() => {})

    const handleResize = () => { windowWidth.value = window.innerWidth }
    window.addEventListener('resize', handleResize, { passive: true })

    // 搜索框内容区高度计算：
    // main-content-area padding-top 72px + search-sticky padding 16px + search-row-input 46px = 134px
    // 当 scrollY > 134 - 72 = 62px 时，搜索框已完全滚入 TopNav 背后
    const SEARCH_HERO_THRESHOLD = 62

    const handleScroll = () => {
      showBackToTop.value = window.scrollY > 100
      // 精选页：基于滚动位置实时判断，无布局剪载，无闪烁
      if (activeNav.value === 'featured') {
        showNavSearch.value = window.scrollY > SEARCH_HERO_THRESHOLD
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })

    // activeNav 变化时：非精选页立即重置，精选页重新根据 scroll 判断
    watch(activeNav, (newNav) => {
      if (newNav !== 'featured') {
        showNavSearch.value = false
      } else {
        // 切回精选页时立即根据当前滚动位置判断
        showNavSearch.value = window.scrollY > SEARCH_HERO_THRESHOLD
      }
    })

    ;(window as any).__cleanupHome = () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll)
    }
  })

  onUnmounted(() => {
    if ((window as any).__cleanupHome) {
      ;(window as any).__cleanupHome()
    }
  })

  const state = {
    themeStore,
    authStore,
    windowWidth,
    isMobile,
    sidebarOpen,
    showNavSearch,
    showBackToTop,
    searchQuery,
    searchFocused,
    activeNav,
    activeChannel,
    searchStickyHeader,
    searchSentinel,
    showTemplate,
    showSettingsModal,
    showAboutModal,
    settingsActiveSection,
    saveLoginInfo,
    isVip,
    followingCount,
    followersCount,
    worksCount,
    likesCount,
    mutualCount,
    templatesCount,
    recommendationsCount,
    collectsCount,
    userProfile,
    fetchUserProfile,
    fetchMyStats,
    updateUserProfile,
    toastMsg,
    showToast,
    channels,
    currentChannel,
    currentChannelUrl,
    currentChannelShowBanner,
    currentCategoryFilter,
    getNavTitle,
    filteredItems,
    formatLikes,
    handleStartCreate,
    openDetail,
    handleLike,
    handleCollect,
    toggleProfileModal,
    onSearchBlur,
    goToSearch,
    scrollToTop,
    hasMore,
    loading,
    refreshData,
    loadMore,
    loadChannels,
    searchSuggestions,
    activeBanners
  }

  provide(HomeStateSymbol, state)

  return state
}
