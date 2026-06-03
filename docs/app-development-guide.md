# 应用开发指南

本指南描述如何在本框架中创建一个完整的应用模块。按照本规范编写的应用，复制到 `src/app/` 目录后即可直接运行。

## 目录结构模板

```
src/app/{app_name}/
├── config.js                   # 应用配置（必填）
├── permission/                 # 权限定义（可选）
│   ├── index.js                #   权限常量
│   └── roles.js                #   角色定义
├── dao/                        # 数据访问层（可选）
│   └── xxx.dao.js
├── services/                   # 业务逻辑层（可选）
│   └── xxx.service.js
├── middleware/                  # 中间件（可选）
│   └── xxx.middleware.js
└── index.js                    # 应用入口（可选，Fastify 插件）

src/api/{app_name}/             # API 路由（与应用同名）
├── system.json                 # 系统配置（必填）
└── v1/
    ├── xxx.js                  # 路由文件
    └── schemas.js              # Schema 定义（可选）

src/models/{app_name}/          # 数据模型（与应用同名）
├── ModelA.js
└── ModelB.js
```

---

## 1. config.js — 应用配置

每个应用必须在根目录下有 `config.js`，导出默认对象。

```js
/**
 * {应用名} 应用配置
 */
export default {
  // 必填：应用唯一标识（与文件夹名一致）
  app_id: 'myapp',

  // 必填：应用显示名称
  name: '我的应用',

  // 可选：应用描述
  description: '这是一个示例应用',

  // 可选：Fastify 插件初始化函数
  // 如果定义了 init，loader 会自动调用 app.register(init)
  init: initMyApp,

  // 可选：OAuth 2.1 客户端配置
  // 如果定义了 oauth_client，loader 会自动同步到 oauth_clients 表
  oauth_client: {
    client_id: 'myapp',
    client_name: '我的应用',
    client_secret: null,                    // null = 公共客户端（SPA）
    redirect_uris: [
      'http://localhost:5173/myapp/callback',
      'https://myapp.example.com/callback'
    ],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'openid profile email',
    token_endpoint_auth_method: 'none',     // 公共客户端不认证
    application_type: 'web'
  }
};

// init 函数（如果 config 中定义了 init）
async function initMyApp(app) {
  // 注册应用级插件、定时任务等
  // 这里可以调用 app.register(...) 注册子插件
}
```

**加载器自动处理：**
- 读取 `config.name` → 打印日志
- 读取 `config.init` → 调用 `app.register(init)`
- 读取 `config.oauth_client` → 同步到 `oauth_clients` 表

---

## 2. permission/ — 权限定义

### permission/index.js — 权限常量

使用 `createPermissionRegistry` 工厂函数定义权限，同时生成后端常量和前端元数据。

```js
import { createPermissionRegistry } from '../../../utils/PbacRegistry.js';

/**
 * 我的应用权限常量
 * createPermissionRegistry(域名, 显示名, 权限定义)
 */
export const MYAPP_PERMISSIONS = createPermissionRegistry('myapp', '我的应用', {
  // 按模块分组
  ARTICLE: {
    READ: { code: 'myapp:article:read', label: '查看文章', type: 'read' },
    WRITE: { code: 'myapp:article:write', label: '编辑文章', type: 'write' },
    DELETE: { code: 'myapp:article:delete', label: '删除文章', type: 'high_risk' }
  },
  ADMIN: {
    ALL: { code: 'myapp:admin:*', label: '管理员全量通配符', type: 'wildcard' },
    CONFIG: { code: 'myapp:admin:config', label: '管理配置', type: 'write' }
  }
});

export default MYAPP_PERMISSIONS;
```

### permission/roles.js — 角色定义

使用 `defineRoles` 注册角色，loader 启动时自动同步到数据库。

```js
import { defineRoles } from '../../../utils/PbacRegistry.js';
import { MYAPP_PERMISSIONS } from './index.js';

/**
 * 我的应用角色定义
 * defineRoles 会在启动时自动同步到 iam_role 表
 */
defineRoles([
  {
    code: 'myapp_user',
    app_id: 'myapp',           // 必须与 app_id 一致
    name: '普通用户',
    rank_level: 10,
    description: '可以查看和编辑自己的文章',
    policy: {
      Version: '2026-05-18',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            MYAPP_PERMISSIONS.ARTICLE.READ,
            MYAPP_PERMISSIONS.ARTICLE.WRITE
          ]
        }
      ]
    }
  },
  {
    code: 'myapp_admin',
    app_id: 'myapp',
    name: '应用管理员',
    rank_level: 80,
    description: '拥有应用全部权限',
    policy: {
      Version: '2026-05-18',
      Statement: [
        {
          Effect: 'Allow',
          Action: [MYAPP_PERMISSIONS.ADMIN.ALL]
        }
      ]
    }
  }
]);
```

---

## 3. src/models/{app_name}/ — 数据模型

每个模型文件导出工厂函数，接收 `(sequelize, DataTypes)`，返回定义好的 Model。

