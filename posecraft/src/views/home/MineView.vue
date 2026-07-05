<template>
  <div class="mine-page-container" :class="{ 'dark-mode': themeStore.isDark }">
    <!-- 背景和个人信息区域 (颜色与主页面统一为白底/黑底) -->
    <div class="profile-header-wrapper">
      <div class="profile-bg-cover" :style="{ backgroundImage: `linear-gradient(to left, rgba(255, 255, 255, 0) 10%, rgba(255, 255, 255, 1) 90%), url(${userProfile.avatar || 'https://picsum.photos/seed/avatar_wang/150/150'})` }"></div>
      
      <div class="profile-header-content">
        <!-- 个人圆形头像 -->
        <div class="avatar-wrapper">
          <img :src="userProfile.avatar || 'https://picsum.photos/seed/avatar_wang/150/150'" alt="avatar" class="user-avatar" />
        </div>

        <!-- 个人信息详情 -->
        <div class="user-info-main">
          <div class="user-name-row">
            <h1 class="username">{{ userProfile.username || '摄影小王' }}</h1>
            <span class="edit-icon" @click="openEditModal">🖊️</span>
          </div>

          <div class="stats-row">
            <div class="stat-item">
              <span class="stat-label">关注</span>
              <span class="stat-val">{{ followingCount }}</span>
            </div>
            <!-- 直播胶囊徽章 -->
            <div class="live-badge">
              <span class="pulse-dot"></span>
              <span>1人正在直播</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">粉丝</span>
              <span class="stat-val">{{ followersCount }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">获赞</span>
              <span class="stat-val">{{ likesCount }}</span>
            </div>
          </div>

          <div class="meta-info-row">
            <span>ID: {{ userProfile.personal_id || userProfile.id || '未知ID' }}</span>
            <span v-if="userProfile.gender || userProfile.age">
              {{ userProfile.gender === 1 ? '♂️' : userProfile.gender === 2 ? '♀️' : '' }} {{ userProfile.age ? userProfile.age + '岁' : '' }}
            </span>
            <span>{{ userProfile.city || '北京 · 朝阳' }}</span>
          </div>

          <div class="bio-row">
            <span class="bio-short-text">{{ bioShortText }}</span>
            <div class="bio-more-wrapper" @mouseenter="onBioTooltipEnter" @mouseleave="onBioTooltipLeave">
              <span class="bio-more">更多</span>
              <!-- 悬浮完整简介气泡 -->
              <div ref="bioTooltipRef" class="bio-tooltip-card">
                <div v-for="(line, idx) in bioLines" :key="idx" class="bio-tooltip-line">
                  {{ line }}
                </div>
              </div>
            </div>
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
          @click="changeTab('works')" 
          :class="['tab-btn', { active: activeTab === 'works' }]"
        >
          <span>作品</span>
          <span>{{ worksCount }}</span>
        </button>
        <button 
          @click="changeTab('recommend')" 
          :class="['tab-btn', { active: activeTab === 'recommend' }]"
        >
          <span>推荐</span>
        </button>
        <button 
          @click="changeTab('likes')" 
          :class="['tab-btn', { active: activeTab === 'likes' }]"
        >
          <span>喜欢</span>
          <span class="tab-lock">🔒</span>
        </button>
        <button 
          @click="changeTab('collect')" 
          :class="['tab-btn', { active: activeTab === 'collect' }]"
        >
          <span>收藏</span>
          <span class="tab-lock">🔒</span>
        </button>
        <button 
          @click="changeTab('history')" 
          :class="['tab-btn', { active: activeTab === 'history' }]"
        >
          <span>观看历史</span>
          <span class="tab-lock">🔒</span>
        </button>
        <button 
          @click="changeTab('watch-later')" 
          :class="['tab-btn', { active: activeTab === 'watch-later' }]"
        >
          <span>稍后再看</span>
          <span class="tab-lock">🔒</span>
        </button>
      </div>

      <div class="tabs-right-actions">
        <!-- 批量管理状态控制 -->
        <button class="manage-btn" @click="toggleManageMode">
          {{ isManageMode ? '取消管理' : '批量管理' }}
        </button>
      </div>
    </div>

    <!-- 三级菜单分类栏 (仅在“作品”Tab下展示，右侧带有搜索与日期筛选) -->
    <div class="sub-tabs-container" v-if="activeTab === 'works'">
      <!-- 左侧三级分类 Tab -->
      <div class="sub-tabs">
        <button 
          :class="['sub-tab-btn', { active: subTab === 'public' }]" 
          @click="subTab = 'public'"
        >
          作品
        </button>
        <button 
          :class="['sub-tab-btn', { active: subTab === 'private' }]" 
          @click="subTab = 'private'"
        >
          <span>私密作品</span>
          <span class="sub-lock">🔒</span>
        </button>
        <button 
          :class="['sub-tab-btn', { active: subTab === 'collection' }]" 
          @click="subTab = 'collection'"
        >
          合集
        </button>
        <button 
          :class="['sub-tab-btn', { active: subTab === 'series' }]" 
          @click="subTab = 'series'"
        >
          短剧
        </button>
      </div>

      <!-- 右侧日期筛选及搜索框 -->
      <div class="sub-right-actions">
        <div class="tab-search-wrapper">
          <span class="tab-search-icon">🔍</span>
          <input 
            type="text" 
            v-model="searchQuery" 
            placeholder="搜索我发布的作品" 
            class="tab-search-input" 
          />
        </div>
        
        <span class="divider-line">|</span>

        <!-- 日期筛选下拉组件 -->
        <div class="date-filter-wrapper">
          <button class="date-filter-btn" @click="showDateDropdown = !showDateDropdown">
            <span>📅 {{ dateFilterLabel }}</span>
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
      <template v-if="filteredItems.length > 0">
        <div class="waterfall-grid">
          <!-- 包裹管理模式的容器 -->
          <div
            v-for="item in filteredItems"
            :key="item.id"
            class="manageable-card-wrapper"
            :class="{ 'manage-active': isManageMode, 'selected': selectedIds.includes(item.id) }"
            @click="handleCardClick(item)"
          >
            <!-- 遮罩多选框 -->
            <div v-if="isManageMode" class="card-checkbox-overlay">
              <div class="custom-checkbox" :class="{ checked: selectedIds.includes(item.id) }">
                <span v-if="selectedIds.includes(item.id)" class="checkbox-tick">✓</span>
              </div>
            </div>
            
            <PoseCard
              :item="item"
              @like="likeItem"
            />
          </div>
        </div>
      </template>
      <template v-else>
        <div class="empty-state">
          <div class="empty-icon">📂</div>
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
          <button 
            class="batch-btn privacy-btn" 
            @click="batchChangePrivacy" 
            :disabled="!selectedIds.length"
          >
            公开 / 私密
          </button>
          <button 
            class="batch-btn delete-btn" 
            @click="batchDelete" 
            :disabled="!selectedIds.length"
          >
            删除
          </button>
          <button class="batch-btn cancel-btn" @click="exitManageMode">
            取消
          </button>
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
            <button class="edit-modal-close" @click="closeEditModal">✕</button>
          </div>

          <!-- 头像修改区域 -->
          <div class="edit-avatar-section">
            <!-- 隐藏文件选择器 -->
            <input
              ref="avatarFileInput"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style="display:none"
              @change="onAvatarFileChange"
            />
            <div class="edit-avatar-wrapper" @click="avatarFileInput?.click()">
              <img
                :src="avatarPreview || editForm.avatar || userProfile.avatar || 'https://picsum.photos/seed/avatar_wang/150/150'"
                alt="avatar"
                class="edit-avatar-img"
              />
              <!-- 上传 loading -->
              <div class="edit-avatar-mask" :class="{ uploading: avatarUploading }">
                <span v-if="avatarUploading" class="avatar-spinner">⟳</span>
                <span v-else class="camera-icon">📷</span>
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
            <button class="edit-btn-save" :class="{ saving: editSaving }" :disabled="editSaving" @click="saveEditProfile">
              {{ editSaving ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useHome } from '@/composables/useHome'
import { useThemeStore } from '@/stores/theme'
import PoseCard from '@/components/home/PoseCard.vue'
import { userApi } from '@/api/user'

const {
  openDetail,
  likeItem,
  showToast,
  userProfile,
  followingCount,
  followersCount,
  worksCount,
  likesCount,
  fetchUserProfile,
  updateUserProfile,
  activeNav
} = useHome()

const themeStore = useThemeStore()

// 标记当前页面
onMounted(() => { activeNav.value = 'mine' })
const activeTab = ref('works')
const subTab = ref('public')
const showLoginSave = ref(true)
const searchQuery = ref('')

// 日期筛选状态
const dateFilter = ref('all')
const dateFilterLabel = ref('全部时间')
const showDateDropdown = ref(false)

// 批量管理状态
const isManageMode = ref(false)
const selectedIds = ref<string[]>([])

// 解析简介多行（按换行符分割，与 textarea 输入对齐）
const bioLines = computed(() => {
  const bio = userProfile.value?.bio
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
    ]
  }
  return bio.split('\n').map((line: string) => line.trim()).filter(Boolean)
})

