<!--
 * 我的主页（个人中心）
 *
 * 展示用户头像/昵称/简介/统计，提供二级 Tab（作品/模板/推荐/喜欢/收藏/历史/稍后看）
 * 和三级分类（公开/私密/合集/短剧）。支持搜索、日期筛选、编辑资料弹窗、
 * 头像上传、批量管理模式（多选、全选、删除、修改可见性）。
 *
 * @author Claude
 * @since 2026-07-13
 -->
<template>
  <div class="mine-page-container" :class="{ 'dark-mode': themeStore.isDark }">
    <!-- 背景和个人信息区域 (颜色与主页面统一为白底/黑底) -->
    <div class="profile-header-wrapper">
      <div
        class="profile-bg-cover"
        :style="{
          backgroundImage: `${themeStore.isDark ? 'linear-gradient(to left, rgba(18, 18, 20, 0) 10%, rgba(18, 18, 20, 1) 90%)' : 'linear-gradient(to left, rgba(255, 255, 255, 0) 10%, rgba(255, 255, 255, 1) 90%)'}, url(${authStore.safeAvatar})`
        }"
      ></div>

      <div class="profile-header-content">
        <!-- 个人圆形头像 -->
        <div class="avatar-wrapper">
          <img :src="authStore.safeAvatar" alt="avatar" class="user-avatar" />
        </div>

        <!-- 个人信息详情 -->
        <div class="user-info-main">
          <div class="user-name-row">
            <h1 class="username">{{ userProfile?.username || '摄影小王' }}</h1>
            <span class="edit-icon" @click="openEditModal"><Pen :size="16" /></span>
          </div>

          <div class="stats-row">
            <div class="stat-item">
              <span class="stat-label">关注</span>
              <span class="stat-val">{{ followingCount }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">粉丝</span>
              <span class="stat-val">{{ followersCount }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">互关</span>
              <span class="stat-val">{{ mutualCount }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">获赞</span>
              <span class="stat-val">{{ likesCount }}</span>
            </div>
          </div>

          <div class="meta-info-row">
            <span>ID: {{ userProfile?.personal_id || userProfile?.id || '未知ID' }}</span>
            <span v-if="userProfile?.gender || userProfile?.age">
              {{ userProfile?.gender === 1 ? '♂️' : userProfile?.gender === 2 ? '♀️' : '' }}
              {{ userProfile?.age ? userProfile?.age + '岁' : '' }}
            </span>
            <span>{{ userProfile?.city || '北京 · 朝阳' }}</span>
          </div>

          <div class="bio-row" @mouseenter="onBioTooltipEnter" @mouseleave="onBioTooltipLeave">
            <span class="bio-short-text">{{ bioShortText }}</span>
            <span class="bio-more">更多</span>
          </div>
        </div>

        <!-- 右上角保存登录信息 Switch（未登录禁用） -->
        <div class="header-right-actions">
          <div class="save-login-switch" :class="{ 'is-disabled': !authStore.isLoggedIn }">
            <span>保存登录信息</span>
            <label class="switch">
              <input
                type="checkbox"
                :checked="authStore.saveLoginInfo"
                :disabled="!authStore.isLoggedIn"
                @change="onSaveLoginChange"
              />
              <span class="slider"></span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- 二级导航 Tabs 栏 -->
    <div class="tabs-outer-container">
      <div class="profile-tabs">
        <button @click="changeTab('works')" :class="['tab-btn', { active: activeTab === 'works' }]">
          <span>作品</span>
          <span v-if="authStore.worksCount > 0">{{ authStore.worksCount }}</span>
        </button>
        <button @click="changeTab('templates')" :class="['tab-btn', { active: activeTab === 'templates' }]">
          <span>模板</span>
          <span v-if="authStore.templatesCount > 0">{{ authStore.templatesCount }}</span>
        </button>
        <button @click="changeTab('recommend')" :class="['tab-btn', { active: activeTab === 'recommend' }]">
          <span>推荐</span>
        </button>
        <button @click="changeTab('likes')" :class="['tab-btn', { active: activeTab === 'likes' }]">
          <span>喜欢</span>
        </button>
        <button @click="changeTab('collect')" :class="['tab-btn', { active: activeTab === 'collect' }]">
          <span>收藏</span>
        </button>
        <button @click="changeTab('history')" :class="['tab-btn', { active: activeTab === 'history' }]">
          <span>观看历史</span>
        </button>
        <button @click="changeTab('watch-later')" :class="['tab-btn', { active: activeTab === 'watch-later' }]">
          <span>稍后再看</span>
          <span class="tab-lock"><Lock :size="12" /></span>
        </button>
      </div>

      <div class="tabs-right-actions">
        <!-- 批量管理状态控制 -->
        <button class="manage-btn" @click="toggleManageMode">
          {{ isManageMode ? '取消管理' : '批量管理' }}
        </button>
      </div>
    </div>

    <!-- 三级菜单分类栏 (作品/模板Tab 下展示) -->
    <div class="sub-tabs-container" v-if="activeTab === 'works' || activeTab === 'templates'">
      <!-- 左侧三级分类 Tab -->
      <div class="sub-tabs">
        <template v-if="activeTab === 'works'">
          <button :class="['sub-tab-btn', { active: subTab === 'public' }]" @click="subTab = 'public'">作品</button>
          <button :class="['sub-tab-btn', { active: subTab === 'private' }]" @click="subTab = 'private'">
            <span>私密作品</span>
            <span class="sub-lock"><Lock :size="11" /></span>
          </button>
          <button :class="['sub-tab-btn', { active: subTab === 'collection' }]" @click="subTab = 'collection'">
            合集
          </button>
        </template>
        <template v-else-if="activeTab === 'templates'">
          <button :class="['sub-tab-btn', { active: subTab === 'all' }]" @click="subTab = 'all'">模板</button>
          <button :class="['sub-tab-btn', { active: subTab === 'private' }]" @click="subTab = 'private'">
            <span>私密模板</span>
            <span class="sub-lock"><Lock :size="11" /></span>
          </button>
          <button :class="['sub-tab-btn', { active: subTab === 'collected' }]" @click="subTab = 'collected'">
            收藏的模板
          </button>
        </template>
      </div>

      <!-- 右侧日期筛选及搜索框 -->
      <div class="sub-right-actions">
        <div class="tab-search-wrapper">
          <Search class="tab-search-icon" :size="14" />
          <input type="text" v-model="searchQuery" placeholder="搜索我发布的作品" class="tab-search-input" />
        </div>

        <span class="divider-line">|</span>

        <!-- 日期筛选下拉组件 -->
        <div class="date-filter-wrapper">
          <button class="date-filter-btn" @click="showDateDropdown = !showDateDropdown">
            <span><Calendar :size="13" /> {{ dateFilterLabel }}</span>
            <span class="arrow-icon" :class="{ open: showDateDropdown }">▼</span>
          </button>
          <div v-if="showDateDropdown" class="date-dropdown-menu">
            <button @click="selectDateFilter('all', '全部时间')">全部时间</button>
            <button @click="selectDateFilter('week', '近一周')">近一周</button>
            <button @click="selectDateFilter('month', '近一月')">近一月</button>
            <button @click="selectDateFilter('year', '近一年')">近一年</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 瀑布流内容区 -->
    <div class="content-container">
      <!-- 首次加载中：骨架占位 -->
      <template v-if="loading && filteredItems.length === 0">
        <div class="waterfall-grid">
          <SkeletonCard v-for="n in 8" :key="n" />
        </div>
      </template>

      <template v-else-if="filteredItems.length > 0">
        <div class="waterfall-grid">
          <!-- 包裹管理模式的容器 -->
          <div
            v-for="item in filteredItems"
            :key="item.id"
            class="manageable-card-wrapper"
            :class="{ 'manage-active': isManageMode, selected: selectedIds.includes(item.id) }"
            @click="handleCardClick(item)"
          >
            <!-- 遮罩多选框 -->
            <div v-if="isManageMode" class="card-checkbox-overlay">
              <div class="custom-checkbox" :class="{ checked: selectedIds.includes(item.id) }">
                <span v-if="selectedIds.includes(item.id)" class="checkbox-tick">✓</span>
              </div>
            </div>

            <!-- 删除按钮（作品/模板/喜欢/收藏 管理模式） -->
            <button
              v-if="isManageMode && activeTab !== 'recommend'"
              class="card-delete-btn"
              title="删除"
              @click.stop="handleDeleteSingle(item)"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>

            <!-- 取消推荐按钮（推荐 Tab 管理模式） -->
            <button
              v-if="isManageMode && activeTab === 'recommend'"
              class="card-cancel-btn"
              title="取消推荐"
              @click.stop="handleCancelRecommend(item)"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <PoseCard :item="item" @like="handleLike" @collect="handleCollect" />
          </div>
        </div>
      </template>
      <template v-else>
        <div class="empty-state">
          <Folder class="empty-icon" :size="54" />
          <div class="empty-text">当前分类或时间范围内没有找到作品</div>
        </div>
      </template>
    </div>

    <!-- 底部批量管理悬浮操作面板 -->
    <div class="batch-management-bar" :class="{ visible: isManageMode }">
      <div class="batch-bar-content">
        <div class="batch-info">
          已选择 <span class="highlight-count">{{ selectedIds.length }}</span> 项
        </div>
        <div class="batch-actions">
          <button class="batch-btn select-all-btn" @click="toggleSelectAll">
            {{ selectedIds.length === filteredItems.length && filteredItems.length > 0 ? '取消全选' : '全选' }}
          </button>
          <button class="batch-btn privacy-btn" @click="batchChangePrivacy" :disabled="!selectedIds.length">
            公开 / 私密
          </button>
          <button class="batch-btn delete-btn" @click="batchDelete" :disabled="!selectedIds.length">删除</button>
          <button class="batch-btn cancel-btn" @click="exitManageMode">取消</button>
        </div>
      </div>
    </div>
    <!-- 编辑资料弹窗 -->
    <Transition name="modal-fade">
      <div v-if="showEditModal" class="edit-modal-overlay" @click.self="closeEditModal">
        <div class="edit-modal-card" :class="{ 'dark-mode': themeStore.isDark }">
          <!-- 顶部标题栏 -->
          <div class="edit-modal-header">
            <span class="edit-modal-title">编辑资料</span>
            <button class="edit-modal-close" @click="closeEditModal"><X :size="16" /></button>
          </div>

          <!-- 头像修改区域 -->
          <div class="edit-avatar-section">
            <!-- 隐藏文件选择器 -->
            <input
              ref="avatarFileInput"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style="display: none"
              @change="onAvatarFileChange"
            />
            <div class="edit-avatar-wrapper" @click="avatarFileInput?.click()">
              <img
                :src="avatarPreview || editForm.avatar || authStore.safeAvatar"
                alt="avatar"
                class="edit-avatar-img"
              />
              <!-- 上传 loading -->
              <div class="edit-avatar-mask" :class="{ uploading: avatarUploading }">
                <span v-if="avatarUploading" class="avatar-spinner">⟳</span>
                <span v-else class="camera-icon"><Camera :size="20" /></span>
              </div>
            </div>
            <p class="edit-avatar-hint">
              {{ avatarUploading ? '上传中...' : '点击修改头像' }}
            </p>
          </div>

          <!-- 表单字段 -->
          <div class="edit-form-body">
            <!-- 名字 -->
            <div class="edit-field-group">
              <label class="edit-field-label">名字</label>
              <div class="edit-input-wrapper">
                <input
                  v-model="editForm.username"
                  type="text"
                  maxlength="20"
                  class="edit-input"
                  placeholder="请输入昵称"
                />
                <span class="edit-char-count">{{ (editForm.username || '').length }}/20</span>
              </div>
            </div>

            <!-- 简介 -->
            <div class="edit-field-group">
              <label class="edit-field-label">简介</label>
              <textarea
                v-model="editForm.bio"
                maxlength="300"
                rows="5"
                class="edit-textarea"
                placeholder="介绍一下自己吧..."
              ></textarea>
              <span class="edit-bio-count">{{ (editForm.bio || '').length }}/300</span>
            </div>
          </div>

          <!-- 底部按钮 -->
          <div class="edit-modal-footer">
            <button class="edit-btn-cancel" @click="closeEditModal">取消</button>
            <button
              class="edit-btn-save"
              :class="{ saving: editSaving }"
              :disabled="editSaving"
              @click="saveEditProfile"
            >
              {{ editSaving ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 简介 Tooltip 弹窗（脱离文档流独立定位） -->
    <Teleport to="body">
      <BioTooltip ref="bioTooltipRef" :bio-lines="bioLines" :is-dark="themeStore.isDark" />
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, toRef } from 'vue';
import { useRoute } from 'vue-router';
import { useHome } from '@/composables/useHome';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { Pen, Lock, Search, Calendar, Folder, X, Camera } from 'lucide-vue-next';
import PoseCard from '@/components/cards/home/PoseCard.vue';
import SkeletonCard from '@/components/cards/home/SkeletonCard.vue';
import BioTooltip from '@/components/popovers/mine/BioTooltip.vue';
import { userApi } from '@/api/user';
import { workApi } from '@/api/work';
import { templateApi } from '@/api/template';

const route = useRoute();
const authStore = useAuthStore();

const {
  openDetail,
  handleLike,
  handleCollect,
  showToast,
  userProfile,
  followingCount,
  followersCount,
  likesCount,
  mutualCount,
  fetchUserProfile,
  updateUserProfile,
  activeNav,
  loading
} = useHome();

// 页面挂载时加载当前用户的上传作品
onMounted(async () => {
  activeNav.value = 'mine';
  await authStore.fetchMyWorks();
});

const themeStore = useThemeStore();

const activeTab = ref('works');
const subTab = ref<string>('public');

watch(
  () => route.query.tab,
  newTab => {
    if (newTab && typeof newTab === 'string') {
      activeTab.value = newTab;
    }
  },
  { immediate: true }
);
const searchQuery = ref('');

// 日期筛选状态
const dateFilter = ref('all');
const dateFilterLabel = ref('全部时间');
const showDateDropdown = ref(false);

// 批量管理状态
const isManageMode = ref(false);
const selectedIds = ref<string[]>([]);

// 解析简介多行（按换行符分割，与 textarea 输入对齐）
const bioLines = computed(() => {
  const bio = userProfile.value?.bio;
  if (!bio) {
    return [
      '✈️已飞0个国家❗️',
      '梦想是环游世界🌍',
      '中国留子👧',
      '个人存款0.000000千万💵',
      '人生是干饭💤',
      '梦游国家40+ | 我命由我不由天🌚',
      '火锅品鉴师🍪 | 5G冲浪达人🏄',
      'pdd资深买手🛍️ | 草莓🍓狂热粉丝',
      '雅思托福没考📚 清华北大没考📖',
      '国家级证件持有者(身份证)💳'
    ];
  }
  return bio
    .split('\n')
    .map((line: string) => line.trim())
    .filter(Boolean);
});

// 简介缩略：所有行拼接为一行，超过 40 字截断
const bioShortText = computed(() => {
  const bio = userProfile.value?.bio;
  if (!bio) return '✈️已飞0个国家❗️ | 梦想是环游世界🌍 | 中国留子...';
  const joined = bio
    .split('\n')
    .map((l: string) => l.trim())
    .filter(Boolean)
    .join(' | ');
  return joined.length > 40 ? joined.slice(0, 40) + '...' : joined;
});

// 简介 tooltip 定位（absolute 定位，跟随内容滚动）
const bioTooltipRef = ref<any>(null);
const onBioTooltipEnter = (e: MouseEvent) => {
  const comp = bioTooltipRef.value;
  if (!comp) return;
  const el = comp.$el as HTMLElement;
  if (!el) return;
  const row = e.currentTarget as HTMLElement;
  const moreBtn = row.querySelector('.bio-more') as HTMLElement;
  const rect = moreBtn ? moreBtn.getBoundingClientRect() : row.getBoundingClientRect();
  el.style.left = rect.right - 280 + 'px';
  el.style.top = rect.bottom + 8 + 'px';
  el.style.display = 'block';
};
const onBioTooltipLeave = () => {
  const comp = bioTooltipRef.value;
  if (comp && comp.$el) {
    comp.$el.style.display = 'none';
  }
};

const onSaveLoginChange = async (e: Event) => {
  if (!authStore.isLoggedIn) return;
  const target = e.target as HTMLInputElement;
  const want = target.checked; // 用户点击后的目标状态
  const prev = authStore.saveLoginInfo;
  await authStore.updateSaveLoginInfo(want);
  // 成功（值翻转了）才提示；失败 store 已回滚 Switch + alert
  if (authStore.saveLoginInfo !== prev) {
    showToast(authStore.saveLoginInfo ? '已开启保存登录信息' : '已关闭保存登录信息');
  }
};

// 编辑资料弹窗
const showEditModal = ref(false);
const editSaving = ref(false);
const editForm = ref({
  username: '',
  avatar: '',
  bio: ''
});

// 头像相关状态
const avatarFileInput = ref<HTMLInputElement | null>(null);
const avatarPreview = ref(''); // base64 本地预览
const avatarUploading = ref(false); // 上传中状态

/**
 * 选择文件后立即上传到后端，回显新 URL
 */
const onAvatarFileChange = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  // 本地预览
  avatarPreview.value = URL.createObjectURL(file);
  avatarUploading.value = true;

  try {
    const res = (await userApi.uploadAvatar(file)) as any;
    const newUrl = res?.avatar || res;
    if (newUrl) {
      editForm.value.avatar = newUrl;
      // 同步更新 userProfile 头像（头像区域实时变化）
      if (userProfile.value) {
        userProfile.value = { ...userProfile.value, avatar: newUrl };
      }
    }
    showToast('头像上传成功 🎉');
  } catch (err: any) {
    avatarPreview.value = ''; // 回退预览
    showToast(err?.message || '头像上传失败，请重试');
  } finally {
    avatarUploading.value = false;
    // 重置 input 以便重复选同一文件
    if (input) input.value = '';
  }
};

const openEditModal = () => {
  avatarPreview.value = '';
  editForm.value = {
    username: userProfile.value?.username || '',
    avatar: userProfile.value?.avatar || '',
    bio: userProfile.value?.bio || ''
  };
  showEditModal.value = true;
};

const closeEditModal = () => {
  avatarPreview.value = '';
  showEditModal.value = false;
};

/**
 * 保存昵称 + 简介（头像已在上传时实时保存）
 */
const saveEditProfile = async () => {
  editSaving.value = true;
  try {
    const res = (await userApi.updateProfile({
      username: editForm.value.username,
      bio: editForm.value.bio
    })) as any;

    // 更新本地 userProfile
    if (userProfile.value) {
      userProfile.value = {
        ...userProfile.value,
        username: res?.username ?? editForm.value.username,
        bio: res?.bio ?? editForm.value.bio
      };
    }
    showToast('个人资料已保存 ✅');
    showEditModal.value = false;
  } catch (err: any) {
    showToast(err?.message || '保存失败，请重试');
  } finally {
    editSaving.value = false;
  }
};

const myWorks = toRef(authStore, 'myWorks');
const myTemplates = toRef(authStore, 'myTemplates');

// 推荐列表（推荐过的内容，支持取消推荐）
const myRecommends = toRef(authStore, 'myRecommendations');

// 喜欢列表
const myLikes = toRef(authStore, 'myLikes');

// 收藏列表
const myCollects = toRef(authStore, 'myCollects');

// 历史列表
const myHistory = toRef(authStore, 'myHistory');

const changeTab = (tabName: string) => {
  activeTab.value = tabName;
  exitManageMode(); // 切换 Tab 自动退出管理模式

  // 重置子Tab 为默认值
  subTab.value = tabName === 'templates' ? 'all' : 'public';

  // 切换 Tab 时按需加载真实数据
  if (tabName === 'templates') {
    authStore.fetchMyTemplates();
  } else if (tabName === 'works') {
    authStore.fetchMyWorks();
  } else if (tabName === 'recommend') {
    authStore.fetchMyRecommendations();
  } else if (tabName === 'likes') {
    authStore.fetchMyLikes();
  } else if (tabName === 'collect') {
    authStore.fetchMyCollects();
  } else if (tabName === 'history') {
    authStore.fetchMyHistory();
  }
};

// 选择日期筛选
const selectDateFilter = (filterType: string, label: string) => {
  dateFilter.value = filterType;
  dateFilterLabel.value = label;
  showDateDropdown.value = false;
};

// 检查是否在指定日期范围内
const isInDateRange = (dateStr: string) => {
  if (dateFilter.value === 'all') return true;
  const now = new Date();
  const itemDate = new Date(dateStr);
  const diffTime = Math.abs(now.getTime() - itemDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (dateFilter.value === 'week') {
    return diffDays <= 7;
  } else if (dateFilter.value === 'month') {
    return diffDays <= 30;
  } else if (dateFilter.value === 'year') {
    return diffDays <= 365;
  }
  return true;
};

// 切换管理模式
const toggleManageMode = () => {
  isManageMode.value = !isManageMode.value;
  if (!isManageMode.value) {
    selectedIds.value = [];
  }
};

// 退出管理模式
const exitManageMode = () => {
  isManageMode.value = false;
  selectedIds.value = [];
};

// 选中/取消选中卡片
const handleCardClick = (item: any) => {
  if (isManageMode.value) {
    const idx = selectedIds.value.indexOf(item.id);
    if (idx > -1) {
      selectedIds.value.splice(idx, 1);
    } else {
      selectedIds.value.push(item.id);
    }
  } else {
    openDetail(item);
  }
};

// 全选/取消全选
const toggleSelectAll = () => {
  if (selectedIds.value.length === filteredItems.value.length) {
    selectedIds.value = [];
  } else {
    selectedIds.value = filteredItems.value.map(item => item.id);
  }
};

// 批量修改公开/私密状态
const batchChangePrivacy = () => {
  if (!selectedIds.value.length) return;
  myWorks.value = myWorks.value.map(item => {
    if (selectedIds.value.includes(item.id)) {
      return { ...item, is_private: !item.is_private };
    }
    return item;
  });
  showToast(`成功将选中的 ${selectedIds.value.length} 项作品修改了可见性`);
  exitManageMode();
};

// 删除单个作品/模板（调后端 API + 本地移除）
const handleDeleteSingle = async (item: any) => {
  if (!confirm(`确定要删除「${item.title || '该作品'}」吗？删除后不可恢复。`)) return;
  try {
    const id = Number(item.id);
    const isTemplate = item.type === 'template' || activeTab.value === 'templates';
    if (isTemplate) {
      await templateApi.delete(id);
      authStore.templatesCount = Math.max(0, authStore.templatesCount - 1);
    } else {
      await workApi.delete(id);
      authStore.worksCount = Math.max(0, authStore.worksCount - 1);
    }
    removeFromLocalList(id);
    showToast('删除成功');
  } catch (err: any) {
    showToast(err.message || '删除失败');
  }
};

// 取消推荐（推荐 Tab 专用）
const handleCancelRecommend = async (item: any) => {
  try {
    await authStore.cancelRecommendation({
      workId: item.type === 'work' ? Number(item.target_id) : undefined,
      templateId: item.type === 'template' ? Number(item.target_id) : undefined
    });
    showToast('已取消推荐');
  } catch (err: any) {
    showToast(err.message || '取消推荐失败');
  }
};

// 从本地所有列表中移除指定 id 的项
const removeFromLocalList = (id: string | number) => {
  myWorks.value = myWorks.value.filter(w => w.id !== id);
  // 推荐列表按 target_id 匹配（推荐的目标作品/模板 ID）
  myRecommends.value = myRecommends.value.filter(w => w.target_id !== id);
  myLikes.value = myLikes.value.filter(w => w.id !== id);
  myCollects.value = myCollects.value.filter(w => w.id !== id);
  selectedIds.value = selectedIds.value.filter(sid => sid !== id);
};

// 批量删除（调后端 API + 本地移除）
const batchDelete = async () => {
  if (!selectedIds.value.length) return;
  const count = selectedIds.value.length;
  if (!confirm(`确定要删除选中的 ${count} 项内容吗？删除后不可恢复。`)) return;

  // 统计本次删除的作品/模板数量（用于本地更新 Tab 数字）
  let removedWorks = 0;
  let removedTemplates = 0;

  try {
    for (const sid of selectedIds.value) {
      const id = Number(sid);
      const item = filteredItems.value.find(f => Number(f.id) === id);
      if (item?.type === 'template' || activeTab.value === 'templates') {
        await templateApi.delete(id);
        removedTemplates++;
      } else {
        await workApi.delete(id).catch(() => {});
        removedWorks++;
      }
    }
    // 本地同步 Tab 数字
    authStore.worksCount = Math.max(0, authStore.worksCount - removedWorks);
    authStore.templatesCount = Math.max(0, authStore.templatesCount - removedTemplates);
    showToast(`已成功删除选中的 ${count} 项内容`);
    exitManageMode();
  } catch (err: any) {
    showToast(err.message || '删除失败');
  }
};

// 作品数（排除创建模板时自动生成的底图作品）
const realWorksCount = computed(() => myWorks.value.filter(w => w.type !== 'template' && !w.is_template_work).length);

// 过滤后的列表计算
const filteredItems = computed(() => {
  let list: any[] = [];

  if (activeTab.value === 'works') {
    // 作品 Tab：排除创建模板时自动生成的底图作品（is_template_work=true）
    const realWorks = myWorks.value.filter(w => w.type !== 'template' && !w.is_template_work);

    if (subTab.value === 'public') {
      list = realWorks.filter(w => w.status === 1); // 公开
    } else if (subTab.value === 'private') {
      list = realWorks.filter(w => w.status === 0); // 私密
    } else if (subTab.value === 'collection') {
      // 合集：从收藏列表中筛选作品类型
      list = myCollects.value.filter((c: any) => c.work_id);
    }

    // 根据日期范围筛选
    list = list.filter(w => isInDateRange(w.created_at));
  } else if (activeTab.value === 'templates') {
    if (subTab.value === 'all') {
      list = myTemplates.value;
    } else if (subTab.value === 'private') {
      list = myTemplates.value.filter((t: any) => t.status === 0);
    } else if (subTab.value === 'collected') {
      // 收藏的模板：从收藏列表中筛选模板类型
      list = myCollects.value.filter((c: any) => c.template_id);
    }
  } else if (activeTab.value === 'recommend') {
    list = myRecommends.value;
  } else if (activeTab.value === 'likes') {
    list = myLikes.value;
  } else if (activeTab.value === 'collect') {
    list = myCollects.value;
  } else if (activeTab.value === 'history') {
    list = myHistory.value;
  }

  // 搜索关键字筛选
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(
      item =>
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q))
    );
  }

  return list;
});
</script>

<style scoped>
.mine-page-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  /* 背景拉到 TopNav 后面重叠显示 */
  margin-top: -72px;
}

