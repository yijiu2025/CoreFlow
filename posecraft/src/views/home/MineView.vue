<template>
  <div class="mine-page-container" :class="{ 'dark-mode': themeStore.isDark }">
    <!-- 背景和个人信息区域 -->
    <div class="profile-header-wrapper">
      <div class="profile-bg-cover"></div>
      
      <div class="profile-header-content">
        <!-- 个人圆形头像 -->
        <div class="avatar-wrapper">
          <img src="https://picsum.photos/seed/avatar_wang/150/150" alt="avatar" class="user-avatar" />
        </div>

        <!-- 个人信息详情 -->
        <div class="user-info-main">
          <div class="user-name-row">
            <h1 class="username">摄影小王</h1>
            <span class="edit-icon" @click="showToast('编辑昵称功能后期开放')">🖊️</span>
          </div>

          <div class="stats-row">
            <div class="stat-item">
              <span class="stat-label">关注</span>
              <span class="stat-val">89</span>
            </div>
            <!-- 直播胶囊徽章 -->
            <div class="live-badge">
              <span class="pulse-dot"></span>
              <span>1人正在直播</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">粉丝</span>
              <span class="stat-val">317</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">获赞</span>
              <span class="stat-val">2524</span>
            </div>
          </div>

          <div class="meta-info-row">
            <span>ID: pose_craft_wang</span>
            <span>♂️ 27岁</span>
            <span>北京 · 朝阳</span>
          </div>

          <div class="bio-row">
            <span>✈️ 已保存30+个姿势 | 梦想是成为独立摄影师 📸 | 探索3D骨骼中...</span>
            <span class="bio-more" @click="showToast('点击查看更多签名内容')">更多</span>
          </div>
        </div>

        <!-- 右上角保存登录信息 Switch -->
        <div class="header-right-actions">
          <div class="save-login-switch">
            <span>保存登录信息</span>
            <label class="switch">
              <input type="checkbox" v-model="showLoginSave" @change="onSaveLoginChange" />
              <span class="slider"></span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- 二级导航 Tabs 栏 -->
    <div class="tabs-outer-container">
      <div class="profile-tabs">
        <button 
          @click="activeTab = 'works'" 
          :class="['tab-btn', { active: activeTab === 'works' }]"
        >
          <span>作品</span>
          <span>{{ myWorks.length }}</span>
        </button>
        <button 
          @click="activeTab = 'recommend'" 
          :class="['tab-btn', { active: activeTab === 'recommend' }]"
        >
          <span>推荐</span>
        </button>
        <button 
          @click="activeTab = 'likes'" 
          :class="['tab-btn', { active: activeTab === 'likes' }]"
        >
          <span>喜欢</span>
          <span class="tab-lock">🔒</span>
        </button>
        <button 
          @click="activeTab = 'collect'" 
          :class="['tab-btn', { active: activeTab === 'collect' }]"
        >
          <span>收藏</span>
          <span class="tab-lock">🔒</span>
        </button>
        <button 
          @click="activeTab = 'history'" 
          :class="['tab-btn', { active: activeTab === 'history' }]"
        >
          <span>观看历史</span>
          <span class="tab-lock">🔒</span>
        </button>
        <button 
          @click="activeTab = 'watch-later'" 
          :class="['tab-btn', { active: activeTab === 'watch-later' }]"
        >
          <span>稍后再看</span>
          <span class="tab-lock">🔒</span>
        </button>
      </div>

      <div class="tabs-right-actions">
        <button class="manage-btn" @click="showToast('批量管理已激活')">批量管理</button>
        <div class="tab-search-wrapper">
          <span class="tab-search-icon">🔍</span>
          <input 
            type="text" 
            v-model="searchQuery" 
            placeholder="搜索我发布的作品" 
            class="tab-search-input" 
          />
        </div>
      </div>
    </div>

    <!-- 瀑布流内容区 -->
    <div class="content-container">
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
      </template>
      <template v-else>
        <div class="empty-state">
          <div class="empty-icon">📂</div>
          <div class="empty-text">当前页没有找到相关的作品</div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useHome } from '@/composables/useHome'
