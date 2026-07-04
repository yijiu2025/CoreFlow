<template>
  <div class="home-layout" :class="{ 'dark-mode': themeStore.isDark }">
    <!-- 左侧侧边栏导航 (小红书比例, 精致质感) -->
    <aside class="side-bar" :class="{ open: sidebarOpen && isMobile }">
      <div class="sidebar-top">
        <!-- Logo -->
        <div class="brand-header" @click="router.push('/')">
          <div class="brand-logo">PoseCraft</div>
        </div>

        <!-- 菜单列表 (分组设计) -->
        <nav class="sidebar-menu">
          <div class="menu-group">
            <span class="group-title">发现</span>
            <button
              @click="activeNav = 'featured'"
              :class="['menu-item', { active: activeNav === 'featured' }]"
            >
              <span class="menu-icon">💎</span>
              <span class="menu-label">精选</span>
            </button>

            <button
              @click="activeNav = 'recommend'"
              :class="['menu-item', { active: activeNav === 'recommend' }]"
            >
              <span class="menu-icon">✨</span>
              <span class="menu-label">推荐</span>
            </button>

            <button
              @click="activeNav = 'nearby'"
              :class="['menu-item', { active: activeNav === 'nearby' }]"
            >
              <span class="menu-icon">📍</span>
              <span class="menu-label">附近</span>
            </button>

            <button
              @click="activeNav = 'ai-search'"
              :class="['menu-item', { active: activeNav === 'ai-search' }]"
            >
              <span class="menu-icon">🔍</span>
              <span class="menu-label">AI 搜索</span>
            </button>
          </div>

          <div class="menu-divider"></div>

          <div class="menu-group">
            <span class="group-title">社交</span>
            <button
              @click="activeNav = 'following'"
              :class="['menu-item', { active: activeNav === 'following' }]"
            >
              <span class="menu-icon">❤️</span>
              <span class="menu-label">关注</span>
            </button>

            <button
              @click="activeNav = 'friends'"
              :class="['menu-item', { active: activeNav === 'friends' }]"
            >
              <span class="menu-icon">👥</span>
              <span class="menu-label">朋友</span>
            </button>

            <button
              @click="activeNav = 'mine'"
              :class="['menu-item', { active: activeNav === 'mine' }]"
            >
              <span class="menu-icon">👤</span>
              <span class="menu-label">我的</span>
            </button>
          </div>
        </nav>
      </div>

      <!-- 侧边栏底部悬浮菜单 -->
      <div class="sidebar-bottom">
        <!-- 设置 -->
        <div class="bottom-menu-wrapper">
          <button class="bottom-item">
            <span class="bottom-icon">⚙️</span>
            <span>设置</span>
          </button>
          <div class="hover-dropdown-menu">
            <div class="dropdown-header">系统设置</div>
            <button class="dropdown-item" @click="themeStore.toggleTheme()">
              <span class="item-icon">🌗</span>
              <span>{{ themeStore.isDark ? '浅色模式' : '深色模式' }}</span>
            </button>
            <button class="dropdown-item" @click="showToast('通用设置 (包含隐私与通知设置)')">
              <span class="item-icon">🛠️</span>
              <span>通用设置</span>
            </button>
            <button class="dropdown-item" @click="showToast('AI设置')">
              <span class="item-icon">🤖</span>
              <span>AI设置</span>
            </button>
            <button class="dropdown-item" @click="showToast('键盘快捷键')">
              <span class="item-icon">⌨️</span>
              <span>键盘快捷键</span>
            </button>
            <button class="dropdown-item" @click="showToast('常见问题')">
              <span class="item-icon">❓</span>
              <span>常见问题</span>
            </button>
            <button class="dropdown-item" @click="showToast('我的客服')">
              <span class="item-icon">🎧</span>
              <span>我的客服</span>
            </button>
          </div>
        </div>

        <!-- 关于 -->
        <div class="bottom-menu-wrapper">
          <button class="bottom-item">
            <span class="bottom-icon">ℹ️</span>
            <span>关于</span>
          </button>
          <div class="hover-dropdown-menu">
            <div class="dropdown-header">关于我们</div>
            <button class="dropdown-item" @click="showToast('关于 PoseCraft')">
              <span class="item-icon">✨</span>
              <span>关于 PoseCraft</span>
            </button>
            <button class="dropdown-item" @click="showToast('联系我们')">
              <span class="item-icon">📞</span>
              <span>联系我们</span>
            </button>
          </div>
        </div>
      </div>
    </aside>

    <!-- 右侧内容容器 -->
    <div class="main-container">
      <!-- 头部通栏 (包括VIP、通知、私信、投稿、头像) -->
      <header class="top-nav">
        <div class="nav-left">
          <!-- 小屏：侧边栏展开按钮 -->
          <button class="sidebar-toggle-btn" @click="sidebarOpen = !sidebarOpen" title="菜单">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <span class="page-title">{{ getNavTitle() }}</span>
        </div>

        <!-- 桌面端：搜索框滚出视野后，在 topnav 居中显示紧凑搜索 -->
        <div
          class="nav-search-inline"
          :class="{ visible: showNavSearch && windowWidth >= 760 }"
        >
          <div class="inline-search-bar" @click="searchFocused = true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <span class="inline-search-placeholder">搜索姿势模板...</span>
          </div>
        </div>

        <div class="nav-right">
          <!-- 小屏：搜索图标（搜索框滚出屏幕后才显示） -->
          <button
            v-show="windowWidth < 760 && showNavSearch"
            class="nav-action-btn nav-search-mobile"
            @click="goToSearch"
            title="搜索"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>

          <!-- VIP标识 (如果有) -->
          <div v-if="authStore.isLoggedIn && isVip" class="vip-badge">
            <span class="vip-icon">👑</span>
            <span class="vip-text">VIP 会员</span>
          </div>

          <!-- 通知 -->
          <button class="nav-action-btn" @click="showToast('通知中心')" title="通知">
            <span class="nav-action-icon">🔔</span>
            <span class="badge-dot"></span>
          </button>

          <!-- 私信 -->
          <button class="nav-action-btn" @click="showToast('私信列表')" title="私信">
            <span class="nav-action-icon">💬</span>
          </button>

          <!-- 投稿 -->
          <button class="btn-upload" @click="handleStartCreate">
            <span class="upload-icon">📤</span>
            <span>投稿</span>
          </button>

          <!-- 头像 -->
          <div class="avatar-wrapper" @click="toggleProfileModal">
            <div class="user-avatar-btn" v-if="authStore.isLoggedIn">
              {{ (authStore.user?.username || authStore.user?.nickname || 'U').charAt(0).toUpperCase() }}
            </div>
            <div class="user-avatar-btn guest" v-else>
              ?
            </div>
          </div>
        </div>
      </header>

      <!-- 主区域 -->
      <main class="main-content-area">
        <!-- 搜索框 + 分类 Tab：sticky 吸附区 -->
        <div class="search-sticky-header" ref="searchStickyHeader">
          <!-- 搜索框主体（一个框：输入区 + 水平线 + 推荐面板） -->
          <div class="search-hero-bar" :class="{ focused: searchFocused, 'at-top': !showNavSearch }">
            <!-- 第一行：输入框（始终显示） -->
            <div class="search-row-input">
              <input
                v-model="searchQuery"
                type="text"
                placeholder="搜索感兴趣的姿势模板、创意构图、运动技巧..."
                class="search-input-new"
                @focus="searchFocused = true"
                @blur="onSearchBlur"
              />
              <!-- 搜索按钮 -->
              <button class="search-btn-float">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </button>
            </div>

            <!-- 第二行：操作栏 -->
            <div class="search-row-actions" v-show="searchFocused || !showNavSearch">
              <button class="search-plus-btn" @click="handleStartCreate" title="创作">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
              <div class="search-divider-v"></div>
              <span class="search-ai-hint">问点点 <span class="ai-badge">AI</span></span>
            </div>

            <!-- 水平分隔线 + 猜你想搜（正常流，随搜索框一起在同一个框里） -->
            <!-- 推荐面板：absolute 浮层，视觉上在搜索框内部，不挤占布局 -->
            <div class="search-suggestions-inner" v-show="searchFocused">
              <div class="suggest-divider" style="margin-top: 0;"></div>
              <div class="suggest-header">猜你想搜</div>
              <div class="suggest-grid">
                <button
                  v-for="word in searchSuggestions"
                  :key="word"
                  class="suggest-item"
                  @mousedown.prevent="searchQuery = word; searchFocused = false"
                >
                  {{ word }}
                </button>
              </div>
            </div>
          </div>

          <!-- 分类 Tab（紧贴搜索框下方） -->
          <div class="channel-container">
            <div class="channel-inner">
              <button
                v-for="ch in channels"
                :key="ch.value"
                @click="activeChannel = ch.value"
                :class="['channel-tag', { active: activeChannel === ch.value }]"
              >
                {{ ch.label }}
              </button>
            </div>
          </div>

          <!-- Sentinel：位于 header 底部，整个搜索头滚出后触发 topnav 搜索 -->
          <div ref="searchSentinel" class="search-sentinel"></div>
        </div>

        <!-- content container -->
        <div class="content-container">
          <!-- 动态网址内容 (iframe) -->
          <div v-if="currentChannelUrl" class="w-full" style="height: calc(100vh - 120px);">
            <iframe :src="currentChannelUrl" class="w-full h-full border-0" sandbox="allow-scripts allow-same-origin"></iframe>
          </div>

          <!-- 瀑布流 (仅当不是外部网址时显示) -->
          <div v-else>
            <div class="waterfall-grid" v-if="filteredItems.length > 0">
              <div
                v-for="item in filteredItems"
                :key="item.id"
                class="card"
                @click="openDetail(item)"
              >
                <div class="card-image">
                  <img :src="item.thumbnail_url || item.image_url || '/placeholder.png'" :alt="item.title" />
                  <div v-if="item.type === 'template'" class="card-badge">模板</div>
                </div>
                <div class="card-info">
                  <h3 class="card-title">{{ item.title || '未命名作品' }}</h3>
                  <div class="card-footer">
                    <div class="card-author">
                      <div class="author-avatar">{{ (item.username || 'U').charAt(0) }}</div>
                      <span class="author-name">{{ item.username || '匿名用户' }}</span>
                    </div>
                    <div class="card-likes" @click.stop="likeItem(item)">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                      </svg>
                      <span>{{ formatLikes(item.likes_count) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 空状态 -->
            <div v-else class="empty-state">
              <div class="empty-icon">🎨</div>
              <p class="empty-text">暂无发现符合条件的内容，去尝试创作一个吧！</p>
              <button class="empty-btn" @click="handleStartCreate">开始创作</button>
            </div>
          </div>
        </div>
      </main>

      <!-- 回到顶部浮动按钮 -->
      <button
        v-show="showBackToTop"
        class="back-to-top-btn"
        @click="scrollToTop"
        title="回到顶部"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="18 15 12 9 6 15"/>
        </svg>
      </button>
    </div>

    <!-- 移动端侧边栏遮罩层 -->
    <div
      v-if="sidebarOpen && isMobile"
      class="sidebar-overlay"
      @click="sidebarOpen = false"
    ></div>

    <!-- 用户信息 Modal -->
    <div v-if="showProfileModal" class="modal-overlay" @click.self="showProfileModal = false">
      <div class="profile-modal-card">
        <div class="modal-header">
          <h3>用户信息</h3>
          <button class="close-btn" @click="showProfileModal = false">×</button>
        </div>

        <div class="modal-user-info" v-if="authStore.isLoggedIn">
          <div class="user-main">
            <div class="user-modal-avatar">
              {{ (authStore.user?.username || authStore.user?.nickname || 'U').charAt(0).toUpperCase() }}
            </div>
            <div class="user-meta">
              <div class="username">{{ authStore.user?.username || authStore.user?.nickname || '用户' }}</div>
              <div class="vip-status" v-if="isVip">👑 VIP 黄金会员</div>
              <div class="guest-status" v-else>普通会员</div>
            </div>
          </div>

          <!-- 关注和粉丝 -->
          <div class="social-stats">
            <div class="stat-item" @click="showToast('我的关注')">
              <span class="stat-val">{{ followingCount }}</span>
              <span class="stat-lbl">关注</span>
            </div>
            <div class="stat-item" @click="showToast('我的粉丝')">
              <span class="stat-val">{{ followersCount }}</span>
              <span class="stat-lbl">粉丝</span>
            </div>
          </div>

          <!-- 导航菜单列表 -->
          <div class="modal-menu-list">
            <button class="modal-menu-item" @click="showToast('我的喜欢')">
              <span class="menu-icon">❤️</span>
              <span>我的喜欢</span>
            </button>
            <button class="modal-menu-item" @click="showToast('我的收藏')">
              <span class="menu-icon">⭐</span>
              <span>我的收藏</span>
            </button>
            <button class="modal-menu-item" @click="showToast('浏览历史')">
              <span class="menu-icon">🕒</span>
              <span>浏览历史</span>
            </button>
            <button class="modal-menu-item" @click="router.push('/profile'); showProfileModal = false">
              <span class="menu-icon">🎨</span>
              <span>我的作品</span>
            </button>
          </div>

          <!-- 保存登录信息开关 -->
          <div class="login-settings">
            <label class="setting-switch-label">
              <span>保存登录信息</span>
              <input type="checkbox" v-model="saveLoginInfo" class="switch-checkbox" />
              <span class="switch-slider"></span>
            </label>
          </div>

          <!-- 退出登录 -->
          <button class="btn-logout" @click="handleLogout">退出登录</button>
        </div>

        <div class="modal-guest-info" v-else>
          <div class="guest-msg">您当前未登录，登录后体验更多功能</div>
          <button class="btn-login-redirect" @click="redirectToLogin">立即登录</button>
        </div>
      </div>
    </div>

    <!-- 简易通知 Toast 提示 -->
    <div v-if="toastMsg" class="toast-tip">
      <span>{{ toastMsg }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import { templateApi } from '@/api/template'
import { workApi } from '@/api/work'
import { followApi } from '@/api/follow'
import service from '@/utils/request'
import { watch } from 'vue'

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
  // 模拟推荐数据，确保页面有内容展示
  return mockRecommendations.map(m => ({ ...m }))
})

// 过滤后的列表
const filteredItems = computed(() => {
  let list = allItems.value

  // 根据左侧导航类型进行筛选
  if (activeNav.value === 'mine') {
    list = list.filter(item => item.username === authStore.user?.username || (item.author && item.author.username === authStore.user?.username))
  } else if (activeNav.value === 'following') {
    list = list.filter(item => item.type === 'work') // 只展示刚刚拉取的关注作品
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
  // 小屏点击搜索图标 → 聚焦搜索框 (如果可见) 或导航到搜索页
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

const refreshData = async () => {
  try {
    const tplList = await templateApi.getList({ page: 1, pageSize: 60 }) as any
    templates.value = (tplList || []).filter((t: any) => t.status === 1)
    
    if (activeNav.value === 'following' && authStore.isLoggedIn) {
      const workList = await workApi.getFollowingWorks({ page: 1, pageSize: 60 }) as any
      works.value = workList || []
    } else {
      const workList = await workApi.getList({ page: 1, pageSize: 60 }) as any
      works.value = workList || []
    }

    if (authStore.isLoggedIn && authStore.user?.id) {
      const stats = await followApi.getStats(authStore.user.id) as any
      followingCount.value = stats.followingCount || 0
      followersCount.value = stats.followersCount || 0
    }
  } catch (err) {
    console.error('加载数据失败:', err)
  }
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

  // 窗口宽度监听（响应式断点）
  const handleResize = () => { windowWidth.value = window.innerWidth }
  window.addEventListener('resize', handleResize, { passive: true })

  // 滚动监听：回到顶部按钮显隐
  const handleScroll = () => {
    showBackToTop.value = window.scrollY > 100
  }
  window.addEventListener('scroll', handleScroll, { passive: true })

  // IntersectionObserver：检测搜索框是否滚出视野
  // sentinel 位于搜索框顶部，越过 topnav 底部 (72px) 后触发
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
</script>

<style scoped>
.home-layout {
  min-height: 100vh;
  width: 100%;
  display: flex;
  background: #f8fafc;
  color: #1e293b;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "PingFang SC", sans-serif;
  transition: background-color 0.3s, color 0.3s;
  position: relative;
}

.dark-mode {
  background: #09090b;
  color: #f4f4f5;
}

/* ==========================================================================
   左侧侧边栏 - 精致拟物/毛玻璃效果
   ========================================================================== */
.side-bar {
  position: fixed;
  width: 220px;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 30px 20px 24px 20px;
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  background: #ffffff;
  transition: all 0.3s;
}

.dark-mode .side-bar {
  background: #121214;
  border-color: rgba(255, 255, 255, 0.08);
}

.brand-header {
  margin-bottom: 30px;
  cursor: pointer;
}

.brand-logo {
  display: inline-block;
  background: linear-gradient(135deg, #ff2442, #ff6b6b);
  color: white;
  font-size: 16px;
  font-weight: 900;
  padding: 10px 24px;
  border-radius: 99px;
  text-align: center;
  letter-spacing: 1px;
  box-shadow: 0 4px 15px rgba(255, 36, 66, 0.25);
}

/* 导航分类 */
.sidebar-menu {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.menu-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.group-title {
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding-left: 12px;
  margin-bottom: 6px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  width: 100%;
  text-align: left;
  transition: all 0.2s;
}

.dark-mode .menu-item {
  color: #a1a1aa;
}

.menu-item:hover {
  background: rgba(0, 0, 0, 0.03);
  color: #ff2442;
}

.dark-mode .menu-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #ff6b6b;
}

.menu-item.active {
  background: rgba(255, 36, 66, 0.08);
  color: #ff2442;
}

.dark-mode .menu-item.active {
  background: rgba(255, 107, 107, 0.15);
  color: #ff6b6b;
}

.menu-icon {
  font-size: 16px;
}

.menu-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.06);
  margin: 4px 0;
}

.dark-mode .menu-divider {
  background: rgba(255, 255, 255, 0.08);
}

/* 侧边栏底部设置/关于的悬浮菜单 */
.sidebar-bottom {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.dark-mode .sidebar-bottom {
  border-color: rgba(255, 255, 255, 0.08);
}

.bottom-menu-wrapper {
  position: relative;
}

.bottom-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 8px;
  text-align: left;
  width: 100%;
  transition: all 0.2s;
}

.dark-mode .bottom-item {
  color: #a1a1aa;
}

.bottom-item:hover {
  background: rgba(0, 0, 0, 0.03);
  color: #1e293b;
}

.dark-mode .bottom-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #f4f4f5;
}

/* Hover 弹出框样式 */
.hover-dropdown-menu {
  position: absolute;
  left: 100%;
  bottom: 0;
  margin-left: 10px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  width: 210px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
  padding: 8px;
  display: none;
  flex-direction: column;
  gap: 2px;
  animation: popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 110;
}

/* 桥接 Hover 间隙，放大隐形触发区域，防止鼠标沿对角线移出时菜单消失 */
.hover-dropdown-menu::before {
  content: "";
  position: absolute;
  top: -40px;
  bottom: -40px;
  left: -25px;
  width: 45px;
}

.dark-mode .hover-dropdown-menu {
  background: rgba(24, 24, 27, 0.95);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
}

.bottom-menu-wrapper:hover .hover-dropdown-menu {
  display: flex;
}

.dropdown-header {
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  padding: 6px 12px;
  letter-spacing: 0.5px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  font-size: 13px;
  color: #334155;
  background: transparent;
  border: none;
  border-radius: 8px;
  width: 100%;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s;
}

.dark-mode .dropdown-item {
  color: #e4e4e7;
}

.dropdown-item:hover {
  background: rgba(0, 0, 0, 0.04);
  color: #ff2442;
}

.dark-mode .dropdown-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #ff6b6b;
}

.item-icon {
  font-size: 14px;
}

@keyframes popIn {
  from { opacity: 0; transform: translateX(5px); }
  to { opacity: 1; transform: translateX(0); }
}

/* ==========================================================================
   右侧内容容器及头部
   ========================================================================== */
.main-container {
  margin-left: 220px;
  flex-grow: 1;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.top-nav {
  height: 72px;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  padding: 0 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  position: sticky;
  top: 0;
  z-index: 90;
}

.dark-mode .top-nav {
  background: rgba(9, 9, 11, 0.8);
  border-color: rgba(255, 255, 255, 0.06);
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

/* 移动端侧边栏切换按钮（桌面端隐藏） */
.sidebar-toggle-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #64748b;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s, color 0.2s;
}

.sidebar-toggle-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #1e293b;
}

.dark-mode .sidebar-toggle-btn {
  color: #a1a1aa;
}

.dark-mode .sidebar-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f4f4f5;
}

.page-title {
  font-size: 18px;
  font-weight: 800;
  background: linear-gradient(135deg, #1e293b, #475569);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.dark-mode .page-title {
  background: linear-gradient(135deg, #f8fafc, #cbd5e1);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

/* 导航栏内嵌紧凑搜索框 - flex:1 占满 nav-left 和 nav-right 之间的空间 */
.nav-search-inline {
  flex: 1;
  min-width: 0;
  max-width: 360px;
  display: flex;
  justify-content: center;
  align-items: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.nav-search-inline.visible {
  opacity: 1;
  pointer-events: auto;
}

.inline-search-bar {
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 360px;
  height: 36px;
  background: #f1f5f9;
  border: 1.5px solid #e2e8f0;
  border-radius: 18px;
  padding: 0 14px;
  gap: 8px;
  cursor: text;
  transition: border-color 0.2s, background 0.2s;
}

.inline-search-bar:hover {
  border-color: #cbd5e1;
}

.dark-mode .inline-search-bar {
  background: #27272a;
  border-color: #3f3f46;
}

.dark-mode .inline-search-bar:hover {
  border-color: #52525b;
}

.inline-search-placeholder {
  font-size: 13px;
  color: #94a3b8;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dark-mode .inline-search-placeholder {
  color: #71717a;
}

/* 小屏搜索图标按钮（桌面端隐藏） */
.nav-search-mobile {
  display: none;
}

/* VIP标识 */
.vip-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #78350f;
  padding: 4px 12px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 800;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.2);
}

.nav-action-btn {
  background: transparent;
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: background 0.2s;
  color: inherit;
}

.nav-action-btn:hover {
  background: rgba(0, 0, 0, 0.04);
}

.dark-mode .nav-action-btn:hover {
  background: rgba(255, 255, 255, 0.06);
}

.nav-action-icon {
  font-size: 18px;
}

.badge-dot {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 6px;
  height: 6px;
  background-color: #ef4444;
  border-radius: 50%;
}

/* 投稿按钮 */
.btn-upload {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #ff2442;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 10px rgba(255, 36, 66, 0.15);
}

.btn-upload:hover {
  background: #e11d48;
  transform: translateY(-1px);
}

/* 头像 */
.avatar-wrapper {
  cursor: pointer;
  position: relative;
}

.user-avatar-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #8b5cf6, #3b82f6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 14px;
  border: 2px solid white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.dark-mode .user-avatar-btn {
  border-color: #1e1e24;
}

.user-avatar-btn.guest {
  background: #cbd5e1;
  color: #64748b;
}

/* ==========================================================================
   主区域设计
   ========================================================================== */
.main-content-area {
  padding: 0 0 32px;
  padding-top: max(0px, calc(64px));
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

/* Sentinel：IntersectionObserver 检测用，无视觉表现 */
.search-sentinel {
  width: 100%;
  height: 1px;
  pointer-events: none;
  opacity: 0;
}

/* ==========================================================================
   搜索头部：搜索框 + 分类 tab，正常文档流随内容上滚
   ========================================================================== */
.search-sticky-header {
  position: relative;
  z-index: 80;
  background: rgba(248, 250, 252, 0.96);
  backdrop-filter: blur(12px);
  padding: 16px 32px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.dark-mode .search-sticky-header {
  background: rgba(9, 9, 11, 0.96);
  border-color: rgba(255, 255, 255, 0.06);
}

/* ==========================================================================
   搜索框主体 - 小红书风格：聚焦时展开两行，右下角搜索按钮
   ========================================================================== */
.search-hero-bar {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  min-height: 46px;
  background: #ffffff;
  border: 1.5px solid #e8edf2;
  border-radius: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  overflow: visible;
  z-index: 10;
  transition: border-radius 0.25s ease, border-color 0.25s ease;
}

.dark-mode .search-hero-bar {
  background: #18181b;
  border-color: #3f3f46;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

/* 聚焦时底部圆角打开，推荐面板接续形成一体的视觉 */
.search-hero-bar.focused {
  z-index: 20;
  border-radius: 16px 16px 0 0;
  border-color: #ff2442;
  box-shadow: 0 0 0 3px rgba(255, 36, 66, 0.08), 0 1px 4px rgba(0, 0, 0, 0.06);
}

.dark-mode .search-hero-bar.focused {
  border-color: #ff6b6b;
  box-shadow: 0 0 0 3px rgba(255, 107, 107, 0.15), 0 1px 4px rgba(0, 0, 0, 0.2);
}

/* 输入框行（始终显示） */
.search-row-input {
  display: flex;
  align-items: center;
  height: 46px;
  padding: 0 44px 0 16px;
  transition: padding 0.3s ease;
}

.search-hero-bar.focused .search-row-input {
  /* 保持与未聚焦时一致的高度，避免 sticky 区域高度变化导致内容跳动 */
}

/* 操作栏（页面顶部时始终显示，聚焦时显示，滚出后隐藏） */
.search-row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 0;
  opacity: 0;
  overflow: hidden;
  transition: all 0.25s ease;
  padding: 0 0 0 12px;
}

.search-hero-bar.at-top .search-row-actions,
.search-hero-bar.focused .search-row-actions {
  height: 36px;
  opacity: 1;
  padding: 0 0 8px 12px;
}

/* + 创作按钮（操作栏内） */
.search-plus-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.2s, background 0.2s;
  border-radius: 8px;
}

.search-plus-btn:hover {
  background: rgba(255, 36, 66, 0.06);
  color: #ff2442;
}

.dark-mode .search-plus-btn {
  color: #a1a1aa;
}

.dark-mode .search-plus-btn:hover {
  background: rgba(255, 107, 107, 0.1);
  color: #ff6b6b;
}

/* 分隔竖线（操作栏内） */
.search-divider-v {
  width: 1px;
  height: 18px;
  background: #e8edf2;
  flex-shrink: 0;
}

.dark-mode .search-divider-v {
  background: #3f3f46;
}

/* 输入框 */
.search-input-new {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 15px;
  color: inherit;
  height: 100%;
  min-width: 0;
}

.search-input-new::placeholder {
  color: #94a3b8;
  font-size: 14px;
}

.dark-mode .search-input-new::placeholder {
  color: #71717a;
}

/* AI 提示 */
.search-ai-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;
}

.dark-mode .search-ai-hint {
  color: #a1a1aa;
}

.ai-badge {
  display: inline-flex;
  align-items: center;
  background: linear-gradient(135deg, #a78bfa, #6366f1);
  color: white;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  line-height: 1.5;
}

/* 浮动搜索按钮（右下角，位于输入行内） */
.search-btn-float {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  background: #333333;
  border: none;
  border-radius: 50%;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  z-index: 2;
  flex-shrink: 0;
}

.search-btn-float:hover {
  background: #ff2442;
}

.search-hero-bar.focused .search-btn-float {
  width: 36px;
  height: 36px;
}

.dark-mode .search-btn-float {
  background: #3f3f46;
}

.dark-mode .search-btn-float:hover {
  background: #ff6b6b;
}

/* ==========================================================================
   搜索建议面板 - absolute 浮层，视觉上在搜索框内，不挤占布局
   ========================================================================== */
.search-suggestions-inner {
  position: absolute;
  top: calc(100% - 1px); /* 无缝衔接搜索框底部 */
  left: -1.5px;
  right: -1.5px;
  z-index: -1;
  background: #ffffff;
  border: 1.5px solid #ff2442;
  border-top: none;
  border-radius: 0 0 16px 16px;
  box-shadow: 0 0 0 3px rgba(255, 36, 66, 0.08);
  overflow: hidden;
  opacity: 0;
  transform: translateY(-12px);
  pointer-events: none;
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.search-hero-bar.focused .search-suggestions-inner {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.dark-mode .search-suggestions-inner {
  background: #18181b;
  border-color: #ff6b6b;
  box-shadow: 0 0 0 3px rgba(255, 107, 107, 0.15);
}

/* 水平分隔线 */
.suggest-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.06);
  margin: 0 16px;
}

.dark-mode .suggest-divider {
  background: rgba(255, 255, 255, 0.06);
}

.suggest-header {
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
  padding: 14px 20px 6px;
}

.dark-mode .suggest-header {
  color: #71717a;
}

.suggest-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  padding: 4px 12px 16px;
}

.suggest-item {
  display: block;
  width: 100%;
  background: transparent;
  border: none;
  padding: 10px 8px;
  font-size: 14px;
  color: #334155;
  text-align: left;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dark-mode .suggest-item {
  color: #e4e4e7;
}

.suggest-item:hover {
  background: rgba(255, 36, 66, 0.06);
  color: #ff2442;
}

.dark-mode .suggest-item:hover {
  background: rgba(255, 107, 107, 0.1);
  color: #ff6b6b;
}


/* Channel-container 分类 Tab - 居中显示 */
.channel-container {
  display: flex;
  justify-content: center;
  width: 100%;
  margin-top: 40px;
  overflow-x: auto;
  scrollbar-width: none;
}

.channel-container::-webkit-scrollbar {
  display: none;
}

.dark-mode .channel-container {
  border-color: rgba(255, 255, 255, 0.05);
}

.channel-inner {
  display: flex;
  gap: 0;
  flex-shrink: 0;
}

.channel-tag {
  background: transparent;
  border: none;
  padding: 10px 20px;
  font-size: 14.5px;
  font-weight: 700;
  color: #64748b;
  cursor: pointer;
  position: relative;
  transition: color 0.2s;
  white-space: nowrap;
}

.dark-mode .channel-tag {
  color: #a1a1aa;
}

.channel-tag:hover {
  color: #ff2442;
}

.dark-mode .channel-tag:hover {
  color: #ff6b6b;
}

.channel-tag.active {
  color: #1e293b;
}

.dark-mode .channel-tag.active {
  color: #f4f4f5;
}

.channel-tag.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 20%;
  right: 20%;
  height: 3px;
  background: #ff2442;
  border-radius: 99px 99px 0 0;
}

.dark-mode .channel-tag.active::after {
  background: #ff6b6b;
}

/* ==========================================================================
   瀑布流及卡片设计
   ========================================================================== */
.content-container {
  flex-grow: 1;
  padding: 20px 32px 0;
}

.waterfall-grid {
  column-count: 4;
  column-gap: 20px;
}

@media (max-width: 1200px) {
  .waterfall-grid {
    column-count: 3;
  }
}

@media (max-width: 900px) {
  .waterfall-grid {
    column-count: 2;
  }
}

@media (max-width: 600px) {
  .waterfall-grid {
    column-count: 1;
  }
}

.card {
  break-inside: avoid;
  margin-bottom: 20px;
  background: #ffffff;
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  border: 1px solid rgba(0, 0, 0, 0.04);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.01), 0 2px 4px -1px rgba(0, 0, 0, 0.006);
}

.dark-mode .card {
  background: #18181b;
  border-color: #27272a;
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.05);
}

.card-image {
  position: relative;
  overflow: hidden;
}

.card-image img {
  width: 100%;
  display: block;
  object-fit: cover;
}

.card-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(255, 36, 66, 0.9);
  backdrop-filter: blur(4px);
  color: white;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
}

