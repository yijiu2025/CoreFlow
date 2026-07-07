<template>
  <div class="card" @click="$emit('click', item)">
    <div class="card-image" :style="{ aspectRatio: getAspectRatio(item.image_url || item.thumbnail_url) }">
      <!-- 1. 底图层 -->
      <img v-if="item.image_url" :src="item.image_url" :alt="item.title" class="base-image" />
      <div v-else class="empty-base-bg"></div>

      <!-- 2. 骨骼线覆盖层 -->
      <img
        v-if="showTemplate || !item.image_url"
        :src="item.thumbnail_url || '/placeholder.png'"
        alt="skeleton"
        class="skeleton-overlay animate-fade-in"
      />

      <div v-if="item.type === 'template' || isTemplateWork" class="card-badge">模板</div>
      <div v-else-if="item.type === 'video'" class="card-badge video-badge">视频</div>
      <div v-if="item.distance" class="card-location-badge">
        <span class="location-pin">📍</span>
        <span>{{ item.distance }}</span>
      </div>
    </div>
    <div class="card-info">
      <h3 class="card-title">{{ item.title || '未命名作品' }}</h3>
      <div class="card-footer">
        <div class="card-author">
          <div class="author-avatar">{{ (item.username || 'U').charAt(0) }}</div>
          <span class="author-name">{{ item.username || '匿名用户' }}</span>
        </div>
        <div class="card-likes-fav-wrapper">
          <div class="card-likes" @click.stop="$emit('like', item)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            <span>{{ formatLikes(item.likes_count) }}</span>
          </div>
          <button class="card-fav" :class="{ favorited: isFavorited }" @click.stop="toggleFavorite" title="收藏">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useHome } from '@/composables/useHome'

const props = defineProps<{
  item: any
}>()

defineEmits<{
  (e: 'click', item: any): void
  (e: 'like', item: any): void
}>()

const { showTemplate } = useHome()
const isFavorited = ref(false)
const toggleFavorite = () => {
  isFavorited.value = !isFavorited.value
}

const isTemplateWork = computed(() => {
  if (!props.item?.edit_data) return false
  try {
    const data = typeof props.item.edit_data === 'string' ? JSON.parse(props.item.edit_data) : props.item.edit_data
    return !!data?.is_template_work
  } catch (e) {
    return false
  }
})

const getAspectRatio = (url: string) => {
  if (!url) return '4/5'
  const match = url.match(/\/400\/(\d+)/)
  if (match && match[1]) {
    const height = parseInt(match[1])
    return `400 / ${height}`
  }
  return '4/5'
}

const formatLikes = (num: number) => {
  if (!num) return '0'
  if (num >= 10000) return (num / 10000).toFixed(1) + '万'
  return num.toString()
}
</script>

<style scoped>
.card {
  break-inside: avoid;
  margin-bottom: 16px;
  background: #ffffff;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  border: 1px solid rgba(0, 0, 0, 0.04);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.01), 0 2px 4px -1px rgba(0, 0, 0, 0.006);
}

.dark-mode .card {
  background: #18181b;
  border-color: #27272a;
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.05);
}

.card-image {
  position: relative;
  overflow: hidden;
  width: 100%;
  background: #f1f5f9;
}

.dark-mode .card-image {
  background: #27272a;
}

.base-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.skeleton-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
  z-index: 2;
}

.empty-base-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at center, #1e1b4b 0%, #09090b 100%);
}

.card-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(255, 36, 66, 0.9);
  backdrop-filter: blur(4px);
  color: white;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
}

.card-info {
  padding: 10px 12px;
}

.card-title {
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.5;
  color: inherit;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-author {
  display: flex;
  align-items: center;
  gap: 6px;
}

.author-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff2442, #ff8b63);
  color: white;
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.author-name {
  font-size: 11.5px;
  font-weight: 500;
  color: #64748b;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dark-mode .author-name {
  color: #a1a1aa;
}

.card-likes-fav-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
}

.card-likes {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #94a3b8;
  transition: color 0.2s;
  cursor: pointer;
}

.card-likes:hover {
  color: #ff2442;
}

.card-likes svg {
  transition: fill 0.2s, stroke 0.2s;
}

.card-likes:hover svg {
  fill: #ff2442;
  stroke: #ff2442;
}

.card-fav {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  transition: all 0.2s;
}

.card-fav:hover {
  color: #fbbf24;
}

.card-fav.favorited svg {
  fill: #fbbf24;
  stroke: #fbbf24;
}

.video-badge {
  background: rgba(59, 130, 246, 0.9) !important;
}

.card-location-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(4px);
  color: white;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 2px;
}
</style>