### 模型文件模板

```js
/**
 * 文章模型
 */
export default (sequelize, DataTypes) => {
  const Article = sequelize.define(
    'Article',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '作者用户ID'
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '文章标题'
      },
      content: {
        type: DataTypes.TEXT,
        comment: '文章内容'
      },
      status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '状态: 1-发布, 0-草稿, -1-已删除'
      },
      // 软删除字段（如果需要软删除）
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: '软删除标志'
      }
    },
    {
      tableName: 'myapp_article',
      timestamps: true,        // 自动管理 created_at, updated_at
      paranoid: true,          // 启用软删除（需要 delete_version 字段）
      indexes: [
        { fields: ['user_id'], name: 'idx_article_user' },
        { unique: true, fields: ['user_id', 'title', 'delete_version'], name: 'uk_user_title' }
      ],
      comment: '文章表'
    }
  );

  // 关联定义（可选）
  Article.associate = (models) => {
    Article.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'author',
      onDelete: 'CASCADE'
    });
  };

  // 注册软删除钩子（如果使用了 delete_version）
  // import { registerDeleteVersionHooks } from '../../db/softDeleteHooks.js';
  // registerDeleteVersionHooks(Article);

  return Article;
};
```

### 模型文件规范

| 规则 | 说明 |
|------|------|
| 文件名 | 大驼峰，与 `sequelize.define()` 的第一个参数一致 |
| 目录 | 按应用放入 `src/models/{app_name}/` |
| 导出 | 工厂函数 `(sequelize, DataTypes) => Model` |
| 关联 | 通过 `Model.associate = (models) => {}` 定义 |
| 软删除 | 需要 `paranoid: true` + `delete_version` 字段 + `registerDeleteVersionHooks()` |
| 时间戳 | 统一 `timestamps: true` |
| 表名 | `{app_name}_{功能}` 格式，如 `myapp_article` |

### 模型自动注册

模型加载器扫描 `src/models/{app_name}/` 目录，自动注册为 `app.db.{app_name}.ModelName`。

```js
// 在路由中使用
const article = await app.db.myapp.Article.findByPk(1);
const user = await app.db.user.User.findByPk(article.user_id);
```

---

## 4. src/api/{app_name}/ — API 路由

### system.json — 系统配置

每个 API 域必须有 `system.json`，定义路由前缀和安全默认值。

```json
{
  "name": "myapp",
  "alias": "我的应用",
  "prefix": "/myapp",
  "description": "应用 API 描述",
  "enabled": true,
  "requireLogin": false,
  "allowIps": [],
  "allowRoles": []
}
```

| 字段 | 说明 |
|------|------|
| `name` | 系统标识名（用于 Guard 配置） |
| `alias` | 显示名称 |
| `prefix` | 路由前缀（如 `/myapp`） |
| `enabled` | 是否启用 |
| `requireLogin` | 是否要求登录 |
| `allowIps` | IP 白名单 |
| `allowRoles` | 角色白名单 |

### v1/xxx.js — 路由文件

使用 `registerSecureRoute()` 注册路由，自动附加三级安全守卫。

```js
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { getSessionStore } from '../../../redis/session-store.js';

export default async function (fastify) {
  // 1. 注册模块级元数据（可选，覆盖 system.json 的默认值）
  registerGroupMetadata({
    name: 'article',
    description: '文章管理',
    prefix: '/v1',
    enabled: true,
    requireLogin: true,       // 此模块所有接口需要登录
    allowRoles: []            // 不限制角色
  });

  // 2. 获取存储适配器（如果需要）
  const store = getSessionStore(fastify, 'myapp_cache');

  // 3. 注册路由
  registerSecureRoute(fastify, {
    name: 'getArticles',
    alias: '获取文章列表',
    method: 'GET',
    url: '/articles',
    handler: async (request, reply) => {
      const user = request.state.user;
      const articles = await app.db.myapp.Article.findAll({
        where: { user_id: user.userId }
      });
      return reply.result.success('获取成功', articles);
    }
  });

  registerSecureRoute(fastify, {
    name: 'createArticle',
    alias: '创建文章',
    method: 'POST',
    url: '/articles',
    requireLogin: true,       // 此接口需要登录（覆盖模块级配置）
    handler: async (request, reply) => {
      const { title, content } = request.body;
      const user = request.state.user;

      const article = await app.db.myapp.Article.create({
        user_id: user.userId,
        title,
        content
      });
      return reply.result.success('创建成功', article);
    }
  });

  registerSecureRoute(fastify, {
    name: 'deleteArticle',
    alias: '删除文章',
    method: 'DELETE',
    url: '/articles/:id',
    requireLogin: true,
    allowRoles: ['myapp_admin'],  // 仅管理员可删除
    handler: async (request, reply) => {
      const { id } = request.params;
      await app.db.myapp.Article.destroy({ where: { id } });
      return reply.result.success('删除成功');
    }
  });
}
```

### 路由文件规范

