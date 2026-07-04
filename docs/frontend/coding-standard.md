# 前端统一规范 {#frontend-coding-standard}

本文档适用于当前仓库中的所有前端项目：`admin/`、`firewall/`、`oauth21/`、`poseadmin/`、`posecraft/`、`phonecopy/`。

`phonecopy/backend/` 属于后端服务，不纳入本文档的前端源码规范；`public/` 下的构建产物只由构建命令生成，不手写维护。

## 目标原则

1. 新功能优先遵循统一规范，旧代码按风险和改动频率逐步迁移。
2. 业务代码可读性优先于技巧性写法，避免为了复用而制造过早抽象。
3. 类型边界清晰：API、Store、路由 meta、组件 props/emits 必须有明确类型。
4. 页面组件保持轻量，复杂逻辑下沉到 `components/`、`composables/`、`stores/`、`api/`。
5. 文案、注释、README 使用简体中文，所有文件保存为 UTF-8。

## 当前项目画像

| 项目 | 定位 | 技术栈特征 | 当前关注点 |
|------|------|------------|------------|
| `admin/` | 通用管理后台 | Vue 3 + Vite + TypeScript + Pinia + Tailwind | API 类型、刷新 Token TODO、目录名 `view` 迁移 |
| `firewall/` | 防火墙控制台 | Vue 3 + Vite + TypeScript + ECharts + Tailwind | 大组件拆分、i18n 资源拆分 |
| `oauth21/` | 登录/授权前端 | Vue 3 + Vite + TypeScript + VeeValidate + Zod + PWA | 表单组件复用、日志清理、目录名 `view` 迁移 |
| `poseadmin/` | PoseCraft 管理后台 | Vue 3 + Vite + TypeScript + Element Plus | 按后台规范补齐 API/Store/权限层 |
| `posecraft/` | PoseCraft 创作前端 | Vue 3 + Vite + TypeScript + Fabric + TensorFlow | 编码乱码、文件超限、`any` 收敛、Canvas 逻辑拆分 |
| `phonecopy/` | 移动端/混合应用 | Vue 3 + Vite + Capacitor + TensorFlow + Fabric | 从 JS 迁移 TS、超大页面拆分、模型资源外置 |

## 统一目录结构

新项目和新增模块使用以下结构。旧项目中的 `view/`、`layout/` 可以保留，但新增代码统一使用 `views/`、`layouts/`。

```text
src/
├── main.ts                 # 极简入口，只负责导入 bootstrap
├── bootstrap.ts            # createApp、插件注册、指令注册、挂载
├── App.vue                 # 根布局容器
├── api/                    # HTTP 接口模块
├── assets/                 # 静态资源、全局样式
│   └── styles/
├── components/             # 通用组件和业务组件
│   ├── common/
│   ├── layout/
│   └── [domain]/
├── composables/            # useXxx 组合函数
├── config/                 # 前端静态配置
├── constants/              # 常量、枚举
├── directives/             # 全局指令
├── i18n/                   # 国际化资源
├── layouts/                # 页面布局
├── router/                 # 路由定义和守卫
├── stores/                 # Pinia Store
├── types/                  # 公共类型
├── utils/                  # 纯工具函数
└── views/                  # 路由页面
```

## 文件和命名

| 类型 | 规范 | 示例 |
|------|------|------|
| Vue 页面 | PascalCase 或 `index.vue`，目录表达业务域 | `UserList.vue`, `views/users/index.vue` |
| Vue 组件 | PascalCase | `UserAvatar.vue`, `SystemSettingsModal.vue` |
| Composable | `use` + PascalCase | `useAuth.ts`, `useCanvasHistory.ts` |
| Store | camelCase 文件名，`useXxxStore` 导出 | `auth.ts`, `useAuthStore` |
| API 模块 | 业务名 camelCase 或 kebab-case | `user.ts`, `pose-template.ts` |
| 类型文件 | 业务名 camelCase 或 `index.ts` | `auth.ts`, `canvas.ts` |
| CSS 类名 | kebab-case | `user-card`, `toolbar-button` |
| 常量 | `SCREAMING_SNAKE_CASE` | `MAX_UPLOAD_SIZE` |
| 函数/变量 | camelCase | `fetchUserList` |

