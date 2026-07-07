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
      <div class="search-suggestions-inner" v-show="searchFocused && !showNavSearch">
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

    <!-- Sentinel：紧跟搜索框之后，搜索框滚出视野时立即触发 -->
    <div ref="sentinelRef" class="search-sentinel"></div>

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

<style scoped>
.search-sticky-header {
  position: relative;
  z-index: 80;
  background: #ffffff;
  padding: 16px 32px 0;
  border-bottom: none;
}

.dark-mode .search-sticky-header {
  background: #121214;
}

/* 搜索框主体 */
.search-hero-bar {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  min-height: 46px;
  background: #ffffff;
  border: 1.5px solid #e8edf2;
  border-radius: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  overflow: visible;
  z-index: 10;
  transition: border-radius 0.25s ease, border-color 0.25s ease;
}

.dark-mode .search-hero-bar {
  background: #18181b;
  border-color: #3f3f46;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

.search-hero-bar.focused {
  z-index: 20;
  border-radius: 16px 16px 0 0;
  border-color: #ff2442;
  box-shadow: 0 0 0 3px rgba(255, 36, 66, 0.08), 0 1px 4px rgba(0, 0, 0, 0.06);
}

.dark-mode .search-hero-bar.focused {
  border-color: #ff6b6b;
  box-shadow: 0 0 0 3px rgba(255, 107, 107, 0.15), 0 1px 4px rgba(0, 0, 0, 0.2);
}

.search-row-input {
  display: flex;
  align-items: center;
  height: 46px;
  padding: 0 44px 0 16px;
  transition: padding 0.3s ease;
}

.search-row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 0;
  opacity: 0;
  overflow: hidden;
  transition: all 0.25s ease;
  padding: 0 0 0 12px;
}

.search-hero-bar.at-top .search-row-actions,
.search-hero-bar.focused .search-row-actions {
  height: 36px;
  opacity: 1;
  padding: 0 0 8px 12px;
}

.search-plus-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.2s, background 0.2s;
  border-radius: 8px;
}

.search-plus-btn:hover {
  background: rgba(255, 36, 66, 0.06);
  color: #ff2442;
}

.dark-mode .search-plus-btn {
  color: #a1a1aa;
}

.dark-mode .search-plus-btn:hover {
  background: rgba(255, 107, 107, 0.1);
  color: #ff6b6b;
}

.search-divider-v {
  width: 1px;
  height: 18px;
  background: #e8edf2;
  flex-shrink: 0;
}

.dark-mode .search-divider-v {
  background: #3f3f46;
}

.search-input-new {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 15px;
  color: inherit;
  height: 100%;
  min-width: 0;
}

.search-input-new::placeholder {
  color: #94a3b8;
  font-size: 14px;
}

.dark-mode .search-input-new::placeholder {
  color: #71717a;
}

.search-ai-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;
}

.dark-mode .search-ai-hint {
  color: #a1a1aa;
}

.ai-badge {
  display: inline-flex;
  align-items: center;
  background: linear-gradient(135deg, #a78bfa, #6366f1);
  color: white;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  line-height: 1.5;
}

.search-btn-float {
  position: absolute;
  right: 8px;
  top: 23px;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  background: #333333;
  border: none;
  border-radius: 50%;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  z-index: 2;
  flex-shrink: 0;
}

.search-btn-float:hover {
  background: #ff2442;
}

.search-hero-bar.focused .search-btn-float,
.search-hero-bar.at-top .search-btn-float {
  top: 60px;
  width: 36px;
  height: 36px;
}

.dark-mode .search-btn-float {
  background: #3f3f46;
}

.dark-mode .search-btn-float:hover {
  background: #ff6b6b;
}

/* 搜索建议面板 */
.search-suggestions-inner {
  position: absolute;
  top: calc(100% - 1px);
  left: -1.5px;
  right: -1.5px;
  z-index: -1;
  background: #ffffff;
  border: 1.5px solid #ff2442;
  border-top: none;
  border-radius: 0 0 16px 16px;
  box-shadow: 0 0 0 3px rgba(255, 36, 66, 0.08);
  overflow: hidden;
  opacity: 0;
  transform: translateY(-12px);
  pointer-events: none;
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.search-hero-bar.focused .search-suggestions-inner {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.dark-mode .search-suggestions-inner {
  background: #18181b;
  border-color: #ff6b6b;
  box-shadow: 0 0 0 3px rgba(255, 107, 107, 0.15);
}

.suggest-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.06);
  margin: 0 16px;
}

.dark-mode .suggest-divider {
  background: rgba(255, 255, 255, 0.06);
}

.suggest-header {
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
  padding: 14px 20px 6px;
}

.dark-mode .suggest-header {
  color: #71717a;
}

.suggest-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  padding: 4px 12px 16px;
}

.suggest-item {
  display: block;
  width: 100%;
  background: transparent;
  border: none;
  padding: 10px 8px;
  font-size: 14px;
  color: #334155;
  text-align: left;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dark-mode .suggest-item {
  color: #e4e4e7;
}

.suggest-item:hover {
  background: rgba(255, 36, 66, 0.06);
  color: #ff2442;
}

.dark-mode .suggest-item:hover {
  background: rgba(255, 107, 107, 0.1);
  color: #ff6b6b;
}

/* Channel-container 分类 Tab */
.channel-container {
  display: flex;
  justify-content: center;
  width: 100%;
  margin-top: 40px;
  overflow-x: auto;
  scrollbar-width: none;
}

.channel-container::-webkit-scrollbar {
  display: none;
}

.channel-inner {
  display: flex;
  gap: 0;
  flex-shrink: 0;
}

.channel-tag {
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

.channel-tag.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 20%;
  right: 20%;
  height: 3px;
  background: #ff2442;
  border-radius: 99px 99px 0 0;
}

.dark-mode .channel-tag.active::after {
  background: #ff6b6b;
}

/* Sentinel */
.search-sentinel {
  width: 100%;
  height: 1px;
  pointer-events: none;
  opacity: 0;
}

@media (max-width: 1024px) {
  .search-sticky-header {
    padding: 12px 16px 0;
  }
}

@media (min-width: 769px) and (max-width: 1024px) {
  .search-sticky-header {
    padding: 16px 24px 0;
  }
}

@media (max-width: 480px) {
  .search-sticky-header {
    padding: 10px 12px 0;
  }

  .search-hero-bar {
    min-height: 40px;
    border-radius: 10px;
  }

  .search-input-new {
    font-size: 14px;
  }

  .search-btn-float {
    width: 28px;
    height: 28px;
    right: 6px;
  }

  .channel-tag {
    padding: 8px 14px;
    font-size: 13px;
  }
}
</style>
