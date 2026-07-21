# 新项目初始化流程

## 核心流程

```
创建 kt 文件 → 完善 kt 设计 → 确认架构 → 项目初始化 → 开发代码 → 测试优化
```

---

## 第一步：创建 kt 文件

创建项目设计文档（kt 文件），参考文献：[kt](../assets/project-template/kt/kx-lang/SPEC.md)

kt 文件按以下目录结构分类存放，每类职责清晰、通过 `@ref` 相互引用：

```
<项目名>/
└── guide/                     # 需求与设计文档根目录
    ├── index.kx               # 项目入口：概述、模型总览、API 总览、@ref 引用
    ├── layouts/               # 布局定义
    │   └── main.kx
    ├── pages/                 # 页面定义（一个页面一个文件）
    │   ├── home.kx
    │   ├── detail.kx
    │   └── login.kx
    ├── models/                # 数据模型 + API 定义
    │   ├── user.kx
    │   ├── work.kx
    │   └── api.kx
    └── components/            # 共享组件
        └── popovers.kx
```

> ⚠️ 创建完成后，请用户确认 kt 文件结构是否合理

### kt 文件分类规则

| 目录 | 文件 | 内容 | 示例 |
|------|------|------|------|
| 根目录 | `index.kx` | 项目概述、模型总览、所有 `@ref` 引用 | 项目入口 |
| `layouts/` | `main.kx` | 布局定义（`@layout`）、全局插槽 | 主布局、侧边栏、顶栏 |
| `pages/` | `*.kx` | 页面定义（`@page`）、路由、页面组件 | 首页、详情页等 |
| `models/` | `*.kx` | 数据模型（`@model`）、字段、关联关系 | User、Work 模型 |
| `models/` | `api.kx` | API 接口定义（`@api`） | 所有接口集中定义 |
| `components/` | `*.kx` | 共享组件（`@popover`、`@card` 等） | 全局浮窗 |

### 文件间引用

不同 `.kx` 文件通过 `@ref` 相互引用，AI 自动定位到对应文件：

```kx
// index.kx 引用所有文件
@ref ./layouts/main.kx
@ref ./pages/home.kx
@ref ./models/user.kx
@ref ./models/api.kx

// pages/home.kx 引用模型
@ref ../layouts/main.kx
@ref ../models/work.kx
```

kt 文件需包含：

- 项目概述（定位、核心功能）
- 数据模型设计（实体、字段、关联关系）
- API 接口设计（路由、请求/响应格式）
- 目录结构规划（按功能模块划分文件夹）
- 权限模型（角色、权限编码）

---

## 第二步：完善 kt 文件

基于第一步的草稿，逐步完善以下细节：

- **API 接口**：明确每个接口的 method、url、参数、权限要求  
- **数据结构**：定义核心数据模型字段和类型
- **路由规划**：按功能域组织路由文件
- **文件夹分类**：细化 `src/app/<name>/` 下的目录结构（config、permission、dao、services）

> ⚠️ 完善后，请用户确认 API 设计和数据模型是否完整

---

## 第三步：确认架构

确认本次开发采用的前端架构类型：

- **Vue 3 + Vite**（Web 端主选）
- **React**（需另行配置）
- **Android**（Kotlin + Jetpack Compose）
- **其他**（小程序、Flutter 等）

> ⚠️ 选择后，请用户确认架构选型

### 确定前端开发风格

确认架构后，在写前端代码前，先确定前端 UI 风格：

- 调用 UI/UX 设计技能（如 `product-designer`、`penpot-uiux-design`）确定设计风格
- 确定技术选型：CSS 方案（Tailwind / CSS 变量 / SCSS）、图标库、组件库
- 创建项目目录下的 `guide/` 文件夹存放设计文档（与 kt 文件共用同一目录）：

```
<项目名>/
└── guide/               # 需求与设计文档
    ├── index.kx         # kt 入口文件
    ├── layouts/         # 布局定义
    ├── pages/           # 页面定义
    ├── models/          # 数据模型 + API 定义
    ├── components/      # 共享组件
    ├── style.md         # 前端风格说明（配色、字体、间距）
    └── requirements.md  # 其他需求说明
```

> ⚠️ 风格方案确定后，请用户确认设计方向

---

## 第四步：项目初始化（Vue + Vite 为例）

### 4.1 确定技术栈版本