| 规则 | 说明 |
|------|------|
| 导出 | `export default async function (fastify) {}` |
| 注册 | 使用 `registerSecureRoute(fastify, options)` |
| 响应 | 使用 `reply.result.success(msg, data)` / `reply.result.fail(msg)` |
| 认证 | `request.state.user` 包含当前用户信息（已登录时） |
| 权限 | `requireLogin` / `allowRoles` / `allowIps` 控制访问 |
| Schema | 可选，使用 Fastify JSON Schema 校验请求 |

### v1/schemas.js — Schema 定义（可选）

```js
export const createArticleSchema = {
  summary: '创建文章',
  body: {
    type: 'object',
    required: ['title'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 200 },
      content: { type: 'string' }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        code: { type: 'integer' },
        message: { type: 'string' },
        data: { type: 'object' }
      }
    }
  }
};

// 在路由中使用
registerSecureRoute(fastify, {
  name: 'createArticle',
  method: 'POST',
  url: '/articles',
  schema: createArticleSchema,
  handler: async (request, reply) => { ... }
});
```

---

## 5. dao/ — 数据访问层

```js
// src/app/myapp/dao/article.dao.js
import sequelize from '../../../db/index.js';

class ArticleDao {
  /**
   * 获取模型（延迟获取，确保模型已加载）
   */
  getModel() {
    return sequelize.models.Article;
  }

  /**
   * 查询文章列表
   * @param {number} userId 用户ID
   * @param {object} options 查询选项
   * @returns {Promise<Array>}
   */
  async findByUser(userId, options = {}) {
    const model = this.getModel();
    return await model.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      limit: options.limit || 20,
      offset: options.offset || 0
    });
  }

  /**
   * 创建文章
   * @param {object} data 文章数据
   * @returns {Promise<object>}
   */
  async create(data) {
    const model = this.getModel();
    return await model.create(data);
  }

  /**
   * 删除文章（软删除）
   * @param {number} id 文章ID
   * @param {number} userId 用户ID（权限校验）
   * @returns {Promise<boolean>}
   */
  async delete(id, userId) {
    const model = this.getModel();
    const result = await model.destroy({ where: { id, user_id: userId } });
    return result > 0;
  }
}

export default new ArticleDao();
```

---

## 6. services/ — 业务逻辑层

```js
// src/app/myapp/services/article.service.js
import articleDao from '../dao/article.dao.js';
import Logger from '../../../log/index.js';

class ArticleService {
  /**
   * 创建文章（包含业务校验）
   */
  async createArticle(userId, data) {
    // 业务校验
    if (!data.title || data.title.trim().length === 0) {
      throw new Error('VALIDATION:文章标题不能为空');
    }

    // 业务逻辑
    const article = await articleDao.create({
      user_id: userId,
      title: data.title.trim(),
      content: data.content || '',
      status: 1
    });

    Logger.info(`[MyApp] 用户 ${userId} 创建文章: ${article.id}`);
    return article;
  }

  /**
   * 获取用户文章列表
   */
  async getUserArticles(userId, page = 1, pageSize = 20) {
    const offset = (page - 1) * pageSize;
    return await articleDao.findByUser(userId, { limit: pageSize, offset });
  }
}

export default new ArticleService();
```

---

## 7. 完整示例：一个完整的博客应用

### 文件清单

```
src/app/blog/
├── config.js
├── permission/
│   ├── index.js
│   └── roles.js
├── dao/
│   └── post.dao.js
├── services/
│   └── post.service.js
└── index.js

src/api/blog/
├── system.json
└── v1/
    ├── post.js
    └── schemas.js

src/models/blog/
├── Post.js
└── Comment.js
```

### config.js

```js
export default {
  app_id: 'blog',
  name: '博客系统',
  description: '文章发布与评论系统',
  oauth_client: {
    client_id: 'blog',
    client_name: '博客系统',
    client_secret: null,
    redirect_uris: ['http://localhost:5173/blog/callback'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'openid profile email',
    token_endpoint_auth_method: 'none',
    application_type: 'web'
  }
};
```

### permission/index.js

```js
import { createPermissionRegistry } from '../../../utils/PbacRegistry.js';

export const BLOG_PERMISSIONS = createPermissionRegistry('blog', '博客系统', {
  POST: {
    READ: { code: 'blog:post:read', label: '查看文章', type: 'read' },
    WRITE: { code: 'blog:post:write', label: '发布文章', type: 'write' },
    DELETE: { code: 'blog:post:delete', label: '删除文章', type: 'high_risk' }
  },
  COMMENT: {
    READ: { code: 'blog:comment:read', label: '查看评论', type: 'read' },
    WRITE: { code: 'blog:comment:write', label: '发表评论', type: 'write' }
  }
});
```

### permission/roles.js

