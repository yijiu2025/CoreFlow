# 前端统一开发规范 (Unified Frontend Development Guide)

> 本文件是所有前端（oauth21、admin、firewall 及未来新增）的统一架构规范。
> 所有前端项目必须遵循本规范，确保代码风格、目录结构、认证流程一致。

---

## 一、技术栈统一要求

| 类别 | 标准 | 说明 |
|------|------|------|
| 框架 | Vue 3.5+ | Composition API + `<script setup lang="ts">` |
| 构建 | Vite 5+ | 统一插件配置 |
| 样式 | Tailwind CSS 3 + SCSS | HSL 变量驱动主题 |
| 状态 | Pinia 3+ | Composition API 风格 |
| 路由 | Vue Router 4+ | NProgress + 权限守卫 |
| HTTP | Axios | 工厂模式 + 401 刷新队列 |
| 国际化 | Vue I18n 9+ | 中/英双语起步 |
| 工具库 | @vueuse/core | useColorMode, usePreferredDark 等 |
| 自动导入 | unplugin-auto-import + unplugin-vue-components | 消除样板 import |
| 表单验证 | vee-validate + zod | 复杂表单场景使用 |
| 类型 | TypeScript 5+ | 严格模式 |

---

## 二、统一目录结构

所有前端必须遵循以下目录结构：

```text
src/
├── main.ts                    # 极简入口，仅 import bootstrap
├── bootstrap.ts               # 启动编排器（按序初始化）
├── App.vue                    # 根组件
├── style.css                  # 全局样式 + CSS 变量
│
├── api/                       # 接口请求模块
│   └── [module].ts            # 按业务模块划分
│
├── config/
│   └── services.ts            # 后端服务地址配置
│
├── stores/                    # Pinia 状态管理
│   ├── auth.ts                # 认证 + 权限（必须）
│   ├── theme.ts               # 主题管理（必须）
│   └── [module].ts            # 业务 store
│
├── composables/               # 组合式函数
│   ├── useCache.ts            # 本地缓存封装（必须）
│   └── auto-imports/          # 自动导入的 composable
│       ├── useHttp.ts         # HTTP 实例
│       └── useTrans.ts        # i18n 翻译
│
├── directives/                # Vue 全局指令
│   ├── auth.ts                # v-auth 权限指令
│   └── role.ts                # v-role 角色指令
│
├── components/
│   ├── ui/                    # 原子 UI 组件（自动注册）
│   ├── layout/                # 布局组件
│   └── [module]/              # 业务组件
│
├── views/                     # 页面视图
│   └── [module]/              # 按业务模块划分
│
├── router/
│   └── index.ts               # 路由配置
│
├── i18n/
│   └── index.ts               # 国际化配置
│
├── types/
│   ├── index.ts               # 全局类型定义
│   ├── auto-imports.d.ts      # 自动生成
│   └── components.d.ts        # 自动生成
│
└── utils/
    └── [tool].ts              # 工具函数
```

---

## 三、启动流程规范

### 3.1 main.ts（极简入口）

```typescript
/**
 * 应用入口文件
 * 启动逻辑移至 bootstrap.ts
 */
import './bootstrap'
```

### 3.2 bootstrap.ts（启动编排器）

```typescript
/**
 * 应用启动编排器
 * 按序初始化：状态管理 → 路由 → 国际化 → 指令 → 等待路由就绪 → 挂载
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { authDirective } from './directives/auth'
import { roleDirective } from './directives/role'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

// 1. 全局错误处理
app.config.errorHandler = (err, instance, info) => {
  console.error('[Global Exception]', err, info)
}

// 2. 插件注册
app.use(pinia)
app.use(router)
app.use(i18n)

// 3. 注册全局指令
app.directive('auth', authDirective)
app.directive('role', roleDirective)

// 4. 等待路由就绪后挂载
router.isReady().then(() => {
  app.mount('#app')
})
```

---

## 四、认证与权限系统

### 4.1 后端 API

所有前端共享同一套认证接口：



