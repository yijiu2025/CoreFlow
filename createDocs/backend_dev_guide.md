# 后端开发核心规范指南 (Backend Development Guide)

本指南系统整理了本项目的后端架构设计准则，包含了系统层与应用层的物理组织方式、三级守卫引擎、统一异常处理体系、缓存数据库设计以及 Git 提交门禁规范，供后端开发或引导 AI 生成代码时参考。

---

## 1. 核心技术栈 (Technology Stack)
*   **运行时**：Node.js ESM (`"type": "module"`)
*   **Web 框架**：Fastify v5
*   **ORM 引擎**：Sequelize v6 + MySQL2 驱动
*   **缓存系统**：Redis v5 (基于 `node-redis`)，支持连通性故障时自动降级到内存 Map 缓存
*   **数据库迁移**：Umzug v3 (存放在 `migrations/` 目录)

---

## 2. 系统物理架构与目录结构 (Backend Architecture)
后端物理代码划分为**基础设施系统层**与**具体业务应用层**：
```text
src/
├── 系统层（核心基础设施）
│   ├── db/                # 数据库连接初始化、迁移运行器与软删除 Hooks
│   ├── redis/             # 缓存连接管理、健康监控、 rate-limit 存储适配器
│   ├── log/               # 结构化日志输出
│   ├── auth/              # Session 状态维护、ALS (异步上下文传递)
│   ├── firewall/          # IP 防火墙、五层拦截机制核心
│   └── models/session/    # 系统会话模型表定义
├── 应用层（具体业务模块）
│   ├── app/
│   │   ├── oauth21/       # OAuth 2.1 鉴权服务 (config + dao + services)
│   │   ├── user/          # 用户账号管理服务
│   │   └── admin/         # 平台管理维护服务
│   ├── api/               # API 路由层 (按业务模块分设子目录，并包含 guard.js)
│   └── models/            # 业务数据表实体模型
├── loader/                # 系统初始化顺序加载器
└── data/                  # 运行时配置存储数据
```

---

## 3. 三级守卫系统与路由注册 (Security Guard Specs)
后端采用了级联访问控制的“三级守卫系统”，通过 `registerSecureRoute` 实现路由的规范化声明和校验隔离。

### 3.1 三级守卫判定矩阵
系统会从高到低执行以下三级拦截判定，任何一级未通过都将立即终止请求：
1.  **System 级（第一级）**：读取 `system.json`，检查全局开关 `enabled`、系统白名单 `allowIps` 限制。
2.  **Group 级（第二级）**：通过 `registerGroupMetadata()` 限制特定模块（即某个 JS 文件）的默认配置。
3.  **API 级（第三级）**：通过 `registerSecureRoute()` 对单独接口做 `allowRoles`、`requireLogin` 或 `permission` 过滤。

### 3.2 路由注册推荐格式
路由的编写必须位于 `src/api/<domain>/v1/` 目录下，并使用如下格式注册：
```javascript
import { registerSecureRoute } from '../../guard.js';

export default async function (app) {
  registerSecureRoute(app, {
    name: 'getUserProfile',
    method: 'GET',
    url: '/profile',
    requireLogin: true,
    permission: 'user:profile:read', // 支持 Any (OR) 或 All (AND) 权限对象
    handler: async (request, reply) => {
      // 业务逻辑
      return reply.result.success('获取成功', { user: request.state.user });
    }
  });
}
```

---

## 4. 统一异常处理规范 (Exceptions & Global Error Handling)
为了确保后端接口返回风格高度统一，项目构建了标准的异常捕获和格式化处理机制，禁止在 Service 或 DAO 层随意以裸 `Error` 对象形式抛出业务异常。

### 4.1 统一异常基类 `ApiException`
异常体系定义于 `src/shared/exceptions.js`，包含：
*   `BadRequestException` (HTTP 400)
*   `UnauthorizedException` (HTTP 401)
*   `ForbiddenException` (HTTP 403)
*   `NotFoundException` (HTTP 404)
*   `ConflictException` (HTTP 409)
*   `TooManyRequestsException` (HTTP 429)
*   `InternalServerException` (HTTP 500)

### 4.2 全局错误捕获机制 (Error Handler)
`src/app.js` 内置的 `app.setErrorHandler` 对异常进行了拦截，并返回格式统一的 JSON 给前端：
```javascript
{
  "code": 403,                           // 业务错误码 (bizCode ?? statusCode)
  "message": "权限不足：需要该操作权限",     // 具体的异常提示信息
  "data": null,                          // 携带的调试数据
  "timestamp": 17170000000,
  "requestId": "req-xxxx",
  "stack": "..."                         // 仅在开发环境 (NODE_ENV !== 'production') 下输出
}
```

---

## 5. 数据库设计与缓存规则 (DB & Cache Guidelines)
### 5.1 命名空间与软删除
*   **模型自动注册**：Sequelize 模型按子目录命名空间自动挂载到 `app.db.<namespace>.<ModelName>`。
*   **物理表名**：遵循 `命名空间_表名` 的规范（例如：`user_user`、`iam_role`、`session_tokens`）。
*   **安全软删除 Hook**：所有的表模型必须统一启用软删除 `delete_version` hooks，防止记录被物理硬删除。

### 5.2 数据库迁移管理
*   **严禁**在生产部署环境下开启 `DB_SYNC=true`。
*   所有的表结构变动必须通过在 `migrations/` 下编写 Umzug 迁移脚本进行，并通过 `npm run migrate` 进行版本升级。

### 5.3 缓存高可用
*   写入和读取 Redis 时，必须捕获连接超时或断开错误。
*   在 Redis 连接异常或不可达时，系统必须无缝降级到本地内存缓存模式，保证 API 可用性。

---

## 6. 开发质量与日志门禁 (Quality Control & Standards)
1.  **文件大小限制**：单个 JS 物理文件控制在 **1000 行** 以内。如果逻辑过于臃肿，必须按照 Service 与 DAO 的职责划分进行文件拆分。
2.  **Emoji 启动日志**：所有的系统 loader、连接成功或失败，必须采用项目约定的 Emoji 及彩色文字标签进行日志输出。例如：
    `✅ [Redis] 连接成功`、`⚠️ [Redis] 连接失败，降级到内存模式`。
3.  **门禁控制**：代码在提交到 GitHub 之前，必须在本地完整运行通过：
    *   `npm run lint`：ESLint 代码检查与自动修复；
    *   `npm run format`：Prettier 统一格式化；
    *   `npm test`：Jest 测试套件，必须保证 **100% 成功通过**。
