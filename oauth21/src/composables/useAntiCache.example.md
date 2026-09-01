# useAntiCache 使用示例

## 基础用法

### 1. 在组件中使用
```vue
<script setup lang="ts">
import { useAntiCache } from '@/composables/useAntiCache';

// 基础用法
const { rnd, refresh } = useAntiCache();

// 自动刷新（每5分钟）
const { 
  rnd, 
  refresh, 
  lastRefreshed, 
  refreshCount 
} = useAntiCache({
  autoRefresh: true,
  refreshInterval: 5 * 60 * 1000
});

// 带调试信息
const { 
  rnd, 
  debugInfo 
} = useAntiCache({
  enableDebug: true,
  autoRefresh: true
});
</script>

<template>
  <div>
    <p>防缓存戳: {{ rnd }}</p>
    <p>最后刷新: {{ lastRefreshed }}</p>
    <p>刷新次数: {{ refreshCount }}</p>
    
    <button @click="refresh">手动刷新</button>
    
    <!-- 调试信息（仅开发环境） -->
    <div v-if="debugInfo" class="debug">
      <pre>{{ debugInfo }}</pre>
    </div>
  </div>
</template>
```

### 2. 生成带防缓存的URL
```typescript
import { useAntiCache } from '@/composables/useAntiCache';

const { getAntiCacheUrl } = useAntiCache({
  autoRefresh: true
});

// 使用示例
const apiUrl = getAntiCacheUrl('/api/login', {
  clientId: 'my-app',
  redirectUri: 'https://myapp.com/callback'
});

// 结果: https://domain.com/api/login?rnd=0.7164508668310778&clientId=my-app&redirectUri=https%3A%2F%2Fmyapp.com%2Fcallback
```

## 高级用法

### 3. 在API请求中使用
```typescript
import { useAntiCache } from '@/composables/useAntiCache';
import { useFetch } from '@/composables/useFetch';

const { getAntiCacheUrl } = useAntiCache();

const { data, error, loading } = useFetch(() => 
  getAntiCacheUrl('/api/user/profile', {
    version: 'v1'
  })
);
```

### 4. 在资源加载中使用
```typescript
import { useAntiCache } from '@/composables/useAntiCache';

const { getAntiCacheUrl } = useAntiCache();

// 加载CSS文件（防止缓存）
const loadStyles = () => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = getAntiCacheUrl('/styles/main.css');
  document.head.appendChild(link);
};

// 加载JS文件
const loadScript = () => {
  const script = document.createElement('script');
  script.src = getAntiCacheUrl('/scripts/app.js');
  document.body.appendChild(script);
};
```

### 5. 在SSR或Hydration时使用
```typescript
// 在组件挂载后初始化
const { rnd, refresh } = useAntiCache({
  autoRefresh: true,
  refreshInterval: 10 * 60 * 1000
});

// 监听防缓存戳变化
watch(() => rnd.value, (newRnd) => {
  console.log('防缓存戳已更新:', newRnd);
  // 可以在这里触发重新渲染或其他操作
});
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `autoRefresh` | boolean | false | 是否自动刷新防缓存戳 |
| `refreshInterval` | number | 300000 (5分钟) | 自动刷新间隔（毫秒） |
| `enableDebug` | boolean | false | 是否启用调试信息 |

## 返回值说明

### 响应式数据
- `rnd`: 当前防缓存戳
- `lastRefreshed`: 最后刷新时间
- `refreshCount`: 刷新次数统计

### 方法
- `refresh()`: 手动刷新防缓存戳
- `refreshAndGet()`: 刷新并返回新值
- `getAntiCacheUrl()`: 生成带防缓存参数的URL

### 计算属性
- `formattedLastRefreshed`: 格式化的最后刷新时间
- `isAutoRefreshing`: 是否正在自动刷新
- `refreshIntervalMs`: 刷新间隔（毫秒）

## 注意事项

1. **性能考虑**: 自动刷新不要设置太频繁，建议至少1分钟以上
2. **SSR兼容**: 在服务端渲染时，防缓存戳只在客户端生成和更新
3. **调试模式**: 调试信息仅在开发环境(`import.meta.env.DEV`)中可用
4. **内存管理**: 组件卸载时会自动清除定时器

## 应用场景

1. **防止API缓存**: 避免浏览器缓存API响应
2. **防止资源缓存**: 确保CSS/JS文件更新后能重新加载
3. **A/B测试**: 防止缓存影响测试结果
4. **安全验证**: 防止重放攻击
5. **实时数据**: 确保获取最新数据