| 接口 | 方法 | 说明 |
|------|------|------|
| `/user/v1/userinfo` | GET | 获取当前用户信息 |
| `/user/v1/permissions` | GET | 获取当前用户角色和权限 |
| `/oauth21/v1/auth/login` | POST | 登录（密码/邮箱） |
| `/oauth21/v1/auth/register` | POST | 注册 |
| `/oauth21/v1/auth/logout` | POST | 登出 |

### 4.2 auth Store 标准实现

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
    // 实现：调用 /user/v1/permissions 接口
    // 存入 roles.value 和 permissions.value
    // 缓存到 localStorage
  }

  /** 检查会话有效性 */
  async function checkSession() {
    if (!token.value) restore()
    if (token.value) {
      try {
        // 调用 /user/v1/userinfo 验证 token
        // 成功后调用 fetchPermissions()
        return true
      } catch {
        setLoggedIn(false, null)
      }
    }
    return false
  }

  /** 权限检查（deny 优先 + 通配符匹配） */
  function hasPermission(permission: string): boolean {
    if (isAdmin.value) return true
    const { allows, denies } = permissions.value
    if (denies.some(p => isPermissionMatch(p, permission))) return false
    return allows.some(p => isPermissionMatch(p, permission))
  }

  /** 角色检查 */
  function hasRole(role: string): boolean {
    return roles.value.includes(role)
  }

  /** 通配符匹配 */
  function isPermissionMatch(pattern: string, target: string): boolean {
    if (pattern === '*') return true
    if (pattern === target) return true
    if (pattern.endsWith(':*')) {
      return target.startsWith(pattern.slice(0, -1))
    }
    return false
  }

  function logout() {
    setLoggedIn(false, null)
  }

  restore()

  return {
    isLoggedIn, user, token, roles, permissions, isAdmin,
    setLoggedIn, checkSession, fetchPermissions,
    hasPermission, hasRole, logout
  }
})
```

### 4.3 权限指令

所有前端必须注册以下全局指令：



```vue
<!-- 权限控制：无权限元素从 DOM 移除 -->
<button v-auth="'config:write'">保存</button>
<button v-auth="['config:write', 'config:delete']">操作</button>

<!-- 角色控制 -->
<button v-role="'admin'">管理</button>
<button v-role="['admin', 'operator']">操作</button>
```

---

## 五、HTTP 请求规范

### 5.1 工厂模式 + 401 刷新队列

所有前端的 API 层必须使用工厂模式创建 Axios 实例：



```typescript
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'

const TOKEN_KEY = 'token'

// 401 刷新队列
let isRefreshing = false
let pendingQueue: Array<(token: string) => void> = []

async function handle401(config: AxiosRequestConfig): Promise<any> {
  if (!isRefreshing) {
    isRefreshing = true
    try {
      const { useAuthStore } = await import('@/stores/auth')
      const newToken = await useAuthStore().refreshAccessToken()
      pendingQueue.forEach(cb => cb(newToken))
      pendingQueue = []
      if (config.headers) config.headers.Authorization = `Bearer ${newToken}`
      return apiClient(config)
    } catch {
      localStorage.removeItem(TOKEN_KEY)
      window.location.reload()
    } finally {
      isRefreshing = false
    }
  }
  return new Promise((resolve) => {
    pendingQueue.push((token) => {
      if (config.headers) config.headers.Authorization = `Bearer ${token}`
      resolve(apiClient(config))
    })
  })
}

/** 创建独立 Axios 实例 */
export function createHttp(baseURL?: string): AxiosInstance {
  const instance = axios.create({
    baseURL: baseURL || import.meta.env.VITE_API_URL || '',
    timeout: 10000,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' }
  })

  // 请求拦截：自动带 token
  instance.interceptors.request.use((config) => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  })

  // 响应拦截：统一解包 + 401 处理
  instance.interceptors.response.use(
    (response) => {
      const res = response.data
      if (res.code === 200) return res.data
      const error = new Error(res.message || 'API Error')
      ;(error as any).code = res.code
      return Promise.reject(error)
    },
    (error) => {
      if (error.response?.status === 401) return handle401(error.config)
      return Promise.reject(error)
    }
  )

  return instance
}

