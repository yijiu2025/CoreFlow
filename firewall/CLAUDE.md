# Firewall 前端开发文档

## 常用命令

```bash
npm run dev          # 启动开发服务器 (Vite, 端口 5173)
npm run build        # 构建生产版本 (输出到 ../public/firewall)
npm run preview      # 预览生产构建
npm test             # Vitest 单元测试
```

## 技术栈

## 技术栈

- **框架**: Vue 3 + TypeScript (Composition API, `<script setup>`)
- **构建**: Vite 5
- **样式**: Tailwind CSS 3 + CSS 变量（HSL 色彩系统）
- **状态**: Pinia 3
- **路由**: Vue Router 4
- **HTTP**: Axios（封装工厂模式 + Token 刷新队列）
- **实时通信**: 原生 WebSocket（非 Socket.io）
- **图表**: ECharts 5（世界地图 + 中国地图）
- **图标**: Lucide Vue Next
- **国际化**: Vue I18n（5 语言：zh/en/ja/fr/de）
- **工具库**: VueUse（useColorMode, usePreferredDark 等）
- **进度条**: NProgress
- **自动导入**: unplugin-auto-import + unplugin-vue-components

## 启动流程

```
main.ts → bootstrap.ts（启动编排器）
  ├── 1. createApp + createPinia
  ├── 2. 全局错误处理器
  ├── 3. 插件注册：pinia → router → i18n
  ├── 4. 注册全局指令：v-auth, v-role
  ├── 5. router.isReady()
  └── 6. app.mount('#app')
```

## 启动流程

```text
main.ts → bootstrap.ts（启动编排器）
  ├── 1. createApp + createPinia
  ├── 2. 全局错误处理器
  ├── 3. 插件注册：pinia → router → i18n
  ├── 4. 注册全局指令：v-auth, v-role
  ├── 5. router.isReady()
  └── 6. app.mount('#app')
```

## 目录结构

```text
firewall/src/
├── main.ts                        # 极简入口，仅 import bootstrap
├── bootstrap.ts                   # 启动编排器（按序初始化所有模块）
├── App.vue                        # 根组件（地图背景 + Header + 全局模态框）
├── style.css                      # 全局样式（CSS 变量 + Tailwind）
│
├── api/
│   └── firewall.ts                # Axios 封装 + 业务 API 定义
│
├── config/
│   └── services.ts                # 后端服务地址配置（API/WS/SSO URL）
│
├── stores/                        # Pinia 状态管理
│   ├── auth.ts                    # 认证（token 持久化 + 权限获取 + 通配符匹配）
│   ├── dashboard.ts               # 仪表盘（WebSocket 连接 + 实时日志 + 统计）
│   ├── configs.ts                 # 三级守卫配置（System → Group → API 树）
│   ├── defense.ts                 # 封禁/白名单管理
│   ├── settings.ts                # 安全设置（限频/暴力破解/地理围栏等）
│   ├── theme.ts                   # 主题管理（HSL 色彩 + 深浅色 + 系统偏好）
│   └── ui.ts                      # UI 状态（HUD 可见性 + 加载态）
│
├── composables/                   # 组合式函数
│   ├── useCache.ts                # 本地缓存封装（TTL 过期 + Key 前缀隔离）
│   └── auto-imports/              # 自动导入（组件中无需 import 直接使用）
│       ├── useHttp.ts             # 返回带 token 的 Axios 实例
│       └── useTrans.ts            # i18n 翻译封装
│
├── directives/                    # Vue 全局指令
│   ├── auth.ts                    # v-auth="'perm:code'" 权限控制
│   └── role.ts                    # v-role="'admin'" 角色控制
│
├── components/
│   ├── ui/                        # 原子 UI 组件（自动注册）
│   │   ├── BaseModal.vue          # 模态框壳
│   │   ├── GlassCard.vue          # 毛玻璃卡片
│   │   ├── ToggleSwitch.vue       # 开关
│   │   ├── TagInput.vue           # 标签输入
│   │   ├── DataTable.vue          # 数据表格
│   │   └── ...                    # 其他原子组件
│   ├── layout/                    # 布局组件
│   │   ├── TheHeader.vue          # 顶部导航栏
│   │   ├── TrafficSidebar.vue     # 实时流量侧栏
│   │   └── AnalyticsSidebar.vue   # 分析侧栏
│   ├── modals/                    # 功能模态框
│   │   ├── SystemSettingsModal.vue    # 系统设置（44KB，最大文件）
│   │   ├── DefenseManagementModal.vue # 防御策略配置
│   │   ├── SecurityConsoleModal.vue   # 三级守卫控制台
│   │   ├── PolicyEditModal.vue        # 策略编辑表单
│   │   └── LoginModal.vue             # SSO 登录弹窗
│   ├── MapChart.vue               # ECharts 地图（世界/中国 + 流量轨迹）
│   ├── LogTable.vue               # 实时访问流水表
│   └── ...                        # 其他业务组件
│
├── views/                         # 页面视图
│   ├── DashboardView.vue          # 仪表盘（地图 + 统计 + 日志）
│   ├── FirewallView.vue           # 封禁/白名单管理
│   ├── SettingsView.vue           # 节点信息 + 快捷设置
│   ├── ConsoleView.vue            # 三级守卫配置树
│   └── LogsView.vue               # 完整日志视图
│
├── router/
│   └── index.ts                   # 路由配置（NProgress + 权限守卫）
│
├── i18n/
│   └── index.ts                   # 国际化配置（5 语言，内联翻译）
│
├── types/
│   └── index.ts                   # 全局 TypeScript 类型定义
│
└── utils/
    └── geoData.ts                 # 地理坐标数据
```

