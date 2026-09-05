# KX 页面描述语言规范

> **KX**（Knowledge eXchange）是一种声明式页面描述 DSL，用于描述页面架构、数据流、交互逻辑和业务规则，AI 据此生成完整的前端代码。
> 本文件是操作规范；完整语法与 AI 生成映射表见 [SPEC.md](../assets/project-template/kt/kx-lang/SPEC.md)。

## 什么时候用 KX？

| 场景              | 触发词                         | 操作                                                              |
| ----------------- | ------------------------------ | ----------------------------------------------------------------- |
| **新项目/新 App** | "架构文件"、".kx"、"KX 规范" | 先输出需求文档 → 多轮提问确认 → 创建 `guide/` 目录下的 `.kx` 文件 |
| **新增页面**      | "新页面"、"写页面"、"页面描述" | 先确认页面功能 → 在 `pages/` 下新增 `.kx` 文件                    |
| **定义数据模型**  | "数据模型"、"实体设计"         | 在 `models/` 下新增 `.kx` 文件                                    |
| **定义 API**      | "接口设计"、"API 规划"         | 在 `models/api.kx` 中集中定义                                     |
| **生成代码**      | "生成代码"、"根据架构生成"     | 读取 `.kx` 文件 → 生成 Vue 3 代码                                 |

新项目/新 App 的完整前置流程（需求文档 → 三轮提问 → 架构方案 → 用户确认）见 [requirement-intake.md](requirement-intake.md)。

## KX 文件结构

```
<项目名>/
└── guide/                     # 需求与设计文档根目录
    ├── index.kx               # 入口文件：@ref 引用所有文件
    ├── layouts/               # 布局定义
    │   └── main.kx
    ├── pages/                 # 页面定义（一个页面一个文件）
    │   ├── home.kx
    │   └── detail.kx
    ├── models/                # 数据模型 + API 定义
    │   ├── user.kx
    │   └── api.kx
    └── components/            # 共享组件（浮窗等）
        └── shared.kx
```

> 现状说明：规范目标目录是 `guide/`，存量项目（如 phonecopy/posecraft）使用根目录 `app.kx` 单文件。
> 为存量项目新增页面时跟随项目现状，新项目一律用 `guide/` 多文件结构。

## 编写 KX 文件的步骤

1. 阅读规范 → 读取 [SPEC.md](../assets/project-template/kt/kx-lang/SPEC.md) 了解完整语法，**不凭记忆写 `.kx` 文件**
2. 确认需求 → 需求文档已确认，用户签字通过
3. 创建目录 → 按上述结构创建 `guide/` 目录
4. 写 `index.kx` → 项目概述 + 架构设计（无 @ref 无 @note）
5. 写 `layouts/` → 定义布局骨架 + 全局状态
6. 写 `models/` → 定义数据模型和 API（`@model API` 统一命名）
7. 写 `pages/` → 定义页面结构、数据流、交互（顶部 @ref 引用模型）
8. 写 `components/` → 定义可复用组件接口（@prop 声明 props）
9. 展示给用户确认 → 确认架构后开始生成代码

## KX 写作规范（避免常见错误）

| 规则                   | 说明                    | 反例                          | 正例                                          |
| :--------------------- | :---------------------- | :---------------------------- | :-------------------------------------------- |
| `@sync` 只用于计算属性 | 不是变量赋值            | `@sync = 'all'`               | `@navigate click -> @state activeTab = 'all'` |
| `@empty` 在容器内      | 必须在 @list/@detail 内 | `@empty 独立`                 | `@list { @empty { ... } }`                    |
| 数组操作用 `=` 展开    | 不用 JS 方法名          | `.unshift(new)`               | `= [new, ...old]`                             |
| `@model` 命名规范      | API 用 `@model API`     | `@model StockAPI`             | `@model API { @api ... }`                     |
| 组件定义接口           | 复杂组件声明 @prop      | `@note K线图组件`             | `@detail KChart { @prop data }`               |
| 页面引用模型           | 顶部加 @ref             | 无 @ref                       | `@ref ../models/stock.kx`                     |
| 全局状态在布局         | 共享状态在 layouts/     | 每个页面重复声明              | 布局文件 `@state isLoggedIn`                  |
| 循环不写死名称         | 动态列表用变量名        | `@card 上证指数 (v-for: idx)` | `@card 指数卡片 (v-for: idx)`                 |

## KX 核心语法速览

| 指令                           | 用途                    | 示例                                       |
| ------------------------------ | ----------------------- | ------------------------------------------ |
| `@page`                        | 页面定义                | `@page /home (首页) extends Layout`        |
| `@layout` / `@slot`            | 布局骨架                | `@layout Main { @slot main (role: main) }` |
| `@model` / `@field`            | 数据模型                | `@model User { @field name: string }`      |
| `@api`                         | 接口请求                | `@api GET /works -> works`                 |
| `@state` / `@prop` / `@param`  | 状态/属性/参数          | `@state page: number = 1`                  |
| `@mutation`                    | 状态变更                | `@mutation set list[idx].liked = true`     |
| `@sync`                        | 计算属性                | `@sync filtered = list.filter(...)`        |
| `@render`                      | 条件渲染                | `@render when: loading`                    |
| `@navigate`                    | 路由跳转                | `@navigate click -> /detail`               |
| `@button` / `@card` / `@list`  | 组件                    | 23 种组件指令                              |
| `@modal` / `@popover`          | 弹窗/浮窗               | `@modal 确认删除`                          |
| `@hover` / `@leave` / `@delay` | 悬浮交互                | `@hover -> @popover 详情`                  |
| `@login` / `@permission`       | 权限控制                | `@login` / `@permission work:create`       |
| `@note`                        | 业务约束（AI 强制识别） | `@note 仅 VIP 可见`                        |
| `@ref`                         | 跨文件引用              | `@ref ../models/user.kx`                   |

## 模块边界规则

| 规则               | 说明                                          | 示例                                    |
| :----------------- | :-------------------------------------------- | :-------------------------------------- |
| **职责单一**       | 一个组件只负责一个功能域                      | 搜索组件只管搜索框，不管分类 Tab        |
| **不内嵌其他模块** | 组件 A 中不出现组件 B 的 UI/逻辑              | 列表页里的 Tab 不应写在搜索组件里       |
| **状态归属**       | 由消费方（父组件）管理状态，不内嵌数据        | Tab 切换状态属于列表页，不属于搜索组件  |
| **跨模块通信**     | 通过 props / emit / v-model / 共享 composable | 子组件需要数据 → props；需要通知 → emit |
| **禁止反向依赖**   | 子组件不依赖父组件的内部结构                  | 搜索组件不应知道列表页的存在            |

**判断标准**：如果修改功能 X 需要改动组件 Y 的文件，说明边界划错了。

## 图标使用规范

- 禁止在 UI 中使用 Unicode emoji 作为图标（跨平台渲染不一致、不可样式化）
- 前端项目优先使用 `lucide-vue-next`（与 firewall 保持一致）
- 编辑器 toolbar 图标可使用内联 SVG
- 控制台日志允许 emoji 前缀（不影响 UI 渲染）
- 用户生成内容（如个人简介）中 emoji 不在此限制范围内