.card-info {
  padding: 16px;
}

.card-title {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.5;
  color: inherit;
  margin-bottom: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-author {
  display: flex;
  align-items: center;
  gap: 8px;
}

.author-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff2442, #ff8b63);
  color: white;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.author-name {
  font-size: 12.5px;
  font-weight: 500;
  color: #64748b;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dark-mode .author-name {
  color: #a1a1aa;
}

.card-likes {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #94a3b8;
  transition: color 0.2s;
}

.card-likes:hover {
  color: #ef4444;
}

.card-likes svg {
  transition: fill 0.2s;
}

.card-likes:hover svg {
  fill: #ef4444;
  stroke: #ef4444;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 80px 20px;
}

.empty-icon {
  font-size: 54px;
  margin-bottom: 16px;
}

.empty-text {
  color: #64748b;
  font-size: 14px;
  margin-bottom: 20px;
}

.empty-btn {
  padding: 10px 28px;
  border-radius: 20px;
  background: #ff2442;
  color: #ffffff;
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  transition: all 0.2s;
  box-shadow: 0 4px 10px rgba(255, 36, 66, 0.2);
}

.empty-btn:hover {
  background: #e11d48;
}

/* ==========================================================================
   用户信息弹出卡片 (Modal)
   ========================================================================== */
.modal-overlay {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.profile-modal-card {
  width: 380px;
  background: #ffffff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  animation: zoomIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.dark-mode .profile-modal-card {
  background: #18181b;
  color: #f4f4f5;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
}

@keyframes zoomIn {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.dark-mode .modal-header {
  border-color: rgba(255, 255, 255, 0.06);
}

.modal-header h3 {
  font-size: 15px;
  font-weight: 800;
}

.close-btn {
  background: transparent;
  border: none;
  font-size: 22px;
  cursor: pointer;
  color: #94a3b8;
}

.close-btn:hover {
  color: #ff2442;
}

.modal-user-info {
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.user-main {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-modal-avatar {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: linear-gradient(135deg, #8b5cf6, #3b82f6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 800;
}

.user-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.user-meta .username {
  font-size: 16px;
  font-weight: 800;
}

.vip-status {
  font-size: 11px;
  font-weight: 700;
  color: #d97706;
}

.guest-status {
  font-size: 11px;
  color: #64748b;
}

/* 关注粉丝数 */
.social-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: #f8fafc;
  padding: 12px;
  border-radius: 12px;
  text-align: center;
}

.dark-mode .social-stats {
  background: #27272a;
}

.stat-item {
  display: flex;
  flex-direction: column;
  cursor: pointer;
}

.stat-val {
  font-size: 16px;
  font-weight: 800;
}

.stat-lbl {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

.dark-mode .stat-lbl {
  color: #a1a1aa;
}

/* 选项列表 */
.modal-menu-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.modal-menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: transparent;
  border: none;
  font-size: 13.5px;
  font-weight: 600;
  color: inherit;
  width: 100%;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s;
}

.modal-menu-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

.dark-mode .modal-menu-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

/* 登录设置 */
.login-settings {
  padding-top: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.dark-mode .login-settings {
  border-color: rgba(255, 255, 255, 0.06);
}

.setting-switch-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  position: relative;
}

.switch-checkbox {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 20px;
  background-color: #cbd5e1;
  border-radius: 20px;
  transition: .3s;
}

.dark-mode .switch-slider {
  background-color: #3f3f46;
}

.switch-slider::before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  border-radius: 50%;
  transition: .3s;
}

.switch-checkbox:checked + .switch-slider {
  background-color: #10b981;
}

.switch-checkbox:checked + .switch-slider::before {
  transform: translateX(20px);
}

.btn-logout {
  background: #fef2f2;
  color: #ef4444;
  border: none;
  height: 40px;
  border-radius: 12px;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
}

.dark-mode .btn-logout {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.btn-logout:hover {
  background: #fee2e2;
}

.dark-mode .btn-logout:hover {
  background: rgba(239, 68, 68, 0.2);
}

/* 游客登录导向 */
.modal-guest-info {
  padding: 30px 20px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.guest-msg {
  font-size: 13.5px;
  color: #64748b;
}

.btn-login-redirect {
  background: #ff2442;
  color: white;
  border: none;
  height: 40px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-login-redirect:hover {
  background: #e11d48;
}

/* ==========================================================================
   Toast 提示
   ========================================================================== */
.toast-tip {
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 10px 24px;
  border-radius: 99px;
  font-size: 13px;
  font-weight: 600;
  z-index: 999;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
  animation: fadeInUp 0.25s ease-out;
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translate(-50%, 10px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

/* ==========================================================================
   移动端侧边栏遮罩 + 响应式布局
   ========================================================================== */

/* 回到顶部浮动按钮 */
.back-to-top-btn {
  position: fixed;
  bottom: 32px;
  right: 32px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 85;
  transition: all 0.25s ease;
}

.back-to-top-btn:hover {
  background: #ff2442;
  color: #ffffff;
  border-color: #ff2442;
  box-shadow: 0 6px 20px rgba(255, 36, 66, 0.25);
  transform: translateY(-2px);
}

.dark-mode .back-to-top-btn {
  background: #27272a;
  border-color: #3f3f46;
  color: #a1a1aa;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
}

.dark-mode .back-to-top-btn:hover {
  background: #ff2442;
  color: #ffffff;
  border-color: #ff2442;
}

/* 侧边栏遮罩层（小屏点击展开侧边栏时显示） */
.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 99;
  animation: overlayFadeIn 0.2s ease;
}

@keyframes overlayFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 移动端最大宽度断点：≤1024px */
@media (max-width: 1024px) {
  /* 侧边栏 → 定位到左侧叠加层（off-canvas） */
  .side-bar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 101;
    transform: translateX(-100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: none;
  }

  /* sidebarOpen 为 true 时滑入 */
  .home-layout:has(.sidebar-overlay) .side-bar,
  .side-bar.open {
    transform: translateX(0);
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.15);
  }

  /* 绑定 sidebarOpen 到 overlay 来控制侧边栏滑入 */
  /* 使用相邻兄弟选择器：overlay 存在时侧边栏滑入 */

  /* 主容器去掉左边距 */
  .main-container {
    margin-left: 0 !important;
  }

  /* 显示侧边栏切换按钮 */
  .sidebar-toggle-btn {
    display: flex;
  }

  /* 隐藏 page-title（移动端空间有限，用侧边栏展开替代） */
  .page-title {
    display: none;
  }

  /* 小屏 nav-search-inline 已在 JS 中通过 windowWidth >= 760 控制 */

  /* topnav 缩小内边距 */
  .top-nav {
    padding: 0 16px;
    height: 56px;
  }

  /* 搜索头部跟随缩小内边距 */
  .search-sticky-header {
    padding: 12px 16px 0;
  }

  /* 小屏去掉大量顶部留白 */
  .main-content-area {
    padding-top: 0;
  }

  /* 内容区减小内边距 */
  .content-container {
    padding: 16px 16px 0;
  }

  /* 投稿按钮文字隐藏，只留图标 */
  .btn-upload span:last-child {
    display: none;
  }

  .btn-upload {
    padding: 8px 12px;
    border-radius: 50%;
    width: 36px;
    height: 36px;
    justify-content: center;
  }

  /* VIP 标识在小屏隐藏 */
  .vip-badge {
    display: none;
  }

  /* 头像缩小 */
  .user-avatar-btn {
    width: 32px;
    height: 32px;
    font-size: 12px;
  }

  /* 导航操作按钮缩小间距 */
  .nav-right {
    gap: 8px;
  }

  .nav-action-btn {
    width: 36px;
    height: 36px;
  }

  /* 回到顶部按钮缩小并靠边 */
  .back-to-top-btn {
    bottom: 20px;
    right: 16px;
    width: 40px;
    height: 40px;
  }
}

/* 手机端 (< 760px)：放大镜图标替代 topnav 搜索框 */
@media (max-width: 759px) {
  .nav-search-mobile {
    display: flex;
  }

  .nav-search-inline {
    display: none !important;
  }
}

/* 平板端：隐藏侧边栏但保留一定页面宽度 */
@media (min-width: 769px) and (max-width: 1024px) {
  .main-content-area {
    padding-top: 0;
  }

  .top-nav {
    padding: 0 24px;
  }

  .search-sticky-header {
    padding: 16px 24px 0;
  }

  .content-container {
    padding: 20px 24px 0;
  }
}

/* 小手机端额外微调 */
@media (max-width: 480px) {
  .top-nav {
    padding: 0 12px;
    height: 52px;
  }

  .search-sticky-header {
    padding: 10px 12px 0;
  }

  .content-container {
    padding: 12px 12px 0;
  }

  .search-hero-bar {
    min-height: 40px;
    border-radius: 10px;
  }

  .search-input-new {
    font-size: 14px;
  }

  .search-btn-float {
    width: 28px;
    height: 28px;
    right: 6px;
  }

  .channel-tag {
    padding: 8px 14px;
    font-size: 13px;
  }
}
</style>
