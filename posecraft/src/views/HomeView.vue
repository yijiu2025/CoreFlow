<template>
  <div class="home-layout" :class="{ 'dark-mode': themeStore.isDark }">
    <!-- 顶部导航栏 -->
    <header class="top-nav">
      <div class="nav-inner">
        <!-- Logo -->
        <div class="nav-logo" @click="router.push('/')">
          <span class="logo-icon">📸</span>
          <span class="logo-text">PoseCraft</span>
        </div>

        <!-- 搜索栏 -->
        <div class="search-bar">
          <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索姿势、模板、作品..."
            class="search-input"
          />
        </div>

        <!-- 右侧操作 -->
        <div class="nav-actions">
          <button class="nav-btn create-btn" @click="handleStartCreate">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>创作</span>
          </button>
          <button v-if="!authStore.isLoggedIn" class="nav-btn login-btn" @click="router.push('/login')">登录</button>
          <button v-else class="nav-btn avatar-btn" @click="router.push('/profile')">
            <div class="avatar-circle">{{ authStore.user?.username?.charAt(0) || 'U' }}</div>
          </button>
        </div>
      </div>
    </header>

    <!-- 分类标签栏 -->
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

    <!-- 主内容区 -->
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

// 合并模板和作品
const allItems = computed(() => {
  const tplList = templates.value.map(t => ({ ...t, type: 'template' }))
  const workList = works.value.map(w => ({ ...w, type: 'work' }))
  return [...tplList, ...workList]
})

// 过滤后的列表
const filteredItems = computed(() => {
  let list = allItems.value
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
/* 页面布局 */
.home-layout {
  min-height: 100vh;
  background: #f5f5f5;
  color: #333;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.dark-mode {
  background: #0a0a0f;
  color: #e2e8f0;
}

/* 顶部导航 */
.top-nav {
  position: sticky; top: 0; z-index: 100;
  background: #fff;
  border-bottom: 1px solid #eee;
  padding: 0 24px;
}
.dark-mode .top-nav { background: #1a1a2e; border-color: #2a2a3e; }
.nav-inner {
  display: flex; align-items: center; gap: 24px;
  height: 56px; max-width: 1400px; margin: 0 auto;
}
.nav-logo {
  display: flex; align-items: center; gap: 8px;
  cursor: pointer; flex-shrink: 0;
}
.logo-icon { font-size: 24px; }
.logo-text {
  font-size: 18px; font-weight: 700;
  background: linear-gradient(135deg, #6366f1, #a78bfa);
  background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.search-bar {
  flex: 1; max-width: 480px; height: 36px;
  display: flex; align-items: center; gap: 8px;
  background: #f5f5f5; border-radius: 18px;
  padding: 0 16px;
}
.dark-mode .search-bar { background: #2a2a3e; }
.search-icon { color: #999; flex-shrink: 0; }
.search-input {
  flex: 1; border: none; background: transparent;
  outline: none; font-size: 14px; color: inherit;
}
.search-input::placeholder { color: #999; }
.nav-actions {
  display: flex; align-items: center; gap: 12px; flex-shrink: 0;
}
.nav-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 20px;
  border: none; cursor: pointer; font-size: 14px;
  font-weight: 500; transition: all 0.2s;
}
.create-btn {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
}
.create-btn:hover { opacity: 0.9; }
.login-btn {
  background: #f5f5f5; color: #333;
}
.dark-mode .login-btn { background: #2a2a3e; color: #e2e8f0; }
.avatar-btn { padding: 4px; background: transparent; }
.avatar-circle {
  width: 32px; height: 32px; border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #a78bfa);
  color: #fff; font-size: 14px; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
}

/* 分类标签栏 */
.category-bar {
  background: #fff;
  border-bottom: 1px solid #eee;
  padding: 0 24px;
  position: sticky; top: 56px; z-index: 99;
}
.dark-mode .category-bar { background: #1a1a2e; border-color: #2a2a3e; }
.category-inner {
  display: flex; align-items: center; gap: 8px;
  max-width: 1400px; margin: 0 auto;
  padding: 12px 0;
  overflow-x: auto;
}
.category-inner::-webkit-scrollbar { display: none; }
.cat-tag {
  padding: 6px 16px; border-radius: 20px;
  background: #f5f5f5; border: none;
  color: #666; font-size: 13px; font-weight: 500;
  cursor: pointer; white-space: nowrap;
  transition: all 0.2s;
}
.dark-mode .cat-tag { background: #2a2a3e; color: #999; }
.cat-tag:hover { background: #e8e8e8; }
.dark-mode .cat-tag:hover { background: #3a3a4e; }
.cat-tag.active {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
}

/* 主内容区 */
.main-content {
  max-width: 1400px; margin: 0 auto;
  padding: 16px 24px 60px;
}

/* 瀑布流 */
.waterfall-grid {
  column-count: 5;
  column-gap: 16px;
}
@media (max-width: 1400px) { .waterfall-grid { column-count: 4; } }
@media (max-width: 1100px) { .waterfall-grid { column-count: 3; } }
@media (max-width: 768px) { .waterfall-grid { column-count: 2; } }
@media (max-width: 480px) { .waterfall-grid { column-count: 1; } }

/* 卡片 */
.card {
  break-inside: avoid;
  margin-bottom: 16px;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.dark-mode .card { background: #1a1a2e; }
.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.1);
}
.dark-mode .card:hover { box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
.card-image {
  position: relative; width: 100%;
  overflow: hidden;
}
.card-image img {
  width: 100%; display: block;
  object-fit: cover;
}
.card-badge {
  position: absolute; top: 8px; left: 8px;
  background: rgba(99,102,241,0.8); color: #fff;
  padding: 2px 8px; border-radius: 4px;
  font-size: 11px; font-weight: 600;
}
.card-info { padding: 12px; }
.card-title {
  font-size: 14px; font-weight: 600;
  line-height: 1.4; margin-bottom: 8px;
  display: -webkit-box; -webkit-line-clamp: 2;
  line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.card-footer {
  display: flex; align-items: center; justify-content: space-between;
}
.card-author {
  display: flex; align-items: center; gap: 6px;
}
.author-avatar {
  width: 20px; height: 20px; border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #a78bfa);
  color: #fff; font-size: 10px; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
}
.author-name {
  font-size: 12px; color: #666;
  max-width: 80px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.dark-mode .author-name { color: #999; }
.card-likes {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; color: #999;
  cursor: pointer; transition: color 0.2s;
}
.card-likes:hover { color: #ef4444; }
.card-likes svg { transition: fill 0.2s; }
.card-likes:hover svg { fill: #ef4444; stroke: #ef4444; }

/* 空状态 */
.empty-state {
  text-align: center; padding: 80px 20px;
}
.empty-icon { font-size: 48px; margin-bottom: 16px; }
.empty-text { color: #999; margin-bottom: 16px; }
.empty-btn {
  padding: 10px 24px; border-radius: 20px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff; border: none; cursor: pointer;
  font-size: 14px; font-weight: 500;
}
</style>