生成文件如 `auto-imports.d.ts`、`components.d.ts` 可以超过普通文件行数限制，不手动编辑。

## 文件大小和拆分

普通源码文件应控制在 500 行以内，接近 400 行时必须评估拆分。

| 文件类型 | 拆分方向 |
|----------|----------|
| 页面组件 | 页面壳、业务区块组件、弹窗组件、列表项组件、页面级 composable |
| 表单页面 | schema/校验、提交逻辑、字段组件、API 类型 |
| 编辑器/Canvas | 初始化、历史、选择、快捷键、鼠标事件、图形对象、导入导出分别拆分 |
| 大型 i18n | 按模块拆成 `zh/*.json`、`en/*.json` 后聚合 |
| 大型静态数据 | 移到 `constants/` 或 `assets/data/`，模型权重放 `public/models/` 或远端资源 |

禁止把大量 mock 数据、模型权重、长 Base64 字符串直接塞进页面组件。

## Vue 组件规范

所有新 Vue 组件使用 `<script setup lang="ts">`。

推荐顺序：

```vue
<template>
  <!-- 模板 -->
</template>

<script setup lang="ts">
// import
// type/interface
// props/emits
// store/router/i18n
// ref/computed
// methods
// watch/lifecycle
</script>

<style scoped>
/* 样式 */
</style>
```

要求：

1. `props` 使用 `defineProps<T>()`，复杂对象单独定义 interface。
2. `emits` 使用 `defineEmits<T>()`，事件名使用 kebab-case。
3. 模板中避免复杂表达式，超过一行逻辑移入 `computed` 或函数。
4. 组件内不直接发散业务请求；页面可以调用 API，复杂流程抽到 composable 或 store。
5. `onMounted` 中注册的监听、定时器、Observer、第三方实例必须在 `onUnmounted` 清理。
6. 不在组件内重写全局对象，例如 `console`、`window.fetch`、`Array.prototype`。

## TypeScript 规范

1. 新代码禁止裸 `any`。确实无法确定类型时使用 `unknown`，在使用前收窄。
2. API 响应必须使用泛型包装，如 `ApiResult<T>`、`PageResult<T>`。
3. Store 状态、路由 meta、组件 props、emits、composable 入参和返回值必须显式类型。
4. 第三方库类型不完整时，在 `types/` 中补声明，避免散落 `@ts-ignore`。
5. 自动生成的 `.d.ts` 不纳入人工类型质量要求。

推荐公共类型：

```ts
export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}
```

## API 和 HTTP

统一使用 `api/` 模块封装请求，页面不直接写 `axios.get('/xxx')`。

要求：

1. 每个业务域一个 API 文件，例如 `api/user.ts`、`api/template.ts`。
2. 请求实例在 `utils/request.ts` 或 `api/request.ts` 创建。
3. 默认启用 `withCredentials: true`，除非该项目明确只使用 Bearer Token。
4. 401 刷新 Token 必须支持并发队列；刷新失败时要 reject 所有等待请求并清理登录状态。
5. 不在业务组件中拼接重复 base URL，统一通过 Vite proxy 和 request 实例管理。
6. 错误对象要保留 `code`、`message`、`response`，便于页面展示和日志排查。

### 前后端响应契约

除 OAuth/OIDC 协议接口、文件下载、静态资源、WebSocket 外，前端只接受后端业务接口返回以下两种结构。

普通响应：

```ts
export interface ApiResult<T> {
  code: number
  message: string
  data: T
  timestamp?: number
  requestId?: string
}
```

分页响应：

```ts
export interface Pagination {
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ApiPageResult<T> extends ApiResult<T[]> {
  pagination: Pagination
}
```

前端列表页禁止依赖“后端返回数组 + 前端本地截取”的模式。后端列表接口必须返回分页信息，前端根据 `pagination.total`、`pagination.totalPages` 渲染加载更多、分页器或空状态。

协议例外必须在 API 模块里显式标注，例如 OAuth token、OIDC userinfo、文件上传下载。

推荐 API 写法：