```js
import { defineRoles } from '../../../utils/PbacRegistry.js';
import { BLOG_PERMISSIONS } from './index.js';

defineRoles([
  {
    code: 'blog_reader',
    app_id: 'blog',
    name: '读者',
    rank_level: 10,
    policy: {
      Statement: [{ Effect: 'Allow', Action: [BLOG_PERMISSIONS.POST.READ, BLOG_PERMISSIONS.COMMENT.READ] }]
    }
  },
  {
    code: 'blog_author',
    app_id: 'blog',
    name: '作者',
    rank_level: 50,
    policy: {
      Statement: [{
        Effect: 'Allow',
        Action: [
          BLOG_PERMISSIONS.POST.READ, BLOG_PERMISSIONS.POST.WRITE,
          BLOG_PERMISSIONS.COMMENT.READ, BLOG_PERMISSIONS.COMMENT.WRITE
        ]
      }]
    }
  }
]);
```

### src/models/blog/Post.js

```js
export default (sequelize, DataTypes) => {
  const Post = sequelize.define('Post', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.BIGINT, allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    content: { type: DataTypes.TEXT },
    status: { type: DataTypes.TINYINT, defaultValue: 1 },
    delete_version: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 }
  }, {
    tableName: 'blog_post',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['user_id'], name: 'idx_post_user' }
    ]
  });

  Post.associate = (models) => {
    Post.belongsTo(models.User, { foreignKey: 'user_id', as: 'author' });
    Post.hasMany(models.Comment, { foreignKey: 'post_id', as: 'comments' });
  };

  return Post;
};
```

### src/api/blog/system.json

```json
{
  "name": "blog",
  "alias": "博客系统",
  "prefix": "/blog",
  "description": "文章发布与评论 API",
  "enabled": true,
  "requireLogin": false
}
```

### src/api/blog/v1/post.js

```js
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { getSessionStore } from '../../../../redis/session-store.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'post',
    description: '文章管理',
    prefix: '/v1',
    requireLogin: false
  });

  // 公开接口：获取文章列表
  registerSecureRoute(fastify, {
    name: 'getPosts',
    alias: '获取文章列表',
    method: 'GET',
    url: '/posts',
    handler: async (request, reply) => {
      const posts = await app.db.blog.Post.findAll({
        where: { status: 1 },
        order: [['created_at', 'DESC']],
        limit: 20
      });
      return reply.result.success('获取成功', posts);
    }
  });

  // 需要登录：创建文章
  registerSecureRoute(fastify, {
    name: 'createPost',
    alias: '发布文章',
    method: 'POST',
    url: '/posts',
    requireLogin: true,
    handler: async (request, reply) => {
      const { title, content } = request.body;
      const user = request.state.user;

      const post = await app.db.blog.Post.create({
        user_id: user.userId,
        title,
        content
      });
      return reply.result.success('发布成功', post);
    }
  });
}
```

---

## 8. 部署检查清单

复制应用到项目后，检查以下项：

- [ ] `src/app/{name}/config.js` 存在且 `app_id` 与文件夹名一致
- [ ] `src/api/{name}/system.json` 存在且 `name` 与 `app_id` 一致
- [ ] `src/models/{name}/` 目录存在（如有模型）
- [ ] 模型文件导出工厂函数 `(sequelize, DataTypes) => Model`
- [ ] `permission/index.js` 的 `createPermissionRegistry` 第一个参数与 `app_id` 一致
- [ ] `permission/roles.js` 的 `defineRoles` 中 `app_id` 与 `app_id` 一致
- [ ] 路由文件使用 `registerSecureRoute()` 注册
- [ ] 响应使用 `reply.result.success/fail`
- [ ] 运行 `npm test` 确认无回归
- [ ] 运行 `npm run migrate` 创建新表（如有新模型）

---

## 附录 A：认证系统原理

### Session 双令牌机制

本框架使用 **Session-based 认证**（非 JWT 无状态），用户信息存储在服务端。

```
登录成功 → 下发两个 Cookie：

1. sid（Session Cookie）
   - 值: <sessionId>.<HMAC签名>
   - HttpOnly / Secure / SameSite=Lax
   - 短期登录: Max-Age=2h
   - 长期登录: Max-Age=30min

2. sid_r（Refresh Cookie，仅长期登录）
   - 值: <refreshToken>.<HMAC签名>
   - Max-Age=30天
```

### 请求验证流程

```
请求到达
  │
  ▼
onRequest[0] → @fastify/cookie     解析 cookies
  │
  ▼
onRequest[1] → auth                1. 解析 sid → 验证 HMAC → Redis 查 session
                                   2. sid 失效时自动用 sid_r 刷新
                                   3. request.state.user = { uid, username, roles, permissions, ... }
  │
  ▼
onRequest[2] → @fastify/rateLimit  全局限频
  │
  ▼
onRequest[3] → firewall            五层拦截（已登录: 基础限频+bot检测; 未登录: 全量拦截）
  │
  ▼
preHandler   → guard               三级权限守卫（检查 request.state.user）
  │
  ▼
handler      → 业务路由
```

### 获取当前用户

