import { ref, onMounted, onUnmounted, computed, watch, type Ref, provide, inject } from 'vue'
import { useUserSettings } from '@/stores/userSettings'
import { useRouter } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import { workApi } from '@/api/work'
import { followApi } from '@/api/follow'
import { bannerConfigApi } from '@/api/bannerConfig'
import service from '@/utils/request'

const HomeStateSymbol = Symbol('HomeState')

export function useHome() {
  const injected = inject<any>(HomeStateSymbol, null)
  if (injected) {
    return injected
  }

  const router = useRouter()
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
  const showToast = (msg: string) => {
    toastMsg.value = msg
    setTimeout(() => {
      if (toastMsg.value === msg) {
        toastMsg.value = ''
      }
    }, 2000)
  }

  const templates = ref<any[]>([])
  const works = ref<any[]>([])
  const activeBanners = ref<any[]>([])
  const currentPage = ref(1)
  const hasMore = ref(true)
  const loading = ref(false)

  // 搜索建议词（猜你想搜）
  const searchSuggestions = [
    '画图编程代码', '画图生成建模', '画图出数模', 'mermaid代码',
    '画图自动生成模型', '画图生成电子签名', '画图生成设计', '画图生成3d代码',
    '画图生成图纸', '画图制作文字', '人体骨骼姿势提取', 'WebGL 3D人体建模'
  ]

  const channels = ref([
    { value: 'recommend', label: '推荐' },
    { value: 'pose', label: '姿势' },
    { value: 'creative', label: '创意' },
    { value: 'scenery', label: '风景', url: 'https://cn.bing.com/images/search?q=%E9%A3%8E%E6%99%AF' },
    { value: 'sports', label: '运动' },
    { value: 'composition', label: '构图' },
    { value: 'technique', label: '技巧' }
  ])

  const currentChannelUrl = computed(() => {
    const channel = channels.value.find(c => c.value === activeChannel.value)
    return channel?.url || ''
  })

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

  // 过滤后的列表
  const filteredItems = computed(() => {
    let list: any[] = []

    // _key = "type-id" 保证跨数据源唯一，防止 Vue v-for :key 重复警告
    const tplList = templates.value.map(t => ({ ...t, type: 'template', _key: `template-${t.id}` }))
    const workList = works.value.map(w => ({ ...w, type: 'work', _key: `work-${w.id}` }))
    const apiItems = [...tplList, ...workList]

    if (activeNav.value === 'featured') {
      list = apiItems

      // 根据 channel 进行分类筛选
      let categoryMapVal = 'all'
      if (activeChannel.value === 'pose') categoryMapVal = 'pose'
      else if (activeChannel.value === 'creative') categoryMapVal = 'creative'
      else if (activeChannel.value === 'sports') categoryMapVal = 'sports'
      else if (activeChannel.value === 'composition') categoryMapVal = 'composition'
      else if (activeChannel.value === 'technique') categoryMapVal = 'technique'

      if (categoryMapVal !== 'all') {
        list = list.filter(item => item.category === categoryMapVal)
      }
    } else if (activeNav.value === 'recommend') {
      list = apiItems
    } else if (activeNav.value === 'nearby') {
      list = apiItems
    } else if (activeNav.value === 'following') {
      list = apiItems
    } else if (activeNav.value === 'friends') {
      list = apiItems
    } else if (activeNav.value === 'mine') {
      list = apiItems
    }

    // 搜索关键字筛选
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase()
      list = list.filter(item =>
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q))
      )
    }

    return list
  })

  const formatLikes = (num: number) => {
    if (!num) return '0'
    if (num >= 10000) return (num / 10000).toFixed(1) + '万'
    return num.toString()
  }

  const handleStartCreate = () => {
    if (authStore.isLoggedIn) {
      router.push('/editor')
    } else {
      router.push('/login')
    }
  }

  const openDetail = (item: any) => {
    if (item.type === 'template') {
      router.push(`/template/${item.id}`)
    } else {
      router.push(`/work/${item.id}`)
    }
  }

  const likeItem = (item: any) => {
    item.likes_count = (item.likes_count || 0) + 1
    showToast('点赞成功！')
  }

  const toggleProfileModal = () => {
    router.push('/login')
  }

  const onSearchBlur = () => {
    setTimeout(() => { searchFocused.value = false }, 150)
  }

  const goToSearch = () => {
    if (!isMobile.value) {
      searchFocused.value = true
    } else {
      router.push('/search')
    }
  }

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }



  /**
   * 首页数据加载（频道识别后调用）
   * - 非 recommend 频道：仅加载作品
   * - recommend 频道：并行加载 Banner + 作品（先显示占位，数据到齐后渲染）
   */
  const loadData = async (page: number) => {
    if (loading.value) return
    loading.value = true
    try {
      // 首页只加载作品——模板通过作品的 template_id 绑定，不在首页单独展示
      let newWorks = []
      let totalPages = 1

      // ★ recommend 频道：Banner 与作品并行加载（提升首屏速度）
      if (activeChannel.value === 'recommend') {
        const [workResult, bannerResult] = await Promise.allSettled([
          (async () => {
            if (activeNav.value === 'following' && authStore.isLoggedIn) {
              return await workApi.getFollowingWorks({ page, pageSize: 12 })
            } else if (activeNav.value === 'mine' && authStore.isLoggedIn && authStore.user?.id) {
              return await workApi.getMyWorks({ page, pageSize: 12 })
            }
            return await workApi.getList({ page, pageSize: 12 })
          })(),
          bannerConfigApi.getActive().catch(() => null)
        ])

        // 处理作品结果
        if (workResult.status === 'fulfilled') {
          const workRes = workResult.value as any
          newWorks = workRes?.list || []
          totalPages = workRes?.totalPages || 1
        }

        // 处理 Banner 结果
        if (bannerResult.status === 'fulfilled' && bannerResult.value) {
          activeBanners.value = Array.isArray(bannerResult.value) ? bannerResult.value : []
        } else {
          activeBanners.value = []
        }
      } else {
        // ★ 非 recommend 频道：仅加载作品
        let workRes: any
        if (activeNav.value === 'following' && authStore.isLoggedIn) {
          workRes = await workApi.getFollowingWorks({ page, pageSize: 12 })
        } else if (activeNav.value === 'mine' && authStore.isLoggedIn && authStore.user?.id) {
          workRes = await workApi.getMyWorks({ page, pageSize: 12 })
        } else {
          workRes = await workApi.getList({ page, pageSize: 12 })
        }
        newWorks = workRes?.list || []
        totalPages = workRes?.totalPages || 1
        activeBanners.value = [] // 非 recommend 不显示 banner
      }

      if (page === 1) {
        works.value = newWorks
      } else {
        works.value = [...works.value, ...newWorks]
      }

      hasMore.value = page < totalPages
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      loading.value = false
    }
  }

  const refreshData = () => {
    currentPage.value = 1
    hasMore.value = true
    loadData(1)
  }

  const loadMore = () => {
    if (!hasMore.value || loading.value) return
    currentPage.value++
    loadData(currentPage.value)
  }

  const fetchUserProfile = async () => {
    if (!authStore.initialized) {
      await authStore.checkSession()
    } else if (authStore.isLoggedIn && !authStore.userProfile?.uid) {
      await authStore.fetchUserProfile()
    }
  }

  /** 获取当前用户完整统计（代理 authStore.fetchMyStats） */
  const fetchMyStats = () => authStore.fetchMyStats()

  const updateUserProfile = async (data: any) => {
    const success = await authStore.updateUserProfile(data)
    if (success) {
      showToast('个人资料更新成功')
      return true
    }
    showToast('更新资料失败，请重试')
    return false
  }

  watch(activeNav, (newNav) => {
    // 非精选页：强制关闭搜索框提示，由 activeNav 控制而非 IO
    // 精选页：重置为 false，等 IO 判断实际位置
    showNavSearch.value = false
    refreshData()
  })

  /** 加载频道配置（在首页渲染前优先调用，决定哪些 Tab 可见） */
  const loadChannels = async () => {
    try {
      const res = await service.get('/posecraft/v1/config/channels')
      if (Array.isArray(res) && res.length > 0) {
        channels.value = res
      }
    } catch (err) {
      console.warn('获取动态频道配置失败，使用默认配置')
    }
  }

  onMounted(async () => {
    // ① 先加载频道配置（决定 Tab 结构）
    await loadChannels()

    // ② 加载用户资料（并行不影响首屏）
    await fetchUserProfile()

    // ③ 加载 Banner + 作品（已在 loadData 内按频道分流）
    refreshData()

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
    currentChannelUrl,
    getNavTitle,
    filteredItems,
    formatLikes,
    handleStartCreate,
    openDetail,
    likeItem,
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
