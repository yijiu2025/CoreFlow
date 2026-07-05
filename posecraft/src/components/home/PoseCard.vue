<template>
  <div class="card" @click="$emit('click', item)">
    <div class="card-image">
      <img :src="item.thumbnail_url || item.image_url || '/placeholder.png'" :alt="item.title" />
      <div v-if="item.type === 'template'" class="card-badge">模板</div>
    </div>
    <div class="card-info">
      <h3 class="card-title">{{ item.title || '未命名作品' }}</h3>
      <div class="card-footer">
        <div class="card-author">
          <div class="author-avatar">{{ (item.username || 'U').charAt(0) }}</div>
          <span class="author-name">{{ item.username || '匿名用户' }}</span>
        </div>
        <div class="card-likes" @click.stop="$emit('like', item)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span>{{ formatLikes(item.likes_count) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  item: any
}>()

defineEmits<{
  (e: 'click', item: any): void
  (e: 'like', item: any): void
}>()

const formatLikes = (num: number) => {
  if (!num) return '0'
  if (num >= 10000) return (num / 10000).toFixed(1) + '万'
  return num.toString()
}
</script>

<style scoped>
.card {
  break-inside: avoid;
  margin-bottom: 20px;
  background: #ffffff;
  border-radius: 16px;
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
}

.card-image img {
  width: 100%;
  display: block;
  object-fit: cover;
}

.card-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(255, 36, 66, 0.9);
  backdrop-filter: blur(4px);
  color: white;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
}

.card-info {
  padding: 16px;
}

.card-title {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.5;
  color: inherit;
  margin-bottom: 12px;
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
  gap: 8px;
}

.author-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff2442, #ff8b63);
  color: white;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.author-name {
  font-size: 12.5px;
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

.card-likes {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #94a3b8;
  transition: color 0.2s;
}

.card-likes:hover {
  color: #ef4444;
}

.card-likes svg {
  transition: fill 0.2s;
}

.card-likes:hover svg {
  fill: #ef4444;
  stroke: #ef4444;
}
</style>
