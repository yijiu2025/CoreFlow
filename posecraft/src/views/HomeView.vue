<template>
  <div class="home-layout" :class="{ 'dark-mode': themeStore.isDark }">
    <!-- 左侧侧边栏导航 -->
    <Sidebar
      v-model:sidebarOpen="sidebarOpen"
      :is-mobile="isMobile"
      @showToast="showToast"
    />

    <!-- 右侧内容容器 -->
    <div class="main-container">
      <!-- 头部通栏 -->
      <TopNav
        v-model:sidebarOpen="sidebarOpen"
        v-model:searchFocused="searchFocused"
        v-model:searchQuery="searchQuery"
        :page-title="getNavTitle()"
        :show-nav-search="activeNav !== 'featured' || showNavSearch"
        :transparent-top="isMinePage && mineAtTop"
        :window-width="windowWidth"
        :is-vip="isVip"
        :search-suggestions="searchSuggestions"
        @showToast="showToast"
        @handleStartCreate="handleStartCreate"
        @toggleProfileModal="toggleProfileModal"
        @goToSearch="goToSearch"
      />

      <!-- 主区域 -->
      <main class="main-content-area">
        <router-view v-slot="{ Component }">
          <keep-alive>
            <component :is="Component" />
          </keep-alive>
        </router-view>
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



    <!-- 系统设置 Modal -->
    <SettingsModal
      v-if="showSettingsModal"
      v-model:showTemplate="showTemplate"
      :active-section="settingsActiveSection"
      @close="showSettingsModal = false"
      @showToast="showToast"
    />

    <!-- 简易通知 Toast 提示 -->
    <div v-if="toastMsg" class="toast-tip">
      <span>{{ toastMsg }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useHome } from '@/composables/useHome'
import Sidebar from '@/components/layouts/home/Sidebar.vue'
import TopNav from '@/components/layouts/home/TopNav.vue'

import SettingsModal from '@/components/modals/home/SettingsModal.vue'

const themeStore = useThemeStore()
const route = useRoute()

// mine 页面 TopNav 透明度：在顶部时透明，滚动后不透明
const mineAtTop = ref(true)
const isMinePage = computed(() => route.path === '/mine' || route.path.endsWith('/mine'))

const onWindowScroll = () => {
  if (isMinePage.value) {
    mineAtTop.value = window.scrollY < 10
  }
}

onMounted(() => window.addEventListener('scroll', onWindowScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', onWindowScroll))

// 路由切换时重置
watch(() => route.path, () => {
  mineAtTop.value = true
})

// 使用主逻辑 Composable
const {
  isMobile,
  sidebarOpen,
  showNavSearch,
  windowWidth,
  searchQuery,
  searchFocused,
  activeNav,
  activeChannel,
  searchSentinel,
  showTemplate,
  showSettingsModal,
  settingsActiveSection,
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
  handleStartCreate,
  openDetail,
  likeItem,
  toggleProfileModal,
  onSearchBlur,
  goToSearch,
  scrollToTop,
  hasMore,
  loading,
  loadMore,
  showBackToTop,
  searchSuggestions
} = useHome()
</script>

<style scoped>
.home-layout {
  min-height: 100vh;
  width: 100%;
  display: flex;
  background: #ffffff;
  color: #1e293b;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "PingFang SC", sans-serif;
  transition: background-color 0.3s, color 0.3s;
  position: relative;
}

.dark-mode {
  background: #121214;
  color: #f4f4f5;
}

.main-container {
  margin-left: 220px;
  flex-grow: 1;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-content-area {
  padding: 72px 0 32px;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.content-container {
  flex-grow: 1;
  padding: 20px 32px 0;
}

.waterfall-grid {
  column-count: 5;
  column-gap: 20px;
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

/* Toast 提示 */
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

/* 侧边栏遮罩层 */
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

@media (max-width: 1024px) {
  .main-container {
    margin-left: 0 !important;
  }

  .main-content-area {
    padding-top: 56px;
  }

  .content-container {
    padding: 16px 16px 0;
  }

  .back-to-top-btn {
    bottom: 20px;
    right: 16px;
    width: 40px;
    height: 40px;
  }
}

@media (min-width: 769px) and (max-width: 1024px) {
  .main-content-area {
    padding-top: 56px;
  }

  .content-container {
    padding: 20px 24px 0;
  }
}

@media (max-width: 480px) {
  .main-content-area {
    padding-top: 52px;
  }

  .content-container {
    padding: 12px 12px 0;
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
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 推荐大图 Banner */
.featured-banner {
  position: relative;
  width: 100%;
  height: 180px;
  border-radius: 20px;
  background-image: linear-gradient(to right, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.4)), url('https://picsum.photos/seed/banner/1200/300');
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
    background-image: linear-gradient(to bottom, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.7)), url('https://picsum.photos/seed/banner/1200/300');
  }

  .banner-btn {
    align-self: flex-start;
  }
}
</style>