```js
// 方式 1：从 request.state 获取
handler: async (request, reply) => {
  const user = request.state.user;
  if (!user) return reply.result.unauth();

  console.log(user.uid);          // 用户 UUID
  console.log(user.userId);       // 用户内部 ID
  console.log(user.username);     // 用户名
  console.log(user.email);        // 邮箱
  console.log(user.roles);        // ['admin', 'user']
  console.log(user.permissions);  // { allows: [...], denies: [...] }
  console.log(user.appId);        // 登录的应用 ID
  console.log(user.sessionId);    // 会话 ID
}

// 方式 2：通过 StpUtil 静态调用（需在请求上下文中）
import StpUtil from '../../auth/StpUtil.js';

const uid = StpUtil.getLoginId();           // 获取当前用户 ID
const user = StpUtil.check();               // 强制登录检查（未登录抛 401）
StpUtil.checkRole('admin');                 // 角色校验（不通过抛 403）
StpUtil.checkPermission('user:write');      // 权限校验（不通过抛 403）
StpUtil.hasPermission('user:read');         // 权限判断（返回 true/false）
StpUtil.checkPermissionAnd('a', 'b');       // 全部通过
StpUtil.checkPermissionOr('a', 'b');        // 任一通过
```

### Session 数据结构（Redis）

```json
{
  "userId": 123,
  "uid": "uuid-xxx",
  "username": "alice",
  "email": "alice@example.com",
  "appId": "firewall",
  "roles": ["admin", "operator"],
  "permissions": { "allows": ["user:read", "config:*"], "denies": ["user:delete"] },
  "ip": "192.168.1.1",
  "deviceId": "device-xxx",
  "loginAt": 1717000000,
  "rememberMe": false
}
```

### 踢用户下线

```js
import { kickUser } from '../auth/session.js';

// 踢指定用户下线（删除 Redis session + DB 标记 revoked）
await kickUser(redis, userId, appId);
```

---

## 附录 B：权限系统原理（PBAC）

### 权限模型

```
用户 (User) ──┬── 角色 (Role) ── 策略 (Policy: allows/denies)
              │
              └── 内联策略 (InlinePolicy) ── 个人特权/黑名单
```

- **角色**：预定义的权限集合（如 `admin`、`user`、`vip`）
- **内联策略**：用户个人的权限覆盖（可临时提权或封禁）
- **Deny 优先**：如果 `denies` 命中权限，即使 `allows` 包含也拒绝

### 权限定义

```js
// src/app/myapp/permission/index.js
import { createPermissionRegistry } from '../../../utils/PbacRegistry.js';

export const MYAPP_PERMISSIONS = createPermissionRegistry('myapp', '我的应用', {
  ARTICLE: {
    READ: { code: 'myapp:article:read', label: '查看文章', type: 'read' },
    WRITE: { code: 'myapp:article:write', label: '编辑文章', type: 'write' },
    DELETE: { code: 'myapp:article:delete', label: '删除文章', type: 'high_risk' }
  }
});
```

### 角色定义

```js
// src/app/myapp/permission/roles.js
import { defineRoles } from '../../../utils/PbacRegistry.js';
import { MYAPP_PERMISSIONS } from './index.js';

defineRoles([{
  code: 'myapp_user',
  app_id: 'myapp',
  name: '普通用户',
  rank_level: 10,
  policy: {
    Statement: [{
      Effect: 'Allow',
      Action: [MYAPP_PERMISSIONS.ARTICLE.READ, MYAPP_PERMISSIONS.ARTICLE.WRITE]
    }]
  }
}]);
```

### 权限检查

```js
// 在路由中
StpUtil.checkPermission('myapp:article:write');  // 不通过抛 403
StpUtil.hasPermission('myapp:article:read');      // 返回 true/false

// 通配符匹配
StpUtil.hasPermission('myapp:admin:*');            // 匹配 myapp:admin:xxx

// Deny 优先
// 如果用户角色 denies: ['user:delete']，即使 allows 包含也返回 false
```

---

## 附录 C：三级守卫系统

### 级联校验

```
请求 → System 级 (system.json) → Group 级 (registerGroupMetadata) → API 级 (registerSecureRoute)
         │                          │                                  │
         ├─ enabled                 ├─ enabled                         ├─ enabled
         ├─ allowIps                ├─ allowIps                        ├─ allowIps
         ├─ requireLogin            ├─ allowRoles                      ├─ allowRoles
         └─ allowRoles              └─ requireLogin                    └─ requireLogin
```

每级可独立拦截，任一级拒绝则请求被拦截。

### 配置示例

```js
// System 级（system.json）
{ "name": "myapp", "prefix": "/myapp", "requireLogin": false }

// Group 级（路由文件中）
registerGroupMetadata({
  name: 'article',
  requireLogin: true,
  allowRoles: ['myapp_user', 'myapp_admin']
});

// API 级（路由文件中）
registerSecureRoute(fastify, {
  name: 'deleteArticle',
  method: 'DELETE',
  url: '/articles/:id',
  requireLogin: true,
  allowRoles: ['myapp_admin']  // 仅管理员
});
```

---