```ts
import request from '@/utils/request'
import type { PageResult } from '@/types/api'
import type { User } from '@/types/user'

export const userApi = {
  list(params: { page: number; pageSize: number }) {
    return request.get<PageResult<User>>('/admin/v1/iam/users', { params })
  },
  detail(id: number) {
    return request.get<User>(`/admin/v1/iam/users/${id}`)
  }
}
```

### PoseCraft 联动要求

`posecraft`、`poseadmin` 与后端 `posecraft` API 优先按以下契约改造：

| 场景 | 后端契约 | 前端要求 |
|------|----------|----------|
| 模板列表 | `data: Template[]` + `pagination` | Home/Profile 使用分页加载，不写死 `pageSize: 60` |
| 作品列表 | `data: Work[]` + `pagination` | 关注流、推荐流、用户作品统一列表组件 |
| 审核列表 | `data: AuditItem[]` + `pagination` | poseadmin 使用统一分页表格 |
| 点赞 | 返回 `{ liked, likesCount }` | 禁止只做本地自增，按后端状态回写 |
| 关注 | 返回 `{ isFollowing, followersCount }` | 关注按钮和统计同步更新 |
| 上传 | 返回 `{ url, filename, size, mimeType }` | 上传组件统一进度、错误和结果展示 |
| 审核状态 | 使用统一 enum | 前端统一状态标签和筛选项 |

## 认证和权限

1. 登录态统一放在 `stores/auth.ts`，至少包含 `user`、`isLoggedIn`、`roles`、`permissions`、`initialized`。
2. 页面权限使用路由 `meta.requiresAuth`、`meta.permission`、`meta.roles`。
3. 按钮级权限使用 `v-auth`、`v-role` 或组件封装，不在模板中散落复杂权限表达式。
4. 本地缓存必须带项目前缀：`admin_`、`firewall_`、`oauth21_`、`poseadmin_`、`posecraft_`、`phonecopy_`。
5. 敏感 Token 不长期存储在 `localStorage`；优先使用 HttpOnly Cookie session。确需存储时必须有刷新和清理机制。

## 路由规范

1. 路由文件统一放 `router/index.ts`。
2. 每个路由必须有 `name` 和 `meta.title`。
3. 独立部署在子路径的项目必须同时配置 `vite.base` 和 `createWebHistory(base)`。
4. 路由守卫只做认证、权限、标题、进度条等横切逻辑；业务数据加载放页面或 store。
5. 跳转目标必须存在，新增页面时同步补路由。

推荐 meta 类型：

```ts
declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    requiresAuth?: boolean
    permission?: string | string[]
    roles?: string[]
  }
}
```

## Store 规范

1. 使用 Composition API 风格 Pinia：`defineStore('auth', () => {})`。
2. Store 只保存跨页面状态；页面局部状态留在页面或 composable。
3. 异步 action 要处理 loading/error，不能吞掉异常。
4. 持久化缓存通过统一 `useCache` 工具封装，禁止散落裸 `localStorage`。
5. Store 中不要直接操作 DOM。

## 样式和主题

1. 优先使用项目既有方案：Tailwind、SCSS、Element Plus token 或 CSS 变量。
2. 全局色彩、间距、圆角、阴影放在 `assets/styles/` 或主题变量中。
3. Scoped 样式只描述组件内部结构，避免深层覆盖第三方组件；确需覆盖时集中到主题文件。
4. 交互控件必须有 hover、active、disabled、loading、empty、error 状态。
5. 后台、控制台类页面以信息密度和可扫描性为优先，不做营销式大 Hero。
6. 移动端页面必须检查 360px 到 430px 宽度下的文本换行和按钮溢出。

## 国际化和文案

1. 对用户可见的固定文案应进入 `i18n/`，临时内部后台可以先中文，但要避免硬编码散落。
2. i18n 文件按模块拆分，单文件超过 500 行时拆分聚合。
3. 禁止提交乱码文案；发现 `鍓嶇`、`鎼滅储` 等异常字符时，先修编码再继续开发。
4. 日志、注释、README 使用简体中文，技术标识保留英文原文。

## 日志和错误处理

