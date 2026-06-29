<template>
  <div class="home-layout" :class="{ 'dark-mode': themeStore.isDark }">
    <!-- 左侧侧边栏导航 (小红书比例，164px) -->
    <aside class="side-bar">
      <div class="sidebar-top">
        <!-- Logo -->
        <div class="brand-header" @click="router.push('/')">
          <div class="brand-logo">PoseCraft</div>
        </div>

        <!-- 菜单列表 -->
        <nav class="sidebar-menu">
          <button
            @click="activeResourceType = 'template'"
            :class="['menu-item', { active: activeResourceType === 'template' }]"
          >
            <span class="menu-icon">🏠</span>
            <span class="menu-label">发现</span>
          </button>

          <button
            @click="activeResourceType = 'work'"
            :class="['menu-item', { active: activeResourceType === 'work' }]"
          >
            <span class="menu-icon">✨</span>
            <span class="menu-label">作品</span>
          </button>

          <button @click="handleStartCreate" class="menu-item">
            <span class="menu-icon">➕</span>
            <span class="menu-label">发布</span>
          </button>

          <button class="menu-item">
            <span class="menu-icon">🔔</span>
            <span class="menu-label">通知</span>
          </button>
        </nav>

        <!-- 登录/控制区 -->
        <div class="sidebar-login-wrapper">
          <button v-if="!authStore.isLoggedIn" @click="router.push('/login')" class="btn-xhs-login">
            登录
          </button>
          <button v-else @click="router.push('/profile')" class="btn-xhs-profile">
            我
          </button>
        </div>
      </div>

      <!-- 侧边栏底部 -->
      <div class="sidebar-bottom">
        <button class="bottom-item">
          <span class="bottom-icon">☰</span>
          <span>更多</span>
        </button>
        <button @click="themeStore.toggleTheme()" class="bottom-item">
          <span class="bottom-icon">⚙️</span>
          <span>{{ themeStore.isDark ? '深色' : '浅色' }}</span>
        </button>
      </div>
    </aside>

    <!-- 右侧内容容器 -->
    <div class="main-container">
      <!-- 顶部通栏搜索栏 -->
      <header class="top-nav">
        <div class="nav-inner">
          <div class="search-bar">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索你感兴趣的姿势模板或精彩作品..."
              class="search-input"
            />
          </div>
          <div class="header-right-links">
            <span class="link-item" @click="handleStartCreate">创作中心</span>
            <span class="link-item">业务合作</span>
          </div>
        </div>
      </header>

      <!-- 细粒度过滤分类横向滑条 -->
      <div class="category-bar">
        <div class="category-inner">
          <button
            v-for="cat in categories"
            :key="cat.value"
            @click="activeCategory = cat.value"
            :class="['cat-tag', { active: activeCategory === cat.value }]"
          >
            {{ cat.label }}
          </button>
        </div>
      </div>

      <!-- 主内容瀑布流区 -->
      <main class="main-content">
        <!-- 瀑布流 -->
        <div class="waterfall-grid">
          <div
            v-for="item in filteredItems"
            :key="item.id"
            class="card"
            @click="openDetail(item)"
          >
            <!-- 图片 -->
            <div class="card-image">
              <img :src="item.thumbnail_url || item.image_url || '/placeholder.png'" :alt="item.title" />
              <div v-if="item.type === 'template'" class="card-badge">模板</div>
            </div>
            <!-- 信息 -->
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
        <div v-if="filteredItems.length === 0" class="empty-state">
          <div class="empty-icon">🎨</div>
          <p class="empty-text">暂无内容</p>
          <button class="empty-btn" @click="handleStartCreate">开始创作</button>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import { templateApi } from '@/api/template'
import { workApi } from '@/api/work'

const router = useRouter()
const themeStore = useThemeStore()
const authStore = useAuthStore()

const searchQuery = ref('')
const activeCategory = ref('all')
const activeResourceType = ref('template') // 'template' | 'work'

const templates = ref<any[]>([])
const works = ref<any[]>([])

