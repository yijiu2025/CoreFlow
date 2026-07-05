import { ref, onMounted, onUnmounted, computed, watch, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import { templateApi } from '@/api/template'
import { workApi } from '@/api/work'
import { followApi } from '@/api/follow'
import service from '@/utils/request'

export function useHome() {
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

  // 用户数据及状态
  const showProfileModal = ref(false)
  const saveLoginInfo = ref(true)
  const isVip = ref(true) // Mock VIP status
  const followingCount = ref(0)
  const followersCount = ref(0)

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
      type: 'work'
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
      type: 'work'
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
    '科特迪瓦挪威1点开战', '胃体黏膜下隆起', '肠镜活检病理报告', '上海动物园文创',
    '胃糜烂怎么调养', '胃溃疡报告', '瑜伽拉伸教程', '复古胶片人像',
    '篮球动作分解', '编舞构图技巧', '街头穿搭姿势', '水下摄影技巧'
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
  const allItems = computed(() => {
    const tplList = templates.value.map(t => ({ ...t, type: 'template' }))
    const workList = works.value.map(w => ({ ...w, type: 'work' }))
    const apiItems = [...tplList, ...workList]
    if (apiItems.length > 0) return apiItems
    return mockRecommendations.map(m => ({ ...m }))
  })

  // 过滤后的列表
  const filteredItems = computed(() => {
    let list = allItems.value

    // 根据左侧导航类型进行筛选
    if (activeNav.value === 'mine') {
      list = list.filter(item => item.username === authStore.user?.username || (item.author && item.author.username === authStore.user?.username))
    } else if (activeNav.value === 'following') {
      list = list.filter(item => item.type === 'work')
    }

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
    showProfileModal.value = !showProfileModal.value
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

  const handleLogout = () => {
    authStore.logout()
    showProfileModal.value = false
    showToast('已退出登录')
  }

  const redirectToLogin = () => {
    showProfileModal.value = false
    router.push('/login')
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
      } else {
        const workRes = await workApi.getList({ page, pageSize: 12 }) as any
        newWorks = workRes.list || []
        totalPages = workRes.totalPages || 1
      }

      if (page === 1) {
        templates.value = newTemplates.filter((t: any) => t.status === 1)
        works.value = newWorks
        
        if (authStore.isLoggedIn && authStore.user?.id) {
          const stats = await followApi.getStats(authStore.user.id) as any
          followingCount.value = stats.followingCount || 0
          followersCount.value = stats.followersCount || 0
        }
      } else {
        templates.value = [...templates.value, ...newTemplates.filter((t: any) => t.status === 1)]
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

  watch(activeNav, () => {
    refreshData()
  })

  onMounted(async () => {
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

    const handleScroll = () => {
      showBackToTop.value = window.scrollY > 100
    }
    window.addEventListener('scroll', handleScroll, { passive: true })

    let io: IntersectionObserver | null = null
    const setupIO = () => {
      io?.disconnect()
      if (!searchSentinel.value) return
      io = new IntersectionObserver(
        ([entry]) => {
          showNavSearch.value = !entry.isIntersecting
        },
        { rootMargin: '-72px 0px 0px 0px', threshold: 0 }
      )
      io.observe(searchSentinel.value)
    }
    setTimeout(setupIO, 100)

    ;(window as any).__cleanupHome = () => {
      io?.disconnect()
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll)
    }
  })

  onUnmounted(() => {
    if ((window as any).__cleanupHome) {
      ;(window as any).__cleanupHome()
    }
  })

  return {
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
    showProfileModal,
    saveLoginInfo,
    isVip,
    followingCount,
    followersCount,
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
    handleLogout,
    redirectToLogin,
    hasMore,
    loading,
    loadMore,
    searchSuggestions
  }
}
