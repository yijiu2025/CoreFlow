<!--
 * 精选频道视图
 *
 * 顶部 SearchHero（搜索框 + 分类 Tab 切换），下方内容区根据频道类型二选一：
 *   - 动态网址频道：iframe 嵌入外部页面
 *   - 普通频道（如 recommend）：推荐 Banner + 瀑布流卡片
 *
 * 支持骨架占位（首次加载）、空状态、加载更多、Banner 跳转。
 * 通过 keep-alive 激活/隐藏生命周期管理 IntersectionObserver sentinel。
 *
 * @author Claude
 * @since 2026-07-13
 -->
<template>
  <div class="featured-page-container">
    <!-- 搜索与分类 Tab (Sticky Area) -->
    <SearchHero
      ref="searchHeroRef"
      v-model:searchQuery="searchQuery"
      v-model:searchFocused="searchFocused"
      v-model:activeChannel="activeChannel"
      :search-suggestions="searchSuggestions"
      :channels="channels"
      :show-nav-search="showNavSearch"
      @blur="onSearchBlur"
      @handleStartCreate="handleStartCreate"
    />

    <!-- 内容区域 -->
    <div class="content-container">
      <!-- 动态网址内容 (iframe) -->
      <div v-if="currentChannelUrl" class="w-full" style="height: calc(100vh - 120px);">
        <iframe :src="currentChannelUrl" class="w-full h-full border-0" sandbox="allow-scripts allow-same-origin"></iframe>
      </div>

      <!-- 瀑布流 -->
      <div v-else>
        <!-- 频道 Banner（仅 has_banner=true 的频道展示，从后端动态渲染） -->
        <template v-if="currentChannelShowBanner && !searchQuery.trim() && activeBanners.length > 0">
          <div
            v-for="banner in activeBanners"
            :key="banner.id"
            class="featured-banner"
            :style="{ backgroundImage: `linear-gradient(to right, rgba(15,23,42,0.95), rgba(15,23,42,0.4)), url(${banner.image_url})` }"
          >
          <div class="banner-content">
            <div class="banner-badge" v-if="banner.badge_text">
              <span class="badge-icon">🏆</span>
              <span>{{ banner.badge_text }}</span>
            </div>
            <h1 class="banner-title">{{ banner.title }}</h1>
            <p class="banner-desc" v-if="banner.description">{{ banner.description }}</p>
          </div>
          <button class="banner-btn" @click="onBannerClick(banner)">
            {{ banner.button_text || '立即探索' }}
          </button>
        </div>
        </template>

        <!-- 首次加载中：骨架占位（瀑布流结构） -->
        <template v-if="loading && filteredItems.length === 0">
          <div class="waterfall-grid">
            <SkeletonCard v-for="n in 8" :key="n" />
          </div>
        </template>

        <!-- 有数据：真实卡片列表 -->
        <template v-else-if="filteredItems.length > 0">
          <div class="waterfall-grid">
            <PoseCard
              v-for="item in filteredItems"
              :key="item._key ?? item.id"
              :item="item"
              @click="openDetail"
              @like="handleLike"
              @collect="handleCollect"
            />
          </div>
          <div class="load-more-container" v-if="hasMore">
            <button class="load-more-btn" @click="loadMore" :disabled="loading">
              <span v-if="loading" class="animate-spin">🔄</span>
              <span>{{ loading ? '加载中...' : '加载更多' }}</span>
            </button>
          </div>
          <div class="load-more-container" v-else>
            <span class="no-more-text">没有更多内容了</span>
          </div>
        </template>

        <!-- 无数据无加载中：空状态 -->
        <template v-else>
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-text">没有找到相关的姿势模板</div>
            <button class="empty-btn" @click="searchQuery = ''">重置搜索</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onActivated, onDeactivated } from 'vue'
import { useHome } from '@/composables/useHome'
import SearchHero from '@/components/widgets/home/SearchHero.vue'
import PoseCard from '@/components/cards/home/PoseCard.vue'
import SkeletonCard from '@/components/cards/home/SkeletonCard.vue'

const {
  searchQuery,
  searchFocused,
  activeChannel,
  searchSuggestions,
  channels,
  showNavSearch,
  filteredItems,
  currentChannel,
  currentChannelUrl,
  currentChannelShowBanner,
  hasMore,
  loading,
  loadMore,
  showToast,
  handleStartCreate,
  openDetail,
  handleLike,
  handleCollect,
  onSearchBlur,
  searchSentinel,
  activeNav,
  activeBanners
} = useHome()

/** 按钮点击：有 link_url 则跳转，否则走 fallback */
const onBannerClick = (banner: any) => {
  if (banner.link_url) window.open(banner.link_url, '_blank')
  else showToast('已进入精选主题页面')
}

// 设置当前导航标识为精选
onMounted(() => {
  activeNav.value = 'featured'
})
// keep-alive 激活时重新设置
onActivated(() => {
  activeNav.value = 'featured'
})
// keep-alive 隐藏时清除 sentinel，避免 IO 继续触发
onDeactivated(() => {
  searchSentinel.value = null
})

const searchHeroRef = ref<any>(null)
watch(
  () => searchHeroRef.value?.sentinelRef,
  (newVal) => {
    searchSentinel.value = newVal
  },
  { immediate: true }
)
</script>

<style scoped>
.featured-page-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  padding-top: 64px;
}

.content-container {
  flex-grow: 1;
  padding: 20px 32px 0;
}

.waterfall-grid {
  column-count: 5;
  column-gap: 20px;
}

@media (max-width: 1200px) {
  .waterfall-grid {
    column-count: 4;
  }
}

@media (max-width: 800px) {
  .waterfall-grid {
    column-count: 3;
  }
}

@media (max-width: 500px) {
  .waterfall-grid {
    column-count: 2;
  }
}

@media (max-width: 320px) {
  .waterfall-grid {
    column-count: 1;
  }
}

.load-more-container {
  display: flex;
  justify-content: center;
  margin: 32px 0 48px;
}

.load-more-btn {
  padding: 10px 24px;
  border: 1px solid #e2e8f0;
  border-radius: 9999px;
  background: white;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.dark-mode .load-more-btn {
  background: #27272a;
  border-color: #3f3f46;
  color: #cbd5e1;
}

.load-more-btn:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #1e293b;
}

.load-more-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.no-more-text {
  color: #94a3b8;
  font-size: 14px;
}

.animate-spin {
  animation: spin 1s linear infinite;
  display: inline-block;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.featured-banner {
  position: relative;
  width: 100%;
  height: 180px;
  border-radius: 20px;
  background-image: linear-gradient(to right, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.4)), url('/posecraft/logo.svg');
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 40px;
  margin-bottom: 28px;
  color: #ffffff;
  overflow: hidden;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
}

.banner-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.banner-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #fbbf24;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.banner-title {
  font-size: 24px;
  font-weight: 850;
  margin: 0;
  letter-spacing: -0.5px;
}

.banner-desc {
  font-size: 13.5px;
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
}

.banner-btn {
  background: #ff2442;
  color: #ffffff;
  border: none;
  padding: 10px 24px;
  border-radius: 99px;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.25s ease;
  box-shadow: 0 4px 15px rgba(255, 36, 66, 0.25);
  flex-shrink: 0;
}

.banner-btn:hover {
  background: #e11d48;
  transform: scale(1.03);
}

@media (max-width: 768px) {
  .featured-banner {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 16px;
    padding: 24px;
    height: auto;
    background-image: linear-gradient(to bottom, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.7)), url('/posecraft/logo.svg');
  }

  .banner-btn {
    align-self: flex-start;
  }
}

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
</style>