## API 路由规范

API 客户端在 `api/firewall.ts` 中统一定义：

```ts
// 创建独立实例（工厂模式，避免刷新 token 时递归拦截）
export function createHttp(baseURL?: string): AxiosInstance { ... }

// 默认实例（自动带 Bearer token）
const apiClient = createHttp()

// 业务 API
export const firewallApi = {
  getSummary: () => apiClient.get('/api/firewall/v1/monitor/summary'),
  // ...
}
```

**401 无感刷新机制**：

- 多个并发请求 401 时，只发一次 refresh 请求
- 其余请求加入 `pendingQueue` 排队等待
- 刷新成功后重放所有排队请求
- 刷新失败清除 token 并刷新页面

## 认证与权限系统

### 登录流程

```text
用户点击登录 → LoginModal 打开 SSO iframe
  → SSO 服务端验证 → postMessage 发送 LOGIN_SUCCESS
  → authStore.setLoggedIn(token, user)
  → authStore.fetchPermissions() 获取 roles + permissions
  → 缓存到 localStorage（fw_token, fw_user, fw_roles, fw_permissions）
```

### 权限数据结构

```ts
{
  roles: ['admin', 'operator'],           // 角色编码列表
  permissions: {
    allows: ['config:write', 'user:read:*'],  // 允许列表（支持通配符）
    denies: ['user:delete']                    // 拒绝列表（deny 优先）
  }
}
```

### 权限判断逻辑

```ts
const authStore = useAuthStore()

// 管理员拥有所有权限
if (authStore.isAdmin) { ... }

// 检查权限（deny 优先 + 通配符匹配）
if (authStore.hasPermission('config:write')) { ... }

// 检查角色
if (authStore.hasRole('admin')) { ... }
```

### 指令用法

```vue
<!-- 权限控制：无权限元素从 DOM 移除 -->
<button v-auth="'config:write'">保存</button>
<button v-auth="['config:write', 'config:delete']">操作</button>

<!-- 角色控制 -->
<button v-role="'admin'">管理</button>
<button v-role="['admin', 'operator']">操作</button>
```

## 状态管理架构

