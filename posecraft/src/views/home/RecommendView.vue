<!--
 * 推荐频道视图
 *
 * 根据用户偏好推荐的瀑布流内容，共享 useHome 的状态（filteredItems / loading / loadMore）。
 * 首次加载显示骨架占位，触底自动加载更多，无数据时显示空状态。
 *
 * @author Claude
 * @since 2026-07-13
 -->
<template>
  <div class="recommend-page-container">
    <div class="content-container">
      <!-- 首次加载中：骨架占位 -->
      <template v-if="loading && filteredItems.length === 0">
        <div class="waterfall-grid">
          <SkeletonCard v-for="n in 8" :key="n" />
        </div>
      </template>

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
            <span v-if="loading" class="animate-spin">🔄</span>
            <span>{{ loading ? '加载中...' : '加载更多' }}</span>
          </button>
        </div>
        <div class="load-more-container" v-else>
          <span class="no-more-text">没有更多推荐了</span>
        </div>
      </template>
      <template v-else>
        <div class="empty-state">
          <div class="empty-icon">✨</div>
          <div class="empty-text">暂时没有推荐的内容</div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useHome } from '@/composables/useHome'
import PoseCard from '@/components/cards/home/PoseCard.vue'
import SkeletonCard from '@/components/cards/home/SkeletonCard.vue'

const {
  activeNav,
  filteredItems,
  hasMore,
  loading,
  loadMore,
  openDetail,
  handleLike,
  handleCollect
} = useHome()

// 切换当前导航状态
activeNav.value = 'recommend'
</script>

<style scoped>
.recommend-page-container {
  width: 100%;
}

.content-container {
  padding: 20px 32px 0;
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
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
