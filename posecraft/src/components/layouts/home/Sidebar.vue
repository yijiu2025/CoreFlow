<template>
  <aside class="side-bar" :class="{ open: sidebarOpen && isMobile }">
    <div class="sidebar-top">
      <!-- Logo -->
      <div class="brand-header" @click="goHome">
        <div class="brand-logo">PoseCraft</div>
      </div>

      <!-- 菜单列表 (分组设计) -->
      <nav class="sidebar-menu">
        <div class="menu-group">
          <span class="group-title">发现</span>
          <button
            @click="navigateTo('/')"
            :class="['menu-item', { active: isActive('/') }]"
          >
            <Gem class="menu-icon" :size="18" />
            <span class="menu-label">精选</span>
          </button>

          <button
            @click="navigateTo('/recommend')"
            :class="['menu-item', { active: isActive('/recommend') }]"
          >
            <Sparkles class="menu-icon" :size="18" />
            <span class="menu-label">推荐</span>
          </button>

          <button
            @click="navigateTo('/nearby')"
            :class="['menu-item', { active: isActive('/nearby') }]"
          >
            <MapPin class="menu-icon" :size="18" />
            <span class="menu-label">附近</span>
          </button>
        </div>

        <div class="menu-divider"></div>

        <div class="menu-group">
          <span class="group-title">社交</span>
          <button
            @click="navigateTo('/following')"
            :class="['menu-item', { active: isActive('/following') }]"
          >
            <Heart class="menu-icon" :size="18" />
            <span class="menu-label">关注</span>
          </button>

          <button
            @click="navigateTo('/friends')"
            :class="['menu-item', { active: isActive('/friends') }]"
          >
            <Users class="menu-icon" :size="18" />
            <span class="menu-label">朋友</span>
          </button>

          <button
            @click="navigateTo('/mine')"
            :class="['menu-item', { active: isActive('/mine') }]"
          >
            <User class="menu-icon" :size="18" />
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
          <Settings class="bottom-icon" :size="16" />
          <span>设置</span>
        </button>
        <div class="hover-dropdown-menu">
          <div class="dropdown-header">系统设置</div>
          <button class="dropdown-item" @click="themeStore.toggleTheme()">
            <Contrast class="item-icon" :size="16" />
            <span>{{ themeStore.isDark ? '浅色模式' : '深色模式' }}</span>
          </button>
          <button class="dropdown-item" @click="openSettings('general')">
            <Wrench class="item-icon" :size="16" />
            <span>通用设置</span>
          </button>
          <button class="dropdown-item" @click="openSettings('ai')">
            <Bot class="item-icon" :size="16" />
            <span>AI设置</span>
          </button>
          <button class="dropdown-item" @click="openSettings('shortcuts')">
            <Keyboard class="item-icon" :size="16" />
            <span>键盘快捷键</span>
          </button>
          <button class="dropdown-item" @click="openSettings('faq')">
            <HelpCircle class="item-icon" :size="16" />
            <span>常见问题</span>
          </button>
          <button class="dropdown-item" @click="$emit('showToast', '我的客服')">
            <Headphones class="item-icon" :size="16" />
            <span>我的客服</span>
          </button>
        </div>
      </div>

      <!-- 关于 -->
      <div class="bottom-menu-wrapper">
        <button class="bottom-item">
          <Info class="bottom-icon" :size="16" />
          <span>关于</span>
        </button>
        <div class="hover-dropdown-menu">
          <div class="dropdown-header">关于我们</div>
          <button class="dropdown-item" @click="$emit('showToast', '关于 PoseCraft')">
            <Sparkles class="item-icon" :size="16" />
            <span>关于 PoseCraft</span>
          </button>
          <button class="dropdown-item" @click="$emit('showToast', '联系我们')">
            <Phone class="item-icon" :size="16" />
            <span>联系我们</span>
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useHome } from '@/composables/useHome'
import {
  Gem, Sparkles, MapPin, Heart, Users, User, Settings, Contrast,
  Wrench, Bot, Keyboard, HelpCircle, Headphones, Info, Phone
} from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const themeStore = useThemeStore()
const { showSettingsModal, settingsActiveSection } = useHome()

const openSettings = (section: string) => {
  settingsActiveSection.value = section
  showSettingsModal.value = true
}

const sidebarOpen = defineModel<boolean>('sidebarOpen', { required: true })

defineProps<{
  isMobile: boolean
}>()

defineEmits<{
  (e: 'showToast', msg: string): void
}>()

const isActive = (path: string) => {
  if (path === '/') {
    return route.path === '/'
  }
  return route.path.startsWith(path)
}

const navigateTo = (path: string) => {
  router.push(path)
}

const goHome = () => {
  router.push('/')
}
</script>

<style scoped>
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
  border-right: none;
  background: #ffffff;
  box-shadow: 1px 0 10px rgba(0, 0, 0, 0.02);
  transition: all 0.3s;
}

.dark-mode .side-bar {
  background: #121214;
  border-right: none;
  box-shadow: 1px 0 10px rgba(0, 0, 0, 0.2);
}

.brand-header {
  margin-bottom: 30px;
  cursor: pointer;
}

.brand-logo {
  display: inline-block;
  color: #1e293b;
  font-size: 20px;
  font-weight: 800;
  text-align: left;
  letter-spacing: -0.5px;
  padding: 6px 12px;
  transition: color 0.3s;
}

.dark-mode .brand-logo {
  color: #ffffff;
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
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

@keyframes popIn {
  from { opacity: 0; transform: translateX(5px); }
  to { opacity: 1; transform: translateX(0); }
}

@media (max-width: 1024px) {
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

  .side-bar.open {
    transform: translateX(0);
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.15);
  }
}
</style>
