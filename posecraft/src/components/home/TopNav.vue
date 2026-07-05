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
    </div>

    <!-- 桌面端：搜索框滚出视野后，在 topnav 居中显示紧凑搜索 -->
    <div
      class="nav-search-inline"
      :class="{ visible: showNavSearch && windowWidth >= 760 }"
    >
      <div class="inline-search-bar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索姿势模板..."
          class="inline-search-input"
          @focus="navSearchFocused = true"
          @blur="onNavSearchBlur"
        />
      </div>

      <!-- 顶部通栏下拉推荐框 -->
      <div class="nav-suggestions-panel" v-show="navSearchFocused">
        <div class="suggest-list">
          <button
            v-for="word in searchSuggestions.slice(0, 8)"
            :key="word"
            class="suggest-list-item"
            @mousedown.prevent="searchQuery = word; navSearchFocused = false"
          >
            <span v-html="highlightText(word, searchQuery)"></span>
          </button>
        </div>
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

      <!-- VIP标识 -->
      <div v-if="authStore.isLoggedIn && isVip" class="vip-badge-outline">
        <svg class="vip-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/>
          <path d="M3 20h18"/>
        </svg>
        <span class="vip-text">VIP 会员</span>
      </div>

      <!-- 通知 -->
      <button class="nav-action-btn" @click="$emit('showToast', '通知中心')" title="通知">
        <svg class="nav-svg-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <span class="badge-dot"></span>
      </button>

      <!-- 私信 -->
      <button class="nav-action-btn" @click="$emit('showToast', '私信列表')" title="私信">
        <svg class="nav-svg-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>

      <!-- 投稿 -->
      <button class="btn-upload" @click="$emit('handleStartCreate')">
        <svg class="upload-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
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
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

const sidebarOpen = defineModel<boolean>('sidebarOpen', { required: true })
const searchFocused = defineModel<boolean>('searchFocused', { default: false })
const searchQuery = defineModel<string>('searchQuery', { required: true })

defineProps<{
  pageTitle: string
  showNavSearch: boolean
  windowWidth: number
  isVip: boolean
  searchSuggestions: string[]
}>()

const emit = defineEmits<{
  (e: 'showToast', msg: string): void
  (e: 'handleStartCreate'): void
  (e: 'toggleProfileModal'): void
  (e: 'goToSearch'): void
}>()

const navSearchFocused = ref(false)

const onNavSearchBlur = () => {
  setTimeout(() => {
    navSearchFocused.value = false
  }, 150)
}

const highlightText = (text: string, query: string) => {
  if (!query || !query.trim()) {
    return `<span>${text}</span>`
  }
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escapedQuery})`, 'gi')
  return text.replace(regex, '<span class="highlight">$1</span>')
}

const goToSearch = () => {
  emit('goToSearch')
}
</script>

<style scoped>
.top-nav {
  height: 72px;
  background: #ffffff;
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
  background: #121214;
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
  position: relative;
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
.vip-badge-outline {
  display: flex;
  align-items: center;
  gap: 5px;
  border: 1px solid #d97706;
  color: #d97706;
  padding: 4px 14px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 700;
  background: transparent;
  cursor: default;
}

.vip-svg {
  flex-shrink: 0;
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
  top: 8px;
  right: 8px;
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
  background: #1e293b;
  color: white;
  border: none;
  padding: 8px 18px;
  border-radius: 99px;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.25s ease;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
}

.dark-mode .btn-upload {
  background: #27272a;
}

.btn-upload:hover {
  background: #0f172a;
  transform: translateY(-1px);
}

.dark-mode .btn-upload:hover {
  background: #3f3f46;
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

@media (max-width: 1024px) {
  .sidebar-toggle-btn {
    display: flex;
  }

  .page-title {
    display: none;
  }

  .top-nav {
    padding: 0 16px;
    height: 56px;
  }

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

  .vip-badge {
    display: none;
  }

  .user-avatar-btn {
    width: 32px;
    height: 32px;
    font-size: 12px;
  }

  .nav-right {
    gap: 8px;
  }

  .nav-action-btn {
    width: 36px;
    height: 36px;
  }
}

@media (max-width: 759px) {
  .nav-search-mobile {
    display: flex;
  }

  .nav-search-inline {
    display: none !important;
  }
}

@media (min-width: 769px) and (max-width: 1024px) {
  .top-nav {
    padding: 0 24px;
  }
}

@media (max-width: 480px) {
  .top-nav {
    padding: 0 12px;
    height: 52px;
  }
}

.inline-search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  color: inherit;
  height: 100%;
  min-width: 0;
}

.inline-search-input::placeholder {
  color: #94a3b8;
}

.dark-mode .inline-search-input::placeholder {
  color: #71717a;
}

.nav-suggestions-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  padding: 8px 0;
  z-index: 100;
  max-height: 280px;
  overflow-y: auto;
}

.dark-mode .nav-suggestions-panel {
  background: #1f2026;
  border-color: rgba(255, 255, 255, 0.06);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
}

.suggest-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.suggest-list-item {
  display: flex;
  align-items: center;
  width: 100%;
  background: transparent;
  border: none;
  padding: 10px 20px;
  font-size: 13.5px;
  font-weight: 500;
  color: #1e293b;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s;
}

.dark-mode .suggest-list-item {
  color: #ffffff;
}

.suggest-list-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

.dark-mode .suggest-list-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

:deep(.highlight) {
  color: #ff2442;
  font-weight: 700;
}

.dark-mode :deep(.highlight) {
  color: #ff3355;
}
</style>
