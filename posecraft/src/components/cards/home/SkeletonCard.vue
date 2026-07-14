<!--
 * 骨架占位卡片
 *
 * 首次加载数据时模拟真实 PoseCard 结构（图片、标题、头像、点赞），
 * 通过 CSS pulse 动画呈现闪烁效果，减少感知加载时间。
 *
 * @author Claude
 * @since 2026-07-13
 -->
<template>
  <!-- 骨架占位卡片：首次加载时模拟真实卡片结构 -->
  <div class="skeleton-card">
    <div class="skeleton-image animate-pulse"></div>
    <div class="skeleton-info">
      <div class="skeleton-title animate-pulse"></div>
      <div class="skeleton-footer">
        <div class="skeleton-avatar animate-pulse"></div>
        <div class="skeleton-likes animate-pulse"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.skeleton-card {
  break-inside: avoid;
  margin-bottom: 16px;
  background: #ffffff;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.04);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.01), 0 2px 4px -1px rgba(0, 0, 0, 0.006);
}

.dark-mode .skeleton-card {
  background: #18181b;
  border-color: #27272a;
}

.skeleton-image {
  width: 100%;
  aspect-ratio: 4 / 5;
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
}

.dark-mode .skeleton-image {
  background: linear-gradient(90deg, #27272a 25%, #3f3f46 50%, #27272a 75%);
  background-size: 200% 100%;
}

.skeleton-info {
  padding: 10px 12px;
}

.skeleton-title {
  height: 14px;
  border-radius: 4px;
  background: #e2e8f0;
  margin-bottom: 10px;
  width: 80%;
}

.dark-mode .skeleton-title {
  background: #3f3f46;
}

.skeleton-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.skeleton-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #e2e8f0;
}

.dark-mode .skeleton-avatar {
  background: #3f3f46;
}

.skeleton-likes {
  width: 36px;
  height: 12px;
  border-radius: 4px;
  background: #e2e8f0;
}

.dark-mode .skeleton-likes {
  background: #3f3f46;
}

.animate-pulse {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