import { useThemeStore } from '@/stores/theme'
import PoseCard from '@/components/home/PoseCard.vue'

const {
  openDetail,
  likeItem,
  showToast
} = useHome()

const themeStore = useThemeStore()
const activeTab = ref('works')
const showLoginSave = ref(true)
const searchQuery = ref('')

const onSaveLoginChange = () => {
  showToast(showLoginSave.value ? '已开启保存登录信息' : '已关闭保存登录信息')
}

// 我的作品列表
const myWorks = ref([
  {
    id: 'my-1',
    title: '我的WebGL 3D人体动作模板',
    description: '我自己设计保存的3D骨骼姿势，可以免费导出',
    username: '摄影小王',
    likes_count: 23,
    thumbnail_url: 'https://picsum.photos/seed/my1/400/490',
    type: 'template'
  },
  {
    id: 'my-2',
    title: '午后书房阅读抓拍瞬间',
    description: '在阳光照进书架时，安静阅读的自然动作',
    username: '摄影小王',
    likes_count: 15,
    thumbnail_url: 'https://picsum.photos/seed/my2/400/390',
    type: 'work'
  }
])

// 推荐列表
const myRecommends = ref([
  {
    id: 'rec-1',
    title: '法式穿搭九宫格构图分享',
    description: '如何在法式街角拍出高级质感穿搭图',
    username: 'ParisianStyle',
    likes_count: 9821,
    thumbnail_url: 'https://picsum.photos/seed/rec1/400/500',
    type: 'work'
  },
  {
    id: 'rec-2',
    title: '猫咪视角拍摄大片技巧',
    description: '蹲下身子，带你用宠物的眼睛看世界',
    username: '喵星人摄影',
    likes_count: 5431,
    thumbnail_url: 'https://picsum.photos/seed/rec2/400/320',
    type: 'video'
  }
])

// 喜欢列表
const myLikes = ref([
  {
    id: 'like-1',
    title: '复古机车拍照动作指南',
    description: '坐在机车上的 3 个高级姿势，女孩子也能很酷！',
    username: '摄影师小林',
    likes_count: 8740,
    thumbnail_url: 'https://picsum.photos/seed/fol1/400/520',
    type: 'work'
  },
  {
    id: 'like-2',
    title: '极简人像棚拍用光分解',
    description: '经典伦勃朗光布局，小白也能拍出质感肖像',
    username: '构图研究所',
    likes_count: 3205,
    thumbnail_url: 'https://picsum.photos/seed/fol2/400/380',
    type: 'template'
  }
])

// 收藏列表
const myCollects = ref([
  {
    id: 'col-1',
    title: '极限跑酷空翻连贯拆解',
    description: '全网首发超清跑酷细节连拍模板',
    username: '飞檐走壁',
    likes_count: 3201,
    thumbnail_url: 'https://picsum.photos/seed/rec3/400/540',
    type: 'template'
  },
  {
    id: 'col-2',
    title: '夏日海边逆光拍照姿势',
    description: '逆光微风下，轻松抓拍那一抹唯美少女感',
    username: '海边微风',
    likes_count: 7654,
    thumbnail_url: 'https://picsum.photos/seed/rec4/400/480',
    type: 'work'
  }
])

// 过滤后的列表计算
const filteredItems = computed(() => {
  let list: any[] = []
  
  if (activeTab.value === 'works') {
    list = myWorks.value
  } else if (activeTab.value === 'recommend') {
    list = myRecommends.value
  } else if (activeTab.value === 'likes') {
    list = myLikes.value
  } else if (activeTab.value === 'collect') {
    list = myCollects.value
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(item => 
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.description && item.description.toLowerCase().includes(q))
    )
  }

  return list
})
</script>

<style scoped>
.mine-page-container {
  width: 100%;
  display: flex;
  flex-direction: column;
}