// 默认实例
const apiClient = createHttp()
export default apiClient
```

### 5.2 API 模块划分

```typescript

// api/auth.ts — 认证相关
export const authApi = {
  login: (data) => apiClient.post('/oauth21/v1/auth/login', data),
  register: (data) => apiClient.post('/oauth21/v1/auth/register', data),
  getUserInfo: () => apiClient.get('/user/v1/userinfo'),
  getPermissions: () => apiClient.get('/user/v1/permissions'),
  // ...
}

// api/user.ts — 用户管理
export const userApi = {
  getList: (params) => apiClient.get('/admin/v1/iam/users', { params }),
  // ...
}
```

---

## 六、缓存规范

统一使用 `useCache` 封装，Key 自动加前缀隔离：

```typescript

import { useCache } from '@/composables/useCache'
const cache = useCache('localStorage')

cache.set('key', value)                // 永不过期
cache.set('key', value, { exp: 3600 }) // 1 小时过期
cache.get('key')                       // 读取（过期返回 null）
cache.del('key')                       // 删除
cache.clear()                          // 清除所有带前缀的缓存
```

每个前端使用不同的 Key 前缀（在 `useCache` 中配置）：

| 前端 | 前缀 |
|------|------|
| firewall | `fw_` |
| oauth21 | `sso_` |
| admin | `adm_` |

---

## 七、主题系统

### 7.1 CSS 变量

所有前端使用统一的 HSL 色彩变量：



```css
:root {
  --primary: 238.7 83.5% 66.7%;
  --accent: 238.3 82.7% 67.5%;
  --muted: 210 40% 96.1%;
  --bg: #f8fafc;
  --text: #1e293b;
  --glass-bg: rgba(255, 255, 255, 0.7);
  --glass-border: rgba(255, 255, 255, 0.4);
}

.dark {
  --primary: 188.9 94.4% 42.7%;
  --accent: 188.9 94.4% 42.7%;
  --muted: 217.2 32.6% 17.5%;
  --bg: #020617;
  --text: #f1f5f9;
  --glass-bg: rgba(15, 23, 42, 0.6);
  --glass-border: rgba(255, 255, 255, 0.1);
}
```

### 7.2 theme Store

```typescript

import { defineStore } from 'pinia'
import { ref, watchEffect } from 'vue'
import { useColorMode, usePreferredDark } from '@vueuse/core'

export const useThemeStore = defineStore('theme', () => {
  const colorMode = useColorMode({ storageKey: 'theme_mode' })
  const isDark = ref(false)
  const preferredDark = usePreferredDark()

  watchEffect(() => {
    isDark.value = colorMode.value === 'dark' ||
      (colorMode.value === 'auto' && preferredDark.value)
    document.documentElement.classList.toggle('dark', isDark.value)
  })

  function toggleTheme() {
    colorMode.value = colorMode.value === 'light' ? 'dark' : 'light'
  }

  return { isDark, colorMode, toggleTheme }
})
```

---

## 八、路由规范

### 8.1 路由守卫

```typescript

import { createRouter, createWebHistory } from 'vue-router'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

NProgress.configure({ showSpinner: false })

const router = createRouter({
  history: createWebHistory('/your-base-path/'),
  routes: [/* ... */]
})

router.beforeEach(async (to) => {
  NProgress.start()
  document.title = `${to.meta.title || 'App'} - Antigravity`

  if (to.meta.requiresAuth) {
    const token = localStorage.getItem('token')
    if (!token) {
      // 未登录处理
    }
  }
})

router.afterEach(() => NProgress.done())

