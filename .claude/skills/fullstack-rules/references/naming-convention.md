# 命名规范

## 核心原则

**JS 内存用 camelCase，SQL 磁盘用 snake_case**。Sequelize 自动双向映射，写入时 `camelCase` → `snake_case`，读取时 `snake_case` → `camelCase`。通过 `field` 属性显式声明：

```js
// 定义时用 camelCase，field 指定磁盘列名
const Model = sequelize.define(
  'Model',
  {
    clientId: { type: DataTypes.INTEGER, field: 'client_id', comment: '客户端ID' },
    redirectUri: { type: DataTypes.STRING, field: 'redirect_uri', comment: '回调地址' },
    createdAt: { type: DataTypes.DATE, field: 'created_at', comment: '创建时间' },
    updatedAt: { type: DataTypes.DATE, field: 'updated_at', comment: '更新时间' }
  },
  {
    tableName: 'app_model', // 表名始终 snake_case
    timestamps: true, // Sequelize 自动处理 createdAt/updatedAt
    underscored: true, // 自动将 createdAt → created_at（省去手动 field）
    comment: '应用模型表'
  }
);
```

> `underscored: true` 可省去 `createdAt`/`updatedAt` 的手动 `field` 声明，但**业务字段建议显式写 `field`**，一目了然且避免误判。

---

## 一、代码命名（JS/TS）

| 类型      | 规范                     | 示例（来源）                     | 说明                       |
| --------- | ------------------------ | -------------------------------- | -------------------------- |
| 变量/属性 | `camelCase`              | `clientId` — 模型字段            | 所有 JS 变量               |
|           |                          | `userName` — 模型字段            |                            |
| 函数/方法 | `camelCase`              | `getUserById` — 服务层方法       | 普通函数、类方法、箭头函数 |
|           |                          | `handleSubmit` — 组件事件        |                            |
| 布尔变量  | 前缀 `is`/`has`/`should` | `isLoading` — 组件状态           | 统一前缀，一眼识别布尔类型 |
|           |                          | `hasPermission` — 权限检查       |                            |
| 私有属性  | 前缀下划线 `_`           | `_internalCache` — 类内部缓存    | 类内部私有属性             |
|           |                          | `_rawData` — 原始数据存储        |                            |
| 常量      | `UPPER_SNAKE_CASE`       | `MAX_RETRY_COUNT` — 重试策略     | 全局常量、枚举值           |
|           |                          | `API_BASE_URL` — 请求配置        |                            |
| 类型/接口 | `PascalCase` + 后缀      | `UserDto` — 数据传输对象         | TypeScript 类型/接口定义   |
|           |                          | `CreateUserRequest` — 请求体类型 |                            |
| 组件/类   | `PascalCase`             | `UserProfile` — Vue 组件         | Vue/React 组件、Class      |
|           |                          | `AuthGuard` — 路由守卫           |                            |

---

## 二、文件命名

| 类型        | 规范         | 示例（来源）                             | 说明               |
| ----------- | ------------ | ---------------------------------------- | ------------------ |
| 模型文件    | `PascalCase` | `User.js` — `src/models/user/`           | Sequelize 模型定义 |
|             |              | `OauthClient.js` — `src/models/oauth21/` | OAuth 客户端模型   |
|             |              | `UserSession.js` — `src/models/session/` | 用户会话模型       |
| 工具文件    | `kebab-case` | `safe-redis.js` — `src/framework/redis/`           | Redis 安全操作封装 |
|             |              | `session-store.js` — `src/framework/redis/`        | 会话存储适配器     |
|             |              | `nonce-store.js` — `src/framework/redis/`          | Nonce 去重存储     |
| Composables | `camelCase`  | `usePoseData.ts` — `hooks/`              | 姿态数据组合式函数 |
|             |              | `useCanvas.ts` — `hooks/`                | 画布组合式函数     |

> **hooks/composables 例外**：`hooks/` 目录下的文件用 `camelCase`（`useXxx.ts`），其他工具文件统一 `kebab-case`。

| 类型        | 规范         | 示例（来源）                             | 说明               |
| ----------- | ------------ | ---------------------------------------- | ------------------ |
| 路由文件    | `kebab-case` | `auth.js` — `src/api/auth/v1/`           | 认证路由           |
|             |              | `user-info.js` — `src/api/user/v1/`      | 用户信息路由       |
|             |              | `traffic-stats.js` — `src/api/firewall/v1/` | 流量统计路由    |
| Vue 组件    | `PascalCase` | `EditorCanvas.vue` — 编辑器              | 编辑器画布组件     |
|             |              | `LoginForm.vue` — 登录页                 | 登录表单组件       |
|             |              | `UserProfile.vue` — 用户中心             | 用户信息组件       |
| Hooks/Composables | `camelCase` | `usePoseData.ts` — 编辑器           | 姿态数据组合式函数 |
|             |              | `useCanvas.ts` — 编辑器                  | 画布组合式函数     |
| 配置文件    | `kebab-case` | `system.json` — `src/api/<domain>/`      | API 域系统配置     |
|             |              | `guard_config.json` — `data/`            | 守卫持久化配置     |

---

## 三、数据库命名