/* 个人头部卡片 (颜色与背景完全融为一体) */
.profile-header-wrapper {
  position: relative;
  width: 100%;
  background: white;
  color: #1e293b;
  overflow: visible;
  border-bottom: 1px solid #f1f5f9;
}

.dark-mode .profile-header-wrapper {
  background: #121214;
  color: #f4f4f5;
  border-color: #27272a;
}

.profile-bg-cover {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  opacity: 0.18;
  pointer-events: none;
}

.dark-mode .profile-bg-cover {
  opacity: 0.12;
}

.profile-header-content {
  position: relative;
  z-index: 1;
  padding: 88px 48px 24px; /* 72px TopNav + 16px 间距 */
  display: flex;
  align-items: flex-start;
  gap: 32px;
}

.user-avatar {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
  object-fit: cover;
}

.dark-mode .user-avatar {
  border-color: #27272a;
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
  font-size: 24px;
  font-weight: 850;
  margin: 0;
  letter-spacing: -0.5px;
}

.edit-icon {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  opacity: 0.7;
}

.edit-icon:hover {
  opacity: 1;
}

.stats-row {
  display: flex;
  align-items: center;
  gap: 20px;
  font-size: 14px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat-val {
  font-weight: 800;
  font-size: 15px;
}

.stat-label {
  color: #64748b;
}

.dark-mode .stat-label {
  color: #a1a1aa;
}

.live-badge {
  background: #ff2442;
  color: white;
  font-size: 10px;
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
  0% {
    transform: scale(0.8);
    opacity: 0.5;
  }
  50% {
    transform: scale(1.2);
    opacity: 1;
  }
  100% {
    transform: scale(0.8);
    opacity: 0.5;
  }
}

.meta-info-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  font-size: 12.5px;
  color: #64748b;
}