export default router
```

### 8.2 路由 Meta 类型

```typescript

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    requiresAuth?: boolean
    roles?: string[]
    permissions?: string[]
  }
}
```

---

## 九、Vite 配置模板

```typescript

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia', 'vue-i18n'],
      dirs: ['./src/composables/auto-imports/**'],
      dts: './src/types/auto-imports.d.ts',
      eslintrc: { enabled: false }
    }),
    Components({
      dirs: ['src/components'],
      extensions: ['vue'],
      dts: './src/types/components.d.ts'
    })
  ],
  base: '/your-base-path/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173, // 每个前端使用不同端口
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../public/your-app-name',
    emptyOutDir: true
  }
})
```

各前端端口分配：

| 前端 | 开发端口 | 代理目标 | 构建输出 |
|------|----------|----------|----------|
| oauth21 | 5174 | `http://localhost:3000` | `../public/sso` |
| firewall | 5173 | `http://localhost:3000` | `../public/firewall` |
| admin | 5175 | `http://localhost:3000` | `../public/admin` |



---

## 十、环境变量规范

每个前端必须有 `.env` 文件：

```bash

# 后端 API 地址（留空使用相对路径）
VITE_API_URL=http://localhost:3000

# WebSocket 地址（如需要）
VITE_WS_HOST=localhost:3000

# SSO 登录地址（oauth21 前端地址）
VITE_SSO_URL=http://localhost:5174
```

---

## 十一、i18n 规范

### 11.1 最低要求

每个前端至少支持中文和英文：



```typescript
import { createI18n } from 'vue-i18n'

const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('lang') || 'zh',
  fallbackLocale: 'zh',
  messages: {
    zh: { /* 中文翻译 */ },
    en: { /* 英文翻译 */ }
  }
})

export default i18n
```

### 11.2 翻译 key 命名规范

```typescript

// 按模块分组
{
  "common": {
    "save": "保存",
    "cancel": "取消",
    "confirm": "确认",
    "delete": "删除",
    "loading": "加载中..."
  },
  "auth": {
    "login": "登录",
    "register": "注册",
    "logout": "退出登录"
  }
}
```

---

## 十二、开发流程

### 12.1 新前端初始化步骤

1. 创建目录，初始化 `package.json`
2. 安装依赖：`vue`, `vue-router`, `pinia`, `axios`, `vue-i18n`, `@vueuse/core`, `nprogress`
3. 安装 dev 依赖：`vite`, `@vitejs/plugin-vue`, `typescript`, `tailwindcss`, `unplugin-auto-import`, `unplugin-vue-components`
4. 按规范创建目录结构
5. 实现 `bootstrap.ts` 启动编排器
6. 实现 `stores/auth.ts` 认证 store
7. 实现 `stores/theme.ts` 主题 store
8. 实现 `composables/useCache.ts` 缓存封装
9. 实现 `directives/auth.ts` 和 `directives/role.ts`
10. 配置 `vite.config.ts`
11. 配置 `.env`
12. 创建 `CLAUDE.md` 文档

### 12.2 现有前端升级步骤

1. 对比本规范，识别缺失项
2. 按优先级补充：认证系统 → 缓存封装 → 权限指令 → i18n → 类型定义
3. 确保 API 层使用工厂模式 + 401 刷新队列
4. 确保主题系统使用 CSS 变量
5. 补充 `CLAUDE.md` 文档



---

## 十三、各前端现状与待办

### oauth21

| 项目 | 状态 | 优先级 |

|------|------|--------|
| i18n | 占位符 | 高 |
| composables/ | 空目录 | 高 |
| components/ui/ | 空目录 | 中 |
| types/ | 空目录 | 中 |
| constants/ | 空目录 | 低 |
| plugins/ | 空目录 | 低 |
| auth guard | 无 | 高 |
| 401 refresh | 占位符 | 高 |
| CLAUDE.md | 无 | 中 |
| build.outDir | 未配置 | 中 |

### admin

| 项目 | 状态 | 优先级 |

|------|------|--------|
| i18n | 未实现 | 高 |
| auth store | 无 | 高 |
| 业务 store | 仅 theme | 高 |
| API 模块 | 内联调用 | 高 |
| 路由守卫 | 无 | 高 |
| 权限指令 | 无 | 中 |
| CLAUDE.md | 无 | 中 |
| build.outDir | 未配置 | 中 |
| .env | 无 | 中 |

