# 应用模块开发 {#app-module}

## 概述

一个应用模块包含以下部分：

```
src/app/{app_name}/
├── config.js                   # 应用配置（必填）
├── permission/                 # 权限定义（可选）
│   ├── index.js                #   权限常量
│   └── roles.js                #   角色定义
├── dao/                        # 数据访问层（可选）
├── services/                   # 业务逻辑层（可选）
└── index.js                    # 应用入口（可选）

src/api/{app_name}/             # API 路由
├── system.json                 # 系统配置（必填）
└── v1/
    └── xxx.js                  # 路由文件

src/models/{app_name}/          # 数据模型
└── ModelA.js
```

## 1. config.js — 应用配置

```js
export default {
  app_id: 'myapp',
  name: '我的应用',
  description: '这是一个示例应用',
  init: initMyApp,              // 可选：Fastify 插件初始化
  oauth_client: {               // 可选：OAuth 2.1 客户端配置
    client_id: 'myapp',
    client_name: '我的应用',
    client_secret: null,        // null = 公共客户端（SPA）
    redirect_uris: ['http://localhost:5173/myapp/callback'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'openid profile email',
    token_endpoint_auth_method: 'none',
    application_type: 'web'
  }
};
```

加载器自动处理：
- 读取 `config.name` → 打印日志
- 读取 `config.init` → 调用 `app.register(init)`
- 读取 `config.oauth_client` → 同步到 `oauth_clients` 表

## 2. permission/index.js — 权限常量

```js
import { createPermissionRegistry } from '../../../utils/PbacRegistry.js';

export const MYAPP_PERMISSIONS = createPermissionRegistry('myapp', '我的应用', {
  ARTICLE: {
    READ: { code: 'myapp:article:read', label: '查看文章', type: 'read' },
    WRITE: { code: 'myapp:article:write', label: '编辑文章', type: 'write' },
    DELETE: { code: 'myapp:article:delete', label: '删除文章', type: 'high_risk' }
  },
  ADMIN: {
    ALL: { code: 'myapp:admin:*', label: '管理员全量通配符', type: 'wildcard' }
  }
});
```

## 3. permission/roles.js — 角色定义

```js
import { defineRoles } from '../../../utils/PbacRegistry.js';
import { MYAPP_PERMISSIONS } from './index.js';

defineRoles([
  {
    code: 'myapp_user',
    app_id: 'myapp',
    name: '普通用户',
    rank_level: 10,
    policy: {
      Version: '2026-05-18',
      Statement: [{
        Effect: 'Allow',
        Action: [MYAPP_PERMISSIONS.ARTICLE.READ, MYAPP_PERMISSIONS.ARTICLE.WRITE]
      }]
    }
  },
  {
    code: 'myapp_admin',
    app_id: 'myapp',
    name: '应用管理员',
    rank_level: 80,
    policy: {
      Version: '2026-05-18',
      Statement: [{
        Effect: 'Allow',
        Action: [MYAPP_PERMISSIONS.ADMIN.ALL]
      }]
    }
  }
]);
```

## 4. system.json — 路由域配置

```json
{
  "name": "myapp",
  "alias": "我的应用",
  "prefix": "/myapp",
  "enabled": true,
  "requireLogin": false,
  "allowIps": [],
  "allowRoles": []
}
```

## 5. 路由文件

```js
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'article',
    description: '文章管理',
    prefix: '/v1',
    requireLogin: true
  });

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
    requireLogin: true,
    handler: async (request, reply) => {
      const { title, content } = request.body;
      const article = await app.db.myapp.Article.create({
        user_id: request.state.user.userId,
        title,
        content
      });
      return reply.result.success('创建成功', article);
    }
  });
}
```

## 6. DAO 层

```js
// src/app/myapp/dao/article.dao.js
import sequelize from '../../../db/index.js';

class ArticleDao {
  getModel() {
    return sequelize.models.Article;
  }

  async findByUser(userId, options = {}) {
    return await this.getModel().findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      limit: options.limit || 20,
      offset: options.offset || 0
    });
  }

  async create(data) {
    return await this.getModel().create(data);
  }
}

export default new ArticleDao();
```

## 7. Service 层

```js
// src/app/myapp/services/article.service.js
import articleDao from '../dao/article.dao.js';
import Logger from '../../../log/index.js';

class ArticleService {
  async createArticle(userId, data) {
    if (!data.title || data.title.trim().length === 0) {
      throw new Error('VALIDATION:文章标题不能为空');
    }
    const article = await articleDao.create({
      user_id: userId,
      title: data.title.trim(),
      content: data.content || '',
      status: 1
    });
    Logger.info(`[MyApp] 用户 ${userId} 创建文章: ${article.id}`);
    return article;
  }
}

export default new ArticleService();
```

## 部署检查清单

- [ ] `src/app/{name}/config.js` 存在且 `app_id` 与文件夹名一致
- [ ] `src/api/{name}/system.json` 存在且 `name` 与 `app_id` 一致
- [ ] `src/models/{name}/` 目录存在（如有模型）
- [ ] 模型文件导出工厂函数 `(sequelize, DataTypes) => Model`
- [ ] 路由文件使用 `registerSecureRoute()` 注册
- [ ] 响应使用 `reply.result.success/fail`
- [ ] 运行 `npm run migrate` 创建新表（如有新模型）
