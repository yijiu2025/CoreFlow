/**
 * 集合工具函数
 * 提供 Map 上限保护、清理等通用操作
 *
 * @author yijiu2025
 * @since 2026-07-25
 */

/**
 * 当 Map 大小超过上限时，丢弃最早插入的一半条目
 * Map 保持插入顺序，最早的条目在最前面，优先淘汰它们
 * 相比随机淘汰，能更好地保留热数据（最近写入的条目）
 * 注意：仅用于内存降级兜底场景，若用于非降级场景请改用 LRU
 * @param {Map<string, any>} map
 * @param {number} maxEntries
 */
function capMapSize(map, maxEntries) {
  if (map.size <= maxEntries) return;
  const toDelete = Math.floor(map.size / 2);
  let i = 0;
  for (const key of map.keys()) {
    if (i >= toDelete) break;
    map.delete(key);
    i++;
  }
}

export { capMapSize };