### firewall

| 项目 | 状态 | 优先级 |

|------|------|--------|
| 测试文件 | 无 | 低 |
| PWA | 无 | 低 |
| 表单验证 | 无 | 低 |
| build script | 缺 vue-tsc | 低 |

---

## 十四、后端接口清单

### OAuth2.1 模块（`/oauth21`）

| 接口 | 方法 | 说明 |

|------|------|------|
| `/oauth21/v1/auth/login` | POST | 登录（密码/邮箱） |
| `/oauth21/v1/auth/register` | POST | 注册 |
| `/oauth21/v1/auth/send-code` | POST | 发送验证码 |
| `/oauth21/v1/auth/send-email-code` | POST | 发送邮箱验证码 |
| `/oauth21/v1/auth/verify-code` | POST | 验证验证码 |
| `/oauth21/v1/auth/check-nickname` | GET | 检查昵称可用性 |
| `/oauth21/v1/auth/check-email` | GET | 检查邮箱可用性 |
| `/oauth21/v1/auth/captcha` | GET | 获取图形验证码 |
| `/oauth21/v1/auth/verify-captcha` | POST | 验证图形验证码 |
| `/oauth21/v1/auth/authorize` | GET | 授权页面 |
| `/oauth21/v1/auth/consent` | POST | 确认授权 |

### User 模块（`/user`）

| 接口 | 方法 | 说明 |

|------|------|------|
| `/user/v1/userinfo` | GET | 获取当前用户信息 |
| `/user/v1/permissions` | GET | 获取当前用户权限 |

### Admin 模块（`/admin`）

| 接口 | 方法 | 说明 |

|------|------|------|
| `/admin/v1/iam/roles` | GET | 获取角色列表 |
| `/admin/v1/iam/roles` | POST | 创建角色 |
| `/admin/v1/iam/roles/:id` | PUT | 更新角色 |
| `/admin/v1/iam/roles/:id` | DELETE | 删除角色 |
| `/admin/v1/iam/users/:id/roles` | GET | 获取用户角色 |
| `/admin/v1/iam/users/:id/roles` | PUT | 分配用户角色 |
| `/admin/v1/iam/policies` | GET | 获取策略列表 |
| `/admin/v1/iam/policies` | POST | 创建策略 |

### Notice 模块（`/notice`）

| 接口 | 方法 | 说明 |

|------|------|------|
| `/notice/v1/channels` | GET | 获取通知通道列表 |
| `/notice/v1/config/:type` | GET | 获取通道配置 |
| `/notice/v1/config/:type` | POST | 保存通道配置 |
| `/notice/v1/test-email` | POST | 测试邮件发送 |

### Verify 模块（`/verify`）

| 接口 | 方法 | 说明 |

|------|------|------|
| `/verify/v1/captcha` | GET | 获取图形验证码 |
| `/verify/v1/captcha/verify` | POST | 验证图形验证码 |
| `/verify/v1/slider` | GET | 获取滑块验证码 |
| `/verify/v1/slider/verify` | POST | 验证滑块验证码 |

### Firewall 模块（`/api/firewall`）

| 接口 | 方法 | 说明 |

|------|------|------|
| `/api/firewall/v1/monitor/summary` | GET | 获取监控摘要 |
| `/api/firewall/v1/monitor/records` | GET | 获取流量记录 |
| `/api/firewall/v1/monitor/ws` | WS | 实时流量推送 |
| `/api/firewall/v1/monitor/settings` | GET | 获取安全设置 |
| `/api/firewall/v1/monitor/settings` | PATCH | 更新安全设置 |
| `/api/firewall/v1/monitor/blocks` | GET/POST | 封禁管理 |
| `/api/firewall/v1/monitor/whitelist` | GET/POST | 白名单管理 |
| `/api/firewall/v1/apiconfigs` | GET | 获取 API 配置 |

---

**所有前端项目必须遵循本规范，确保代码风格、认证流程、目录结构一致。**