const categories = [
  { value: 'all', label: '推荐' },
  { value: 'pose', label: '姿势' },
  { value: 'dance', label: '舞蹈' },
  { value: 'yoga', label: '瑜伽' },
  { value: 'sports', label: '运动' },
  { value: 'custom', label: '创意' }
]

// 合并模板和作品并映射标识
const allItems = computed(() => {
  const tplList = templates.value.map(t => ({ ...t, type: 'template' }))
  const workList = works.value.map(w => ({ ...w, type: 'work' }))
  return [...tplList, ...workList]
})

// 过滤后的列表
const filteredItems = computed(() => {
  let list = allItems.value
  
  // 过滤资源类型模板/作品
  list = list.filter(item => item.type === activeResourceType.value)

  if (activeCategory.value !== 'all') {
    list = list.filter(item => item.category === activeCategory.value)
  }
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
  console.log('点赞:', item.id, item.type)
}

const refreshData = async () => {
  try {
    const tplList = await templateApi.getList({ page: 1, pageSize: 60 }) as any
    templates.value = (tplList || []).filter((t: any) => t.status === 1)
    const workList = await workApi.getList({ page: 1, pageSize: 60 }) as any
    works.value = workList || []
  } catch (err) {
    console.error('加载数据失败:', err)
  }
}

onMounted(() => {
  refreshData()
})
</script>

<style scoped>
/* 页面主布局 - 大于 1728px 时两边空白 */
.home-layout {
  min-height: 100vh;
  width: 100%;
  margin: 0 auto;
  max-width: 1728px;
  background: rgb(248, 250, 252);
  color: #333333;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "PingFang SC", sans-serif;
  transition: background-color 0.3s, color 0.3s;
  position: relative;
}

.dark-mode {
  background: #0a0a0f;
  color: #e2e8f0;
}

/* 左侧侧边栏 - 小红书 164px 比例 */
.side-bar {
  position: fixed;
  width: 164px;
  padding-left: 16px;
  padding-right: 16px;
  top: 0;
  bottom: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding-top: 30px;
  padding-bottom: 24px;
  border-right: 1px solid rgba(0, 0, 0, 0.05);
  background: #ffffff;
  transition: background-color 0.3s, border-color 0.3s;
}

.dark-mode .side-bar {
  background: #0a0a0f;
  border-color: rgba(255, 255, 255, 0.08);
}

/* 小于 960px 时隐藏侧边栏 */
@media (max-width: 960px) {
  .side-bar {
    display: none;
  }
  .main-container {
    margin-left: 0 !important;
    width: 100% !important;
  }
}

/* Logo */
.brand-header {
  padding-left: 8px;
  margin-bottom: 24px;
  cursor: pointer;
}

.brand-logo {
  display: inline-block;
  background-color: #ff2442;
  color: white;
  font-size: 13px;
  font-weight: 900;
  padding: 8px 18px;
  border-radius: 99px;
  text-align: center;
  letter-spacing: 0.5px;
}

/* 侧边栏菜单列表 */
.sidebar-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 99px;
  font-size: 14.5px;
  font-weight: 700;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  width: 100%;
  text-align: left;
  transition: background-color 0.2s;
}

.menu-item:hover, .menu-item.active {
  background-color: rgba(0, 0, 0, 0.03);
}

.dark-mode .menu-item:hover, .dark-mode .menu-item.active {
  background-color: rgba(255, 255, 255, 0.06);
}

.menu-icon {
  font-size: 16px;
}

.sidebar-login-wrapper {
  padding: 16px 8px 0;
}

