# 认证集成 {#frontend-auth}

## auth Store 标准实现

所有前端的 `stores/auth.ts` 必须包含以下功能：

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useCache } from '@/composables/useCache'

const cache = useCache('localStorage')

export const useAuthStore = defineStore('auth', () => {
  const isLoggedIn = ref(false)
  const user = ref<any>(null)
  const token = ref<string | null>(null)
  const roles = ref<string[]>([])
  const permissions = ref<{ allows: string[]; denies: string[] }>({ allows: [], denies: [] })

  const isAdmin = computed(() => roles.value.includes('admin'))

  /** 从缓存恢复状态 */
  function restore() {
    const savedToken = cache.get<string>('token')
    if (savedToken) {
      token.value = savedToken
      isLoggedIn.value = true
      user.value = cache.get('user')
      roles.value = cache.get('roles') || []
      permissions.value = cache.get('permissions') || { allows: [], denies: [] }
    }
  }

  /** 设置登录状态 */
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
    }
  }

  /** 获取权限（登录后自动调用） */
  async function fetchPermissions() {
    // 调用 /user/v1/permissions 接口
    // 存入 roles.value 和 permissions.value
  }

  /** 权限检查（deny 优先 + 通配符匹配） */
  function hasPermission(permission: string): boolean {
    if (isAdmin.value) return true
    const { allows, denies } = permissions.value
    if (denies.some(p => isPermissionMatch(p, permission))) return false
    return allows.some(p => isPermissionMatch(p, permission))
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

  function logout() { setLoggedIn(false, null) }

  restore()

  return {
    isLoggedIn, user, token, roles, permissions, isAdmin,
    setLoggedIn, fetchPermissions, hasPermission, hasRole, logout
  }
})
```

## 权限指令

```vue
<!-- 权限控制：无权限元素从 DOM 移除 -->
<button v-auth="'config:write'">保存</button>
<button v-auth="['config:write', 'config:delete']">操作</button>

<!-- 角色控制 -->
<button v-role="'admin'">管理</button>
<button v-role="['admin', 'operator']">操作</button>
```

## HTTP 请求封装

```typescript
import axios from 'axios'

const service = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 10000,
  withCredentials: true  // 允许跨域携带 Cookie
})

// 请求拦截：自动带 token
service.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 响应拦截：统一解包 + 401 处理
service.interceptors.response.use(
  (response) => {
    const res = response.data
    if (res.code === 200) return res.data
    return Promise.reject(new Error(res.message))
  },
  (error) => {
    if (error.response?.status === 401) {
      // 跳转登录或刷新 token
    }
    return Promise.reject(error)
  }
)

export default service
```

## 后端接口清单

### 认证相关

| 接口 | 方法 | 说明 |
|------|------|------|
| `/oauth21/v1/auth/login` | POST | 登录 |
| `/oauth21/v1/auth/register` | POST | 注册 |
| `/oauth21/v1/auth/logout` | POST | 登出 |
| `/user/v1/userinfo` | GET | 获取当前用户信息 |
| `/user/v1/permissions` | GET | 获取当前用户权限 |
