# 后端代码检查与整改规划 {#backend-review-plan}

本文档基于当前 `src/`、`migrations/`、`scripts/` 后端代码检查结果整理，目标是把后端书写规范、业务逻辑、接口契约和前端规划对齐，作为后续重构和评审依据。

## 检查范围

- 启动入口：`src/app.js`、`index.js`
- Loader：`src/loader/engine.js`、`src/loader/registry/`
- 通用响应和守卫：`src/loader/registry/00-globals.js`、`src/api/guard.js`、`src/api/guard-config.js`
- 认证会话：`src/auth/`
- 数据库和迁移：`src/db/`、`migrations/`
- Redis：`src/redis/`
- 业务模块：`src/app/*`、`src/api/*`
- 重点联动模块：`src/api/posecraft/`、`src/app/posecraft/dao/`、`src/models/posecraft/`
- 运维脚本：`scripts/`

## 总体评价

后端整体架构已经具备清晰骨架：Fastify 插件化启动、数字前缀 loader、统一认证、三级 Guard、Sequelize 命名空间模型、Umzug 迁移和较完整测试目录。主要问题不是缺少基础设施，而是规范执行不够一致：

1. 乱码注释和乱码提示在后端同样普遍存在，影响可维护性和用户可见错误。
2. 响应结构尚未完全统一，部分接口绕过 `reply.result` 直接 `reply.send`。
3. Schema 校验覆盖不完整，很多接口直接读取 `request.body` / `request.query`。
4. 公开列表接口与后台分页接口契约不一致，前端不得不本地兜底和写死分页。
5. 少量脚本仍使用 `sequelize.sync()`，和“生产必须迁移”的规范存在冲突风险。
6. 部分核心文件开始接近或超过拆分阈值，尤其是 Session 和 Firewall 管理逻辑。

## 已确认问题

### P0：编码乱码

`src/app.js`、`src/api/guard.js`、`src/loader/registry/00-globals.js`、PoseCraft API/DAO/Model 等文件存在大量乱码注释和乱码中文响应。

影响：

- 前端 toast、错误提示、页面文案会直接显示乱码。
- 文档和代码注释难以 review。
- 自动生成 API 文档或日志检索会失真。

要求：

1. 全仓后端源码统一保存为 UTF-8。
2. 用户可见 `message` 优先修复，随后修复注释。
3. 后续 CI 增加乱码字符扫描，例如检查 `鍓`、`鎼`、`閿`、`鉂` 等常见异常字符。

### P0：响应结构不一致

现有统一响应在 `reply.result` 中定义，但仍存在直接响应：

- `src/api/admin/v1/iam.js` 使用 `{ success: true, data }`。
- `src/api/guard.js` 中 Token 错误返回 `{ error, error_description }`。
- `src/api/posecraft/v1/template.js` 审核参数错误使用 `reply.code(400).send({ error })`。
- OAuth Token/OIDC 等协议接口有标准协议格式，需要明确例外。

统一要求：