// 简介缩略：所有行拼接为一行，超过 40 字截断
const bioShortText = computed(() => {
  const bio = userProfile.value?.bio
  if (!bio) return '✈️已飞0个国家❗️ | 梦想是环游世界🌍 | 中国留子...'
  const joined = bio.split('\n').map((l: string) => l.trim()).filter(Boolean).join(' | ')
  return joined.length > 40 ? joined.slice(0, 40) + '...' : joined
})

// 简介 tooltip 定位（fixed 定位，逃逸 overflow:hidden 容器）
const bioTooltipRef = ref<HTMLElement | null>(null)
const onBioTooltipEnter = (e: MouseEvent) => {
  const el = bioTooltipRef.value
  if (!el) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  el.style.position = 'fixed'
  el.style.bottom = 'auto'
  el.style.right = 'auto'
  el.style.left = rect.right - 280 + 'px'
  el.style.top = rect.bottom + 8 + 'px'
  el.style.display = 'block'
}
const onBioTooltipLeave = () => {
  const el = bioTooltipRef.value
  if (el) el.style.display = 'none'
}

const onSaveLoginChange = () => {
  showToast(showLoginSave.value ? '已开启保存登录信息' : '已关闭保存登录信息')
}

// 编辑资料弹窗
const showEditModal = ref(false)
const editSaving = ref(false)
const editForm = ref({
  username: '',
  avatar: '',
  bio: ''
})