/* 个人头部卡片 */
.profile-header-wrapper {
  position: relative;
  width: 100%;
  background: #09090b;
  color: #f4f4f5;
  overflow: hidden;
}

.profile-bg-cover {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: linear-gradient(to bottom, rgba(9, 9, 11, 0.4), rgba(9, 9, 11, 0.98)), url('https://picsum.photos/seed/profile_bg/1200/400');
  background-size: cover;
  background-position: center;
  filter: blur(15px);
  transform: scale(1.1);
  opacity: 0.65;
}

.profile-header-content {
  position: relative;
  z-index: 1;
  padding: 44px 48px 28px;
  display: flex;
  align-items: flex-start;
  gap: 36px;
}

.avatar-wrapper {
  position: relative;
}

.user-avatar {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  border: 4px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
  object-fit: cover;
}

.user-info-main {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.user-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.username {
  font-size: 26px;
  font-weight: 850;
  margin: 0;
  letter-spacing: -0.5px;
}

.edit-icon {
  font-size: 18px;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.edit-icon:hover {
  opacity: 1;
}

.stats-row {
  display: flex;
  align-items: center;
  gap: 20px;
  font-size: 14.5px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-val {
  font-weight: 800;
  font-size: 16px;
}

.stat-label {
  color: rgba(255, 255, 255, 0.6);
}

.live-badge {
  background: #ff2442;
  color: white;
  font-size: 10.5px;
  font-weight: 800;
  padding: 2.5px 8px;
  border-radius: 99px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.pulse-dot {
  width: 5px;
  height: 5px;
  background: white;
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { transform: scale(0.8); opacity: 0.5; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(0.8); opacity: 0.5; }
}

.meta-info-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.5);
}

.bio-row {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  gap: 12px;
}

.bio-more {
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
}

.header-right-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}

.save-login-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.05);
  padding: 6px 14px;
  border-radius: 99px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* Switch 按钮样式 */
.switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.2);
  transition: .3s;
  border-radius: 20px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .3s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: #ff2442;
}

input:checked + .slider:before {
  transform: translateX(16px);
}

/* 二级导航 Tabs */
.tabs-outer-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e2e8f0;
  padding: 0 48px;
  background: white;
}

.dark-mode .tabs-outer-container {
  background: #121214;
  border-color: #27272a;
}

.profile-tabs {
  display: flex;
  gap: 32px;
}

.tab-btn {
  background: none;
  border: none;
  padding: 16px 0;
  font-size: 15px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: color 0.2s;
}

.dark-mode .tab-btn {
  color: #a1a1aa;
}

.tab-btn.active {
  color: #0f172a;
  font-weight: 800;
}

.dark-mode .tab-btn.active {
  color: #f4f4f5;
}

.tab-btn.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: #ff2442;
  border-radius: 9999px;
}

.tab-lock {
  font-size: 11px;
  opacity: 0.6;
}

.tabs-right-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.manage-btn {
  background: #f1f5f9;
  border: none;
  padding: 6px 14px;
  border-radius: 99px;
  font-size: 12.5px;
  font-weight: 700;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
}

.dark-mode .manage-btn {
  background: #27272a;
  color: #cbd5e1;
}

.manage-btn:hover {
  background: #e2e8f0;
}

.tab-search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.tab-search-input {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 6px 14px 6px 32px;
  border-radius: 99px;
  font-size: 12.5px;
  color: #1e293b;
  width: 180px;
  transition: all 0.2s;
}

.dark-mode .tab-search-input {
  border-color: #3f3f46;
  background: #18181b;
  color: #f4f4f5;
}

.tab-search-input:focus {
  outline: none;
  border-color: #cbd5e1;
  background: white;
  width: 220px;
}

.tab-search-icon {
  position: absolute;
  left: 12px;
  color: #94a3b8;
  font-size: 12px;
  pointer-events: none;
}

.content-container {
  padding: 20px 48px 48px;
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
}
</style>
