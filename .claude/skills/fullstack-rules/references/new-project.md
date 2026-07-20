# 新项目初始化流程

## 核心流程

```
创建 kt 文件 → 完善 kt 设计 → 确认架构 → 项目初始化 → 开发代码 → 测试优化
```

---

## 第一步：创建 kt 文件

创建项目设计文档（kt 文件），参考文献：[kt](../assets/project-template/kt/kx-lang/SPEC.md)

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

---

## 第三步：确认架构

确认本次开发采用的前端架构类型：

- **Vue 3 + Vite**（Web 端主选）
- **React**（需另行配置）
- **Android**（Kotlin + Jetpack Compose）
- **其他**（小程序、Flutter 等）

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

向用户展示完整的架构方案（技术栈、目录结构、数据模型、API 设计），确认后进入开发阶段。

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

---

## 第六步：测试优化

- 功能测试：核心流程走通
- 边界测试：异常输入、空数据、权限校验
- 性能优化：N+1 查询、懒加载、缓存策略