.dark-mode .meta-info-row {
  color: #a1a1aa;
}

.bio-row {
  font-size: 12.5px;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 12px;
}

.dark-mode .bio-row {
  color: #cbd5e1;
}

.bio-more {
  color: #64748b;
  cursor: pointer;
  font-weight: 700;
  transition: color 0.2s;
}

.bio-more:hover {
  color: #ff2442;
}

.header-right-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.save-login-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #475569;
  background: #f8fafc;
  padding: 6px 14px;
  border-radius: 99px;
  border: 1px solid #e2e8f0;
}

.dark-mode .save-login-switch {
  color: #cbd5e1;
  background: #18181b;
  border-color: #27272a;
}

/* 未登录时灰显（saveLoginInfo 针对 per-account 当前账号，未登录无意义） */
.save-login-switch.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

/* Switch 拨动开关 */
.switch {
  position: relative;
  display: inline-block;
  width: 34px;
  height: 18px;
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
  background-color: #cbd5e1;
  transition: 0.3s;
  border-radius: 20px;
}

.dark-mode .slider {
  background-color: #3f3f46;
}

.slider:before {
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

input:checked + .slider {
  background-color: #ff2442;
}

input:checked + .slider:before {
  transform: translateX(16px);
}

/* 二级导航 Tabs — 吸附在 TopNav 下方 */
.tabs-outer-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e2e8f0;
  padding: 0 48px;
  background: white;
  position: sticky;
  top: 72px;
  z-index: 89;
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
  display: inline-flex;
  align-items: center;
  opacity: 0.6;
}

