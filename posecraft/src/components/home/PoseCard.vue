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
