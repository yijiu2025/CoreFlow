import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { firewallApi } from '@/api/firewall'
import { useCache } from '@/composables/useCache'

const cache = useCache('localStorage')

/**
 * 认证模式：
 * - JWT 模式：token 存 localStorage，请求带 Authorization header
 * - Session 模式（默认）：Cookie 自动携带，无需存 token
 *
 * 通过 checkSession 中的 getUserInfo 调用自动适配两种模式
 */
export const useAuthStore = defineStore('auth', () => {
  const isLoggedIn = ref(false)
  const user = ref<any>(null)
  const token = ref<string | null>(null)
  const roles = ref<string[]>([])
  const permissions = ref<{ allows: string[]; denies: string[] }>({ allows: [], denies: [] })
  /** 控制登录弹窗显示（API 层 401 时自动设为 true） */
  const showLoginModal = ref(false)

  /** 是否为管理员（GLOBAL 或 firewall 超管） */
  const isAdmin = computed(() =>
    roles.value.includes('admin') ||
    roles.value.includes('superadmin') ||
    roles.value.includes('fw_admin')
  )

  /** 主要角色显示名称 */
  const roleName = computed(() => {
    if (roles.value.includes('superadmin') || roles.value.includes('admin')) return '超级管理员'
    if (roles.value.includes('fw_admin')) return '防火墙管理员'
    if (roles.value.includes('fw_operator')) return '防火墙操作员'
    if (roles.value.includes('fw_viewer')) return '观察者'
    return '访客'
  })

  /** 从缓存恢复状态 */
  function restore() {
    const savedUser = cache.get<any>('user')
    const savedRoles = cache.get<string[]>('roles')
    const savedPerms = cache.get<any>('permissions')
    const savedToken = cache.get<string>('token')

    // 有缓存的用户信息就恢复（Session 模式下可能没有 token）
    if (savedUser) {
      user.value = savedUser
      isLoggedIn.value = true
    }
    if (savedToken) token.value = savedToken
    if (savedRoles) roles.value = savedRoles
    if (savedPerms) permissions.value = savedPerms
  }

  function setLoggedIn(status: boolean, userData: any = null, tokenStr?: string) {
    isLoggedIn.value = status
    user.value = userData

    if (status) {
      if (userData) cache.set('user', userData)
      if (tokenStr) {
        token.value = tokenStr
        cache.set('token', tokenStr)
      }
    }

    if (!status) {
      token.value = null
      roles.value = []
      permissions.value = { allows: [], denies: [] }
      cache.del('token')
      cache.del('user')
      cache.del('roles')
      cache.del('permissions')
      cache.del('refresh_token')
    }
  }

  /**
   * 获取当前用户权限
   */
  async function fetchPermissions() {
    try {
      const res: any = await firewallApi.getPermissions()
      if (res) {
        roles.value = res.roles || []
        permissions.value = res.permissions || { allows: [], denies: [] }
        cache.set('roles', roles.value)
        cache.set('permissions', permissions.value)
      }
    } catch (err) {
      console.warn('🔒 获取权限失败:', err)
    }
  }

  /**
   * 检查会话有效性
   * 自动适配 JWT 和 Session 两种模式：
   * - JWT 模式：带 Bearer token 请求
   * - Session 模式：Cookie 自动携带
   */
  async function checkSession() {
    restore()

    try {
      const userInfo: any = await firewallApi.getUserInfo()
      if (userInfo && userInfo.sub) {
        const merged = {
          id: userInfo.sub || user.value?.id,
          username: userInfo.preferred_username || userInfo.name || user.value?.username,
          name: userInfo.name || user.value?.name,
          email: userInfo.email || user.value?.email,
          avatar: userInfo.avatar || user.value?.avatar
        }
        isLoggedIn.value = true
        user.value = merged
        cache.set('user', merged)
        await fetchPermissions()
        return true
      }
    } catch (err) {
      console.log('🔒 未登录或会话已过期')
    }

    setLoggedIn(false, null)
    return false
  }

  /**
   * 刷新 Access Token（仅 JWT 模式使用）
   */
  async function refreshAccessToken(): Promise<string> {
    const refreshToken = cache.get<string>('refresh_token')
    if (!refreshToken) throw new Error('无 Refresh Token')

    const { createHttp } = await import('@/api/firewall')
    const http = createHttp()
    const res: any = await http.post('/oauth2.1/token', {
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })

    const newToken = res.access_token
    if (!newToken) throw new Error('刷新失败：未返回新 Token')

    token.value = newToken
    cache.set('token', newToken)

    if (res.refresh_token) {
      cache.set('refresh_token', res.refresh_token, { exp: 86400 })
    }

    return newToken
  }

  /**
   * 检查是否拥有指定权限
   */
  function hasPermission(permission: string): boolean {
    if (isAdmin.value) return true

    const { allows, denies } = permissions.value
    if (denies.some(p => isPermissionMatch(p, permission))) return false
    return allows.some(p => isPermissionMatch(p, permission))
  }

  /**
   * 检查是否拥有指定角色
   */
  function hasRole(role: string): boolean {
    return roles.value.includes(role)
  }

  /**
   * 权限通配符匹配
   */
  function isPermissionMatch(pattern: string, target: string): boolean {
    if (pattern === '*') return true
    if (pattern === target) return true
    if (pattern.endsWith(':*')) {
      return target.startsWith(pattern.slice(0, -1))
    }
    return false
  }

  async function logout() {
    setLoggedIn(false, null)
    try { await firewallApi.clearCookie() } catch {}
  }

  // 初始化时恢复状态
  restore()

  return {
    isLoggedIn,
    user,
    token,
    roles,
    permissions,
    isAdmin,
    roleName,
    showLoginModal,
    setLoggedIn,
    checkSession,
    fetchPermissions,
    refreshAccessToken,
    hasPermission,
    hasRole,
    logout
  }
})