## 附录 D：验证工具（Verify 模块）

### 可用验证方式

| 模块 | 用途 | 导入 |
|------|------|------|
| `captcha/` | 图形验证码 | `{ captchaService, captchaDao }` |
| `email/` | 邮箱验证码 | `{ emailService, emailDao }` |
| `sms/` | 短信验证码 | `{ smsService, smsDao }` |
| `slider/` | 滑块验证码 | `{ sliderService, sliderDao }` |
| `qrcode/` | 二维码扫码 | `{ qrCodeService, qrCodeDao }` |
| `recaptcha/` | 人机验证 | `{ recaptchaService, recaptchaDao }` |
| `voice/` | 语音验证码 | `{ voiceService, voiceDao }` |

### 使用示例

```js
// 图形验证码
import { captchaDao } from '../../../verify/captcha/index.js';
const { captchaImage, captchaKey } = await captchaDao.generate(store);

// 邮箱验证码
import { emailDao } from '../../../verify/email/index.js';
await emailDao.sendCode(email, sessionId, store);
await emailDao.verifyCode(email, code, store);

// 短信验证码
import { smsDao } from '../../../verify/sms/index.js';
await smsDao.sendCode(phone, sessionId, store);
await smsDao.verifyCode(phone, code, store);

// 人机验证
import { recaptchaDao } from '../../../verify/recaptcha/index.js';
const isValid = await recaptchaDao.isValid(token, remoteIp);
```

### Store 适配器

所有验证 service 通过 Store 适配器访问存储：

```js
import { getSessionStore } from '../../../redis/session-store.js';
const captchaStore = getSessionStore(fastify, 'captcha');
const emailCodeStore = getSessionStore(fastify, 'email_code');
```

---

## 附录 E：响应格式

### 标准响应方法

```js
reply.result.success(message, data)    // 200 成功
reply.result.fail(message, data, code) // 400 业务失败
reply.result.unauth(message)           // 401 未登录
reply.result.forbidden(message)        // 403 权限不足
```

### 响应结构

```json
{
  "code": 200,
  "message": "操作成功",
  "data": { ... },
  "timestamp": 1717000000,
  "requestId": "uuid-xxx"
}
```

---

## 附录 F：常用工具函数

### 数据库

```js
import sequelize from '../../../db/index.js';

// 获取模型
const User = sequelize.models.User;

// 事务
const result = await sequelize.transaction(async (t) => {
  const user = await User.create({ username: 'test' }, { transaction: t });
  await UserIdentity.create({ user_id: user.id }, { transaction: t });
  return user;
});

// 通过 app.db 访问（命名空间）
const article = await app.db.myapp.Article.findByPk(1);
const user = await app.db.user.User.findByPk(article.user_id);
```

### Redis

```js
// 直接使用
if (app.redis) {
  await app.redis.set('key', 'value', { EX: 60 });
  const val = await app.redis.get('key');
}

// 安全操作包装
import { safeRedis } from '../../../redis/safe-redis.js';
const val = await safeRedis(app.redis, (r) => r.get('key'), null);

// 会话存储适配器
import { getSessionStore } from '../../../redis/session-store.js';
const store = getSessionStore(app, 'myapp_cache');
await store.set('key', { data: 123 }, 600);
const val = await store.get('key');
```

### 日志

```js
import Logger from '../../../log/index.js';

Logger.info('[MyApp] 操作成功', { userId: 123 });
Logger.error('[MyApp] 操作失败', err);
Logger.warn('[MyApp] 警告信息');
```

### ALS 上下文

```js
import { requestContext, getCtx, getDb, getServerResource } from '../../../auth/index.js';

const request = getCtx();                    // 获取当前 request
const db = getDb();                          // 获取 Sequelize 实例
const redis = getServerResource('redis');    // 获取 Redis 实例
```

---

## 附录 G：URL 拼接规则

### 最终 URL 计算

```
最终 URL = system.json.prefix + registerGroupMetadata.prefix + registerSecureRoute.url
```

**示例：**

```json
// src/api/blog/system.json
{ "name": "blog", "prefix": "/blog" }
```

```js
// src/api/blog/v1/post.js
registerGroupMetadata({ name: 'post', prefix: '/v1' });
registerSecureRoute(fastify, { url: '/posts', method: 'GET', ... });
```

最终 URL：`/blog` + `/v1` + `/posts` = **`GET /blog/v1/posts`**

### system.json 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 系统标识名（Guard 配置用） |
| `alias` | string | 显示名称 |
| `prefix` | string | 路由前缀（如 `/blog`） |
| `enabled` | boolean | 是否启用 |
| `requireLogin` | boolean | System 级登录要求 |
| `allowIps` | string[] | System 级 IP 白名单 |
| `allowRoles` | string[] | System 级角色白名单 |

---

## 附录 H：登录流程端到端

### 后端登录接口