业务 API 默认返回：

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {},
  "timestamp": 1717000000000,
  "requestId": "..."
}
```

分页 API 默认返回：

```json
{
  "code": 200,
  "message": "获取成功",
  "data": [],
  "pagination": {
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5
  },
  "timestamp": 1717000000000,
  "requestId": "..."
}
```

允许例外：

- OAuth/OIDC 标准协议接口可以返回协议规定格式。
- 文件下载、图片、静态资源、WebSocket 不使用 JSON 包装。
- 例外接口必须在路由注释或文档中注明。

### P0：前后端分页契约不统一

PoseCraft 后台审核接口已经使用 `reply.result.paginated`，但公开模板/作品列表仍返回数组：

- `GET /posecraft/v1/templates`
- `GET /posecraft/v1/works`
- `GET /posecraft/v1/works/user/:userId`
- `GET /posecraft/v1/works/following`

影响：

- 前端无法可靠展示总数、是否还有下一页。
- 当前前端容易写成 `pageSize: 60` 后本地过滤，性能和体验都会变差。

整改要求：

1. DAO 层列表方法统一返回 `{ list, total, page, pageSize }`。
2. API 层统一使用 `reply.result.paginated`。
3. 前端 request 层提供 `PageResult<T>` 类型，并统一解析 `pagination`。

### P0：输入校验不完整

很多业务路由直接读取 `request.query` 和 `request.body`，缺少 Fastify schema：

- `src/api/posecraft/v1/template.js`
- `src/api/posecraft/v1/work.js`
- `src/api/posecraft/v1/admin.js`
- `src/api/admin/v1/iam.js`

风险：

- `parseInt(undefined)`、非法状态值、空标题、超大字段等问题会进入 DAO。
- 前端和后端校验规则可能漂移。

整改要求：

1. 所有新增和改动路由必须提供 `schema`。
2. 分页参数统一限制：`page >= 1`，`1 <= pageSize <= 100`。
3. 状态字段用 enum，例如 `[-2, -1, 0, 1, 2]`。
4. 字符串字段声明 `minLength`、`maxLength`。
5. JSON 大字段明确大小和用途，上传型数据走文件接口，不塞进普通 JSON。

### P1：Session 文件过大且职责过多

`src/auth/session.js` 超过 500 行，包含设备识别、并发限制、踢下线、创建、验证、刷新、销毁、DB 日志等多类职责。

建议拆分：

```text
src/auth/session/
├── index.js              # 对外门面
├── constants.js          # key 前缀、设备类型
├── device.js             # 设备识别
├── lifecycle.js          # create/get/destroy/refresh
├── limits.js             # 最大会话、refresh token 上限
├── kick.js               # 踢下线
└── persistence.js        # SessionToken/SessionLog 写入
```

拆分原则：

- 先移动纯函数和低耦合逻辑，再移动核心生命周期。
- 保持原导出 API 不变，避免一次性影响调用方。
- 补充 session-flow 测试覆盖刷新、踢下线、Redis 降级。

### P1：脚本中仍有 `sequelize.sync()`

发现位置：

- `scripts/initSuperAdmin.js`
- `scripts/setup-superadmin.js`

风险：

- 运维人员可能在错误环境执行，导致生产结构被自动同步。

整改要求：

1. 脚本默认只验证迁移状态，不自动 `sync()`。
2. 如确需开发环境建表，必须显式传参，例如 `--allow-sync`。
3. 生产环境检测到 sync 直接拒绝执行。

### P1：日志风格不统一

运行时既有 Fastify/Pino，也有大量 `console.log`。CLI 和迁移脚本可以使用 `console`，服务端运行时代码应优先使用 `request.log` 或 `app.log`。

要求：

1. 请求链路内使用 `request.log`。
2. Loader 使用 `app.log`，避免绕过日志系统。
3. CLI、迁移、一次性脚本允许使用 `console`。
4. 日志中不要输出密码、Token、验证码、完整 Cookie。

### P1：权限点命名和资源类型需细化

PoseCraft 模板接口复用了 `posecraft:work:*` 权限，能工作，但从长期维护看不够清晰。

建议：

```text
posecraft:template:read
posecraft:template:create
posecraft:template:update
posecraft:template:delete
posecraft:template:audit
posecraft:work:read
posecraft:work:create
posecraft:work:update
posecraft:work:delete
posecraft:work:audit
```

迁移方式：

1. 先在权限字典新增 template 权限。
2. Guard 支持新旧权限任一满足。
3. 前端管理后台切换到新权限。
4. 确认无旧客户端后移除兼容。

## 后端统一规范补充

### 路由注册

所有业务路由使用 `registerSecureRoute()`，必须包含：

- `name`
- `alias`
- `method`
- `url`
- `schema`
- `requireLogin`
- `permission` 或明确说明无需权限
- `handler`

示例：

```js
registerSecureRoute(app, {
  name: 'listTemplates',
  alias: '获取模板列表',
  method: 'GET',
  url: '/templates',
  requireLogin: false,
  schema: {
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        keyword: { type: 'string', maxLength: 100 }
      }
    }
  },
  handler: async (request, reply) => {}
});
```

### DAO 返回值

DAO 不直接使用 Fastify `request` / `reply`，只接收普通参数。

推荐：

```js
async findPage({ page = 1, pageSize = 20, keyword }) {
  const limit = pageSize;
  const offset = (page - 1) * pageSize;
  const { count, rows } = await Model.findAndCountAll({ where, limit, offset });
  return { list: rows, total: count, page, pageSize };
}
```

### 错误处理

1. 业务错误使用带 `statusCode` / `code` 的 Error，交给全局 error handler。
2. 路由内可直接 `return reply.result.fail(...)`，但不要混用 `{ success: true }`。
3. OAuth/OIDC 协议错误保留标准格式，但需要在前端 request 层作为特例处理。

### 数据库变更

1. 表结构变更必须走 `migrations/`。
2. 模型字段新增后必须同步新增迁移。
3. 删除字段分两步：先停止使用，再迁移删除。
4. 生产环境禁止 `DB_SYNC=true` 和脚本隐式 `sequelize.sync()`。

## 前后端联动优化规划

### 统一接口契约

前端 `utils/request.ts` 只处理两类成功响应：

1. 普通业务响应：`ApiResult<T>`
2. 分页业务响应：`ApiPageResult<T>`

后端所有非协议业务接口对齐 `reply.result`。

前端类型：

```ts
export interface ApiResult<T> {
  code: number;
  message: string;
  data: T;
  timestamp?: number;
  requestId?: string;
}