| Store | 职责 | 关键状态 |
|-------|------|----------|
| `auth` | 认证 + 权限 | `isLoggedIn`, `user`, `token`, `roles`, `permissions`, `isAdmin` |
| `dashboard` | 实时数据 | `logs`, `summary`, `wsEvents`, `serverPosition` |
| `configs` | 守卫配置树 | `configs`（System → Group → API 三级结构） |
| `defense` | 封禁管理 | `activeBlocks`, `activeWhitelist` |
| `settings` | 安全设置 | `securitySettings`（限频/暴力破解/地理围栏等） |
| `theme` | 主题 | `isDark`, `primaryColor`, `colorMode` |
| `ui` | UI 状态 | `isUIVisible`, `loading` |

## 缓存规范

统一使用 `useCache` 封装，Key 自动加 `fw_` 前缀：

```ts
import { useCache } from '@/composables/useCache'
const cache = useCache('localStorage')

cache.set('key', value)              // 永不过期
cache.set('key', value, { exp: 3600 }) // 1 小时过期
cache.get('key')                     // 读取（过期返回 null）
cache.del('key')                     // 删除
cache.clear()                        // 清除所有 fw_ 前缀的缓存
```

## 环境变量

配置在 `firewall/.env`：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_API_URL` | 防火墙 API 地址 | 开发: `http://localhost:3000` |
| `VITE_WS_HOST` | WebSocket 地址 | 开发: `localhost:3000` |
| `VITE_SSO_URL` | OAuth21 认证服务器 | `http://localhost:5174` |
| `VITE_USER_API_URL` | 用户信息接口 | 与 `VITE_API_URL` 相同 |

## 路由配置

| 路径 | 名称 | 视图 | 需要登录 |
|------|------|------|----------|
| `/` | Dashboard | DashboardView | ❌ |
| `/firewall` | Firewall | FirewallView | ✅ |
| `/settings` | Settings | SettingsView | ✅ |
| `/console` | Console | ConsoleView | ✅ |
| `/logs` | Logs | LogsView | ✅ |

路由守卫：NProgress 进度条 + Token 校验 + 动态标题

## 主题系统

基于 CSS 变量 + VueUse `useColorMode`：

```ts
import { useThemeStore } from '@/stores/theme'
const themeStore = useThemeStore()

themeStore.isDark          // 是否深色模式
themeStore.toggleTheme()   // 切换：light → dark → auto → light
themeStore.setTheme('dark') // 直接设置
themeStore.setPrimaryColor('200 80% 50%') // 设置主题色（HSL）
```

CSS 变量定义在 `style.css`：

```css
:root {
  --primary: 238.7 83.5% 66.7%;
  --accent: 238.3 82.7% 67.5%;
  --muted: 210 40% 96.1%;
  --bg: #f8fafc;
  --text: #1e293b;
  --glass-bg: rgba(255, 255, 255, 0.7);
}
.dark {
  --primary: 188.9 94.4% 42.7%;
  --bg: #020617;
  --text: #f1f5f9;
  --glass-bg: rgba(15, 23, 42, 0.6);
}
```

## 自动导入配置

`vite.config.js` 中配置了自动导入：

- **Vue API**: `ref`, `computed`, `watch`, `onMounted` 等无需 import
- **Vue Router**: `useRouter`, `useRoute` 无需 import
- **Pinia**: `defineStore`, `storeToRefs` 无需 import
- **Vue I18n**: `useI18n` 无需 import
- **Composables**: `src/composables/auto-imports/` 下的函数无需 import
- **组件**: `src/components/` 下的 `.vue` 文件自动注册

类型声明自动生成：

- `src/types/auto-imports.d.ts`
- `src/types/components.d.ts`

## 开发规范

- 注释和文档使用简体中文
- 组件使用 `<script setup lang="ts">`
- 函数命名使用小驼峰（camelCase）
- 每个函数写 JSDoc 文档注释
- 修改现有代码前先说明改动计划
- 遇到不确定的业务逻辑先提问再写代码
- 状态管理使用 Composition API 风格的 Pinia store
- 样式优先使用 Tailwind CSS 类名
- 复杂样式使用 CSS 变量驱动