| 类型   | 规范                       | 示例（来源）                     | 说明               |
| ------ | -------------------------- | -------------------------------- | ------------------ |
| 表名   | `{app}_{功能}`，snake_case | `user_user` — 用户服务           | 用户表             |
|        |                            | `posecraft_work` — 编辑器        | 作品表             |
|        |                            | `iam_role` — 权限中心            | 角色表             |
|        |                            | `oauth_clients` — OAuth          | OAuth 客户端表     |
| 列名   | snake_case                 | `created_at` — 通用时间戳        | 创建时间           |
|        |                            | `user_id` — 外键列               | 用户 ID            |
|        |                            | `client_id` — 配置列             | 客户端 ID          |
| 索引名 | `idx_{表名}_{列名}`        | `idx_users_email` — 用户表       | 用户表邮箱索引     |
|        |                            | `idx_orders_created_at` — 订单表 | 订单表创建时间索引 |
| 外键名 | `fk_{表名}_{引用表}`       | `fk_orders_user_id` — 订单表     | 订单表 -> 用户表   |
|        |                            | `fk_work_user_id` — 作品表       | 作品表 -> 用户表   |

---

## 四、权限与角色编码

| 类型     | 规范                        | 示例（来源）                     | 说明         |
| -------- | --------------------------- | -------------------------------- | ------------ |
| 权限编码 | `{app}:{resource}:{action}` | `posecraft:work:create` — 编辑器 | 创建作品权限 |
|          |                             | `user:read` — 用户服务           | 读取用户信息 |
|          |                             | `config:update` — 系统管理       | 更新配置     |
| 角色编码 | `{app}_{role}`              | `fw_admin` — 防火墙              | 防火墙管理员 |
|          |                             | `posecraft_user` — 编辑器        | 普通用户     |
|          |                             | `posecraft_vip` — 编辑器         | VIP 用户     |

---

## 五、前端组件/文件命名

| 类型         | 规范               | 示例（来源）                       | 说明           |
| ------------ | ------------------ | ---------------------------------- | -------------- |
| 组件文件     | `PascalCase`       | `EditorCanvas.vue` — `components/` | 编辑器画布     |
|              |                    | `LoginForm.vue` — `components/`    | 登录表单       |
|              |                    | `UserProfile.vue` — `views/`       | 用户信息页     |
| 文件夹       | `kebab-case`       | `business-panels/` — `components/` | 业务面板目录   |
|              |                    | `common/` — `components/`          | 通用组件目录   |
| 工具/JS 文件 | `camelCase`        | `usePoseData.ts` — `hooks/`        | 数据组合式函数 |
|              |                    | `request.ts` — `api/`              | HTTP 请求封装  |
| 常量         | `UPPER_SNAKE_CASE` | `MAX_REFRESH_TOKENS` — `config/`   | 最大刷新令牌数 |
|              |                    | `API_BASE_URL` — `config/`         | API 基础路径   |

---

## 六、路由与 API 命名

| 类型     | 规范         | 示例（来源）                        | 说明          |
| -------- | ------------ | ----------------------------------- | ------------- |
| 路由文件 | `kebab-case` | `auth.js` — `src/api/auth/`         | 认证路由      |
| URL 路径 | kebab-case   | `/api/v1/user-info` — API 路由      | API 路径      |
| 路由名称 | camelCase    | `getUserInfo` — registerSecureRoute | 路由注册名    |
| 参数名   | camelCase    | `userId`, `pageSize` — 路由参数     | 查询/路径参数 |

---

## 七、Git 分支命名

| 类型     | 规范                | 示例（来源）              | 说明               |
| -------- | ------------------- | ------------------------- | ------------------ |
| 功能分支 | `feature/<desc>`    | `feature/user-login`      | 新功能开发         |
| 修复分支 | `hotfix/<desc>`     | `hotfix/fix-npe-on-login` | 生产紧急修复       |
| 发布分支 | `release/<version>` | `release/v1.2.0`          | 版本发布准备       |
| 杂务分支 | `chore/<desc>`      | `chore/upgrade-sequelize` | 依赖升级、配置变更 |

---

## 命名反例

```js
// ❌ JS 变量用了 snake_case
const user_name = 'Alice';

// ❌ JS 变量用了 PascalCase
const UserProfile = {};

// ❌ 常量用了 camelCase
const maxRetryCount = 3;

// ✅ 正确
const userName = 'Alice';
const userProfile = {};
const MAX_RETRY_COUNT = 3;
```

```bash
# ❌ 模型文件用了 kebab-case
user-session.js    → 应为 UserSession.js

# ❌ 工具文件用了 PascalCase
SessionStore.js    → 应为 session-store.js

# ❌ Vue 组件用了 kebab-case
user-profile.vue   → 应为 UserProfile.vue
```

---

## 附：快速对照表

| 领域     | 使用规范           | 禁止使用                   |
| -------- | ------------------ | -------------------------- |
| JS 变量  | `camelCase`        | `snake_case`, `PascalCase` |
| SQL 列   | `snake_case`       | `camelCase`, `PascalCase`  |
| 模型文件 | `PascalCase`       | `snake_case`, `kebab-case` |
| 工具文件 | `kebab-case`       | `camelCase`, `PascalCase`  |
| 路由文件 | `kebab-case`       | `camelCase`                |
| Vue 组件 | `PascalCase`       | `kebab-case`               |
| 常量     | `UPPER_SNAKE_CASE` | `camelCase`, `PascalCase`  |
| 表名     | `snake_case`       | `camelCase`, `PascalCase`  |
| 权限编码 | `:` 分隔           | `/` 分隔, `.` 分隔         |
