# Vue 3 开发规范

## 技术选型

| 领域     | 选型                                        |
| -------- | ------------------------------------------- |
| 语言     | **TypeScript 严格模式**，禁止无故使用 `any` |
| 构建     | Vite                                        |
| 请求     | Axios，所有 API 调用在统一层管理            |
| 代码质量 | ESLint + Prettier                           |

### TypeScript 严格模式配置

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": false,
    "moduleResolution": "bundler",
    "target": "ESNext",
    "module": "ESNext"
  }
}
```

| 选项                         | 说明                                           |
| ---------------------------- | ---------------------------------------------- |
| `strict: true`               | 启用所有严格类型检查                           |
| `noUncheckedIndexedAccess`   | 数组/对象索引返回 `T \| undefined`             |
| `noUnusedLocals`             | 禁止未使用的局部变量                           |
| `noUnusedParameters`         | 禁止未使用的参数                               |
| `exactOptionalPropertyTypes` | 可选属性不能赋值 `undefined`（视项目情况启用） |

---

## 环境变量配置

### 变量清单

前端通过 `VITE_` 前缀的环境变量与后端通信，项目初始化时必须创建 `.env` 文件：

| 变量           | 说明             | 开发默认值              | 必填 |
| -------------- | ---------------- | ----------------------- | ---- |
| `VITE_API_URL` | 后端 API 地址    | `http://localhost:3000` | ✅   |
| `VITE_WS_HOST` | WebSocket 地址   | `localhost:3000`        | 按需 |
| `VITE_SSO_URL` | SSO 登录页面地址 | `http://localhost:5174` | 按需 |

### 文件层级

```
.env                # 开发环境（commit 时不提交，仅提交 .env.example）
.env.example        # 模板，列出所有变量和默认值
.env.production     # 生产环境（不提交 git）
```

### Axios 实例配置

`src/api/index.ts` 中通过环境变量拼接后端地址，而非硬编码：

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL + '/stick/v1',
  timeout: 10000,
  withCredentials: true // 跨域携带 Cookie
});
```

### 设备身份接入（stable-deviceid，强制）

所有前端应用（含新建）必须接入 `stable-deviceid` 设备身份体系（后端风控/人机验证/设备管理依赖）。
**接入清单以 AGENTS.md"新前端设备身份接入（强制）"7 步清单为权威**（工程三件套、`initDeviceSync`、
`setupDeviceSync` 禁止手写拦截器、SSO 场景 `adoptDeviceId` 在 bindSession 前、verify-challenge 显式带头）。

axios 实例创建后一行接入：

```typescript
import { setupDeviceSync } from 'stable-deviceid';

const api = axios.create({ /* ... */ });
setupDeviceSync(api); // 自动注入 x-device-id 头、响应头同步、跨标签页监听
```

详细文档见 [packages/shared-device/README.zh-CN.md](../../../../../../../packages/shared-device/README.zh-CN.md)
的"快速开始"与"SSO 跨 origin 身份归一"章节；参考实现见 `posecraft/src/utils/request.ts`。

### 开发环境代理

开发时 Vite 代理将请求转发到后端，避免跨域问题（`vite.config.ts`）：

```typescript
server: {
  port: 5177,
  proxy: {
    '/stick': {
      target: 'http://localhost:3000',  // 对应 VITE_API_URL
      changeOrigin: true
    }
  }
}
```

> ⚠️ **开发依赖 proxy，生产依赖 VITE_API_URL**：开发时 Axios 请求发到 Vite 自身（`/stick/v1/...`），由 proxy 转发到后端。生产构建后 proxy 不存在，Axios 必须通过 `VITE_API_URL` 直接访问后端。`baseURL` 应设计为同时兼容两种模式，或用环境变量区分。

### 创建步骤

1. 前端开发完成后，创建 `.env.example` 列出所有变量
2. 复制为 `.env` 填入开发环境值
3. 部署时创建 `.env.production` 填入生产环境值
4. 将 `.env` 和 `.env.production` 加入 `.gitignore`
5. 确认 `src/api/index.ts` 中的 `baseURL` 使用 `import.meta.env.VITE_*`

---

## 一、认证与权限系统

### 权限数据结构

后端返回的权限信息格式：

```typescript
interface AuthData {
  roles: string[]; // 角色编码列表
  permissions: {
    allows: string[]; // 允许列表，支持通配符
    denies: string[]; // 拒绝列表，deny 优先
  };
}
```

### 通配符规则

| 模式               | 匹配范围         | 示例                                       |
| ------------------ | ---------------- | ------------------------------------------ |
| `*`                | 所有权限         | 管理员拥有全部权限                         |
| `模块名:*`         | 某模块下所有权限 | `模块名:资源:操作`                         |
| `模块名:资源:*`    | 某资源的所有操作 | `模块名:资源:create`、`模块名:资源:delete` |
| `模块名:资源:操作` | 精确匹配         | 只匹配该权限                               |

### 权限判断逻辑（deny 永远优先）

```
请求权限 "system:config:write"
  ├── denies 包含 "system:config:write" → ❌ 拒绝（即使 admin 也拒绝）
  ├── isAdmin = true → ✅ 放行
  ├── allows 包含 "system:*" → ✅ 放行（通配符匹配）
  └── 否则 → ❌ 拒绝