// 头像相关状态
const avatarFileInput = ref<HTMLInputElement | null>(null)
const avatarPreview = ref('')      // base64 本地预览
const avatarUploading = ref(false) // 上传中状态

/**
 * 选择文件后立即上传到后端，回显新 URL
 */
const onAvatarFileChange = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  // 本地预览
  avatarPreview.value = URL.createObjectURL(file)
  avatarUploading.value = true

  try {
    const res = await userApi.uploadAvatar(file) as any
    const newUrl = res?.avatar || res
    if (newUrl) {
      editForm.value.avatar = newUrl
      // 同步更新 userProfile 头像（头像区域实时变化）
      userProfile.value = { ...userProfile.value, avatar: newUrl }
    }
    showToast('头像上传成功 🎉')
  } catch (err: any) {
    avatarPreview.value = '' // 回退预览
    showToast(err?.message || '头像上传失败，请重试')
  } finally {
    avatarUploading.value = false
    // 重置 input 以便重复选同一文件
    if (input) input.value = ''
  }
}

const openEditModal = () => {
  avatarPreview.value = ''
  editForm.value = {
    username: userProfile.value.username || '',
    avatar: userProfile.value.avatar || '',
    bio: userProfile.value.bio || ''
  }
  showEditModal.value = true
}

const closeEditModal = () => {
  avatarPreview.value = ''
  showEditModal.value = false
}

