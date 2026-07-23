<!--
 * 精选频道视图
 *
 * 顶部 SearchHero（搜索框 + 分类 Tab 切换），下方内容区根据频道类型二选一：
 *   - 动态网址频道：iframe 嵌入外部页面
 *   - 普通频道（如 recommend）：推荐 Banner + 瀑布流卡片
 *
 * 支持骨架占位（首次加载）、空状态、加载更多、Banner 跳转。
 * 通过 keep-alive 激活/隐藏生命周期管理 IntersectionObserver sentinel。
 *
 * @author Claude
 * @since 2026-07-13
 -->
<template>
  <div class="featured-page-container">
    <!-- 搜索与分类 Tab (Sticky Area) -->
    <SearchHero
      ref="searchHeroRef"
      v-model:searchQuery="searchQuery"
      v-model:searchFocused="searchFocused"
      :search-suggestions="searchSuggestions"
      :show-nav-search="showNavSearch"
      @blur="onSearchBlur"
      @handleStartCreate="handleStartCreate"
    />

    <!-- 分类 Tab -->
    <div
      ref="channelContainerRef"
      class="channel-container"
      :class="{ 'justify-start': tabOverflow }"
      @mousedown="onDragStart"
      @mousemove="onDragMove"
      @mouseup="onDragEnd"
      @mouseleave="onDragEnd"
    >
      <div ref="channelInnerRef" class="channel-inner">
        <button
          v-for="ch in channels"
          :key="ch.value"
          @click="onTabClick(ch.value)"
          :class="['channel-tag', { active: activeChannel === ch.value }]"
        >
          <Icon v-if="ch.icon" :name="ch.icon" :size="16" class="channel-icon" />
          {{ ch.label }}
        </button>
      </div>
    </div>

    <!-- 内容区域 -->
    <div
      class="content-container"
      @mousedown="onContentDragStart"
      @mousemove="onContentDragMove"
      @mouseup="onContentDragEnd"
      @mouseleave="onContentDragEnd"
      @click.capture="onContentClick"
    >
      <!-- 动态网址内容 (iframe) -->
      <div v-if="currentChannelUrl" class="w-full" style="height: calc(100vh - 120px)">
        <iframe
          :src="currentChannelUrl"
          class="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin"
        ></iframe>
      </div>

      <!-- 瀑布流 -->
      <div v-else class="content-body">
        <!-- 频道 Banner（仅 has_banner=true 的频道展示，从后端动态渲染） -->
        <template v-if="currentChannelShowBanner && !searchQuery.trim() && activeBanners.length > 0">
          <div
            v-for="banner in activeBanners"
            :key="banner.id"
            class="featured-banner"
            :style="{
              backgroundImage: `linear-gradient(to right, rgba(15,23,42,0.95), rgba(15,23,42,0.4)), url(${banner.image_url})`
            }"
          >
            <div class="banner-content">
              <div class="banner-badge" v-if="banner.badge_text">
                <Trophy class="badge-icon" :size="14" />
                <span>{{ banner.badge_text }}</span>
              </div>
              <h1 class="banner-title">{{ banner.title }}</h1>
              <p class="banner-desc" v-if="banner.description">{{ banner.description }}</p>
            </div>
            <button class="banner-btn" @click="onBannerClick(banner)">
              {{ banner.button_text || '立即探索' }}
            </button>
          </div>
        </template>

        <!-- 首次加载中：骨架占位（瀑布流结构） -->
        <template v-if="loading && filteredItems.length === 0">
          <div class="waterfall-grid">
            <SkeletonCard v-for="n in 8" :key="n" />
          </div>
        </template>

        <!-- 有数据：真实卡片列表 -->
        <template v-else-if="filteredItems.length > 0">
          <div class="waterfall-grid">
            <PoseCard
              v-for="item in filteredItems"
              :key="item._key ?? item.id"
              :item="item"
              @click="openDetail"
              @like="handleLike"
              @collect="handleCollect"
            />
          </div>
          <div class="load-more-container" v-if="hasMore">
            <button class="load-more-btn" @click="loadMore" :disabled="loading">
              <Loader2 v-if="loading" class="animate-spin" :size="16" />
              <span>{{ loading ? '加载中...' : '加载更多' }}</span>
            </button>
          </div>
          <div class="load-more-container" v-else>
            <span class="no-more-text">没有更多内容了</span>
          </div>
        </template>

        <!-- 无数据无加载中：空状态 -->
        <template v-else>
          <div class="empty-state">
            <Search class="empty-icon" :size="54" />
            <div class="empty-text">没有找到相关的姿势模板</div>
            <button class="empty-btn" @click="searchQuery = ''">重置搜索</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onActivated, onDeactivated, onUnmounted, nextTick } from 'vue';
