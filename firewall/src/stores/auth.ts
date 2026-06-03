import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { firewallApi } from '@/api/firewall'
import { useCache } from '@/composables/useCache'

const cache = useCache('localStorage')

export const useAuthStore = defineStore('auth', () => {
  const isLoggedIn = ref(false)
  const user = ref<any>(null)
  const token = ref<string | null>(null)
  const roles = ref<string[]>([])
  const permissions = ref<{ allows: string[]; denies: string[] }>({ allows: [], denies: [] })

  /** 是否为管理员 */
  const isAdmin = computed(() => roles.value.includes('admin'))

  /** 从缓存恢复状态 */
  function restore() {
    const savedToken = cache.get<string>('token')
    const savedUser = cache.get<any>('user')
    const savedRoles = cache.get<string[]>('roles')
    const savedPerms = cache.get<any>('permissions')

    if (savedToken) {
      token.value = savedToken
      isLoggedIn.value = true
      if (savedUser) user.value = savedUser
      if (savedRoles) roles.value = savedRoles
      if (savedPerms) permissions.value = savedPerms
    }
  }

  function setLoggedIn(status: boolean, userData: any = null, tokenStr?: string) {
    isLoggedIn.value = status
    user.value = userData
    if (status && tokenStr) {
      token.value = tokenStr
      cache.set('token', tokenStr)
      if (userData) cache.set('user', userData)
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
   * 登录成功后自动调用，将角色和权限存入 store 和缓存
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

  async function checkSession() {
    if (!token.value) restore()

    if (token.value) {
      try {
        const userInfo: any = await firewallApi.getUserInfo()
        if (userInfo && userInfo.sub) {
          // 增量合并，保留缓存中已有的完整数据
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
        console.log('🔒 Token 已失效')
      }
    }

    setLoggedIn(false, null)
    return false
  }

  /**
   * 刷新 Access Token
   * 由 API 层 401 拦截器调用
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

    // 更新 refresh_token（如果后端返回了新的）
    if (res.refresh_token) {
      cache.set('refresh_token', res.refresh_token, { exp: 86400 })
    }

    return newToken
  }

  /**
   * 检查是否拥有指定权限
   * @param permission 权限标识，如 'config:write'
   * 支持通配符匹配，deny 优先
   */
  function hasPermission(permission: string): boolean {
    // 管理员拥有所有权限
    if (isAdmin.value) return true

    const { allows, denies } = permissions.value

    // deny 优先：如果在拒绝列表中，直接返回 false
    if (denies.some(p => isPermissionMatch(p, permission))) {
      return false
    }

    // 检查允许列表
    return allows.some(p => isPermissionMatch(p, permission))
  }

  /**
   * 检查是否拥有指定角色
   * @param role 角色编码，如 'admin'
   */
  function hasRole(role: string): boolean {
    return roles.value.includes(role)
  }

  /**
   * 权限通配符匹配
   * 支持 '*' 通配符，如 'user:*' 匹配 'user:read', 'user:write' 等
   */
  function isPermissionMatch(pattern: string, target: string): boolean {
    if (pattern === '*') return true
    if (pattern === target) return true

    // 通配符匹配：user:* → user:read, user:write 等
    if (pattern.endsWith(':*')) {
      const prefix = pattern.slice(0, -1)
      return target.startsWith(prefix)
    }

    return false
  }

  function logout() {
    setLoggedIn(false, null)
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
    setLoggedIn,
    checkSession,
    fetchPermissions,
    refreshAccessToken,
    hasPermission,
    hasRole,
    logout
  }
})
