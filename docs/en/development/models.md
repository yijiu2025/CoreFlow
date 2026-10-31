# Models {#models}

## Model template

```js
/**
 * Article model
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
        field: 'user_id',
        comment: 'author user id'
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: 'title'
      },
      content: {
        type: DataTypes.TEXT,
        comment: 'body'
      },
      status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '1 published, 0 draft, -1 deleted'
      },
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: 'soft-delete marker'
      }
    },
    {
      tableName: 'myapp_article',
      timestamps: true,
      paranoid: true,
      indexes: [{ fields: ['user_id'], name: 'idx_article_user' }],
      comment: 'articles'
    }
  );

  Article.associate = models => {
    Article.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'author',
      onDelete: 'CASCADE'
    });
  };

  return Article;
};
```

## Conventions

| Rule | Detail |
| --- | --- |
| File name | PascalCase, identical to the first argument of `sequelize.define()` |
| Location | `src/models/{app_name}/` |
| Export | a factory `(sequelize, DataTypes) => Model` |
| Relations | declared via `Model.associate = (models) => {}` |
| Soft delete | needs `paranoid: true` plus a `delete_version` column |
| Timestamps | always `timestamps: true` |
| Table name | `{app_name}_{feature}` |

## Auto-registration

The model loader scans `src/models/{app_name}/` and registers each model as
`app.db.{app_name}.ModelName`:

```js
// during loader startup (where the app instance is available)
const article = await app.db.myapp.Article.findByPk(1);
```

At request time you usually only hold `request`; take models through `getModel()`
(model names are globally unique):

```js
import { getModel } from '../../../framework/db/index.js';

const article = await getModel('Article').findByPk(1);
const user = await getModel('User').findByPk(article.user_id);
```

> `app.db` is decorated onto the Fastify instance during the loader phase. Business code
> (routes / services / DAOs) must use `getModel('ModelName')` and never rely on an `app`
> variable being in scope.

## Domain split (DDD)

| Domain | Directory | Models | Question it answers |
| --- | --- | --- | --- |
| Identity | `models/user/` | User, UserIdentity | "who are you?" |
| Access control | `models/iam/` | Role, UserRole, InlinePolicy | "what may you do?" |
| Delegated authz | `models/oauth21/` | OauthClient, OauthToken, OauthApproval | "what may a third party do?" |
| Sessions | `models/session/` | UserSession, SessionToken, SessionLog | "where are you signed in?" |
| Infrastructure | `models/notice/` | EmailCode, NoticeConfig | system configuration |

## Sequelize queries

```js
// basic reads
const user = await User.findByPk(1);
const users = await User.findAll({ where: { status: 1 }, limit: 20 });

// create
const user = await User.create({ username: 'alice', email: 'alice@example.com' });

// update
await user.update({ username: 'bob' });
await User.update({ status: 0 }, { where: { id: 1 } });

// delete
await User.destroy({ where: { id: 1 } });               // soft delete
await User.destroy({ where: { id: 1 }, force: true });  // hard delete

// complex queries
import { Op } from 'sequelize';
const users = await User.findAll({
  where: {
    status: 1,
    email: { [Op.like]: '%@example.com' },
    created_at: { [Op.gte]: new Date('2026-01-01') }
  },
  order: [['created_at', 'DESC']],
  limit: 10
});

// transactions
const result = await sequelize.transaction(async t => {
  const user = await User.create({ username: 'alice' }, { transaction: t });
  await UserIdentity.create({ user_id: user.id }, { transaction: t });
  return user;
});
```