.tabs-right-actions {
  display: flex;
  align-items: center;
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

/* 三级导航分类栏 — 吸附在二级 Tabs 下方 */
.sub-tabs-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 48px;
  background: white;
  border-bottom: 1px solid #f8fafc;
  position: sticky;
  top: 120px; /* TopNav(72) + Tabs(~48) */
  z-index: 88;
}

.dark-mode .sub-tabs-container {
  background: #121214;
  border-color: #18181b;
}

.sub-tabs {
  display: flex;
  gap: 8px;
}

.sub-tab-btn {
  border: none;
  background: #f1f5f9;
  color: #475569;
  padding: 5px 12px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}

.dark-mode .sub-tab-btn {
  background: #27272a;
  color: #cbd5e1;
}

.sub-tab-btn:hover {
  background: #e2e8f0;
}

.sub-tab-btn.active {
  background: rgba(255, 36, 66, 0.1);
  color: #ff2442;
  font-weight: 700;
}

.sub-lock {
  display: inline-flex;
  align-items: center;
  opacity: 0.75;
}

.sub-right-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.divider-line {
  color: #e2e8f0;
  font-size: 14px;
}

.dark-mode .divider-line {
  color: #27272a;
}

.tab-search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.tab-search-input {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 6px 14px 6px 30px;
  border-radius: 99px;
  font-size: 12px;
  color: #1e293b;
  width: 160px;
  transition: all 0.2s;
}

