/**
 * 认证状态管理
 * 接入 CoreFlow Session 认证（Cookie 模式）
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useCache } from '@/composables/useCache'

const cache = useCache('localStorage', 'posecraft_')

export const useAuthStore = defineStore('auth', () => {
  const isLoggedIn = ref(false)
  const user = ref<any>(null)
  const token = ref<string | null>(null)
  const roles = ref<string[]>([])
  const permissions = ref<{ allows: string[]; denies: string[] }>({ allows: [], denies: [] })
  const initialized = ref(false)

  const isAdmin = computed(() => roles.value.includes('admin') || roles.value.includes('posecraft_admin'))

  /** 从缓存恢复状态（不验证有效性） */
  function restoreFromCache() {
    const savedUser = cache.get<any>('user')
    if (savedUser) {
      user.value = savedUser
      isLoggedIn.value = true
      roles.value = cache.get('roles') || []
      permissions.value = cache.get('permissions') || { allows: [], denies: [] }
    }
    token.value = cache.get<string>('token')
  }

  /** 设置登录状态 */
  function setLoggedIn(status: boolean, userData: any = null, tokenStr?: string) {
    isLoggedIn.value = status
    user.value = userData

    if (status) {
      // 保存用户信息到缓存（无论是否有 token）
      if (userData) {
        cache.set('user', userData)
      }
      if (tokenStr) {
        token.value = tokenStr
        cache.set('token', tokenStr)
      }
    }

    if (!status) {
      token.value = null
      roles.value = []
      permissions.value = { allows: [], denies: [] }
      cache.del('user')
      cache.del('token')
      cache.del('roles')
      cache.del('permissions')
    }
  }

  /** 获取权限 */
  async function fetchPermissions() {
    try {
      const { authApi } = await import('@/api/auth')
      const res: any = await authApi.getPermissions()
      roles.value = res.roles || []
      permissions.value = res.permissions || { allows: [], denies: [] }
      cache.set('roles', roles.value)
      cache.set('permissions', permissions.value)
    } catch (err) {
      console.error('获取权限失败:', err)
    }
  }

  /**
   * 检查会话有效性
   * Session 模式：直接调用 API 验证 Cookie 是否有效
   * JWT 模式：检查 token 是否存在
   */
  async function checkSession(): Promise<boolean> {
    try {
      const { authApi } = await import('@/api/auth')
      const userData = await authApi.getUserInfo()

      if (userData) {
        user.value = userData
        isLoggedIn.value = true
        cache.set('user', userData)
        await fetchPermissions()
        initialized.value = true
        return true
      }
    } catch {
      // Session 无效，清除状态
      setLoggedIn(false, null)
    }

    initialized.value = true
    return false
  }

  /** 权限检查 */
  function hasPermission(permission: string): boolean {
    if (isAdmin.value) return true
    const { allows, denies } = permissions.value
    if (denies.some((p) => isPermissionMatch(p, permission))) return false
    return allows.some((p) => isPermissionMatch(p, permission))
  }

  function hasRole(role: string): boolean {
    return roles.value.includes(role)
  }

  function isPermissionMatch(pattern: string, target: string): boolean {
    if (pattern === '*') return true
    if (pattern === target) return true
    if (pattern.endsWith(':*')) return target.startsWith(pattern.slice(0, -1))
    return false
  }

  function logout() {
    setLoggedIn(false, null)
  }

  // 启动时从缓存恢复（快速显示 UI）
  restoreFromCache()

  return {
    isLoggedIn,
    user,
    token,
    roles,
    permissions,
    isAdmin,
    initialized,
    setLoggedIn,
    checkSession,
    fetchPermissions,
    hasPermission,
    hasRole,
    logout
  }
})