1. 生产代码禁止无条件 `console.log`，调试日志使用统一 logger，并由环境变量控制。
2. 不覆盖全局 `console.warn`、`console.error`；需要过滤第三方噪声时封装局部 logger。
3. 用户操作失败必须有可见反馈，不能只写控制台。
4. 捕获异常时至少保留错误信息，避免空 `catch`。

## 资源和性能

1. 路由页面使用动态 import，重型组件按需加载。
2. TensorFlow、Fabric、ECharts、地图等重型库按页面或功能懒加载。
3. 模型文件、长 Base64、图片素材不要放进业务 JS；放 `public/models/`、`public/assets/` 或后端静态资源。
4. 图片上传前做大小、类型、尺寸校验，必要时压缩。
5. 列表页必须考虑分页、虚拟滚动或懒加载，不一次性渲染大量卡片。

## 安全规范

1. 禁止使用 `v-html` 渲染未净化内容。
2. 禁止直接设置 `innerHTML`，除非内容经过可信白名单净化。
3. iframe 必须配置 `sandbox`，只开放必要权限。
4. 外链打开使用 `rel="noopener noreferrer"`。
5. 用户输入必须前后端都校验；前端负责体验，后端负责安全边界。

## Vite 配置规范

1. 所有项目统一配置 `@` 指向 `src`。
2. 子路径部署项目必须配置 `base` 和 `build.outDir`。
3. 开发端口固定写入 README 或本文档，避免冲突。
4. proxy 只代理 API、上传、模型等后端资源，不代理前端路由。
5. 自动导入的 dts 统一输出到 `src/types/`，历史项目可逐步迁移。

建议端口：

| 项目 | 端口 | base | 构建输出 |
|------|------|------|----------|
| `firewall` | 5173 | `/firewall/` | `../public/firewall` |
| `oauth21` | 5174 | 按部署配置 | 建议 `../public/oauth21` 或后端约定目录 |
| `admin` | 5175 | `/admin/` 或 `/` | 建议 `../public/admin` |
| `posecraft` | 5176 | `/posecraft/` | `../public/posecraft` |
| `poseadmin` | 5177 | `/poseadmin/` | `../public/poseadmin` |
| `phonecopy` | 5178 | 按 Capacitor/部署配置 | `dist` |

## 质量门禁

提交前至少执行：

```bash
npm run build
```

有测试脚本的项目还要执行：

```bash
npm test
```

检查清单：

- [ ] 没有乱码文案和乱码注释。
- [ ] 普通源码文件不超过 500 行。
- [ ] 新增 API、Store、Props、Emits 已补类型。
- [ ] 无新增裸 `any`、`@ts-ignore`、无条件 `console.log`。
- [ ] 事件监听、定时器、Observer、第三方实例已清理。
- [ ] 路由存在且 `meta.title`、权限配置完整。
- [ ] 页面覆盖 loading、empty、error、disabled 状态。
- [ ] 构建产物未手写修改，`public/` 只由构建生成。

## 现有项目整改优先级

### P0：立即处理

1. 修复所有前端项目中的乱码注释和用户可见文案。
2. 修复 `admin` 的刷新 Token TODO，避免上线后 401 流程不可用。
3. 修复 `posecraft` 中超大页面和全局 `console` 覆盖问题。
4. 将 `phonecopy` 中内嵌模型权重迁移到静态资源或模型加载流程。

### P1：近期处理

1. `posecraft/HomeView.vue`、`phonecopy/EditorView.vue`、`firewall/SystemSettingsModal.vue` 拆分。
2. 收敛各项目 API 返回类型，减少页面中的 `as any`。
3. 统一 `views/`、`layouts/` 命名，新代码不再使用 `view/`、`layout/`。
4. 为核心前端补 `type-check`、`lint`、`format` 脚本。

### P2：持续优化

1. 统一 Vue、Vite、Pinia、Vue Router、Tailwind 的主版本升级策略。
2. 抽取共享的 request、auth、theme、permission 指令模板。
3. 为复杂组件补充 Vitest 或 Playwright 用例。
4. 建立前端构建产物清理和发布流程，减少 `public/` 噪声提交。
