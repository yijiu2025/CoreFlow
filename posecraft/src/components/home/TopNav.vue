<template>
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
      <span class="page-title">{{ pageTitle }}</span>
    </div>

    <!-- 桌面端：搜索框滚出视野后，在 topnav 居中显示紧凑搜索 -->
    <div
      class="nav-search-inline"
      :class="{ visible: showNavSearch && windowWidth >= 760 }"
    >
      <div class="inline-search-bar" @click="goToSearch">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span class="inline-search-placeholder">
          {{ searchQuery.trim() ? searchQuery : '搜索姿势模板...' }}
        </span>
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
      <button class="nav-action-btn" @click="$emit('showToast', '通知中心')" title="通知">
        <span class="nav-action-icon">🔔</span>
        <span class="badge-dot"></span>
      </button>

      <!-- 私信 -->
      <button class="nav-action-btn" @click="$emit('showToast', '私信列表')" title="私信">
        <span class="nav-action-icon">💬</span>
      </button>

      <!-- 投稿 -->
      <button class="btn-upload" @click="$emit('handleStartCreate')">
        <span class="upload-icon">📤</span>
        <span>投稿</span>
      </button>

      <!-- 头像 -->
      <div class="avatar-wrapper" @click="$emit('toggleProfileModal')">
        <div class="user-avatar-btn" v-if="authStore.isLoggedIn">
          {{ (authStore.user?.username || authStore.user?.nickname || 'U').charAt(0).toUpperCase() }}
        </div>
        <div class="user-avatar-btn guest" v-else>
          ?
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

const sidebarOpen = defineModel<boolean>('sidebarOpen', { required: true })
const searchFocused = defineModel<boolean>('searchFocused', { default: false })

defineProps<{
  pageTitle: string
  showNavSearch: boolean
  windowWidth: number
  searchQuery: string
  isVip: boolean
}>()

const emit = defineEmits<{
  (e: 'showToast', msg: string): void
  (e: 'handleStartCreate'): void
  (e: 'toggleProfileModal'): void
  (e: 'goToSearch'): void
}>()

const goToSearch = () => {
  emit('goToSearch')
}
</script>