```js
// src/api/oauth21/v1/auth.js
registerSecureRoute(fastify, {
  name: 'login',
  method: 'POST',
  url: '/login',
  requireLogin: false,
  handler: async (request, reply) => {
    const { email, password, rememberMe } = request.body;

    // 1. 验证用户
    const user = await userDao.verifyPassword(email, password);
    if (!user) return reply.result.fail('用户名或密码错误');

    // 2. 创建 Session
    const { createSession } = await import('../../../auth/session.js');
    await createSession({
      redis: app.redis,
      userId: user.id,
      uid: user.uid,
      username: user.username,
      email: user.email,
      appId: 'myapp',
      ip: request.ip,
      rememberMe: !!rememberMe,
      reply  // 用于设置 Cookie
    });

    // 3. 返回用户信息（不含密码）
    return reply.result.success('登录成功', {
      uid: user.uid,
      username: user.username,
      email: user.email
    });
  }
});
```

### 前端登录调用

```ts
// 前端调用登录接口（Cookie 自动携带）
const res = await fetch('https://api.example.com/oauth2.1/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',  // 重要：允许跨域携带 Cookie
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123',
    rememberMe: true
  })
});
const data = await res.json();
// data: { code: 200, message: "登录成功", data: { uid, username, email } }
```

### 后续请求（自动携带 Cookie）

```ts
// Cookie 中的 sid 会自动携带，无需手动设置
const res = await fetch('https://api.example.com/myapp/v1/articles', {
  credentials: 'include'  // 重要
});
```

### 登出接口

```js
registerSecureRoute(fastify, {
  name: 'logout',
  method: 'POST',
  url: '/logout',
  requireLogin: true,
  handler: async (request, reply) => {
    const { destroySession } = await import('../../../auth/session.js');
    await destroySession({
      redis: app.redis,
      sessionId: request.state.user.sessionId,
      userId: request.state.user.userId,
      appId: 'myapp',
      ip: request.ip,
      reply
    });
    return reply.result.success('已登出');
  }
});
```

---

## 附录 I：Sequelize 查询模式

### 基础查询

```js
// 查询单条
const user = await User.findByPk(1);
const user = await User.findOne({ where: { email: 'test@example.com' } });

// 查询多条
const users = await User.findAll({ where: { status: 1 }, limit: 20, offset: 0 });

// 创建
const user = await User.create({ username: 'alice', email: 'alice@example.com' });

// 更新
await user.update({ username: 'bob' });
// 或批量更新
await User.update({ status: 0 }, { where: { id: 1 } });

// 删除（软删除，paranoid: true 时）
await User.destroy({ where: { id: 1 } });

// 硬删除（忽略 paranoid）
await User.destroy({ where: { id: 1 }, force: true });

// 恢复软删除
await User.restore({ where: { id: 1 } });
```

### 复杂查询

```js
import { Op } from 'sequelize';

// 条件查询
const users = await User.findAll({
  where: {
    status: 1,
    email: { [Op.like]: '%@example.com' },
    created_at: { [Op.gte]: new Date('2026-01-01') }
  },
  order: [['created_at', 'DESC']],
  limit: 10
});

// 关联查询
const user = await User.findByPk(1, {
  include: [{ model: Role, as: 'roles' }]
});

// 计数
const count = await User.count({ where: { status: 1 } });

// 原生查询
const [results] = await sequelize.query('SELECT * FROM user_user WHERE status = ?', {
  replacements: [1]
});
```

### 事务

```js
const result = await sequelize.transaction(async (t) => {
  const user = await User.create({ username: 'alice' }, { transaction: t });
  await UserIdentity.create({ user_id: user.id, identity_type: 'password' }, { transaction: t });
  return user;
});
```

---

## 附录 J：错误处理约定

### 业务错误格式

```js
// 前缀约定：ERROR_TYPE:具体描述
throw new Error('VERIFY_FAILED:图形验证码错误或已过期');
throw new Error('SEND_CODE_FAILED:发送过于频繁，请在 60 秒后再试');
throw new Error('BUSINESS_ERROR:该邮箱已注册，请直接登录');
throw new Error('PARAM_ERROR:邮箱和验证码不能为空');
```

### 路由中捕获

```js
registerSecureRoute(fastify, {
  handler: async (request, reply) => {
    try {
      const result = await someService.doSomething();
      return reply.result.success('操作成功', result);
    } catch (err) {
      // 业务错误返回 400
      return reply.result.fail(err.message, null, 400);
    }
  }
});
```

### 标准响应码

| code | 含义 | 使用场景 |
|------|------|----------|
| 200 | 成功 | 操作成功 |
| 201 | 已创建 | 资源创建成功 |
| 400 | 业务失败 | 参数错误、业务校验失败 |
| 401 | 未登录 | 未提供有效 Session |
| 403 | 权限不足 | 角色/权限不满足 |
| 429 | 请求过于频繁 | 触发限流 |
| 500 | 服务器错误 | 未捕获的异常 |

---

## 附录 K：数据库迁移规范

### 创建迁移文件

```bash
npx umzug migration:create --name create-myapp-tables
```

### 迁移文件模板