.btn-xhs-login {
  width: 100%;
  height: 38px;
  background-color: #ff2442;
  color: white;
  border: none;
  border-radius: 99px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.btn-xhs-profile {
  width: 100%;
  height: 38px;
  background-color: rgba(0, 0, 0, 0.03);
  color: inherit;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 99px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.dark-mode .btn-xhs-profile {
  background-color: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
}

.sidebar-bottom {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 8px;
}

.bottom-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  color: #666666;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 0;
  text-align: left;
}

.dark-mode .bottom-item {
  color: #999999;
}

.bottom-item:hover {
  color: inherit;
}

/* 右侧内容区域 */
.main-container {
  margin-left: 164px;
  flex-grow: 1;
  min-width: 0;
  width: calc(100% - 164px);
}

/* 顶部导航与搜索 */
.top-nav {
  position: sticky;
  top: 0;
  z-index: 90;
  background: #ffffff;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  padding: 16px 24px 12px;
}

.dark-mode .top-nav {
  background: #0a0a0f;
  border-color: rgba(255, 255, 255, 0.06);
}

.nav-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.search-bar {
  display: flex;
  align-items: center;
  background-color: #f5f5f5;
  border-radius: 99px;
  padding: 0 16px;
  width: 100%;
  max-width: 480px;
  height: 36px;
  margin: 0 auto;
}

.dark-mode .search-bar {
  background-color: #1e1e24;
}

.search-input {
  background: transparent;
  border: none;
  outline: none;
  flex-grow: 1;
  font-size: 13.5px;
  color: inherit;
}

.search-icon {
  color: #999999;
}

.header-right-links {
  display: flex;
  align-items: center;
  gap: 20px;
  font-size: 13.5px;
  color: #666666;
  font-weight: 600;
}

.dark-mode .header-right-links {
  color: #999999;
}

.link-item {
  cursor: pointer;
}

.link-item:hover {
  color: inherit;
}

/* 分类标签栏 */
.category-bar {
  background: #ffffff;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  padding: 0 24px;
  position: sticky;
  top: 64px;
  z-index: 89;
}

.dark-mode .category-bar {
  background: #0a0a0f;
  border-color: rgba(255, 255, 255, 0.06);
}

.category-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  overflow-x: auto;
}

.category-inner::-webkit-scrollbar {
  display: none;
}

.cat-tag {
  padding: 6px 16px;
  border-radius: 20px;
  background: #f5f5f5;
  border: none;
  color: #666666;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.dark-mode .cat-tag {
  background: #1e1e24;
  color: #999999;
}

.cat-tag:hover {
  background: #e8e8e8;
}

.dark-mode .cat-tag:hover {
  background: #2a2a3e;
}

.cat-tag.active {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #ffffff;
}

/* 主内容瀑布流区 */
.main-content {
  padding: 16px 24px 60px;
}

.waterfall-grid {
  column-count: 5;
  column-gap: 16px;
}

@media (max-width: 1400px) {
  .waterfall-grid {
    column-count: 4;
  }
}

@media (max-width: 1100px) {
  .waterfall-grid {
    column-count: 3;
  }
}

@media (max-width: 768px) {
  .waterfall-grid {
    column-count: 2;
  }
}

@media (max-width: 480px) {
  .waterfall-grid {
    column-count: 1;
  }
}

/* 卡片 */
.card {
  break-inside: avoid;
  margin-bottom: 16px;
  background: #ffffff;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  border: 1px solid rgba(0, 0, 0, 0.03);
}

.dark-mode .card {
  background: #1a1a2e;
  border-color: rgba(255, 255, 255, 0.04);
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
}

.card-image {
  position: relative;
  width: 100%;
  overflow: hidden;
}

.card-image img {
  width: 100%;
  display: block;
  object-fit: cover;
}

.card-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(99, 102, 241, 0.8);
  color: #ffffff;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.card-info {
  padding: 12px;
}

.card-title {
  font-size: 13.5px;
  font-weight: 700;
  line-height: 1.4;
  margin-bottom: 8px;
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
  gap: 6px;
}

.author-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #a78bfa);
  color: #ffffff;
  font-size: 10px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.author-name {
  font-size: 12px;
  color: #666666;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dark-mode .author-name {
  color: #999999;
}

.card-likes {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #999999;
  cursor: pointer;
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
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-text {
  color: #999999;
  margin-bottom: 16px;
}

.empty-btn {
  padding: 10px 24px;
  border-radius: 20px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #ffffff;
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}
</style>