/**
 * 保存昵称 + 简介（头像已在上传时实时保存）
 */
const saveEditProfile = async () => {
  editSaving.value = true
  try {
    const res = await userApi.updateProfile({
      username: editForm.value.username,
      bio: editForm.value.bio
    }) as any

    // 更新本地 userProfile
    userProfile.value = {
      ...userProfile.value,
      username: res?.username ?? editForm.value.username,
      bio: res?.bio ?? editForm.value.bio
    }
    showToast('个人资料已保存 ✅')
    showEditModal.value = false
  } catch (err: any) {
    showToast(err?.message || '保存失败，请重试')
  } finally {
    editSaving.value = false
  }
}

// 统一的作品及合集数据源 (增加 type、is_private、created_at 属性)
const myWorks = ref([
  {
    id: 'my-1',
    title: '我的WebGL 3D人体动作模板',
    description: '我自己设计保存的3D骨骼姿势，可以免费导出',
    username: '摄影小王',
    likes_count: 23,
    thumbnail_url: 'https://picsum.photos/seed/my1/400/490',
    type: 'template',
    is_private: false,
    created_at: '2026-07-04' // 近一周内
  },
  {
    id: 'my-2',
    title: '午后书房阅读抓拍瞬间',
    description: '在阳光照进书架时，安静阅读的自然动作',
    username: '摄影小王',
    likes_count: 15,
    thumbnail_url: 'https://picsum.photos/seed/my2/400/390',
    type: 'work',
    is_private: false,
    created_at: '2026-06-20' // 近一月内
  },
  {
    id: 'my-3',
    title: '[私密] 2026年7月室内私享构图',
    description: '仅限个人可见的复古法式卧室打光姿势',
    username: '摄影小王',
    likes_count: 0,
    thumbnail_url: 'https://picsum.photos/seed/my3/400/520',
    type: 'work',
    is_private: true,
    created_at: '2026-07-02' // 近一周内
  },
  {
    id: 'my-4',
    title: '我的首发胶片合集 · 经典港风',
    description: '打包汇总 10 组港风人像经典抓拍要点',
    username: '摄影小王',
    likes_count: 120,
    thumbnail_url: 'https://picsum.photos/seed/my4/400/450',
    type: 'collection',
    is_private: false,
    created_at: '2026-06-10' // 近一月内
  },
  {
    id: 'my-5',
    title: '短剧 1 - 摄影大师养成之路',
    description: '如何从零入门，摆姿设光一贴搞定',
    username: '摄影小王',
    likes_count: 320,
    thumbnail_url: 'https://picsum.photos/seed/my5/400/310',
    type: 'series',
    is_private: false,
    created_at: '2026-07-01' // 近一周内
  },
  {
    id: 'my-6',
    title: '老屋檐瓦当构图之美',
    description: '北京胡同古建筑屋顶的细节抓拍',
    username: '摄影小王',
    likes_count: 157,
    thumbnail_url: 'https://picsum.photos/seed/pose11/400/500',
    type: 'work',
    is_private: false,
    created_at: '2026-05-12'
  },
  {
    id: 'my-7',
    title: '黄昏逆光人像拍摄技巧',
    description: '利用黄金时段的逆光拍出梦幻氛围感',
    username: '摄影小王',
    likes_count: 89,
    thumbnail_url: 'https://picsum.photos/seed/my7/400/460',
    type: 'work',
    is_private: false,
    created_at: '2026-07-03'
  },
  {
    id: 'my-8',
    title: '城市天际线延时摄影合集',
    description: '从日出到日落，记录城市光影变化',
    username: '摄影小王',
    likes_count: 203,
    thumbnail_url: 'https://picsum.photos/seed/my8/400/350',
    type: 'collection',
    is_private: false,
    created_at: '2026-06-25'
  },
  {
    id: 'my-9',
    title: '日系清新色调调色分享',
    description: '低饱和高光偏青的日系后期思路',
    username: '摄影小王',
    likes_count: 312,
    thumbnail_url: 'https://picsum.photos/seed/my9/400/480',
    type: 'work',
    is_private: false,
    created_at: '2026-06-18'
  },
  {
    id: 'my-10',
    title: '咖啡馆文艺人像摆姿',
    description: '在咖啡馆场景下的12种自然坐姿',
    username: '摄影小王',
    likes_count: 76,
    thumbnail_url: 'https://picsum.photos/seed/my10/400/520',
    type: 'work',
    is_private: false,
    created_at: '2026-05-30'
  },
  {
    id: 'my-11',
    title: '雨天街拍情绪大片',
    description: '雨中漫步的电影感构图与色彩',
    username: '摄影小王',
    likes_count: 145,
    thumbnail_url: 'https://picsum.photos/seed/my11/400/400',
    type: 'work',
    is_private: true,
    created_at: '2026-07-01'
  },
  {
    id: 'my-12',
    title: '短剧 2 - 街头摄影日记',
    description: '跟着镜头探索城市角落的故事',
    username: '摄影小王',
    likes_count: 456,
    thumbnail_url: 'https://picsum.photos/seed/my12/400/330',
    type: 'series',
    is_private: false,
    created_at: '2026-06-08'
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
    type: 'work',
    created_at: '2026-07-01'
  },
  {
    id: 'rec-2',
    title: '猫咪视角拍摄大片技巧',
    description: '蹲下身子，带你用宠物的眼睛看世界',
    username: '喵星人摄影',
    likes_count: 5431,
    thumbnail_url: 'https://picsum.photos/seed/rec2/400/320',
    type: 'video',
    created_at: '2026-06-28'
  },
  {
    id: 'rec-3',
    title: '电影感暗调人像布光详解',
    description: '一盏灯就能拍出的高级质感肖像',
    username: '光影实验室',
    likes_count: 3210,
    thumbnail_url: 'https://picsum.photos/seed/rec3/400/470',
    type: 'work',
    created_at: '2026-06-20'
  },
  {
    id: 'rec-4',
    title: '旅行Vlog转场技巧合集',
    description: '10种丝滑转场让你的旅拍更有节奏感',
    username: '旅行摄影师Leo',
    likes_count: 8870,
    thumbnail_url: 'https://picsum.photos/seed/rec4/400/380',
    type: 'video',
    created_at: '2026-07-02'
  },
  {
    id: 'rec-5',
    title: '手机摄影也能出大片',
    description: '不靠器材，只靠构图和光线的手机拍摄指南',
    username: '手机摄影达人',
    likes_count: 12050,
    thumbnail_url: 'https://picsum.photos/seed/rec5/400/500',
    type: 'template',
    created_at: '2026-06-15'
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
    type: 'work',
    created_at: '2026-07-03'
  },
  {
    id: 'like-2',
    title: '极简人像棚拍用光分解',
    description: '经典伦勃朗光布局，小白也能拍出质感肖像',
    username: '构图研究所',
    likes_count: 3205,
    thumbnail_url: 'https://picsum.photos/seed/fol2/400/380',
    type: 'template',
    created_at: '2026-05-15'
  },
  {
    id: 'like-3',
    title: '海边日落情侣写真指南',
    description: '抓住黄金20分钟，拍出最浪漫的瞬间',
    username: '海边摄影师',
    likes_count: 5621,
    thumbnail_url: 'https://picsum.photos/seed/like3/400/450',
    type: 'work',
    created_at: '2026-06-22'
  },
  {
    id: 'like-4',
    title: '古风汉服拍摄场景推荐',
    description: '最适合拍汉服的10个北京取景地',
    username: '国风摄影',
    likes_count: 2890,
    thumbnail_url: 'https://picsum.photos/seed/like4/400/510',
    type: 'work',
    created_at: '2026-06-10'
  },
  {
    id: 'like-5',
    title: '运动抓拍连拍参数设置',
    description: '高速快门+连续对焦，定格每一个精彩瞬间',
    username: '体育摄影师',
    likes_count: 1540,
    thumbnail_url: 'https://picsum.photos/seed/like5/400/340',
    type: 'template',
    created_at: '2026-05-28'
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
    type: 'template',
    created_at: '2026-07-02'
  },
  {
    id: 'col-2',
    title: '夏日海边逆光拍照姿势',
    description: '逆光微风下，轻松抓拍那一抹唯美少女感',
    username: '海边微风',
    likes_count: 7654,
    thumbnail_url: 'https://picsum.photos/seed/rec4/400/480',
    type: 'work',
    created_at: '2026-06-15'
  },
  {
    id: 'col-3',
    title: '室内极简光影构图模板',
    description: '利用百叶窗和自然光打造高级感',
    username: '极简主义',
    likes_count: 4120,
    thumbnail_url: 'https://picsum.photos/seed/col3/400/420',
    type: 'template',
    created_at: '2026-06-28'
  },
  {
    id: 'col-4',
    title: '夜景人像闪光灯使用技巧',
    description: '城市夜景+离机闪，拍出杂志封面感',
    username: '夜拍大师',
    likes_count: 6780,
    thumbnail_url: 'https://picsum.photos/seed/col4/400/500',
    type: 'work',
    created_at: '2026-07-01'
  },
  {
    id: 'col-5',
    title: '胶片质感调色预设分享',
    description: '一键还原柯达金200的经典色调',
    username: '胶片玩家',
    likes_count: 9340,
    thumbnail_url: 'https://picsum.photos/seed/col5/400/360',
    type: 'template',
    created_at: '2026-05-20'
  }
])