import { useHome } from '@/composables/useHome';
import { Trophy, Loader2, Search } from 'lucide-vue-next';
import SearchHero from '@/components/widgets/home/SearchHero.vue';
import PoseCard from '@/components/cards/home/PoseCard.vue';
import SkeletonCard from '@/components/cards/home/SkeletonCard.vue';

const {
  searchQuery,
  searchFocused,
  activeChannel,
  searchSuggestions,
  channels,
  showNavSearch,
  filteredItems,
  currentChannel,
  currentChannelUrl,
  currentChannelShowBanner,
  hasMore,
  loading,
  loadMore,
  showToast,
  handleStartCreate,
  openDetail,
  handleLike,
  handleCollect,
  onSearchBlur,
  searchSentinel,
  activeNav,
  activeBanners
} = useHome();

/** 按钮点击：有 link_url 则跳转，否则走 fallback */
const onBannerClick = (banner: any) => {
  if (banner.link_url) window.open(banner.link_url, '_blank');
  else showToast('已进入精选主题页面');
};

// 设置当前导航标识为精选
onMounted(() => {
  activeNav.value = 'featured';
});
// keep-alive 激活时重新设置
onActivated(() => {
  activeNav.value = 'featured';
});
const channelContainerRef = ref<HTMLElement | null>(null);
const channelInnerRef = ref<HTMLElement | null>(null);
const tabOverflow = ref(false);

// ─── 溢出检测 ─────────────────────────────────────

/** 检测 Tab 是否溢出容器，动态切换对齐方式：
 *  少 Tab → justify-content: center（居中）
 *  多 Tab → justify-content: flex-start（左对齐 + 滚动） */
const checkTabOverflow = () => {
  const container = channelContainerRef.value;
  const inner = channelInnerRef.value;
  if (container && inner) {
    tabOverflow.value = inner.scrollWidth > container.clientWidth;
  }
};

let overflowObserver: ResizeObserver | null = null;
onMounted(() => {
  nextTick(checkTabOverflow);
  overflowObserver = new ResizeObserver(checkTabOverflow);
  if (channelContainerRef.value) overflowObserver.observe(channelContainerRef.value);
  if (channelInnerRef.value) overflowObserver.observe(channelInnerRef.value);
});
onActivated(() => {
  nextTick(checkTabOverflow);
});
onDeactivated(() => {
  searchSentinel.value = null;
});
onUnmounted(() => {
  overflowObserver?.disconnect();
});

// ─── 拖拽滚动 ─────────────────────────────────────

/** 鼠标拖拽横向滚动分类 Tab */
const dragState = { startX: 0, startScrollLeft: 0, moved: false };
const DRAG_THRESHOLD = 5; // 超过 5px 视为拖拽，不触发 click

const onDragStart = (e: MouseEvent) => {
  const el = channelContainerRef.value;
  if (!el) return;
  dragState.startX = e.clientX;
  dragState.startScrollLeft = el.scrollLeft;
  dragState.moved = false;
  el.classList.add('dragging');
  document.body.style.cursor = 'grabbing';
  document.body.style.userSelect = 'none';
};

const onDragMove = (e: MouseEvent) => {
  const el = channelContainerRef.value;
  if (!el || dragState.startX === 0) return;
  const dx = e.clientX - dragState.startX;
  if (Math.abs(dx) > DRAG_THRESHOLD) dragState.moved = true;
  el.scrollLeft = dragState.startScrollLeft - dx;
};

const onDragEnd = () => {
  const el = channelContainerRef.value;
  if (el) el.classList.remove('dragging');
  dragState.startX = 0;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
};

/** Tab 点击事件：拖拽后不切换 */
const onTabClick = (value: string) => {
  if (dragState.moved) {
    dragState.moved = false;
    return;
  }
  activeChannel.value = value;
};

// ─── 内容区拖拽滚动 ─────────────────────────────────

/** 鼠标拖拽内容区上下滚动页面 */
const contentDragState = { startY: 0, startScrollY: 0, moved: false };

const onContentDragStart = (e: MouseEvent) => {
  // 忽略 Tab 区、搜索框、按钮等交互元素的拖拽
  const target = e.target as HTMLElement;
  if (target.closest('button, a, input, textarea, select, iframe')) return;
  contentDragState.startY = e.clientY;
  contentDragState.startScrollY = window.scrollY;
  contentDragState.moved = false;
  document.body.style.cursor = 'grabbing';
  document.body.style.userSelect = 'none';
};

const onContentDragMove = (e: MouseEvent) => {
  if (contentDragState.startY === 0) return;
  const dy = e.clientY - contentDragState.startY;
  if (Math.abs(dy) > DRAG_THRESHOLD) contentDragState.moved = true;
  window.scrollTo(window.scrollX, contentDragState.startScrollY - dy);
};

