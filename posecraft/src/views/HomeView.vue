<template>
  <div class="home-layout" :class="{ 'dark-mode': themeStore.isDark }">
    <!-- 左侧侧边栏导航 -->
    <Sidebar
      v-model:activeNav="activeNav"
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
        :show-nav-search="showNavSearch"
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
            <template v-if="filteredItems.length > 0">
              <div class="waterfall-grid">
                <PoseCard
                  v-for="item in filteredItems"
                  :key="item.id"
                  :item="item"
                  @click="openDetail"
                  @like="likeItem"
                />
              </div>

              <!-- 加载更多 -->
              <div class="load-more-container">
                <button
                  v-if="hasMore"
                  @click="loadMore"
                  :disabled="loading"
                  class="load-more-btn"
                >
                  <span v-if="loading" class="animate-spin">🔄</span>
                  <span>{{ loading ? '加载中...' : '加载更多' }}</span>
                </button>
                <span v-else class="no-more-text">没有更多内容了</span>
              </div>
            </template>

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
    <ProfileModal
      v-if="showProfileModal"
      v-model:saveLoginInfo="saveLoginInfo"
      :is-vip="isVip"
      :following-count="followingCount"
      :followers-count="followersCount"
      @close="showProfileModal = false"
      @showToast="showToast"
      @logout="handleLogout"
      @login="redirectToLogin"
    />

    <!-- 简易通知 Toast 提示 -->
    <div v-if="toastMsg" class="toast-tip">
      <span>{{ toastMsg }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useThemeStore } from '@/stores/theme'
import { useHome } from '@/composables/useHome'
import Sidebar from '@/components/home/Sidebar.vue'
import TopNav from '@/components/home/TopNav.vue'
import SearchHero from '@/components/home/SearchHero.vue'
import PoseCard from '@/components/home/PoseCard.vue'
import ProfileModal from '@/components/home/ProfileModal.vue'

const themeStore = useThemeStore()

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
  showBackToTop,
  searchSuggestions
} = useHome()

// 用于连接 SearchHero 中的 sentinel 节点
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
  padding: 0 0 32px;
  padding-top: max(0px, calc(64px));
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
    padding-top: 0;
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
    padding-top: 0;
  }

  .content-container {
    padding: 20px 24px 0;
  }
}

@media (max-width: 480px) {
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
</style>