| 依赖 | 用途 | 参考版本 |
|------|------|----------|
| Node.js | 运行时 | >= 20 LTS |
| Vue | 前端框架 | 3.x |
| Vite | 构建工具 | 5.x |
| TypeScript | 类型系统 | 5.x |
| Axios | HTTP 请求 | 1.x |
| Pinia | 状态管理 | 3.x |
| Vue Router | 路由 | 4.x |
| ESLint | 代码检查 | 9.x |
| Prettier | 代码格式化 | 3.x |

> 后端版本参考现有项目：Fastify v5、Sequelize v6、MySQL2。

### 4.2 初始化项目配置

- [ ] 初始化 `package.json`（`npm init`）
- [ ] 配置 `tsconfig.json`（严格模式）
- [ ] 配置 ESLint（`eslint.config.js`）
- [ ] 配置 Prettier（`.prettierrc`）
- [ ] 配置 `.gitignore`（含 `node_modules/`、`.env`、`.env.*`、`*.pem`、`*.key`）
- [ ] 配置 `.env.example` 环境变量模板

### 4.3 创建目录骨架

参考 [frontend/main.md](frontend/main.md) 创建前端骨架，后端只需创建与业务相关的目录：

```
# 后端：按应用创建
src/api/<domain>/         # 路由（按功能域分文件夹）
src/models/<namespace>/   # 模型（按命名空间分文件夹）
src/app/<name>/           # 应用层（config + permission + dao + services）

# 基础设施（已有，不需重写）
src/db/     ✓   src/auth/  ✓   src/firewall/  ✓   src/loader/  ✓

# 前端
src/
├── api/          # 请求封装
├── components/   # 组件（三层结构）
├── views/        # 页面视图
├── router/       # 路由
├── stores/       # 状态管理
├── types/        # 类型定义
└── ...
```

### 4.4 配置 Git 钩子

- [ ] 安装 husky：`npx husky init`
- [ ] 配置 commitlint：`echo 'npx --no -- commitlint --edit "$1"' > .husky/commit-msg`
- [ ] 配置 lint-staged：`echo 'npx lint-staged' > .husky/pre-commit`
- [ ] 配置 `package.json` 中的 `lint-staged` 规则

### 4.5 确认架构方案

向用户展示完整的架构方案，逐项确认后进入开发阶段：

- [ ] 技术栈版本（Node.js、Vue、Fastify、Sequelize 等）
- [ ] 目录结构（后端 api/models/app、前端 src/ 各目录）
- [ ] 数据模型（核心实体、字段、关联关系）
- [ ] API 设计（路由、method、参数、权限）
- [ ] 前端风格（CSS 方案、图标库、组件库）

> ⚠️ 全部确认通过后，才开始开发代码

---

## 第五步：开发代码

### 后端：按应用生成文件

每新增一个应用（如 `xxx`），需创建以下文件：

```
src/app/<name>/           # 业务逻辑层
├── config.js             # 应用配置
├── permission/           # 权限和角色定义
├── dao/                  # 数据访问层（CRUD）
└── services/             # 业务逻辑层

src/api/<domain>/         # API 路由（按功能域）
├── system.json           # 域配置（name、prefix、安全默认值）
└── v1/<route>.js         # 路由文件

src/models/<namespace>/   # Sequelize 模型
└── <Model>.js            # 模型定义
```

### 前端：按需生成

根据选定的前端架构，生成对应页面、组件和 API 请求封装。

> 前端代码生成方式因架构而异（Vue / React / Android 等），具体规范见对应技术栈文档。

### 前后端对应检查

生成代码后，逐项检查前后端是否一致（适用于所有 Web 前端）：

- [ ] 后端路由拼接正确（system.json prefix + group prefix + route url）
- [ ] 前端 API 请求路径与后端最终路由一致
- [ ] 后端 permission 编码与前端权限指令中的编码一致
- [ ] 后端请求/响应字段名与前端类型定义一致

---

## 第六步：测试优化

- 功能测试：核心流程走通
- 边界测试：异常输入、空数据、权限校验
- 性能优化：N+1 查询、懒加载、缓存策略

> ⚠️ 测试完成后，请用户确认功能是否满足需求

---

## 第七步：部署准备

- [ ] 配置 `.env.production` 生产环境变量
- [ ] 生产日志配置（`isTTY` 判断，非 TTY 环境过滤 ANSI 颜色）
- [ ] 配置 CORS（`CORS_ORIGINS` 环境变量）
- [ ] 构建前端：`vite build`
- [ ] 配置反向代理（Nginx 将前端请求转发到后端）
- [ ] 验证生产构建正常运行