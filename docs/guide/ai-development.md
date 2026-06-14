# AI 辅助开发 {#ai-development}

本框架的目录结构和约定高度统一，非常适合使用 AI（如 Claude、ChatGPT、Cursor）生成适配项目规范的前后端代码。

## 核心理念

> **你描述业务需求，AI 生成符合项目规范的代码。**

框架的约定性设计让 AI 能够：
- 自动遵循目录结构和命名规范
- 生成可直接运行的代码（无需手动调整）
- 保持认证、权限、路由的一致性

---

## 后端代码生成

### 生成应用模块

向 AI 提供以下信息，即可生成完整的应用模块：

```
帮我创建一个「博客」应用模块，需求如下：
- 功能：文章的增删改查、评论管理
- 权限：读者（只读）、作者（读写）、管理员（全部）
- 模型：Post（标题、内容、状态）、Comment（内容、关联文章）
- 表名前缀：blog_
```

AI 会生成：

```
src/app/blog/
├── config.js                    # 应用配置
├── permission/
│   ├── index.js                 # 权限常量
│   └── roles.js                 # 角色定义
├── dao/
│   ├── post.dao.js              # 文章数据访问
│   └── comment.dao.js           # 评论数据访问
└── services/
    ├── post.service.js          # 文章业务逻辑
    └── comment.service.js       # 评论业务逻辑

src/api/blog/
├── system.json                  # 路由域配置
└── v1/
    ├── post.js                  # 文章路由
    └── comment.js               # 评论路由

src/models/blog/
├── Post.js                      # 文章模型
└── Comment.js                   # 评论模型
```

### 生成模型

```
帮我创建一个订单模型，字段：
- order_no: 订单号（唯一）
- user_id: 用户ID
- amount: 金额（DECIMAL 10,2）
- status: 状态（0-待支付 1-已支付 2-已取消）
- paid_at: 支付时间
表名：shop_order，需要软删除
```

AI 会生成：

```js
// src/models/shop/Order.js
export default (sequelize, DataTypes) => {
  const Order = sequelize.define('Order', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    order_no: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: 'order_no' },
    user_id: { type: DataTypes.BIGINT, allowNull: false, field: 'user_id' },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    status: { type: DataTypes.TINYINT, defaultValue: 0 },
    paid_at: { type: DataTypes.DATE, field: 'paid_at' },
    delete_version: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 }
  }, {
    tableName: 'shop_order',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['user_id'], name: 'idx_order_user' },
      { unique: true, fields: ['order_no'], name: 'uk_order_no' }
    ]
  });

  Order.associate = (models) => {
    Order.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return Order;
};
```

### 生成路由

```
帮我创建订单管理路由：
- GET /orders — 获取订单列表（需要登录）
- GET /orders/:id — 获取订单详情（需要登录）
- POST /orders — 创建订单（需要登录，权限 shop:order:write）
- PUT /orders/:id/pay — 支付订单（需要登录，权限 shop:order:write）
- DELETE /orders/:id — 取消订单（需要登录，权限 shop:order:delete）
```

### 生成迁移文件

```
帮我创建博客系统的数据库迁移，包含：
- blog_post 表（id, user_id, title, content, status, delete_version）
- blog_comment 表（id, post_id, user_id, content, delete_version）
- 需要索引
```

---

## 前端代码生成

### 生成 API 模块

```
帮我创建博客系统的前端 API 模块，接口：
- GET /blog/v1/posts — 获取文章列表
- POST /blog/v1/posts — 创建文章
- GET /blog/v1/posts/:id — 获取文章详情
- PUT /blog/v1/posts/:id — 更新文章
- DELETE /blog/v1/posts/:id — 删除文章
- GET /blog/v1/posts/:id/comments — 获取评论
- POST /blog/v1/posts/:id/comments — 发表评论
```

AI 会生成：

```typescript
// api/blog.ts
import service from '@/utils/request'

export const blogApi = {
  // 文章
  getPosts: (params?: { page?: number; pageSize?: number }) =>
    service.get('/blog/v1/posts', { params }),
  getPost: (id: number) =>
    service.get(`/blog/v1/posts/${id}`),
  createPost: (data: { title: string; content: string }) =>
    service.post('/blog/v1/posts', data),
  updatePost: (id: number, data: { title?: string; content?: string; status?: number }) =>
    service.put(`/blog/v1/posts/${id}`, data),
  deletePost: (id: number) =>
    service.delete(`/blog/v1/posts/${id}`),

  // 评论
  getComments: (postId: number) =>
    service.get(`/blog/v1/posts/${postId}/comments`),
  createComment: (postId: number, data: { content: string }) =>
    service.post(`/blog/v1/posts/${postId}/comments`, data)
}
```

