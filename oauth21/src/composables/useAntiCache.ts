import { ref, onMounted, onUnmounted, computed } from 'vue';
import { generateRandomTimestamp, generateTimestampRandom } from '@/utils/anti-cache';

/**
 * 防缓存 Composable
 *
 * 提供防缓存相关的功能：
 * - 生成随机数戳
 * - 自动刷新机制
 * - URL参数处理
 * - 调试功能
 */
export function useAntiCache(options: {
  autoRefresh?: boolean;        // 是否自动刷新
  refreshInterval?: number;     // 刷新间隔（毫秒）
  enableDebug?: boolean;        // 是否启用调试
} = {}) {
  const {
    autoRefresh = false,
    refreshInterval = 5 * 60 * 1000, // 默认5分钟
    enableDebug = import.meta.env.DEV
  } = options;

  // 防缓存戳
  const rnd = ref(generateRandomTimestamp());

  // 最后刷新时间
  const lastRefreshed = ref(new Date());

  // 刷新次数统计
  const refreshCount = ref(0);

  // 刷新定时器
  let refreshTimer: number | null = null;

  /**
   * 生成新的防缓存戳
   */
  const refresh = () => {
    rnd.value = generateRandomTimestamp();
    lastRefreshed.value = new Date();
    refreshCount.value++;
  };

  /**
   * 手动刷新并返回新值
   */
  const refreshAndGet = () => {
    refresh();
    return rnd.value;
  };

  /**
   * 获取带防缓存参数的URL
   */
  const getAntiCacheUrl = (baseUrl: string, params?: Record<string, string>) => {
    const url = new URL(baseUrl, window.location.origin);
    url.searchParams.set('rnd', rnd.value);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    return url.toString();
  };

  // 格式化的最后刷新时间
  const formattedLastRefreshed = computed(() => {
    return lastRefreshed.value.toLocaleString();
  });

  // 启用自动刷新
  if (autoRefresh) {
    onMounted(() => {
      refreshTimer = window.setInterval(refresh, refreshInterval);
    });

    onUnmounted(() => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    });
  }

  return {
    // 响应式数据
    rnd,
    lastRefreshed,
    refreshCount,
    formattedLastRefreshed,

    // 方法
    refresh,
    refreshAndGet,
    getAntiCacheUrl,

    // 计算属性
    isAutoRefreshing: computed(() => autoRefresh),
    refreshIntervalMs: computed(() => refreshInterval),

    // 调试信息（仅在开发环境可用）
    debugInfo: enableDebug ? computed(() => ({
      currentRnd: rnd.value,
      lastRefreshed: lastRefreshed.value,
      refreshCount: refreshCount.value,
      autoRefresh: autoRefresh,
      refreshInterval: refreshInterval
    })) : undefined
  };
}