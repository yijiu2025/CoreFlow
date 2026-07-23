<template>
  <div class="bio-tooltip-card" :class="{ 'dark-mode': isDark }">
    <div v-for="(line, idx) in bioLines" :key="idx" class="bio-tooltip-line">
      {{ line }}
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  bioLines: string[];
  isDark: boolean;
}>();
</script>

<style scoped>
.bio-tooltip-card {
  position: fixed;
  width: 280px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  z-index: 100; /* 高于 TopNav(90)，确保不被导航栏遮挡 */
  display: none;
  color: #334155;
  text-align: left;
}

.bio-tooltip-card.dark-mode {
  background: #18181b;
  border-color: #27272a;
  color: #e4e4e7;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.bio-tooltip-line {
  font-size: 12.5px;
  line-height: 1.6;
  margin-bottom: 8px;
  white-space: nowrap;
}

.bio-tooltip-line:last-child {
  margin-bottom: 0;
}
</style>