.dark-mode .tab-search-input {
  border-color: #3f3f46;
  background: #18181b;
  color: #f4f4f5;
}

.tab-search-input:focus {
  outline: none;
  border-color: #ff2442;
  background: white;
  width: 200px;
}

.tab-search-icon {
  position: absolute;
  left: 10px;
  color: #94a3b8;
  font-size: 11px;
}

/* 日期筛选下拉 */
.date-filter-wrapper {
  position: relative;
}

.date-filter-btn {
  background: none;
  border: none;
  color: #475569;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.dark-mode .date-filter-btn {
  color: #cbd5e1;
}

.date-filter-btn:hover {
  background: #f1f5f9;
}

.dark-mode .date-filter-btn:hover {
  background: #27272a;
}

.arrow-icon {
  font-size: 8px;
  transition: transform 0.2s ease;
}

.arrow-icon.open {
  transform: rotate(180deg);
}

.date-dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
  z-index: 50;
  display: flex;
  flex-direction: column;
  padding: 6px;
  min-width: 110px;
}

.dark-mode .date-dropdown-menu {
  background: #18181b;
  border-color: #27272a;
}

.date-dropdown-menu button {
  border: none;
  background: none;
  padding: 8px 12px;
  font-size: 12.5px;
  color: #475569;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.15s;
}

