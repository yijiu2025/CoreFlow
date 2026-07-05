<template>
  <div class="search-sticky-header">
    <!-- 搜索框主体 -->
    <div class="search-hero-bar" :class="{ focused: searchFocused, 'at-top': !showNavSearch }">
      <!-- 第一行：输入框 -->
      <div class="search-row-input">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索感兴趣的姿势模板、创意构图、运动技巧..."
          class="search-input-new"
          @focus="searchFocused = true"
          @blur="$emit('blur')"
        />
        <!-- 搜索按钮 -->
        <button class="search-btn-float">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
      </div>

      <!-- 第二行：操作栏 -->
      <div class="search-row-actions" v-show="searchFocused || !showNavSearch">
        <button class="search-plus-btn" @click="$emit('handleStartCreate')" title="创作">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <div class="search-divider-v"></div>
        <span class="search-ai-hint">问点点 <span class="ai-badge">AI</span></span>
      </div>

      <!-- 推荐面板 -->
      <div class="search-suggestions-inner" v-show="searchFocused">
        <div class="suggest-divider" style="margin-top: 0;"></div>
        <div class="suggest-header">猜你想搜</div>
        <div class="suggest-grid">
          <button
            v-for="word in searchSuggestions"
            :key="word"
            class="suggest-item"
            @mousedown.prevent="searchQuery = word; searchFocused = false"
          >
            {{ word }}
          </button>
        </div>
      </div>
    </div>

    <!-- 分类 Tab -->
    <div class="channel-container">
      <div class="channel-inner">
        <button
          v-for="ch in channels"
          :key="ch.value"
          @click="activeChannel = ch.value"
          :class="['channel-tag', { active: activeChannel === ch.value }]"
        >
          {{ ch.label }}
        </button>
      </div>
    </div>

    <!-- Sentinel：位于 header 底部 -->
    <div ref="sentinelRef" class="search-sentinel"></div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const searchQuery = defineModel<string>('searchQuery', { required: true })
const searchFocused = defineModel<boolean>('searchFocused', { required: true })
const activeChannel = defineModel<string>('activeChannel', { required: true })

defineProps<{
  searchSuggestions: string[]
  channels: any[]
  showNavSearch: boolean
}>()

defineEmits<{
  (e: 'blur'): void
  (e: 'handleStartCreate'): void
}>()

const sentinelRef = ref<HTMLElement | null>(null)

defineExpose({
  sentinelRef
})
</script>
