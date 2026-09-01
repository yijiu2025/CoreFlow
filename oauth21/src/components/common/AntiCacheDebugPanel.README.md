# AntiCacheDebugPanel 组件说明

## 概述

`AntiCacheDebugPanel` 是一个专门用于调试防缓存功能的组件，提供了完整的防缓存戳管理界面。

## 功能特性

### 🎯 核心功能
- **实时显示**：显示当前防缓存戳值
- **手动刷新**：手动生成新的防缓存戳
- **自动刷新**：支持定时自动刷新（默认5分钟）
- **状态监控**：显示刷新次数、最后刷新时间等信息

### 🎨 界面特性
- **响应式设计**：固定在右上角，不影响主界面
- **暗色主题**：专业的调试面板外观
- **动画效果**：滑入动画和按钮交互动画
- **可折叠**：支持关闭面板

### 🔧 调试功能
- **详细信息**：JSON 格式显示完整调试信息
- **复制功能**：一键复制防缓存戳
- **间隔调整**：可自定义刷新间隔
- **开关控制**：可暂停/开启自动刷新

## 基础用法

### 1. 基础引入
```vue
<template>
  <div>
    <!-- 主界面内容 -->
    <AntiCacheDebugPanel :visible="showDebug" />
  </div>
</template>

<script setup lang="ts">
import AntiCacheDebugPanel from '@/components/common/AntiCacheDebugPanel.vue';

const showDebug = ref(true);
</script>
```

### 2. 完整配置
```vue
<template>
  <AntiCacheDebugPanel
    :visible="true"
    :refresh-interval="10 * 60 * 1000"  // 10分钟
  />
</template>
```

## Props

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `visible` | boolean | false | 是否显示调试面板 |
| `refreshInterval` | number | 300000 (5分钟) | 自动刷新间隔（毫秒） |

## 事件

组件内部已处理所有交互，无需额外监听事件。

## 最佳实践

### 1. 开发环境使用
```typescript
// 只在开发环境显示
const showDebug = computed(() => import.meta.env.DEV);
```

### 2. 条件显示
```vue
<template>
  <AntiCacheDebugPanel 
    v-if="showDebug"
    :visible="isDebugMode"
  />
</template>

<script setup lang="ts">
const isDebugMode = ref(false);

// 通过快捷键切换
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'D') {
    isDebugMode.value = !isDebugMode.value;
  }
});
</script>
```

### 3. 配合路由参数
```javascript
// 从URL参数控制
const showDebug = route.query.debug === 'true';
```

## 自定义样式

组件使用 scoped 样式，如需自定义，可以：

### 1. 覆盖样式
```vue
<style scoped>
/* 覆盖面板背景 */
:deep(.debug-panel) {
  background: rgba(0, 0, 0, 0.95);
}

/* 覆盖按钮样式 */
:deep(.refresh-btn) {
  background: #67c23a;
}
</style>
```

### 2. 全局样式
```css
/* 在全局CSS中修改 */
.debug-panel {
  border-radius: 16px;
}

.debug-panel .refresh-btn {
  border-radius: 8px;
}
```

## 性能考虑

1. **按需加载**：只在需要时显示面板
2. **自动清理**：组件卸载时自动清理定时器
3. **轻量级**：依赖最小化，不影响主应用性能

## 注意事项

1. **开发环境**：推荐仅在开发环境使用
2. **性能影响**：自动刷新会产生一定的性能开销
3. **安全性**：调试面板不应暴露给生产环境用户
4. **响应式**：组件内部已处理所有响应式更新

## 扩展建议

### 1. 添加更多调试信息
```typescript
// 在组件中添加新的调试信息
const customDebug = {
  customData: 'your data',
  timestamp: Date.now()
};
```

### 2. 集成到现有调试工具
```typescript
// 与其他调试工具集成
if (window.__DEBUG__) {
  window.__DEBUG__.antiCache = {
    rnd,
    refreshCount,
    lastRefreshed
  };
}
```

### 3. 添加主题支持
```vue
<template>
  <AntiCacheDebugPanel
    :theme="theme"
    :visible="true"
  />
</template>
```

## 常见问题

### Q: 如何完全关闭自动刷新？
A: 设置 `refreshInterval` 为 0 或 `autoRefresh: false`

### Q: 如何调整面板位置？
A: 通过 CSS 覆盖 `.debug-panel` 的 `top` 和 `right` 属性

### Q: 如何自定义刷新按钮文本？
A: 查看组件源码，通过插槽或 props 传入自定义内容