.dark-mode .date-dropdown-menu button {
  color: #cbd5e1;
}

.date-dropdown-menu button:hover {
  background: #f1f5f9;
  color: #ff2442;
}

.dark-mode .date-dropdown-menu button:hover {
  background: #27272a;
}

/* 瀑布流内容区 */
.content-container {
  padding: 20px 48px 48px;
}

.waterfall-grid {
  column-count: 5;
  column-gap: 20px;
}

@media (max-width: 1200px) {
  .waterfall-grid {
    column-count: 4;
  }
}

@media (max-width: 800px) {
  .waterfall-grid {
    column-count: 3;
  }
}

@media (max-width: 500px) {
  .waterfall-grid {
    column-count: 2;
  }
}

@media (max-width: 320px) {
  .waterfall-grid {
    column-count: 1;
  }
}

/* 批量管理卡片容器包装 */
.manageable-card-wrapper {
  position: relative;
  break-inside: avoid;
  margin-bottom: 16px;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.manageable-card-wrapper.manage-active:hover {
  transform: translateY(-2px);
}

.manageable-card-wrapper.selected {
  outline: 3px solid #ff2442;
  box-shadow: 0 0 15px rgba(255, 36, 66, 0.2);
}

/* 复选框覆盖层 */
.card-checkbox-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.08);
  z-index: 10;
  pointer-events: none;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 10px;
}