export interface Pagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiPageResult<T> extends ApiResult<T[]> {
  pagination: Pagination;
}
```

### PoseCraft 优先联动项

| 后端任务                    | 前端配套                                                 |
| --------------------------- | -------------------------------------------------------- |
| 模板/作品公开列表改分页响应 | Home/Profile 列表改为分页加载，去掉一次性 `pageSize: 60` |
| 模板和作品权限点拆分        | 前端按钮、菜单、路由按新权限控制                         |
| 点赞接口增加幂等记录        | 前端显示 liked 状态，避免本地点赞假成功                  |
| 关注接口补 schema 和分页    | 前端关注流支持加载更多                                   |
| 上传接口统一返回文件元信息  | 前端上传组件统一展示进度、错误和最终 URL                 |
| 审核状态 enum 文档化        | poseadmin 使用统一状态字典渲染标签和筛选                 |

### 统一状态字典

建议后端提供或文档化以下字典，前端不要硬编码散落：

```js
export const REVIEW_STATUS = {
  REJECTED: -2,
  DELETED: -1,
  PRIVATE: 0,
  PUBLIC: 1,
  PENDING: 2
};
```

### 分阶段执行

#### Phase 1：契约收口

1. 修复乱码用户可见响应。
2. 统一业务响应格式。
3. PoseCraft 公开列表改分页。
4. 前端 request 和 API 类型同步更新。

#### Phase 2：安全和校验

1. 给 PoseCraft、admin IAM、notice 配置接口补 schema。
2. 权限点细化并兼容迁移。
3. session 拆分前补齐测试。

#### Phase 3：结构优化

1. 拆分 `src/auth/session.js`。
2. 拆分 Firewall 大 DAO/监控接口。
3. 前端拆分超大页面和 Canvas composables。

#### Phase 4：质量门禁

1. 增加乱码扫描。
2. 增加接口契约测试。
3. 增加前端类型检查和文档构建到 CI。

## Review 清单

- [ ] 路由是否使用 `registerSecureRoute()`。
- [ ] 是否提供 `schema` 校验 `params/query/body`。
- [ ] 是否使用统一 `reply.result` 响应。
- [ ] 分页接口是否返回 `pagination`。
- [ ] DAO 是否与 Fastify request/reply 解耦。
- [ ] 权限点是否符合 `{app}:{resource}:{action}`。
- [ ] 是否避免在生产路径使用 `sequelize.sync()`。
- [ ] 是否没有乱码文案、敏感日志和裸 `console.log`。
- [ ] 是否有对应迁移、测试和前端类型更新。