```js
// migrations/20260601000001-create-myapp-tables.js
export async function up({ queryInterface, Sequelize }) {
  async function createTableIfNotExists(tableName, columns) {
    const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
    const exists = tables.some((t) => Object.values(t)[0] === tableName);
    if (!exists) await queryInterface.createTable(tableName, columns);
  }

  async function addIndexIfNotExists(tableName, columns, options = {}) {
    try {
      await queryInterface.addIndex(tableName, columns, options);
    } catch (err) {
      if (!err.message.includes('Duplicate key name')) throw err;
    }
  }

  await createTableIfNotExists('myapp_article', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: Sequelize.BIGINT, allowNull: false },
    title: { type: Sequelize.STRING(200), allowNull: false },
    content: { type: Sequelize.TEXT },
    status: { type: Sequelize.TINYINT, defaultValue: 1 },
    delete_version: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    deleted_at: { type: Sequelize.DATE, allowNull: true }
  });

  await addIndexIfNotExists('myapp_article', ['user_id'], { name: 'idx_article_user' });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('myapp_article');
}
```

### 运行迁移

```bash
npm run migrate                                          # 执行所有待运行迁移
node --env-file=.env src/db/migrate.js --status          # 查看状态
node --env-file=.env src/db/migrate.js --down            # 回滚最近一次
```

---

## 附录 L：前端技术栈

### 技术栈

- **框架**: Vue 3 + Composition API
- **构建**: Vite
- **语言**: TypeScript
- **HTTP**: Axios（带拦截器）
- **路由**: Vue Router
- **状态**: Pinia

### 前端项目结构（每个应用独立）

```
src/
├── api/                # API 调用封装
│   └── auth.ts
├── views/              # 页面组件
│   └── Login.vue
├── router/             # 路由配置
├── stores/             # Pinia 状态管理
├── utils/              # 工具函数
│   └── request.ts      # Axios 实例 + 拦截器
└── main.ts
```

### HTTP 请求配置

```ts
// src/utils/request.ts
import axios from 'axios';

const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  timeout: 15000,
  withCredentials: true  // 重要：允许跨域携带 Cookie
});

// 响应拦截器
service.interceptors.response.use(
  (res) => {
    const { code, message, data } = res.data;
    if (code !== 200) {
      if (code === 401) {
        // 跳转登录页
        window.location.href = '/login';
        return Promise.reject(new Error('未登录'));
      }
      return Promise.reject(new Error(message));
    }
    return data;
  },
  (error) => Promise.reject(error)
);

export default service;
```

### API 调用示例

```ts
// src/api/auth.ts
import service from '@/utils/request';

export function login(email: string, password: string, rememberMe: boolean) {
  return service.post('/oauth2.1/login', { email, password, rememberMe });
}

export function getArticles() {
  return service.get('/blog/v1/articles');
}

export function createArticle(title: string, content: string) {
  return service.post('/blog/v1/articles', { title, content });
}
```

### Vue 组件示例

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { login } from '@/api/auth';

const email = ref('');
const password = ref('');
const rememberMe = ref(false);

async function handleLogin() {
  try {
    const user = await login(email.value, password.value, rememberMe.value);
    // 登录成功，Cookie 自动设置
    console.log('登录成功:', user);
  } catch (err) {
    console.error('登录失败:', err.message);
  }
}
</script>

<template>
  <form @submit.prevent="handleLogin">
    <input v-model="email" type="email" placeholder="邮箱" />
    <input v-model="password" type="password" placeholder="密码" />
    <label><input v-model="rememberMe" type="checkbox" /> 记住我</label>
    <button type="submit">登录</button>
  </form>
</template>
```

---

## 附录 M：环境变量完整清单

```env
# === 系统 ===
NODE_ENV=development
PORT=3000

# === 数据库 ===
DB_TYPE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=your_database
DB_USER=root
DB_PASS=your_password
DB_SYNC=false
# DB_POOL_MAX=10
# DB_POOL_MIN=2

# === Redis ===
REDIS_ENABLED=false
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
# REDIS_TLS=false

# === 安全 ===
APP_SECRET=change-me
SESSION_SECRET=change-me
FIREWALL_SECRET=change-me

# === CORS ===
# CORS_ORIGINS=https://your-domain.com

# === SMTP ===
# SMTP_SERVER=smtp.163.com
# SMTP_PORT=465
# SMTP_USER=your_email@163.com
# SMTP_PASSWORD=your_password

# === Token TTL（秒）===
ACCESS_TOKEN_TTL=600
REFRESH_TOKEN_TTL=86400
ID_TOKEN_TTL=3600
AUTH_CODE_TTL=600

# === 验证码 ===
CAPTCHA_SIZE=4
CAPTCHA_NOISE=3
CAPTCHA_TTL=600
SMS_PROVIDER=aliyun
SMS_ACCESS_KEY_ID=
SMS_ACCESS_KEY_SECRET=
RECAPTCHA_PROVIDER=google
RECAPTCHA_SECRET_KEY=
```