.custom-checkbox {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(4px);
  border: 2px solid #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  transition: all 0.2s ease;
}

.custom-checkbox.checked {
  background: #ff2442;
  border-color: #ff2442;
}

.checkbox-tick {
  color: white;
  font-size: 12px;
  font-weight: 900;
}

/* 单个删除按钮 */
.card-delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 36, 66, 0.9);
  backdrop-filter: blur(4px);
  border: none;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 11;
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(255, 36, 66, 0.3);
}
.manageable-card-wrapper:hover .card-delete-btn {
  opacity: 1;
  transform: scale(1);
}
.card-delete-btn:hover {
  background: #e11d48;
  transform: scale(1.1) !important;
}

/* 取消推荐按钮 */
.card-cancel-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(245, 158, 11, 0.9);
  backdrop-filter: blur(4px);
  border: none;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 11;
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
}
.manageable-card-wrapper:hover .card-cancel-btn {
  opacity: 1;
  transform: scale(1);
}
.card-cancel-btn:hover {
  background: #d97706;
  transform: scale(1.1) !important;
}

/* 底部批量管理悬浮操作面板 */
.batch-management-bar {
  position: fixed;
  bottom: -80px; /* 隐藏 */
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 680px;
  height: 64px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: bottom 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.dark-mode .batch-management-bar {
  background: rgba(24, 24, 27, 0.85);
  border-color: rgba(63, 63, 70, 0.8);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.batch-management-bar.visible {
  bottom: 24px; /* 弹出 */
}

.batch-bar-content {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}

.batch-info {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
}

.dark-mode .batch-info {
  color: #f4f4f5;
}

.highlight-count {
  color: #ff2442;
  font-size: 16px;
  font-weight: 850;
  margin: 0 2px;
}

.batch-actions {
  display: flex;
  gap: 12px;
}

.batch-btn {
  border: none;
  padding: 6px 14px;
  border-radius: 99px;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.select-all-btn {
  background: #f1f5f9;
  color: #475569;
}

.dark-mode .select-all-btn {
  background: #27272a;
  color: #cbd5e1;
}

.select-all-btn:hover {
  background: #e2e8f0;
}

.privacy-btn {
  background: #ff2442;
  color: white;
}

.privacy-btn:hover {
  background: #e11d48;
}

.privacy-btn:disabled,
.delete-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.delete-btn {
  background: #0f172a;
  color: white;
}

.dark-mode .delete-btn {
  background: #e4e4e7;
  color: #09090b;
}

.delete-btn:hover {
  background: #1e293b;
}

.cancel-btn {
  background: none;
  color: #64748b;
}

.cancel-btn:hover {
  color: #1e293b;
}

.dark-mode .cancel-btn:hover {
  color: #f4f4f5;
}

.empty-state {
  text-align: center;
  padding: 80px 20px;
}

.empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  margin-bottom: 16px;
}

.empty-text {
  color: #64748b;
  font-size: 14px;
}

/* ===== 编辑资料弹窗 ===== */
.edit-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.edit-modal-card {
  background: #ffffff;
  border-radius: 20px;
  width: 100%;
  max-width: 460px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
}

.edit-modal-card.dark-mode {
  background: #18181b;
  color: #f4f4f5;
}

/* 头部 */
.edit-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid #f1f5f9;
}

.dark-mode .edit-modal-header {
  border-color: #27272a;
}

.edit-modal-title {
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
}

.dark-mode .edit-modal-title {
  color: #f4f4f5;
}

.edit-modal-close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: #f1f5f9;
  color: #64748b;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.edit-modal-close:hover {
  background: #e2e8f0;
}

