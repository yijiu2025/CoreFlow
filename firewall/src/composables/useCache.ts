/**
 * 本地缓存封装
 *
 * 特性：
 * - 统一 API：get/set/delete/clear
 * - TTL 过期支持（秒）
 * - Key 前缀隔离（多项目共存不冲突）
 * - 自动 JSON 序列化/反序列化
 */

type CacheType = 'localStorage' | 'sessionStorage'

interface CacheOptions {
  /** 过期时间（秒），0 或不传表示永不过期 */
  exp?: number
}

interface CacheEntry<T> {
  value: T
  /** 过期时间戳（毫秒），0 表示永不过期 */
  expireAt: number
}

const PREFIX = 'fw_'

/**
 * 缓存工具 Hook
 * @param type 存储类型，默认 localStorage
 */
export function useCache(type: CacheType = 'localStorage') {
  const storage = window[type]

  /** 生成带前缀的 key */
  function key(k: string): string {
    return `${PREFIX}${k}`
  }

  /**
   * 写入缓存
   * @param k 键名
   * @param v 值
   * @param opts 选项（exp: 过期秒数）
   */
  function set<T>(k: string, v: T, opts: CacheOptions = {}): void {
    const entry: CacheEntry<T> = {
      value: v,
      expireAt: opts.exp ? Date.now() + opts.exp * 1000 : 0
    }
    try {
      storage.setItem(key(k), JSON.stringify(entry))
    } catch (e) {
      console.warn('[Cache] 写入失败:', k, e)
    }
  }

  /**
   * 读取缓存
   * @param k 键名
   * @param fallback 默认值（key 不存在或已过期时返回）
   * @returns 缓存值或 fallback
   */
  function get<T = any>(k: string, fallback: T | null = null): T | null {
    try {
      const raw = storage.getItem(key(k))
      if (!raw) return fallback

      const entry: CacheEntry<T> = JSON.parse(raw)

      // 检查是否过期
      if (entry.expireAt > 0 && Date.now() > entry.expireAt) {
        storage.removeItem(key(k))
        return fallback
      }

      return entry.value
    } catch {
      return fallback
    }
  }

  /**
   * 删除缓存
   * @param k 键名
   */
  function del(k: string): void {
    storage.removeItem(key(k))
  }

  /**
   * 清除所有带前缀的缓存
   */
  function clear(): void {
    const keysToRemove: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)
      if (k?.startsWith(PREFIX)) {
        keysToRemove.push(k)
      }
    }
    keysToRemove.forEach(k => storage.removeItem(k))
  }

  return { set, get, del, clear }
}