### 生成 Store

```
帮我创建博客系统的 Pinia store，功能：
- 文章列表和详情的缓存
- 创建/更新/删除文章的乐观更新
- 登录状态检查
```

### 生成页面组件

```
帮我创建博客文章列表页面，要求：
- 使用 Vue 3 Composition API + <script setup lang="ts">
- 表格展示文章列表（标题、作者、状态、创建时间）
- 支持分页
- 有新增、编辑、删除按钮
- 使用 v-auth 指令控制按钮权限
- 支持深色模式
```

### 生成表单组件

```
帮我创建文章编辑表单组件，要求：
- 使用 vee-validate + zod 做表单验证
- 字段：标题（必填，最大200字）、内容（富文本）、状态（下拉选择）
- 提交时调用 blogApi.createPost 或 blogApi.updatePost
- 支持 i18n
```

---

## AI 提示词模板

### 后端模块生成提示词

```markdown
请根据以下需求生成完整的后端模块代码：

## 项目框架信息
- 框架：Fastify v5 + Sequelize v6
- 认证：Session-based（Cookie sid + Redis）
- 权限：PBAC（createPermissionRegistry + defineRoles）
- 路由：registerSecureRoute() 注册
- 响应：reply.result.success/fail/unauth/forbidden

## 需求描述
[你的业务需求]

## 输出要求
1. 按项目规范生成所有文件
2. 包含 config.js、permission/、models/、api/、dao/、services/
3. 模型使用 field 映射（camelCase → snake_case）
4. 路由使用 registerSecureRoute 注册
5. 包含完整的 JSDoc 注释
```

### 前端页面生成提示词

```markdown
请根据以下需求生成前端页面代码：

## 项目框架信息
- 框架：Vue 3 + TypeScript + Pinia + Vue Router
- HTTP：Axios（withCredentials: true）
- 认证：Cookie 自动携带，authStore 管理状态
- 权限：v-auth="权限编码" 指令
- 样式：Tailwind CSS + HSL 变量

## 后端接口
[接口列表]

## 需求描述
[页面功能需求]

## 输出要求
1. 使用 <script setup lang="ts">
2. 使用 Composition API
3. 包含完整的类型定义
4. 支持深色模式
5. 包含 i18n 翻译 key
```

---

## AI 生成的最佳实践

### 1. 提供足够的上下文

```
❌ "帮我写一个用户管理页面"
✅ "帮我写一个用户管理页面，后端接口是 GET/POST/PUT/DELETE /admin/v1/iam/users，
   使用 registerSecureRoute 注册，需要 admin 角色，表格展示用户名、邮箱、角色、状态"
```

### 2. 明确技术栈

```
❌ "写一个 API 接口"
✅ "用 Fastify 写一个 GET /blog/v1/posts 接口，
   使用 registerSecureRoute 注册，需要登录，
   查 blog_post 表，返回分页数据"
```

### 3. 分步骤生成

```
步骤 1: 生成模型（models/blog/Post.js）
步骤 2: 生成权限（app/blog/permission/）
步骤 3: 生成路由（api/blog/v1/post.js）
步骤 4: 生成前端 API（api/blog.ts）
步骤 5: 生成页面（views/blog/PostList.vue）
```

### 4. 让 AI 参考现有代码

```
参考 src/app/firewall/ 的目录结构和代码风格，
帮我创建一个类似的应用模块，功能是...
```

---

## 常见生成场景

| 场景 | 输入 | 输出 |
|------|------|------|
| 新建应用 | 业务需求描述 | 完整的应用目录（config + permission + models + api） |
| 新增接口 | 接口路径 + 参数 + 权限 | 路由文件 + Schema 定义 |
| 新增模型 | 字段列表 + 关系 | 模型文件 + 迁移文件 |
| 新增页面 | 页面功能 + 接口列表 | Vue 组件 + API 模块 + Store |
| 新增权限 | 权限编码 + 角色 | permission/index.js + roles.js |
| 代码重构 | 现有代码 + 改进目标 | 重构后的代码 |

---

## 注意事项

1. **AI 生成的代码需要人工审查**：检查权限配置、SQL 注入风险、业务逻辑正确性
2. **迁移文件需要手动运行**：AI 生成迁移后，需要 `npm run migrate` 执行
3. **权限需要手动分配**：角色定义后，需要在管理后台给用户分配角色
4. **前端路由需要手动配置**：AI 生成页面后，需要在 `router/index.ts` 中添加路由
5. **环境变量需要手动配置**：如 SMTP、OAuth 客户端密钥等
