# 前端规范

## 技术栈目录

| 技术栈 | 参考文件 | 说明 |
|--------|----------|------|
| Vue 3 + Vite + TypeScript | [vue.md](web/vue.md) | 组件开发、SFC 模板、图标、样式规范 |

> 其他技术栈（React / Android / 小程序等）后续可在此目录下添加对应的子目录和规范文件。

---

## 核心原则

| 领域 | 规范 |
|------|------|
| 状态管理 | 全局状态用 Store；局部状态保留在组件或 hooks 中 |
| 图标 | SVG 图标库，**禁止使用 emoji 作为 UI 图标** |
| 样式 | CSS 变量驱动主题切换（dark-mode / light-mode） |

> 语言、构建工具、请求库、代码质量工具等因技术栈而异，见各技术栈子目录规范。

---

## 通用目录结构

```
src/
├── api/          # API 请求封装层（按功能域分文件）
├── assets/       # 静态资源（images/ styles/）
├── components/   # 组件（common/ 通用, business/ 业务）
├── hooks/        # 组合式逻辑
├── config/       # 配置文件
├── layouts/      # 布局模板
├── router/       # 路由配置
├── stores/       # 状态管理
├── types/        # 类型定义
├── utils/        # 工具函数
├── views/        # 页面视图
└── 入口文件（main.ts 或对应框架入口）
```

---

## 组件开发通用原则

| 原则 | 说明 |
|------|------|
| 单一职责 | 一个组件只负责一个功能域，不内嵌其他模块的 UI/逻辑 |
| 跨模块通信 | 通过 props / 回调 / 事件 / 共享状态管理 |
| 禁止反向依赖 | 子组件不依赖父组件内部结构，通过接口通信 |
| 状态完备性 | 每个组件必须覆盖 **loading**（加载中）、**empty**（空数据）、**error**（错误提示）、**disabled**（禁用态） |
| 重型库懒加载 | TensorFlow、Fabric.js、ECharts 等必须动态 `import()` |

### 组件开发反例

```vue
<!-- ❌ 组件 A 内嵌组件 B 的 UI -->
<template>
  <div>
    <h2>用户列表</h2>
    <!-- 搜索框应该抽取为独立组件 -->
    <input v-model="keyword" placeholder="搜索..." />
    <div v-for="user in filteredList">{{ user.name }}</div>
  </div>
</template>

<!-- ✅ 拆分为独立组件 -->
<template>
  <div>
    <SearchBar @search="onSearch" />
    <UserList :users="filteredList" />
  </div>
</template>
```

```vue
<!-- ❌ 子组件直接调父组件方法 -->
<template>
  <button @click="parentMethod()">点击</button>
</template>

<!-- ✅ 子组件 emit 事件，父组件决定怎么处理 -->
<template>
  <button @click="$emit('click')">点击</button>
</template>
```

```vue
<!-- ❌ 缺少 loading/empty/error 状态 -->
<template>
  <div v-for="item in list">{{ item.name }}</div>
</template>

<!-- ✅ 覆盖所有状态 -->
<template>
  <div v-if="loading">加载中...</div>
  <div v-else-if="error">加载失败: {{ error }}</div>
  <div v-else-if="!list.length">暂无数据</div>
  <div v-else v-for="item in list">{{ item.name }}</div>
</template>
```

---

## 通用命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件夹 | kebab-case | `business-panels/` |
| 组件文件 | PascalCase | `EditorCanvas.vue`, `ProfileCard.tsx` |
| 工具/JS/TS 文件 | camelCase | `usePoseData.ts`, `request.ts` |
| 常量 | UPPER_SNAKE_CASE | `MAX_REFRESH_TOKENS` |

---

## 数据加载原则

- **底层基础数据**（用户身份/权限/统计/配置）：首次加载时请求，全局共享
- **展示层数据**（列表/详情）：切换到对应页面/Tab 时才请求，按需加载
- 所有 HTTP 请求必须在 `src/api/` 下按功能域的文件中定义，禁止在组件中直接调用 API 请求
- 父组件不预取子组件数据，各组件自行按需加载

### 数据加载反例

```vue
<script setup>
// ❌ 组件内直接调用 API
import axios from 'axios'
const list = ref([])
onMounted(async () => {
  const res = await axios.get('/api/users')
  list.value = res.data
})
</script>

<script setup>
// ✅ 在 src/api/user.ts 中封装，组件只关心调用
import { userApi } from '@/api/user'
const list = ref([])
onMounted(async () => {
  const res = await userApi.getList()
  list.value = res.data
})
</script>
```

```vue
<script setup>
// ❌ 父组件预取子组件数据（耦合）
const userData = await userApi.getDetail(id)
</script>
<template>
  <UserProfile :data="userData" />
</template>

<script setup>
// ✅ 子组件自行按需加载
</script>
<template>
  <UserProfile :userId="id" />
</template>
```

---

## API 响应格式

```typescript
interface ApiResult<T> {
  code: number
  message: string
  data: T
  timestamp?: number
  requestId?: string
}

interface Pagination {
  total: number
  page: number
  pageSize: number
  totalPages: number
}
```

---

## 相关规范

| 规范 | 文件 | 说明 |
|------|------|------|
| 📝 注释规范 | [note.md](../note.md) | 文件头注释、函数注释、控制台日志 |
| 🏷️ 命名规范 | [naming-convention.md](../naming-convention.md) | 代码/文件/数据库命名规则 |
| 🎯 Git 规范 | [git-patterns.md](../git-patterns.md) | 分支模型、提交信息、PR 模板 |