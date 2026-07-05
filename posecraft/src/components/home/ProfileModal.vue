<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="profile-modal-card">
      <div class="modal-header">
        <h3>用户信息</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>

      <div class="modal-user-info" v-if="authStore.isLoggedIn">
        <div class="user-main">
          <div class="user-modal-avatar">
            {{ (authStore.user?.username || authStore.user?.nickname || 'U').charAt(0).toUpperCase() }}
          </div>
          <div class="user-meta">
            <div class="username">{{ authStore.user?.username || authStore.user?.nickname || '用户' }}</div>
            <div class="vip-status" v-if="isVip">👑 VIP 黄金会员</div>
            <div class="guest-status" v-else>普通会员</div>
          </div>
        </div>

        <!-- 关注和粉丝 -->
        <div class="social-stats">
          <div class="stat-item" @click="$emit('showToast', '我的关注')">
            <span class="stat-val">{{ followingCount }}</span>
            <span class="stat-lbl">关注</span>
          </div>
          <div class="stat-item" @click="$emit('showToast', '我的粉丝')">
            <span class="stat-val">{{ followersCount }}</span>
            <span class="stat-lbl">粉丝</span>
          </div>
        </div>

        <!-- 导航菜单列表 -->
        <div class="modal-menu-list">
          <button class="modal-menu-item" @click="$emit('showToast', '我的喜欢')">
            <span class="menu-icon">❤️</span>
            <span>我的喜欢</span>
          </button>
          <button class="modal-menu-item" @click="$emit('showToast', '我的收藏')">
            <span class="menu-icon">⭐</span>
            <span>我的收藏</span>
          </button>
          <button class="modal-menu-item" @click="$emit('showToast', '浏览历史')">
            <span class="menu-icon">🕒</span>
            <span>浏览历史</span>
          </button>
          <button class="modal-menu-item" @click="goToMyWorks">
            <span class="menu-icon">🎨</span>
            <span>我的作品</span>
          </button>
        </div>

        <!-- 保存登录信息开关 -->
        <div class="login-settings">
          <label class="setting-switch-label">
            <span>保存登录信息</span>
            <input type="checkbox" v-model="saveLoginInfo" class="switch-checkbox" />
            <span class="switch-slider"></span>
          </label>
        </div>

        <!-- 退出登录 -->
        <button class="btn-logout" @click="$emit('logout')">退出登录</button>
      </div>

      <div class="modal-guest-info" v-else>
        <div class="guest-msg">您当前未登录，登录后体验更多功能</div>
        <button class="btn-login-redirect" @click="$emit('login')">立即登录</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const saveLoginInfo = defineModel<boolean>('saveLoginInfo', { required: true })

defineProps<{
  isVip: boolean
  followingCount: number
  followersCount: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'showToast', msg: string): void
  (e: 'logout'): void
  (e: 'login'): void
}>()

const goToMyWorks = () => {
  router.push('/profile')
  emit('close')
}
</script>
