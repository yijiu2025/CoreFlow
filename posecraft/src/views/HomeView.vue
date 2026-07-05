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
        :page-title="getNavTitle()"
        :show-nav-search="showNavSearch"
        :window-width="windowWidth"
        :search-query="searchQuery"
        :is-vip="isVip"
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

<style scoped src="@/assets/styles/home-view.css"></style>