```

> **deny 永远优先于 admin 放行**：即使管理员，如果被明确 deny 了某个权限，也会被拒绝。

### 全局指令

| 指令     | 用途     | 说明                                                       |
| -------- | -------- | ---------------------------------------------------------- |
| `v-auth` | 权限控制 | 支持仅验权限、或权限+角色组合验证。无权限时元素从 DOM 移除 |

### v-auth 指令

```vue
<!-- 仅验权限 -->
<button v-auth="'system:config:write'">保存</button>
<!-- 单权限 -->
<button v-auth="['system:config:write', 'system:config:delete']">操作</button>
<!-- 多权限 OR -->
<button v-auth="{ any: ['system:config:write', 'system:config:delete'] }">操作</button>
<!-- 显式 OR -->
<button v-auth="{ all: ['system:config:write', 'system:config:delete'] }">操作</button>
<!-- AND -->

<!-- 权限 + 角色组合验证（同时满足才放行） -->
<button v-auth="{ perm: 'system:config:write', role: 'admin' }">保存</button>
<button v-auth="{ perm: { any: ['a', 'b'] }, role: 'admin' }">操作</button>
<button v-auth="{ perm: { all: ['a', 'b'] }, role: 'admin' }">操作</button>

<!-- 可选 modifier -->
<button v-auth:disabled="'system:config:write'">保存</button>
<!-- 无权限时禁用，不移除 -->
<button v-auth:hidden="'system:config:write'">保存</button>
<!-- 无权限时隐藏，不移除 -->
```

### 指令注册

```typescript
// src/directives/index.ts
import type { App } from 'vue';
import { authDirective } from './auth';

export function setupDirectives(app: App) {
  app.directive('auth', authDirective);
}
```

---

## 二、路由规范

### 路由配置

路由文件统一放在 `src/router/index.ts` 中，使用 `vue-router` 的 createRouter：

```typescript
import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: '首页', requireLogin: false }
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: '登录', requireLogin: false }
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { title: '仪表盘', requireLogin: true, permission: 'dashboard:read' }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});
```

### 路由懒加载

所有页面组件使用动态 `import()` 懒加载，禁止直接 import 页面组件：

```typescript
// ✅ 正确：懒加载
component: () => import('@/views/HomeView.vue');

// ❌ 错误：同步加载，会增加首屏包体积
import HomeView from '@/views/HomeView.vue';
component: HomeView;
```

### 路由守卫

使用 `router.beforeEach` 全局前置守卫做权限校验：

```typescript
router.beforeEach(async (to, from, next) => {
  // 设置页面标题
  document.title = (to.meta.title as string) || '默认标题';

  // 需要登录但未登录 → 跳转登录页
  if (to.meta.requireLogin && !authStore.isLoggedIn) {
    return next({ name: 'login', query: { redirect: to.fullPath } });
  }

  // 需要权限但无权限 → 跳转 403
  if (to.meta.permission && !authStore.hasPermission(to.meta.permission as string)) {
    return next({ name: 'forbidden' });
  }

  next();
});
```

### 路由元信息（meta）

| 字段           | 类型       | 说明                                  | 示例                    |
| -------------- | ---------- | ------------------------------------- | ----------------------- |
| `title`        | `string`   | 页面标题，守卫中设置 `document.title` | `'首页'`                |
| `requireLogin` | `boolean`  | 是否需要登录                          | `true`                  |
| `permission`   | `string`   | 需要的权限编码                        | `'dashboard:read'`      |
| `roles`        | `string[]` | 允许的角色列表                        | `['admin', 'operator']` |
| `keepAlive`    | `boolean`  | 是否启用 keep-alive                   | `true`                  |

---

## 三、SFC 代码块顺序

```vue
<template>...</template>
<script setup lang="ts">
...
</script>
<style scoped>
...
</style>
```

---

## 四、组件开发规范

### 4.1 组件职责

- **单一职责**：一个组件只负责一个功能域
- **不内嵌其他模块**：组件 A 中不出现组件 B 的 UI/逻辑
- **跨模块通信**：通过 props / emit / v-model / 共享 composable 实现
- **禁止反向依赖**：子组件不依赖父组件的内部结构

### 4.2 状态完备性

每个可交互组件必须覆盖以下状态：

- **loading**：加载中占位（骨架屏 / Spinner）
- **empty**：空数据视图（提示文案 + 引导按钮）
- **error**：加载/操作失败提示
- **disabled**：禁用态控制

### 4.3 弹窗模板

```vue
<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-card" :class="{ 'dark-mode': isDark }">
      <div class="modal-header">
        <h3>{{ title }}</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body"><!-- 内容 --></div>
    </div>
  </div>
