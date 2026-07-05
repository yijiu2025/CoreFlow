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
          <button class="dropdown-item" @click="$emit('showToast', '通用设置 (包含隐私与通知设置)')">
            <span class="item-icon">🛠️</span>
            <span>通用设置</span>
          </button>
          <button class="dropdown-item" @click="$emit('showToast', 'AI设置')">
            <span class="item-icon">🤖</span>
            <span>AI设置</span>
          </button>
          <button class="dropdown-item" @click="$emit('showToast', '键盘快捷键')">
            <span class="item-icon">⌨️</span>
            <span>键盘快捷键</span>
          </button>
          <button class="dropdown-item" @click="$emit('showToast', '常见问题')">
            <span class="item-icon">❓</span>
            <span>常见问题</span>
          </button>
          <button class="dropdown-item" @click="$emit('showToast', '我的客服')">
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
          <button class="dropdown-item" @click="$emit('showToast', '关于 PoseCraft')">
            <span class="item-icon">✨</span>
            <span>关于 PoseCraft</span>
          </button>
          <button class="dropdown-item" @click="$emit('showToast', '联系我们')">
            <span class="item-icon">📞</span>
            <span>联系我们</span>
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useThemeStore } from '@/stores/theme'

const router = useRouter()
const themeStore = useThemeStore()

// 双向绑定属性
const activeNav = defineModel<string>('activeNav', { required: true })
const sidebarOpen = defineModel<boolean>('sidebarOpen', { required: true })

defineProps<{
  isMobile: boolean
}>()

defineEmits<{
  (e: 'showToast', msg: string): void
}>()

const goHome = () => {
  router.push('/')
}
</script>
