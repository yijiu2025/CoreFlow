# Building an app module {#app-module}

## Anatomy

An app module consists of:

```
src/app/{app_name}/
├── config.js                   # app config (required)
├── permission/                 # permission definitions (optional)
│   ├── index.js                #   permission constants
│   └── roles.js                #   role definitions
├── dao/                        # data access (optional)
├── services/                   # business logic (optional)
└── index.js                    # app entry (optional)

src/api/{app_name}/             # API routes
├── system.json                 # route-domain config (required)
└── v1/
    └── xxx.js                  # route file

src/models/{app_name}/          # Sequelize models
└── ModelA.js
```

## 1. config.js — app config

```js
export default {
  app_id: 'myapp',
  name: 'My app',
  description: 'An example application',
  init: initMyApp, // optional: a Fastify plugin initialiser
  oauth_client: {
    // optional: OAuth 2.1 client config
    client_id: 'myapp',
    client_name: 'My app',
    client_secret: null, // null = public client (SPA)
    redirect_uris: ['http://localhost:5173/myapp/callback'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'openid profile email',
    token_endpoint_auth_method: 'none',
    application_type: 'web'
  }
};
```

What the loader does with it:

- reads `config.name` → logs it
- reads `config.init` → calls `app.register(init)`
- reads `config.oauth_client` → syncs it into the `oauth_clients` table

## 2. permission/index.js — permission constants

```js
import { createPermissionRegistry } from '../../../utils/PbacRegistry.js';

export const MYAPP_PERMISSIONS = createPermissionRegistry('myapp', 'My app', {
  ARTICLE: {
    READ: { code: 'myapp:article:read', label: 'View articles', type: 'read' },
    WRITE: { code: 'myapp:article:write', label: 'Edit articles', type: 'write' },
    DELETE: { code: 'myapp:article:delete', label: 'Delete articles', type: 'high_risk' }
  },
  ADMIN: {
    ALL: { code: 'myapp:admin:*', label: 'Admin wildcard', type: 'wildcard' }
  }
});
```

## 3. permission/roles.js — role definitions

```js
import { defineRoles } from '../../../utils/PbacRegistry.js';
import { MYAPP_PERMISSIONS } from './index.js';

defineRoles([
  {
    code: 'myapp_user',
    app_id: 'myapp',
    name: 'Regular user',
    rank_level: 10,
    policy: {
      Version: '2026-05-18',
      Statement: [
        {
          Effect: 'Allow',
          Action: [MYAPP_PERMISSIONS.ARTICLE.READ, MYAPP_PERMISSIONS.ARTICLE.WRITE]
        }
      ]
    }
  },
  {
    code: 'myapp_admin',
    app_id: 'myapp',
    name: 'App administrator',
    rank_level: 80,
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

## 4. system.json — route-domain config

```json
{
  "name": "myapp",
  "alias": "My app",
  "prefix": "/myapp",
  "enabled": true,
  "requireLogin": false,
  "allowIps": [],
  "allowRoles": []
}
```

## 5. Route file

```js
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import articleDao from '../../../app/myapp/dao/article.dao.js';
import articleService from '../../../app/myapp/services/article.service.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'article',
    description: 'Article management',
    prefix: '/v1',
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'getArticles',
    alias: 'List articles',
    method: 'GET',
    url: '/articles',
    requireLogin: true,
    handler: async (request, reply) => {
      // routes never touch models directly: go through the DAO / service
      // (`app.db` is only available during loader startup)
      const articles = await articleDao.findByUser(request.state.user.userId);
      return reply.result.success('ok', articles);
    }
  });

  registerSecureRoute(fastify, {
    name: 'createArticle',
    alias: 'Create an article',
    method: 'POST',
    url: '/articles',
    requireLogin: true,
    handler: async (request, reply) => {
      const { title, content } = request.body;
      const article = await articleService.createArticle(request.state.user.userId, { title, content });
      return reply.result.success('created', article);
    }
  });
}
```

## 6. DAO layer

```js
// src/app/myapp/dao/article.dao.js
import { getModel } from '../../../framework/db/index.js';

class ArticleDao {
  getModel() {
    // models are registered per domain namespace:
    // src/models/myapp/Article.js → getModel('Article')
    return getModel('Article');
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

## 7. Service layer

```js
// src/app/myapp/services/article.service.js
import articleDao from '../dao/article.dao.js';
import Logger from '../../../framework/log/index.js';

class ArticleService {
  async createArticle(userId, data) {
    if (!data.title || data.title.trim().length === 0) {
      throw new Error('VALIDATION:title must not be empty');
    }
    const article = await articleDao.create({
      user_id: userId,
      title: data.title.trim(),
      content: data.content || '',
      status: 1
    });
    Logger.info(`[MyApp] user ${userId} created article: ${article.id}`);
    return article;
  }
}

export default new ArticleService();
```

## Pre-deployment checklist

- [ ] `src/app/{name}/config.js` exists and `app_id` matches the directory name
- [ ] `src/api/{name}/system.json` exists and `name` matches `app_id`
- [ ] `src/models/{name}/` exists (when there are models)
- [ ] model files export a factory `(sequelize, DataTypes) => Model`
- [ ] route files register through `registerSecureRoute()`
- [ ] responses go through `reply.result.success/fail`
- [ ] `npm run migrate` has been run to create new tables (when there are new models)
