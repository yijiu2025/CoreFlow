<template>
  <div class="avatar-hover-card">
    <!-- 用户基本信息 -->
    <div class="card-user-info" @click="goToMyWorks">
      <img :src="authStore.safeAvatar" alt="avatar" class="card-avatar" />
      <div class="card-user-detail">
        <div class="card-username">{{ authStore.userProfile?.username || authStore.user?.username || '用户' }}</div>
        <div class="card-social-stats">
          <span
            >关注 <strong class="stat-highlight">{{ authStore.followingCount }}</strong></span
          >
          <span class="social-divider">|</span>
          <span
            >粉丝 <strong class="stat-highlight">{{ authStore.followersCount }}</strong></span
          >
        </div>
      </div>
    </div>

    <!-- 导航菜单 -->
    <!-- 导航菜单 -->
    <div class="card-menu-list">
      <!-- 我的喜欢 (带3个缩略图) -->
      <div class="card-menu-group" @click="goToTab('likes')">
        <div class="card-menu-title">
          <span class="title-left"><Heart :size="14" /> 我的喜欢</span>
          <span class="card-menu-count">
            {{ authStore.likedWorksCount }}
            <svg class="arrow-svg" viewBox="0 0 24 24" width="14" height="14">
              <path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
            </svg>
          </span>
        </div>
        <div class="card-thumbnails-wrapper">
          <div class="card-likes-thumbnails">
            <div v-for="item in authStore.myLikes.slice(0, 3)" :key="item.id" class="thumb-item">
              <img :src="item.thumbnail_url" alt="thumb" class="thumb-img" />
              <span class="thumb-title">{{ item.title }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 我的收藏 (带3个缩略图) -->
      <div class="card-menu-group" @click="goToTab('collect')">
        <div class="card-menu-title">
          <span class="title-left"><Star :size="14" /> 我的收藏</span>
          <span class="card-menu-count">
            {{ authStore.collectsCount }}
            <svg class="arrow-svg" viewBox="0 0 24 24" width="14" height="14">
              <path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
            </svg>
          </span>
        </div>
        <div class="card-thumbnails-wrapper">
          <div class="card-likes-thumbnails">
            <div v-for="item in authStore.myCollects.slice(0, 3)" :key="item.id" class="thumb-item">
              <img :src="item.thumbnail_url" alt="thumb" class="thumb-img" />
              <span class="thumb-title">{{ item.title }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 观看历史 (带3个缩略图) -->
      <div class="card-menu-group" @click="goToTab('history')">
        <div class="card-menu-title">
          <span class="title-left"><Clock :size="14" /> 观看历史</span>
          <span class="card-menu-count">
            {{ authStore.historyText }}
            <svg class="arrow-svg" viewBox="0 0 24 24" width="14" height="14">
              <path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
            </svg>
          </span>
        </div>
        <div class="card-thumbnails-wrapper">
          <div class="card-likes-thumbnails">
            <div v-for="item in historyList" :key="item.id" class="thumb-item">
              <img :src="item.thumbnail_url" alt="thumb" class="thumb-img" />
              <span class="thumb-title">{{ item.title }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 稍后再看 (带3个缩略图) -->
      <div class="card-menu-group" @click="goToTab('watch-later')">
        <div class="card-menu-title">
          <span class="title-left"><Clapperboard :size="14" /> 稍后再看</span>
          <span class="card-menu-count">
            {{ authStore.watchLaterCount }}
            <svg class="arrow-svg" viewBox="0 0 24 24" width="14" height="14">
              <path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
            </svg>
          </span>
        </div>
        <div class="card-thumbnails-wrapper">
          <div class="card-likes-thumbnails">
            <div v-for="item in watchLaterList" :key="item.id" class="thumb-item">
              <img :src="item.thumbnail_url" alt="thumb" class="thumb-img" />
              <span class="thumb-title">{{ item.title }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 我的作品 (带3个缩略图) -->
      <div class="card-menu-group" @click="goToTab('works')">
        <div class="card-menu-title">
          <span class="title-left"><Play :size="14" /> 我的作品</span>
          <span class="card-menu-count">
            {{ authStore.worksCount || 14 }}
            <svg class="arrow-svg" viewBox="0 0 24 24" width="14" height="14">
              <path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
            </svg>
          </span>
        </div>
        <div class="card-thumbnails-wrapper">
          <div class="card-likes-thumbnails">
            <div v-for="item in authStore.myWorks.slice(0, 3)" :key="item.id" class="thumb-item">
              <img :src="item.thumbnail_url" alt="thumb" class="thumb-img" />
              <span class="thumb-title">{{ item.title }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card-menu-item" @click="$emit('showToast', '我的预约')">
        <Bell class="menu-icon" :size="15" />
        <span>我的预约</span>
      </div>

      <div class="card-menu-item" @click="$emit('showToast', '我的订单')">
        <FileText class="menu-icon" :size="15" />
        <span>我的订单</span>
      </div>
    </div>

    <!-- 底部动作 -->
    <div class="card-footer">
      <button class="btn-card-logout" @click="handleLogout">
        <svg
          class="logout-icon"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
        <span>退出登录</span>
      </button>
      <div class="card-save-login" :class="{ 'is-disabled': !authStore.isLoggedIn }">
        <span>保存登录信息</span>
        <label class="card-switch">
          <input
            type="checkbox"
            v-model="saveLoginState"
            :disabled="!authStore.isLoggedIn"
            @change="onSaveLoginChange"
          />
          <span class="card-slider"></span>
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { Heart, Star, Clock, Clapperboard, Play, Bell, FileText } from 'lucide-vue-next';

const router = useRouter();
const authStore = useAuthStore();

const saveLoginState = computed({
  get: () => authStore.saveLoginInfo,
  set: val => authStore.updateSaveLoginInfo(val)
});

const historyList = ref<any[]>([]);

const watchLaterList = ref<any[]>([]);

const emit = defineEmits<{
  (e: 'showToast', msg: string): void;
}>();

const onSaveLoginChange = () => {
  emit('showToast', saveLoginState.value ? '已开启保存登录信息' : '已关闭保存登录信息');
};

const goToMyWorks = () => {
  router.push('/mine');
};

const goToTab = (tabName: string) => {
  router.push({ path: '/mine', query: { tab: tabName } });
};

const handleLogout = async () => {
  // 先清后端 session + 前端用户数据（savedAccounts 保留，供弹窗显示可切账号）
  await authStore.logout();
  // 跳首页（离开受保护路由避免守卫二次弹窗）+ 弹切换登录弹窗（显示已登录账号可免切回）
  router.push('/');
  authStore.openLoginModal();
  emit('showToast', '已退出登录');
};
</script>

<style scoped>
.avatar-hover-card {
  position: absolute;
  top: calc(100% - 4px);
  right: -10px;
  width: 320px;
  background: #ffffff;
  color: #1e293b;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);
  border: 1px solid #e2e8f0;
  padding: 20px;
  z-index: 250;
  animation: cardFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
  overflow-x: hidden;
  display: none;
}

.dark-mode .avatar-hover-card {
  background: #222228;
  color: #f4f4f5;
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
}

@keyframes cardFadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 用户基本信息 */
.card-user-info {
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  margin-bottom: 20px;
}

.card-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid #e2e8f0;
}

.dark-mode .card-avatar {
  border-color: #3f3f46;
}

.card-user-detail {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-username {
  font-size: 16px;
  font-weight: 850;
  color: inherit;
}

.card-social-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #64748b;
}

.dark-mode .card-social-stats {
  color: #a1a1aa;
}

.stat-highlight {
  font-weight: 700;
  color: #0f172a;
}

.dark-mode .stat-highlight {
  color: #ffffff;
}

.social-divider {
  color: #e2e8f0;
}

.dark-mode .social-divider {
  color: #3f3f46;
}

/* 导航菜单 */
.card-menu-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 380px;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
}

/* 滚动条 */
.card-menu-list::-webkit-scrollbar {
  width: 4px;
}
.card-menu-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 99px;
}
.dark-mode .card-menu-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
}

/* 我的喜欢组合卡片 */
.card-menu-group {
  display: flex;
  flex-direction: column;
  gap: 0px;
  background: #f8fafc;
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
  transition:
    background 0.2s,
    all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;
}

.dark-mode .card-menu-group {
  background: rgba(255, 255, 255, 0.03);
}

.card-menu-group:hover {
  background: #f1f5f9;
}

.dark-mode .card-menu-group:hover {
  background: rgba(255, 255, 255, 0.06);
}

/* 缩略图动画包装容器 */
.card-thumbnails-wrapper {
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  transition:
    max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.25s ease,
    margin-top 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  margin-top: 0;
  width: 100%;
}

.card-menu-group:hover .card-thumbnails-wrapper {
  max-height: 140px;
  opacity: 1;
  margin-top: 12px;
}

.card-menu-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13.5px;
  font-weight: 700;
  width: 100%;
}

