import { ref, onMounted, onUnmounted, computed, watch, type Ref, provide, inject } from 'vue'
import { useUserSettings } from '@/stores/userSettings'
import { useRouter } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import { templateApi } from '@/api/template'
import { workApi } from '@/api/work'
import { followApi } from '@/api/follow'
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
  const currentPage = ref(1)
  const hasMore = ref(true)
  const loading = ref(false)

  // 模拟推荐数据（当 API 无数据时展示）
  const mockRecommendations = [
    {
      id: 'mock-1',
      title: '复古胶片风人像姿势指南',
      description: '适合初学者的5个经典胶片人像姿势，轻松拍出高级感',
      username: '摄影小王',
      likes_count: 2341,
      thumbnail_url: 'https://picsum.photos/seed/pose1/400/560',
      category: 'pose',
      type: 'video'
    },
    {
      id: 'mock-2',
      title: '瑜伽拉伸 · 清晨唤醒序列',
      description: '10分钟瑜伽拉伸，唤醒身体每一天',
      username: '瑜伽Lily',
      likes_count: 5678,
      thumbnail_url: 'https://picsum.photos/seed/pose2/400/300',
      category: 'technique',
      type: 'work'
    },
    {
      id: 'mock-3',
      title: '篮球动作分解模板',
      description: '从基础运球到扣篮，一图看懂每个动作细节',
      username: '体育达人阿杰',
      likes_count: 1892,
      thumbnail_url: 'https://picsum.photos/seed/pose3/400/500',
      category: 'sports',
      type: 'template'
    },
    {
      id: 'mock-4',
      title: '舞蹈编舞构图技巧分享',
      description: '舞台编舞中的黄金分割构图法，让画面更具张力',
      username: '编舞师Coco',
      likes_count: 3420,
      thumbnail_url: 'https://picsum.photos/seed/pose4/400/600',
      category: 'composition',
      type: 'video'
    },
    {
      id: 'mock-5',
      title: '街头潮牌穿搭姿势灵感',
      description: '用这些姿势让你的街拍瞬间出片',
      username: '潮流捕手',
      likes_count: 4105,
      thumbnail_url: 'https://picsum.photos/seed/pose5/400/480',
      category: 'creative',
      type: 'work'
    },
    {
      id: 'mock-6',
      title: '动态人像追踪构图模板',
      description: '专业摄影师常用的动态构图模板，快速上手',
      username: '构图研究所',
      likes_count: 1267,
      thumbnail_url: 'https://picsum.photos/seed/pose6/400/350',
      category: 'pose',
      type: 'template'
    },
    {
      id: 'mock-7',
      title: '普拉提核心训练打卡姿势',
      description: '每天一组普拉提核心动作，30天练出马甲线',
      username: '健身教练Kira',
      likes_count: 8934,
      thumbnail_url: 'https://picsum.photos/seed/pose7/400/550',
      category: 'technique',
      type: 'work'
    },
    {
      id: 'mock-8',
      title: '极限运动 · 跑酷动作模板',
      description: '从基础翻越到空中转体，跑酷动作全收录',
      username: '跑酷小子',
      likes_count: 3210,
      thumbnail_url: 'https://picsum.photos/seed/pose8/400/420',
      category: 'sports',
      type: 'template'
    },
    {
      id: 'mock-9',
      title: '日系清新风 · 校园拍照姿势',
      description: '还原日剧感校园拍照，每张都是青春电影画面',
      username: '日系拍照日记',
      likes_count: 6789,
      thumbnail_url: 'https://picsum.photos/seed/pose9/400/500',
      category: 'creative',
      type: 'work'
    },
    {
      id: 'mock-10',
      title: '舞台表演人物群像构图',
      description: '多人舞台场景构图模板，适用于汇报演出和集体照',
      username: '编导工作室',
      likes_count: 1543,
      thumbnail_url: 'https://picsum.photos/seed/pose10/400/380',
      category: 'composition',
      type: 'template'
    },
    {
      id: 'mock-11',
      title: '水下摄影姿势大全',
      description: '水下的每一个动作都要特别练习，这些姿势让你从容应对',
      username: '水下摄影师阿伟',
      likes_count: 4521,
      thumbnail_url: 'https://picsum.photos/seed/pose11/400/520',
      category: 'pose',
      type: 'work'
    },
    {
      id: 'mock-12',
      title: '太极养生动作图解模板',
      description: '24式太极拳动作分解，中老年人也能轻松跟练',
      username: '养生堂',
      likes_count: 2100,
      thumbnail_url: 'https://picsum.photos/seed/pose12/400/450',
      category: 'technique',
      type: 'template'
    }
  ]

  // 搜索建议词（猜你想搜）
  const searchSuggestions = [
    '画图编程代码', '画图生成建模', '画图出数模', 'mermaid代码',
    '画图自动生成模型', '画图生成电子签名', '画图生成设计', '画图生成3d代码',
    '画图生成图纸', '画图制作文字', '人体骨骼姿势提取', 'WebGL 3D人体建模'
  ]

  // 1. 推荐页专属数据
  const mockRecommendItems = ref([
    {
      id: 'rec-1',
      title: '法式穿搭九宫格构图分享',
      description: '如何在法式街角拍出高级质感穿搭图',
      username: 'ParisianStyle',
      likes_count: 9821,
      thumbnail_url: 'https://picsum.photos/seed/rec1/400/500',
      type: 'work'
    },
    {
      id: 'rec-2',
      title: '猫咪视角拍摄大片技巧',
      description: '蹲下身子，带你用宠物的眼睛看世界',
      username: '喵星人摄影',
      likes_count: 5431,
      thumbnail_url: 'https://picsum.photos/seed/rec2/400/320',
      type: 'video'
    },
    {
      id: 'rec-3',
      title: '极限跑酷空翻连贯拆解',
      description: '全网首发超清跑酷细节连拍模板',
      username: '飞檐走壁',
      likes_count: 3201,
      thumbnail_url: 'https://picsum.photos/seed/rec3/400/540',
      type: 'template'
    },
    {
      id: 'rec-4',
      title: '夏日海边逆光拍照姿势',
      description: '逆光微风下，轻松抓拍那一抹唯美少女感',
      username: '海边微风',
      likes_count: 7654,
      thumbnail_url: 'https://picsum.photos/seed/rec4/400/480',
      type: 'work'
    }
  ])

  // 2. 附近页专属数据
  const mockNearbyItems = ref([
    {
      id: 'near-1',
      title: '朝阳公园草坪 · 复古飞盘动作',
      description: '周末来朝阳公园草坪抓拍几个超阳光的接盘瞬间吧！',
      username: '户外飞盘小分队',
      likes_count: 1205,
      thumbnail_url: 'https://picsum.photos/seed/near1/400/510',
      distance: '0.8km',
      type: 'work'
    },
    {
      id: 'near-2',
      title: '798艺术区 · 工业风人像姿势',
      description: '在红色红砖墙前，教你如何摆出酷炫的高冷站姿',
      username: '冷系胶片摄影',
      likes_count: 452,
      thumbnail_url: 'https://picsum.photos/seed/near2/400/400',
      distance: '1.5km',
      type: 'template'
    },
    {
      id: 'near-3',
      title: '三里屯太古里 · 街头潮流走秀摆拍',
      description: '捕捉最潮的街头定格瞬间，手插裤兜经典姿势',
      username: '时尚街头指南',
      likes_count: 2310,
      thumbnail_url: 'https://picsum.photos/seed/near3/400/580',
      distance: '2.4km',
      type: 'video'
    },
    {
      id: 'near-4',
      title: '颐和园昆明湖 · 古风汉服画中人',
      description: '在十七孔桥头斜靠凭栏，拍出温婉的江南古典质感',
      username: '古风人像馆',
      likes_count: 1894,
      thumbnail_url: 'https://picsum.photos/seed/near4/400/470',
      distance: '4.8km',
      type: 'work'
    }
  ])

  // 3. 关注页专属数据
  const mockFollowingItems = ref([
    {
      id: 'follow-1',
      title: '复古机车拍照动作指南',
      description: '坐在机车上的 3 个高级姿势，女孩子也能很酷！',
      username: '摄影师小林',
      likes_count: 8740,
      thumbnail_url: 'https://picsum.photos/seed/fol1/400/520',
      type: 'work'
    },
    {
      id: 'follow-2',
      title: '极简人像棚拍用光分解',
      description: '经典伦勃朗光布局，小白也能拍出质感肖像',
      username: '构图研究所',
      likes_count: 3205,
      thumbnail_url: 'https://picsum.photos/seed/fol2/400/380',
      type: 'template'
    }
  ])

  // 4. 朋友页专属数据
  const mockFriendsItems = ref([
    {
      id: 'friend-1',
      title: '周末露营大餐，帐篷前合照姿势',
      description: '和集美一起出动，野餐垫上的自然松弛感！',
      username: '闺蜜旅行日记',
      likes_count: 673,
      thumbnail_url: 'https://picsum.photos/seed/fr1/400/460',
      type: 'work'
    },
    {
      id: 'friend-2',
      title: '海边悬崖秋千抓拍机位',
      description: '面朝大海荡起秋千的完美仰拍视角',
      username: '阿杰爱冲浪',
      likes_count: 1045,
      thumbnail_url: 'https://picsum.photos/seed/fr2/400/530',
      type: 'video'
    }
  ])

  // 5. 我的空间专属数据
  const mockMyItems = ref([
    {
      id: 'my-1',
      title: '我的WebGL 3D人体动作模板',
      description: '我自己设计保存的3D骨骼姿势，可以免费导出',
      username: '摄影小王',
      likes_count: 23,
      thumbnail_url: 'https://picsum.photos/seed/my1/400/490',
      type: 'template'
    },
    {
      id: 'my-2',
      title: '午后书房阅读抓拍瞬间',
      description: '在阳光照进书架时，安静阅读的自然动作',
      username: '摄影小王',
      likes_count: 15,
      thumbnail_url: 'https://picsum.photos/seed/my2/400/390',
      type: 'work'
    }
  ])

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
  const allItems = computed(() => {
    const tplList = templates.value.map(t => ({ ...t, type: 'template' }))
    const workList = works.value.map(w => ({ ...w, type: 'work' }))
    const apiItems = [...tplList, ...workList]
    if (apiItems.length > 0) return apiItems
    return mockRecommendations.map(m => ({ ...m }))
  })

  // 过滤后的列表
  const filteredItems = computed(() => {
    let list: any[] = []

    const tplList = templates.value.map(t => ({ ...t, type: 'template' }))
    const workList = works.value.map(w => ({ ...w, type: 'work' }))
    const apiItems = [...tplList, ...workList]

    if (activeNav.value === 'featured') {
      list = apiItems.length > 0 ? apiItems : mockRecommendations.map(m => ({ ...m }))

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
      list = apiItems.length > 0 ? apiItems : mockRecommendItems.value.map(m => ({ ...m }))
    } else if (activeNav.value === 'nearby') {
      list = apiItems.length > 0 ? apiItems : mockNearbyItems.value.map(m => ({ ...m }))
    } else if (activeNav.value === 'following') {
      list = (apiItems.length > 0 && authStore.isLoggedIn) ? apiItems : mockFollowingItems.value.map(m => ({ ...m }))
    } else if (activeNav.value === 'friends') {
      list = (apiItems.length > 0 && authStore.isLoggedIn) ? apiItems : mockFriendsItems.value.map(m => ({ ...m }))
    } else if (activeNav.value === 'mine') {
      list = (apiItems.length > 0 && authStore.isLoggedIn) ? apiItems : mockMyItems.value.map(m => ({ ...m }))
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



  const loadData = async (page: number) => {
    if (loading.value) return
    loading.value = true
    try {
      const tplRes = await templateApi.getList({ page, pageSize: 12 }) as any
      const newTemplates = tplRes.list || []
      
      let newWorks = []
      let totalPages = 1
      if (activeNav.value === 'following' && authStore.isLoggedIn) {
        const workRes = await workApi.getFollowingWorks({ page, pageSize: 12 }) as any
        newWorks = workRes.list || []
        totalPages = workRes.totalPages || 1
      } else if (activeNav.value === 'mine' && authStore.isLoggedIn && authStore.user?.id) {
        const workRes = await workApi.getUserWorks(authStore.user.id, { page, pageSize: 12 }) as any
        newWorks = workRes.list || []
        totalPages = workRes.totalPages || 1
      } else {
        const workRes = await workApi.getList({ page, pageSize: 12 }) as any
        newWorks = workRes.list || []
        totalPages = workRes.totalPages || 1
      }

      if (page === 1) {
        if (activeNav.value === 'mine' && authStore.isLoggedIn && authStore.user?.id) {
          templates.value = newTemplates.filter((t: any) => t.user_id === authStore.user.id)
        } else {
          templates.value = newTemplates.filter((t: any) => t.status === 1)
        }
        works.value = newWorks
      } else {
        if (activeNav.value === 'mine' && authStore.isLoggedIn && authStore.user?.id) {
          templates.value = [...templates.value, ...newTemplates.filter((t: any) => t.user_id === authStore.user.id)]
        } else {
          templates.value = [...templates.value, ...newTemplates.filter((t: any) => t.status === 1)]
        }
        works.value = [...works.value, ...newWorks]
      }

      const hasMoreTemplates = tplRes.page < tplRes.totalPages
      const hasMoreWorks = page < totalPages
      hasMore.value = hasMoreTemplates || hasMoreWorks
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

  onMounted(async () => {
    await fetchUserProfile()
    refreshData()
    
    // 动态获取频道配置
    try {
      const res = await service.get('/posecraft/v1/config/channels')
      if (res?.data?.length > 0) {
        channels.value = res.data
      }
    } catch (err) {
      console.warn('获取动态频道配置失败，使用默认配置')
    }

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
    userProfile,
    fetchUserProfile,
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
    searchSuggestions
  }

  provide(HomeStateSymbol, state)

  return state
}
