# 前端开发核心规范指南 (Frontend Development Guide)

本指南由项目团队整理，结合了既有的 `FRONTEND_STANDARDS.md`、`coding-standard.md` 规范与当前 PoseCraft 实际代码的最佳实践。供前端开发以及引导 AI 生成代码时参考。

---

## 1. 核心技术栈 (Technology Stack)
开发新前端页面或组件时，必须严格限定使用以下技术版本，禁止引入其他重合职责的框架或库：
*   **核心库**：Vue 3 (SFC, Composition API, `<script setup lang="ts">`)
*   **编程语言**：TypeScript (严格模式，严禁无故使用 `any`，边界处使用 `unknown`)
*   **构建工具**：Vite
*   **状态管理**：Pinia
*   **路由管理**：Vue Router 4
*   **样式方案**：Tailwind CSS (响应式与内置公用组件) + SCSS
*   **请求库**：Axios (封装于 `utils/request.ts`)
*   **国际化**：vue-i18n
*   **校验库**：Zod + vee-validate

---

## 2. 项目目录物理结构 (Directory Structure)
所有的源文件必须按照以下规范结构进行组织，禁止随意新增根目录下的子文件夹：
```text
src/
├── assets/                 # 静态资源存放
│   ├── images/             # 图片与图标
│   └── styles/             # 公共 SCSS 样式（主样式：main.scss）
├── components/             # 组件存放
│   ├── common/             # 跨业务的通用底座组件（如 CustomButton）
│   └── business/           # 针对特定业务场景的组件（如 PoseCanvas）
├── composables/            # 可复用的 UI/逻辑组合函数 (例如：useDragDrop.ts)
├── config/                 # 页面全局配置文件
├── directives/             # 自定义 Vue 指令（如权限指令 v-auth）
├── i18n/                   # 国际化语言包（zh-CN.ts, en-US.ts）
├── layouts/                # 布局模板组件
├── router/                 # 路由配置文件 (router/index.ts)
├── stores/                 # Pinia 状态管理模块
├── types/                  # 全局 TypeScript 接口与类型声明定义
├── utils/                  # 辅助工具函数
└── views/                  # 页面级组件（与路由直接映射）
```

---

## 3. 命名规范与文件大小限制 (Naming & File Size Constraints)
### 3.1 命名约定
*   **文件夹命名**：统一采用短横线连接（`kebab-case`，例如：`business-panels`）。
*   **SFC 组件文件**：统一采用大驼峰命名（`PascalCase.vue`，例如：`EditorCanvas.vue`）。
*   **函数与辅助 JS/TS 文件**：统一采用小驼峰命名（`camelCase.ts`，例如：`usePoseData.ts`）。
*   **样式文件**：统一采用短横线连接（`kebab-case.scss`）。
*   **常量**：全部大写，以下划线连接（`UPPER_SNAKE_CASE`）。

### 3.2 文件大小门禁
*   **单文件限额**：单个 JS/TS 或 Vue SFC 文件行数**不得超过 1000 行**。
*   **重构建议**：当单文件行数接近 **400 行** 时，应当主动规划进行功能和 UI 解耦：
    *   将纯 UI 交互的嵌套子元素抽离为子组件；
    *   将状态计算与副作用处理抽离到独立的 `composables` (如 `useCanvasState.ts`) 中。

---

## 4. API 数据契约与分页规范 (API Integration)
### 4.1 数据响应格式
所有请求默认对接的 JSON 响应格式必须是：
```typescript
export interface ApiResult<T> {
  code: number       // 业务状态码
  message: string    // 提示信息
  data: T            // 数据载荷
  timestamp?: number
  requestId?: string
}
```

### 4.2 严格的分页契约
前端列表展示禁止依赖“后端返回全量数据，前端本地截取”的非分页模式。列表接口必须返回 `pagination` 信息，并以此渲染加载状态或分页器：
```typescript
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

---

## 5. 组件开发与状态管理 (Components & Store Specs)
### 5.1 组件开发要求
*   **代码布局顺序**：SFC 文件内部必须统一按照以下代码块顺序书写：
    ```vue
    <template> ... </template>
    <script setup lang="ts"> ... </script>
    <style scoped> ... </style>
    ```
*   **状态健全性**：所有可交互的组件或页面必须完整覆盖以下 UI 状态处理，严禁缺少兜底：
    *   `loading`：加载中占位（骨架屏/Spinner）；
    *   `empty`：空数据视图（提示文案与引导按钮）；
    *   `error`：加载/操作失败提示；
    *   `disabled`：禁用态控制。

### 5.2 Store 规范
*   **设计原则**：使用 Composition Setup 风格声明 Pinia Store (`defineStore('name', () => { ... })`)。
*   **职责划分**：Store 只应存放跨页面、跨组件的共享状态（如登录状态、全局配置等）。普通的页面局部状态（如当前弹窗开关、临时表单数据）必须保留在页面组件内部或 Composable 中，禁止污染全局 Store。
*   **持久化**：持久化数据统一通过 `pinia-plugin-persistedstate` 处理，且缓存键必须带上项目专属前缀（如 `posecraft_`）。

---

## 6. 安全、性能与部署矩阵 (Security & Port Settings)
### 6.1 安全底线
1.  **防止 XSS**：严禁使用 `v-html` 或 `innerHTML` 直接渲染未经安全净化的用户输入内容。
2.  **Iframe 隔离**：如果项目使用 `iframe` 嵌入外部系统，必须显式配置 `sandbox` 限制其执行权限。

### 6.2 性能优化
1.  **重型库懒加载**：对于如 TensorFlow、Fabric.js、ECharts 等包体积较大的第三方库，必须采用动态 `import()` 或组件懒加载（异步组件）的方式，防止首屏加载缓慢。
2.  **资源管理**：模型权重文件、长 Base64 等高消耗静态资源严禁直接打包进 JS 源码中，必须置于 `public/models/` 等静态目录中进行异步网络读取。

### 6.3 Vite 部署端口矩阵
项目开发与部署需根据以下端口分配，防止本地开发时端口冲突：
| 子应用 | 开发端口 | 统一 Base 路径 | 构建输出目录 |
| :--- | :--- | :--- | :--- |
| `firewall` | 5173 | `/firewall/` | `../public/firewall` |
| `oauth21` | 5174 | 按部署配置 | `../public/oauth21` |
| `admin` | 5175 | `/admin/` | `../public/admin` |
| `posecraft` | 5176 | `/posecraft/` | `../public/posecraft` |
| `poseadmin` | 5177 | `/poseadmin/` | `../public/poseadmin` |
| `phonecopy` | 5178 | `/` | `dist` |
