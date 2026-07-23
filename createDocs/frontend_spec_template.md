# 前端功能规格书模版 (Frontend Spec Template)

---

## 1. 页面基本信息 (Page Metadata)

- **页面/功能名称**：[例如：动作编辑器工作台]
- **路由路径 (Route)**：[例如：`/editor/:id`]
- **访问权限限制**：[例如：需登录 (requireLogin: true)，需具备 `user:editor:*` 权限]
- **页面主要布局**：[例如：左右分栏布局 / 全屏画布布局 / 通用顶部导航栏 + 侧边栏布局]

---

## 2. 源码文件预设 (Source Files Directory)

请指示 AI 在以下路径下创建或修改文件：

```text
├── src/
│   ├── views/
│   │   └── [功能名称]View.vue          # 主页面入口
│   ├── components/[功能名称]/
│   │   ├── SidebarPanel.vue          # 侧边栏子组件
│   │   └── CanvasBoard.vue           # 画布渲染子组件
│   ├── composables/
│   │   └── use[功能名称]Canvas.ts     # 提取复杂的 Canvas 交互逻辑
│   └── store/
│       └── [功能名称]Store.ts         # Pinia 状态管理模块
```

---

## 3. UI 布局与视觉规范 (UI Layout & Theme)

- **主框架布局（Wireframe Layout）**：
  - **区域 A（顶部）**：[说明顶部导航栏内容，包含按钮与状态]
  - **区域 B（中间/左侧）**：[说明左侧面板的功能，如工具箱、图层]
  - **区域 C（中间/右侧）**：[说明右侧属性配置面板，包含的输入框、滑块]
- **响应式适配策略 (Responsive Design)**：
  - 在 Mobile 端（宽度 < 768px）：[例如：侧边栏自动隐藏，改为抽屉滑出模式]
  - 在 PC 端：[双栏显示，支持侧边栏固定]
- **交互微动效 (Micro-interactions)**：
  - [例如：拖拽悬停时容器边框虚线高亮显示，悬浮按钮 hover 时产生 scale-105 的轻微缩放]

---

## 4. 页面状态与状态管理 (State Management)

### 4.1 本地状态 (Local Ref/Reactive)

- `activeTab` (`String`)：[例如：当前侧边栏处于激活状态的标签页，可选 'template'|'history']
- `isSaving` (`Boolean`)：[例如：保存按钮的 loading 加载态控制]

### 4.2 全局/跨组件状态 (Pinia Store)

- `storeId` / `name`：`use[功能名称]Store`
- **State**：
  - `nodes` (`Array`)：[存储当前动作编辑器的所有骨骼点坐标列表]
- **Actions**：
  - `updateNodePosition(id, x, y)`：[修改特定节点位置]
  - `loadPoseFromApi(id)`：[调用 API 加载已存在的姿态数据]

---

## 5. 交互流程与生命周期逻辑 (Interaction Flows)

### 5.1 初始化加载 (On Mounted)

1.  页面挂载时读取 URL 中的 `params.id`。
2.  若 `id` 存在且不为 `'new'`，显示全局加载遮罩，调用 Pinia `loadPoseFromApi(id)` 并初始化 Canvas 绘制。
3.  若加载失败，使用 `ElMessage.error` 提示并重定向回 `/dashboard`。

### 5.2 核心业务交互（例如：骨骼节点拖拽）

1.  用户在 Canvas 上的节点上触发 `mousedown` 或 `touchstart`。
2.  记录初始按下坐标，开启全局 `mousemove` 监听，并计算 X/Y 偏移量。
3.  将偏移量实时更新到 `store.nodes` 数组中，触发 Canvas 的重绘。
4.  触发 `mouseup`，移除全局监听，并将当前修改前的动作坐标作为一个快照存入 `history` 数组，做为撤销的备份。

---

## 6. API 接口对接契约 (API Integration)

请让 AI 严格按照以下接口结构和字段名称进行 Axios/Fetch 请求方法的封装：

- **API 接口名**：保存当前编辑的动作姿态
- **Method & URL**：`POST /api/v1/pose/save`
- **Request Body**：
  ```json
  {
    "id": 12,
    "name": "标准拳击防御动作",
    "points": [
      { "nodeId": "left_hand", "x": 120.5, "y": 80.2 },
      { "nodeId": "right_hand", "x": 160.0, "y": 85.0 }
    ]
  }
  ```
- **Response Response**：
  ```json
  {
    "code": 200,
    "message": "动作保存成功",
    "data": {
      "id": 12,
      "updatedAt": "2026-07-05T15:00:00Z"
    }
  }
  ```

---

## 7. 异常拦截与边界情况处理 (Error & Boundary Cases)

- **空数据状态 (Empty State)**：当没有可选模版时，在侧边栏渲染 `<EmptyPlaceholder />` 组件，显示提示词 "暂无可用的模版姿势，请点击新建"。
- **无网络/请求错误**：拦截 401 并自动重定向到登录页；拦截 403 友好提示 "您没有修改该资源的权限"；如果是 500 提示 "系统繁忙，保存失败"。

---

## 8. 编码约束 (Coding Standards)

1.  **TypeScript 强类型**：必须定义所有相关字段的 `interface`，禁止使用任何 `any` 类型。
2.  **单一职责与解耦**：单个 SFC (Single File Component) 代码必须在 600 行以内，Canvas 重绘等逻辑必须抽取成独立的 Composable 逻辑文件。
3.  **UI库限制**：禁止引入 ad-hoc CSS 样式，全部使用预设的 Vanilla CSS / Tailwind 样式。
