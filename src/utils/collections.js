/**
 * 集合工具函数
 * 提供 Map 上限保护、清理等通用操作
 *
 * @author yijiu2025
 * @since 2026-07-25
 */

/**
 * 当 Map 大小超过上限时，从最旧的一端逐条淘汰，直到不超过上限
 *
 * Map 保持插入顺序，最早的条目在最前面，优先淘汰它们；相比随机淘汰能更好地保留
 * 热数据（最近写入的条目）。
 *
 * ⚠️ 语义是**封顶**，不是"砍一半"：旧实现 `toDelete = size / 2` 只在
 * `size <= 2 * maxEntries` 时够用，一次性灌入 1000 条、上限 10 条时会留下 500 条 ——
 * 与"上限保护"的承诺不符。逐条删到 `size <= limit` 才是真上限。
 *
 * 注意：仅用于内存降级兜底场景，若用于非降级场景请改用 LRU（淘汰需按访问顺序而非插入顺序）。
 *
 * @param {Map<any, any>} map - 目标 Map（原地修改）
 * @param {number} maxEntries - 上限条目数；0 表示清空
 * @returns {number} 实际淘汰的条目数（便于调用方按需记日志）
 */
function capMapSize(map, maxEntries) {
  if (!(map instanceof Map)) return 0;
  const limit = Number.isFinite(maxEntries) ? Math.max(0, Math.floor(maxEntries)) : 0;

  let evicted = 0;
  // 边迭代边 delete 对 Map 是安全的（规范保证已删除项不会被再次访问）
  for (const key of map.keys()) {
    if (map.size <= limit) break;
    map.delete(key);
    evicted++;
  }
  return evicted;
}

export { capMapSize };
