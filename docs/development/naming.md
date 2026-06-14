# 命名规范 {#naming}

## 核心铁律

> **"JS 内存世界属于 camelCase，SQL 物理磁盘世界属于 snake_case。"**

- **JavaScript 内存中**：一律使用 `camelCase`。例如：`clientId`, `clientName`, `lastAuthAt`
- **数据库物理列中**：一律使用 `snake_case`。例如：`client_id`, `client_name`, `last_auth_at`

## 映射方式

### 方案 A：显式 `field` 映射（推荐）

```js
export default (sequelize, DataTypes) => {
  const OauthApproval = sequelize.define('OauthApproval', {
    appId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'app_id',           // 显式映射
      comment: '应用唯一标识'
    },
    lastAuthAt: {
      type: DataTypes.DATE,
      field: 'last_auth_at',     // 显式映射
      comment: '最后授权时间'
    }
  }, {
    tableName: 'user-approval',
    timestamps: true
  });
  return OauthApproval;
};
```

### 方案 B：全局 `underscored: true`

```js
const UserRole = sequelize.define('UserRole', {
  userId: {
    type: DataTypes.BIGINT,
    allowNull: false
    // 开启 underscored 之后，底层自动生成名为 user_id 的列
  }
}, {
  tableName: 'user_roles',
  underscored: true
});
```

## 遗留代码渐进式重构

通过 `field` 映射，**不更改任何物理表列名**即可将 JS 代码层统一回驼峰命名法：

```js
const OauthClient = sequelize.define('OauthClient', {
  clientId: {
    type: DataTypes.STRING(128),
    primaryKey: true,
    field: 'client_id',       // 物理层保持旧列名
    comment: '客户端唯一标识'
  },
  clientName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'client_name',
    comment: '客户端名称'
  }
}, {
  tableName: 'oauth_clients',
  timestamps: true
});
```

## 其他命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件名（模型） | 大驼峰 | `User.js`, `OauthClient.js` |
| 文件名（路由） | 小驼峰/kebab | `auth.js`, `user-info.js` |
| 文件名（工具） | kebab-case | `safe-redis.js`, `session-store.js` |
| 函数名 | 小驼峰 | `getUserById`, `createSession` |
| 常量 | 大蛇形 | `MAX_REFRESH_TOKENS` |
| 表名 | `{app}_{功能}` | `myapp_article`, `user_user` |
| 权限编码 | `{app}:{res}:{act}` | `fw:monitor:read` |
| 角色编码 | `{app}_{role}` | `fw_admin`, `myapp_user` |

## Review 规范清单

- [ ] 属性定义中是否包含 `field: 'xxx'` 映射
- [ ] `createdAt` 和 `updatedAt` 是否配置了 `createdAt: 'created_at'`
- [ ] 外部 API 返回的 payload 是否遵循驼峰规范
- [ ] 表名是否遵循 `{app}_{功能}` 格式