const changeTab = (tabName: string) => {
  activeTab.value = tabName
  exitManageMode() // 切换 Tab 自动退出管理模式
}

// 选择日期筛选
const selectDateFilter = (filterType: string, label: string) => {
  dateFilter.value = filterType
  dateFilterLabel.value = label
  showDateDropdown.value = false
}

// 检查是否在指定日期范围内
const isInDateRange = (dateStr: string) => {
  if (dateFilter.value === 'all') return true
  const now = new Date()
  const itemDate = new Date(dateStr)
  const diffTime = Math.abs(now.getTime() - itemDate.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (dateFilter.value === 'week') {
    return diffDays <= 7
  } else if (dateFilter.value === 'month') {
    return diffDays <= 30
  } else if (dateFilter.value === 'year') {
    return diffDays <= 365
  }
  return true
}

// 切换管理模式
const toggleManageMode = () => {
  isManageMode.value = !isManageMode.value
  if (!isManageMode.value) {
    selectedIds.value = []
  }
}

// 退出管理模式
const exitManageMode = () => {
  isManageMode.value = false
  selectedIds.value = []
}

// 选中/取消选中卡片
const handleCardClick = (item: any) => {
  if (isManageMode.value) {
    const idx = selectedIds.value.indexOf(item.id)
    if (idx > -1) {
      selectedIds.value.splice(idx, 1)
    } else {
      selectedIds.value.push(item.id)
    }
  } else {
    openDetail(item)
  }
}

// 全选/取消全选
const toggleSelectAll = () => {
  if (selectedIds.value.length === filteredItems.value.length) {
    selectedIds.value = []
  } else {
    selectedIds.value = filteredItems.value.map(item => item.id)
  }
}

// 批量修改公开/私密状态
const batchChangePrivacy = () => {
  if (!selectedIds.value.length) return
  myWorks.value = myWorks.value.map(item => {
    if (selectedIds.value.includes(item.id)) {
      return { ...item, is_private: !item.is_private }
    }
    return item
  })
  showToast(`成功将选中的 ${selectedIds.value.length} 项作品修改了可见性`)
  exitManageMode()
}

// 批量删除
const batchDelete = () => {
  if (!selectedIds.value.length) return
  const count = selectedIds.value.length
  
  if (activeTab.value === 'works') {
    myWorks.value = myWorks.value.filter(item => !selectedIds.value.includes(item.id))
  } else if (activeTab.value === 'recommend') {
    myRecommends.value = myRecommends.value.filter(item => !selectedIds.value.includes(item.id))
  } else if (activeTab.value === 'likes') {
    myLikes.value = myLikes.value.filter(item => !selectedIds.value.includes(item.id))
  } else if (activeTab.value === 'collect') {
    myCollects.value = myCollects.value.filter(item => !selectedIds.value.includes(item.id))
  }

  showToast(`已成功删除选中的 ${count} 项内容`)
  exitManageMode()
}

// 过滤后的列表计算
const filteredItems = computed(() => {
  let list: any[] = []
  
  if (activeTab.value === 'works') {
    // 根据三级分类进行过滤
    if (subTab.value === 'public') {
      list = myWorks.value.filter(w => !w.is_private && w.type !== 'collection' && w.type !== 'series')
    } else if (subTab.value === 'private') {
      list = myWorks.value.filter(w => w.is_private)
    } else if (subTab.value === 'collection') {
      list = myWorks.value.filter(w => w.type === 'collection')
    } else if (subTab.value === 'series') {
      list = myWorks.value.filter(w => w.type === 'series')
    }

    // 根据日期范围筛选
    list = list.filter(w => isInDateRange(w.created_at))
  } else if (activeTab.value === 'recommend') {
    list = myRecommends.value
  } else if (activeTab.value === 'likes') {
    list = myLikes.value
  } else if (activeTab.value === 'collect') {
    list = myCollects.value
  }

  // 搜索关键字筛选
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
  /* 背景拉到 TopNav 后面重叠显示 */
  margin-top: -72px;
}

/* 个人头部卡片 (颜色与背景完全融为一体) */
.profile-header-wrapper {
  position: relative;
  width: 100%;
  background: white;
  color: #1e293b;
  overflow: hidden;
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
  right: 0;
  width: 45%;
  height: 100%;
  background-image: linear-gradient(to left, rgba(255, 255, 255, 0) 10%, rgba(255, 255, 255, 1) 90%), url('https://picsum.photos/seed/profile_bg/1200/400');
  background-size: cover;
  background-position: center right;
  opacity: 0.18;
  pointer-events: none;
}

.dark-mode .profile-bg-cover {
  background-image: linear-gradient(to left, rgba(18, 18, 20, 0) 10%, rgba(18, 18, 20, 1) 90%), url('https://picsum.photos/seed/profile_bg/1200/400');
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
  font-size: 16px;
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

.bio-more-wrapper {
  position: relative;
  display: inline-block;
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

.bio-tooltip-card {
  position: fixed;
  width: 280px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  z-index: 9999;
  display: none;
  color: #334155;
  text-align: left;
}

.dark-mode .bio-tooltip-card {
  background: #18181b;
  border-color: #27272a;
  color: #e4e4e7;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

/* tooltip 显示由 JS 控制，不使用 CSS hover */

.bio-tooltip-line {
  font-size: 12.5px;
  line-height: 1.6;
  margin-bottom: 8px;
  white-space: nowrap;
}

.bio-tooltip-line:last-child {
  margin-bottom: 0;
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
  transition: .3s;
  border-radius: 20px;
}

.dark-mode .slider {
  background-color: #3f3f46;
}

.slider:before {
  position: absolute;
  content: "";
  height: 12px;
  width: 12px;
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
  font-size: 11px;
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
  font-size: 9px;
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

.privacy-btn:disabled, .delete-btn:disabled {
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
  font-size: 54px;
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
  font-size: 24px;
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
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
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
