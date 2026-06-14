# 数据模型 {#models}

## 模型文件模板

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
        field: 'user_id',
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
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: '软删除标志'
      }
    },
    {
      tableName: 'myapp_article',
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ['user_id'], name: 'idx_article_user' }
      ],
      comment: '文章表'
    }
  );

  // 关联定义
  Article.associate = (models) => {
    Article.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'author',
      onDelete: 'CASCADE'
    });
  };

  return Article;
};
```

## 文件规范

| 规则 | 说明 |
|------|------|
| 文件名 | 大驼峰，与 `sequelize.define()` 的第一个参数一致 |
| 目录 | 按应用放入 `src/models/{app_name}/` |
| 导出 | 工厂函数 `(sequelize, DataTypes) => Model` |
| 关联 | 通过 `Model.associate = (models) => {}` 定义 |
| 软删除 | 需要 `paranoid: true` + `delete_version` 字段 |
| 时间戳 | 统一 `timestamps: true` |
| 表名 | `{app_name}_{功能}` 格式 |

## 自动注册

模型加载器扫描 `src/models/{app_name}/` 目录，自动注册为 `app.db.{app_name}.ModelName`：

```js
const article = await app.db.myapp.Article.findByPk(1);
const user = await app.db.user.User.findByPk(article.user_id);
```

## DDD 分域

| 域 | 目录 | 模型 | 核心问题 |
|----|------|------|----------|
| 身份核心 | `models/user/` | User, UserIdentity | "你是谁？" |
| 访问控制 | `models/iam/` | Role, UserRole, InlinePolicy | "你能干什么？" |
| 委派授权 | `models/oauth21/` | OauthClient, OauthToken, OauthApproval | "第三方能干什么？" |
| 会话管理 | `models/session/` | UserSession, SessionToken, SessionLog | "你在哪登录？" |
| 系统设施 | `models/notice/` | EmailCode, NoticeConfig | 系统配置 |

## Sequelize 查询

```js
// 基础查询
const user = await User.findByPk(1);
const users = await User.findAll({ where: { status: 1 }, limit: 20 });

// 创建
const user = await User.create({ username: 'alice', email: 'alice@example.com' });

// 更新
await user.update({ username: 'bob' });
await User.update({ status: 0 }, { where: { id: 1 } });

// 删除
await User.destroy({ where: { id: 1 } });           // 软删除
await User.destroy({ where: { id: 1 }, force: true }); // 硬删除

// 复杂查询
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

// 事务
const result = await sequelize.transaction(async (t) => {
  const user = await User.create({ username: 'alice' }, { transaction: t });
  await UserIdentity.create({ user_id: user.id }, { transaction: t });
  return user;
});
```