const onContentDragEnd = () => {
  contentDragState.startY = 0;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
};

/** 拖拽后阻止卡片点击事件 */
const onContentClick = (e: MouseEvent) => {
  if (contentDragState.moved) {
    e.stopPropagation();
    e.preventDefault();
    contentDragState.moved = false;
  }
};

const searchHeroRef = ref<any>(null);
watch(
  () => searchHeroRef.value?.sentinelRef,
  newVal => {
    searchSentinel.value = newVal;
  },
  { immediate: true }
);
</script>

<style scoped>
/* 分类 Tab */
.channel-container {
  display: flex;
  justify-content: center;
  width: 100%;
  min-width: 0;
  padding: 12px 0 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.channel-container::-webkit-scrollbar {
  display: none;
}

.channel-container.dragging {
  cursor: grabbing;
  user-select: none;
}

.channel-container.justify-start {
  justify-content: flex-start;
}

.channel-inner {
  display: flex;
  gap: 0;
  flex-shrink: 0;
}

.channel-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  padding: 10px 20px;
  font-size: 14.5px;
  font-weight: 700;
  color: #64748b;
  cursor: pointer;
  position: relative;
  transition: color 0.2s;
  white-space: nowrap;
}
.channel-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.dark-mode .channel-tag {
  color: #a1a1aa;
}
.channel-tag:hover {
  color: #ff2442;
}
.dark-mode .channel-tag:hover {
  color: #ff6b6b;
}
.channel-tag.active {
  color: #1e293b;
}
.dark-mode .channel-tag.active {
  color: #f4f4f5;
}

.featured-page-container {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  padding-top: 64px;
  flex: 1;
  min-height: 0;
}

.content-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.content-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.waterfall-grid {
  column-count: 5;
  column-gap: 20px;
  padding: 20px 32px 0;
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
  .channel-tag {
    padding: 10px 14px;
    font-size: 13.5px;
  }
}

@media (max-width: 500px) {
  .waterfall-grid {
    column-count: 2;
  }
  .channel-tag {
    padding: 8px 12px;
    font-size: 13px;
  }
  .channel-inner {
    padding: 0 8px;
  }
}

@media (max-width: 320px) {
  .waterfall-grid {
    column-count: 1;
  }
  .channel-tag {
    padding: 8px 10px;
    font-size: 12px;
    gap: 4px;
  }
  .channel-icon {
    display: inline-flex;
  }
}

.load-more-container {
  display: flex;
  justify-content: center;
  margin: 32px 0 48px;
}

.load-more-btn {
  padding: 10px 24px;
  border: 1px solid #e2e8f0;
  border-radius: 9999px;
  background: white;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.dark-mode .load-more-btn {
  background: #27272a;
  border-color: #3f3f46;
  color: #cbd5e1;
}

.load-more-btn:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #1e293b;
}

.load-more-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.no-more-text {
  color: #94a3b8;
  font-size: 14px;
}

.animate-spin {
  animation: spin 1s linear infinite;
  display: inline-block;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.featured-banner {
  position: relative;
  width: 100%;
  height: 180px;
  border-radius: 20px;
  background-image:
    linear-gradient(to right, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.4)), url('/posecraft/logo.svg');
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 40px;
  margin-bottom: 28px;
  color: #ffffff;
  overflow: hidden;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
}

.banner-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.banner-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #fbbf24;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.banner-title {
  font-size: 24px;
  font-weight: 850;
  margin: 0;
  letter-spacing: -0.5px;
}

.banner-desc {
  font-size: 13.5px;
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
}

.banner-btn {
  background: #ff2442;
  color: #ffffff;
  border: none;
  padding: 10px 24px;
  border-radius: 99px;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.25s ease;
  box-shadow: 0 4px 15px rgba(255, 36, 66, 0.25);
  flex-shrink: 0;
}

.banner-btn:hover {
  background: #e11d48;
  transform: scale(1.03);
}

@media (max-width: 768px) {
  .featured-banner {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 16px;
    padding: 24px;
    height: auto;
    background-image:
      linear-gradient(to bottom, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.7)), url('/posecraft/logo.svg');
  }

  .banner-btn {
    align-self: flex-start;
  }
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 20px;
  margin-top: -5%;
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
  margin-bottom: 20px;
}

.empty-btn {
  padding: 10px 28px;
  border-radius: 20px;
  background: #ff2442;
  color: #ffffff;
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  transition: all 0.2s;
  box-shadow: 0 4px 10px rgba(255, 36, 66, 0.2);
}

.empty-btn:hover {
  background: #e11d48;
}
</style>