.dark-mode .edit-modal-close {
  background: #27272a;
  color: #a1a1aa;
}

/* 头像区 */
.edit-avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0 12px;
}

.edit-avatar-wrapper {
  position: relative;
  width: 88px;
  height: 88px;
  border-radius: 50%;
  cursor: pointer;
  overflow: hidden;
}

.edit-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  display: block;
}

.edit-avatar-mask {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.38);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.edit-avatar-wrapper:hover .edit-avatar-mask {
  opacity: 1;
}

.camera-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.edit-avatar-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #94a3b8;
}

/* 表单 */
.edit-form-body {
  padding: 4px 24px 8px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.edit-field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.edit-field-label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.dark-mode .edit-field-label {
  color: #a1a1aa;
}

.edit-input-wrapper {
  position: relative;
}

.edit-input {
  width: 100%;
  padding: 10px 46px 10px 14px;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  font-size: 14px;
  color: #1e293b;
  background: #f8fafc;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.edit-input-sm {
  width: 120px;
  padding-right: 14px;
}

.edit-input:focus {
  border-color: #ff2442;
  background: #fff;
}

.dark-mode .edit-input {
  background: #27272a;
  border-color: #3f3f46;
  color: #f4f4f5;
}

.dark-mode .edit-input:focus {
  border-color: #ff2442;
  background: #1c1c1f;
}

.edit-char-count {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  color: #94a3b8;
  pointer-events: none;
}

/* 性别选择 */
.edit-gender-row {
  display: flex;
  gap: 8px;
}

.edit-gender-btn {
  padding: 7px 18px;
  border-radius: 99px;
  border: 1.5px solid #e2e8f0;
  background: #f8fafc;
  font-size: 13px;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
}

.edit-gender-btn:hover {
  border-color: #ff2442;
  color: #ff2442;
}

.edit-gender-btn.active {
  border-color: #ff2442;
  background: #fff0f3;
  color: #ff2442;
  font-weight: 700;
}

.dark-mode .edit-gender-btn {
  background: #27272a;
  border-color: #3f3f46;
  color: #a1a1aa;
}

.dark-mode .edit-gender-btn.active {
  background: #2d1a1e;
  color: #ff2442;
}

/* 简介文本框 */
.edit-textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  font-size: 14px;
  color: #1e293b;
  background: #f8fafc;
  outline: none;
  resize: none;
  line-height: 1.7;
  transition: border-color 0.2s;
  box-sizing: border-box;
  font-family: inherit;
}

.edit-textarea:focus {
  border-color: #ff2442;
  background: #fff;
}

.dark-mode .edit-textarea {
  background: #27272a;
  border-color: #3f3f46;
  color: #f4f4f5;
}

.dark-mode .edit-textarea:focus {
  border-color: #ff2442;
  background: #1c1c1f;
}

.edit-bio-count {
  font-size: 11px;
  color: #94a3b8;
  text-align: right;
}

/* 底部按钮 */
.edit-modal-footer {
  display: flex;
  gap: 12px;
  padding: 16px 24px 24px;
}

.edit-btn-cancel {
  flex: 1;
  padding: 12px;
  border-radius: 12px;
  border: 1.5px solid #e2e8f0;
  background: #f8fafc;
  font-size: 15px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
}

.edit-btn-cancel:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.dark-mode .edit-btn-cancel {
  background: #27272a;
  border-color: #3f3f46;
  color: #a1a1aa;
}

.edit-btn-save {
  flex: 2;
  padding: 12px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #ff2442, #ff6b6b);
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 16px rgba(255, 36, 66, 0.3);
}

.edit-btn-save:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(255, 36, 66, 0.4);
}

.edit-btn-save:disabled,
.edit-btn-save.saving {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

/* 过渡动画 */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.22s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active .edit-modal-card,
.modal-fade-leave-active .edit-modal-card {
  transition: transform 0.22s ease;
}

.modal-fade-enter-from .edit-modal-card,
.modal-fade-leave-to .edit-modal-card {
  transform: translateY(20px) scale(0.97);
}

/* 头像上传 spinner */
.edit-avatar-mask.uploading {
  opacity: 1;
  background: rgba(0, 0, 0, 0.5);
}

.avatar-spinner {
  font-size: 28px;
  color: #fff;
  display: inline-block;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 响应式：跟随 TopNav 高度变化 */
@media (max-width: 1024px) {
  .mine-page-container {
    margin-top: -56px;
  }
  .profile-header-content {
    padding-top: 72px; /* 56 + 16 */
  }
  .tabs-outer-container {
    top: 56px;
  }
  .sub-tabs-container {
    top: 104px;
  }
}

@media (max-width: 480px) {
  .mine-page-container {
    margin-top: -52px;
  }
  .profile-header-content {
    padding-top: 68px; /* 52 + 16 */
  }
  .tabs-outer-container {
    top: 52px;
  }
  .sub-tabs-container {
    top: 100px;
  }
}
</style>
