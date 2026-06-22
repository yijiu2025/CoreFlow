/**
 * 本地缓存封装
 */
export function useCache(storage: 'localStorage' | 'sessionStorage' = 'localStorage', prefix = '') {
  const storageObj = storage === 'localStorage' ? localStorage : sessionStorage

  function getKey(key: string) {
    return `${prefix}${key}`
  }

  function get<T>(key: string): T | null {
    try {
      const data = storageObj.getItem(getKey(key))
      if (!data) return null

      const parsed = JSON.parse(data)
      if (parsed.exp && Date.now() > parsed.exp) {
        storageObj.removeItem(getKey(key))
        return null
      }
      return parsed.value
    } catch {
      return null
    }
  }

  function set(key: string, value: any, options?: { exp?: number }) {
    const data: any = { value }
    if (options?.exp) {
      data.exp = Date.now() + options.exp * 1000
    }
    storageObj.setItem(getKey(key), JSON.stringify(data))
  }

  function del(key: string) {
    storageObj.removeItem(getKey(key))
  }

  function clear() {
    const keys = Object.keys(storageObj)
    keys.forEach(key => {
      if (key.startsWith(prefix)) {
        storageObj.removeItem(key)
      }
    })
  }

  return { get, set, del, clear }
}