</template>
```

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}
.modal-card {
  width: 100%;
  max-width: 420px;
  background: var(--bg-card);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
  animation: fadeIn 0.2s ease forwards;
}
```

### 4.4 懒加载弹窗

```ts
const Modal = shallowRef<any>(null);
const ensureModal = async () => {
  if (!Modal.value) Modal.value = defineAsyncComponent(() => import('@/components/...'));
};
watch(
  showModal,
  v => {
    if (v) ensureModal();
  },
  { immediate: true }
);
```

### 4.5 keep-alive 视图

```ts
import { onActivated } from 'vue';

// 子路由切换回来时重置状态
onActivated(() => {
  activeTab.value = 'default';
  scrollToTop();
});
```

### 4.6 Composable 单例模式

```ts
const MyStateSymbol = Symbol('myState');
export function useMyState() {
  const injected = inject<ReturnType<typeof createState>>(MyStateSymbol, null);
  if (injected) return injected;
  const state = createState();
  provide(MyStateSymbol, state);
  return state;
}
```

### 4.7 空状态视图

```css
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 20px;
  margin-top: -5%;
}
```

---

## 五、图标规范

- 统一使用 SVG 图标库（如 `lucide-vue-next`）
- **禁止在 UI 中使用 emoji 作为图标**
- 编辑器 toolbar 可用内联 SVG
- 数据驱动图标用映射组件

---

## 六、样式规范

- `<style scoped>` 默认带 dark-mode 变体
- 品牌色使用 CSS 变量定义（`--primary`、`--accent` 等），统一管理
- 弹窗遮罩：`position: fixed; inset: 0; backdrop-filter: blur(12px); z-index: 1000`

---

## 七、安全规范

- 禁止使用 `v-html` 渲染未经净化的用户输入（防 XSS）
- iframe 嵌入必须配置 `sandbox` 属性
- 重型库（TensorFlow、Fabric.js、ECharts）必须动态 `import()` 懒加载

---

## 八、组件目录架构

**三层结构**：`功能分类 -> 业务页面 -> 组件文件`

### 第一层：功能分类

| 分类        | 说明                             |
| ----------- | -------------------------------- |
| `modals/`   | 弹窗/模态对话框                  |
| `popovers/` | 悬浮卡片/气泡/信息提示           |
| `panels/`   | 控制面板/侧栏工具箱/浮动面板     |
| `layouts/`  | 结构布局/导航/顶栏/核心渲染区    |
| `cards/`    | 具有重复渲染特性的数据或业务卡片 |
| `widgets/`  | 大幅定制的小部件/页面特色区块    |
| `common/`   | 跨业务通用的基础组件             |

### 第二层：业务页面

| 页面      | 说明                      |
| --------- | ------------------------- |
| `home/`   | 首页/展示流页面           |
| `editor/` | 画布编辑中心页面          |
| `login/`  | 登录/验证页面             |
| `mine/`   | 我的个人资产/历史信息页面 |

### 完整示例

```
components/
├── common/              # 跨业务通用组件
│   ├── Icon.vue
│   └── SkeletonCard.vue
├── cards/
│   └── home/
│       └── XxxCard.vue
├── layouts/
│   ├── home/
│   │   ├── Sidebar.vue
│   │   └── TopNav.vue
│   └── editor/
│       └── TopBar.vue
├── modals/
│   ├── home/
│   │   ├── SettingsModal.vue
│   │   └── AboutModal.vue
│   ├── editor/
│   │   ├── SaveModal.vue
│   │   └── ConfirmModal.vue
│   └── login/
│       └── LoginModal.vue
├── panels/
│   └── editor/
│       ├── XxxPanel.vue
│       └── YyyPanel.vue
├── popovers/
│   └── home/
│       └── AvatarHoverCard.vue
└── widgets/
    └── home/
        └── XxxWidget.vue
```

### `composables/` 组合式函数

```
composables/
├── useXxx.ts            # 按功能模块分文件
├── useYyy.ts
└── auto-imports/         # 自动导入的独立函数
    ├── useHttp.ts
    └── useTrans.ts
```

### `views/` 页面视图

```
views/
├── HomeView.vue          # 主页面（含子路由）
├── home/                 # 子路由视图
│   ├── FeaturedView.vue
│   ├── RecommendView.vue
│   └── MineView.vue
├── DetailView.vue        # 详情页
├── EditorView.vue        # 编辑器
└── LoginView.vue         # 登录
```

### `stores/` 状态管理

```
stores/
├── auth.ts               # 用户认证状态
├── theme.ts              # 主题配置
└── xxx.ts                # 按功能模块分文件
```

### `types/` 类型定义

```
types/
└── index.ts              # 所有共享类型定义
```

### `utils/` 工具函数

```
utils/
├── request.ts            # HTTP 请求封装
├── format.ts             # 格式化工具
└── validate.ts           # 校验工具
```
