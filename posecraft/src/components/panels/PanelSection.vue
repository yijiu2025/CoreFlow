<template>
  <div class="panel-section">
    <!-- 面板标题 -->
    <div class="panel-header">
      <div class="panel-title">
        <slot name="icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="10"/>
          </svg>
        </slot>
        <span>{{ title }}</span>
      </div>
    </div>

    <!-- 主要内容 -->
    <div class="panel-content">
      <slot />
    </div>

    <!-- 快捷键（可选） -->
    <template v-if="shortcuts && shortcuts.length > 0">
      <div class="panel-footer">
        <div class="shortcut-grid">
          <div v-for="(s, i) in shortcuts" :key="i" class="shortcut-item">
            <div class="shortcut-keys">
              <kbd v-for="(k, ki) in s.keys" :key="ki">{{ k }}</kbd>
            </div>
            <span class="shortcut-label">{{ s.label }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
interface Shortcut {
  keys?: string[]
  label: string
}

defineProps<{
  title: string
  shortcuts?: Shortcut[]
}>()
</script>

<style scoped>
.panel-section {
  display: flex; flex-direction: column;
  height: 100%;
}

.panel-header {
  padding: 16px 16px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.panel-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 600; color: #e2e8f0;
}

.panel-content {
  flex: 1; overflow-y: auto; padding: 16px;
}

.panel-footer {
  padding: 12px 16px;
  border-top: 1px solid rgba(255,255,255,0.06);
  background: rgba(0,0,0,0.1);
}

.shortcut-grid {
  display: flex; flex-direction: column; gap: 6px;
}

.shortcut-item {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px;
}

.shortcut-keys {
  display: flex; align-items: center; gap: 4px;
}

.shortcut-item kbd {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 24px; height: 22px; padding: 0 6px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  font-size: 11px; font-family: 'Inter', monospace; color: #94a3b8;
  line-height: 1;
}

.shortcut-label {
  color: #64748b; font-size: 11px;
}
</style>
