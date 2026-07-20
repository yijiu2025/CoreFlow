# Vue 3 开发规范

## 技术选型

| 领域 | 选型 |
|------|------|
| 语言 | **TypeScript 严格模式**，禁止无故使用 `any` |
| 构建 | Vite |
| 请求 | Axios，所有 API 调用在统一层管理 |
| 代码质量 | ESLint + Prettier |

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

| 选项 | 说明 |
|------|------|
| `strict: true` | 启用所有严格类型检查 |
| `noUncheckedIndexedAccess` | 数组/对象索引返回 `T \| undefined` |
| `noUnusedLocals` | 禁止未使用的局部变量 |
| `noUnusedParameters` | 禁止未使用的参数 |
| `exactOptionalPropertyTypes` | 可选属性不能赋值 `undefined`（视项目情况启用） |

---

## 一、认证与权限系统

### 权限数据结构

后端返回的权限信息格式：

```typescript
interface AuthData {
  roles: string[]           // 角色编码列表
  permissions: {
    allows: string[]         // 允许列表，支持通配符
    denies: string[]         // 拒绝列表，deny 优先
  }
}
```

### 通配符规则

| 模式 | 匹配范围 | 示例 |
|------|----------|------|
| `*` | 所有权限 | 管理员拥有全部权限 |
| `模块名:*` | 某模块下所有权限 | `模块名:资源:操作` |
| `模块名:资源:*` | 某资源的所有操作 | `模块名:资源:create`、`模块名:资源:delete` |
| `模块名:资源:操作` | 精确匹配 | 只匹配该权限 |

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

| 指令 | 用途 | 说明 |
|------|------|------|
| `v-auth` | 权限控制 | 支持仅验权限、或权限+角色组合验证。无权限时元素从 DOM 移除 |

### v-auth 指令

```vue
<!-- 仅验权限 -->
<button v-auth="'system:config:write'">保存</button>                          <!-- 单权限 -->
<button v-auth="['system:config:write', 'system:config:delete']">操作</button>  <!-- 多权限 OR -->
<button v-auth="{ any: ['system:config:write', 'system:config:delete'] }">操作</button>  <!-- 显式 OR -->
<button v-auth="{ all: ['system:config:write', 'system:config:delete'] }">操作</button>  <!-- AND -->

<!-- 权限 + 角色组合验证（同时满足才放行） -->
<button v-auth="{ perm: 'system:config:write', role: 'admin' }">保存</button>
<button v-auth="{ perm: { any: ['a', 'b'] }, role: 'admin' }">操作</button>
<button v-auth="{ perm: { all: ['a', 'b'] }, role: 'admin' }">操作</button>

<!-- 可选 modifier -->
<button v-auth:disabled="'system:config:write'">保存</button>   <!-- 无权限时禁用，不移除 -->
<button v-auth:hidden="'system:config:write'">保存</button>     <!-- 无权限时隐藏，不移除 -->
```

### 指令注册

```typescript
// src/directives/index.ts
import type { App } from 'vue'
import { authDirective } from './auth'

export function setupDirectives(app: App) {
  app.directive('auth', authDirective)
}
```

---

## 二、SFC 代码块顺序

```vue
<template> ... </template>
<script setup lang="ts"> ... </script>
<style scoped> ... </style>
```

---

## 三、组件开发规范

### 3.1 组件职责

- **单一职责**：一个组件只负责一个功能域
- **不内嵌其他模块**：组件 A 中不出现组件 B 的 UI/逻辑
- **跨模块通信**：通过 props / emit / v-model / 共享 composable 实现
- **禁止反向依赖**：子组件不依赖父组件的内部结构

### 3.2 状态完备性

每个可交互组件必须覆盖以下状态：

- **loading**：加载中占位（骨架屏 / Spinner）
- **empty**：空数据视图（提示文案 + 引导按钮）
- **error**：加载/操作失败提示
- **disabled**：禁用态控制

### 3.3 弹窗模板

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
.modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45);
  backdrop-filter: blur(12px); display: flex; align-items: center;
  justify-content: center; z-index: 1000; padding: 20px; }
.modal-card { width: 100%; max-width: 420px; background: var(--bg-card);
  border-radius: 20px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.15);
  animation: fadeIn .2s ease forwards; }
```

### 3.4 懒加载弹窗

```ts
const Modal = shallowRef<any>(null)
const ensureModal = async () => {
  if (!Modal.value) Modal.value = defineAsyncComponent(() => import('@/components/...'))
}
watch(showModal, (v) => { if (v) ensureModal() }, { immediate: true })
```

### 3.5 keep-alive 视图

```ts
import { onActivated } from 'vue'

// 子路由切换回来时重置状态
onActivated(() => {
  activeTab.value = 'default'
  scrollToTop()
})
```

### 3.6 Composable 单例模式

```ts
const MyStateSymbol = Symbol('myState')
export function useMyState() {
  const injected = inject<ReturnType<typeof createState>>(MyStateSymbol, null)
  if (injected) return injected
  const state = createState(); provide(MyStateSymbol, state); return state
}
```

### 3.7 空状态视图

```css
.empty-state { flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; text-align: center; padding: 20px; margin-top: -5%; }
```

---

## 四、图标规范

- 统一使用 SVG 图标库（如 `lucide-vue-next`）
- **禁止在 UI 中使用 emoji 作为图标**
- 编辑器 toolbar 可用内联 SVG
- 数据驱动图标用映射组件

---

## 五、样式规范

- `<style scoped>` 默认带 dark-mode 变体
- 品牌色使用 CSS 变量定义（`--primary`、`--accent` 等），统一管理
- 弹窗遮罩：`position: fixed; inset: 0; backdrop-filter: blur(12px); z-index: 1000`

---

## 六、安全规范

- 禁止使用 `v-html` 渲染未经净化的用户输入（防 XSS）
- iframe 嵌入必须配置 `sandbox` 属性
- 重型库（TensorFlow、Fabric.js、ECharts）必须动态 `import()` 懒加载

---

## 七、组件目录架构

**三层结构**：`功能分类 -> 业务页面 -> 组件文件`

### 第一层：功能分类

| 分类 | 说明 |
|------|------|
| `modals/` | 弹窗/模态对话框 |
| `popovers/` | 悬浮卡片/气泡/信息提示 |
| `panels/` | 控制面板/侧栏工具箱/浮动面板 |
| `layouts/` | 结构布局/导航/顶栏/核心渲染区 |
| `cards/` | 具有重复渲染特性的数据或业务卡片 |
| `widgets/` | 大幅定制的小部件/页面特色区块 |
| `common/` | 跨业务通用的基础组件 |

### 第二层：业务页面

| 页面 | 说明 |
|------|------|
| `home/` | 首页/展示流页面 |
| `editor/` | 画布编辑中心页面 |
| `login/` | 登录/验证页面 |
| `mine/` | 我的个人资产/历史信息页面 |

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