.card-menu-count {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  color: #64748b;
}

.dark-mode .card-menu-count {
  color: #a1a1aa;
}

.arrow-svg {
  opacity: 0.7;
  transition: transform 0.3s ease;
}

.card-menu-group:hover .arrow-svg {
  transform: rotate(90deg);
}

.card-likes-thumbnails {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
}

.thumb-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.thumb-img {
  width: 100%;
  height: 100px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.dark-mode .thumb-img {
  border-color: rgba(255, 255, 255, 0.04);
}

.thumb-title {
  font-size: 10.5px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dark-mode .thumb-title {
  color: #a1a1aa;
}

/* 列表单个项目 */
.card-menu-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  background: #f8fafc;
}

.dark-mode .card-menu-item {
  background: rgba(255, 255, 255, 0.03);
}

.card-menu-item:hover {
  background: #f1f5f9;
  transform: translateX(2px);
}

.dark-mode .card-menu-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.menu-icon {
  margin-right: 8px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.menu-value {
  margin-left: auto;
  font-size: 12px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 2px;
}

.dark-mode .menu-value {
  color: #a1a1aa;
}

/* 底部操作 */
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid #e2e8f0;
}

.dark-mode .card-footer {
  border-color: rgba(255, 255, 255, 0.08);
}

.btn-card-logout {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: #ef4444;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 8px;
  transition: background 0.2s;
}

.btn-card-logout:hover {
  background: #fef2f2;
}

.dark-mode .btn-card-logout:hover {
  background: rgba(239, 68, 68, 0.15);
}

.logout-icon {
  flex-shrink: 0;
}

.card-save-login {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #64748b;
}

.dark-mode .card-save-login {
  color: #a1a1aa;
}

/* 未登录时灰显 */
.card-save-login.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

/* Switch 开关样式 */
.card-switch {
  position: relative;
  display: inline-block;
  width: 32px;
  height: 18px;
}

.card-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.card-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #cbd5e1;
  transition: 0.3s;
  border-radius: 20px;
}

.dark-mode .card-slider {
  background-color: #3f3f46;
}

.card-slider:before {
  position: absolute;
  content: '';
  height: 12px;
  width: 12px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

.card-switch input:checked + .card-slider {
  background-color: #ff2442;
}

.card-switch input:checked + .card-slider:before {
  transform: translateX(14px);
}
</style>
