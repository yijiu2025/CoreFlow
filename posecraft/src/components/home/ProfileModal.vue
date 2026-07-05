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

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.profile-modal-card {
  width: 380px;
  background: #ffffff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  animation: zoomIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.dark-mode .profile-modal-card {
  background: #18181b;
  color: #f4f4f5;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
}

@keyframes zoomIn {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.dark-mode .modal-header {
  border-color: rgba(255, 255, 255, 0.06);
}

.modal-header h3 {
  font-size: 15px;
  font-weight: 800;
}

.close-btn {
  background: transparent;
  border: none;
  font-size: 22px;
  cursor: pointer;
  color: #94a3b8;
}

.close-btn:hover {
  color: #ff2442;
}

.modal-user-info {
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.user-main {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-modal-avatar {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: linear-gradient(135deg, #8b5cf6, #3b82f6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 800;
}

.user-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.user-meta .username {
  font-size: 16px;
  font-weight: 800;
}

.vip-status {
  font-size: 11px;
  font-weight: 700;
  color: #d97706;
}

.guest-status {
  font-size: 11px;
  color: #64748b;
}

/* 关注粉丝数 */
.social-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: #f8fafc;
  padding: 12px;
  border-radius: 12px;
  text-align: center;
}

.dark-mode .social-stats {
  background: #27272a;
}

.stat-item {
  display: flex;
  flex-direction: column;
  cursor: pointer;
}

.stat-val {
  font-size: 16px;
  font-weight: 800;
}

.stat-lbl {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

.dark-mode .stat-lbl {
  color: #a1a1aa;
}

/* 选项列表 */
.modal-menu-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.modal-menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: transparent;
  border: none;
  font-size: 13.5px;
  font-weight: 600;
  color: inherit;
  width: 100%;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s;
}

.modal-menu-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

.dark-mode .modal-menu-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

/* 登录设置 */
.login-settings {
  padding-top: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.dark-mode .login-settings {
  border-color: rgba(255, 255, 255, 0.06);
}

.setting-switch-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  position: relative;
}

.switch-checkbox {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 20px;
  background-color: #cbd5e1;
  border-radius: 20px;
  transition: .3s;
}

.dark-mode .switch-slider {
  background-color: #3f3f46;
}

.switch-slider::before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  border-radius: 50%;
  transition: .3s;
}

.switch-checkbox:checked + .switch-slider {
  background-color: #10b981;
}

.switch-checkbox:checked + .switch-slider::before {
  transform: translateX(20px);
}

.btn-logout {
  background: #fef2f2;
  color: #ef4444;
  border: none;
  height: 40px;
  border-radius: 12px;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
}

.dark-mode .btn-logout {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.btn-logout:hover {
  background: #fee2e2;
}

.dark-mode .btn-logout:hover {
  background: rgba(239, 68, 68, 0.2);
}

/* 游客登录导向 */
.modal-guest-info {
  padding: 30px 20px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.guest-msg {
  font-size: 13.5px;
  color: #64748b;
}

.btn-login-redirect {
  background: #ff2442;
  color: white;
  border: none;
  height: 40px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-login-redirect:hover {
  background: #e11d48;
}
</style>
