# 命名规范 {#naming}

## 模型属性命名：存量并存，新代码走方案 A

> 先纠正一条容易误读的旧说法：本仓**不是**"内存一律 camelCase"。`sequelize.define` 已全局
> 开 `underscored: true`（`src/framework/persistence/db/index.js`），所以属性名写
> `clientId` 或 `client_id` **都能对上** `client_id` 列 —— 存量因此分成两派：

| 风格                    | 属性名                        | 是否写 `field`                | 典型位置                                                         |
| ----------------------- | ----------------------------- | ----------------------------- | ---------------------------------------------------------------- |
| **A（新代码按这个写）** | `camelCase`，如 `appId`       | 写 `field: 'app_id'` 显式声明 | `src/models/iam/`、`src/models/posecraft/`                       |
| **B（存量）**           | `snake_case`，如 `config_key` | 不写，靠全局 `underscored`    | `src/models/console/`、`src/models/user/`、`src/models/oauth21/` |

- **新增模型一律按 A**：属性名 camelCase + `field` 显式写列名，读代码时不用去猜映射
- **不要为了"统一"批量重命名存量模型**：属性名是业务代码的调用面（DAO / service / 测试都在用），
  改名要全仓同步，风险和收益不成比例
- 数据库物理列名**始终** snake_case —— 这一条没有例外

## 映射方式

### 方案 A：显式 `field` 映射（新代码用这个）

```js
const defineOauthApproval = (sequelize, DataTypes) => {
  const OauthApproval = sequelize.define(
    'OauthApproval',
    {
      appId: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'app_id', // 显式映射
        comment: '应用唯一标识'
      },
      lastAuthAt: {
        type: DataTypes.DATE,
        field: 'last_auth_at', // 显式映射
        comment: '最后授权时间'
      }
    },
    {
      tableName: 'oauth_user_approval',
      timestamps: true
    }
  );
  return OauthApproval;
};

export default defineOauthApproval; // 🔴 export 收拢到文件末尾（eslint 强制）
```

### 方案 B：全局 `underscored: true`（存量写法）

```js
const UserRole = sequelize.define(
  'UserRole',
  {
    userId: {
      type: DataTypes.BIGINT,
      allowNull: false
      // 开启 underscored 之后，底层自动生成名为 user_id 的列
    }
  },
  {
    tableName: 'user_roles',
    underscored: true
  }
);
```

## 遗留代码渐进式重构

通过 `field` 映射，**不更改任何物理表列名**即可将 JS 代码层统一回驼峰命名法：

```js
const OauthClient = sequelize.define(
  'OauthClient',
  {
    clientId: {
      type: DataTypes.STRING(128),
      primaryKey: true,
      field: 'client_id', // 物理层保持旧列名
      comment: '客户端唯一标识'
    },
    clientName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'client_name',
      comment: '客户端名称'
    }
  },
  {
    tableName: 'oauth_clients',
    timestamps: true
  }
);
```

## 其他命名规范

| 类型           | 规范                | 示例                                |
| -------------- | ------------------- | ----------------------------------- |
| 文件名（模型） | 大驼峰              | `User.js`, `OauthClient.js`         |
| 文件名（路由） | 小驼峰/kebab        | `auth.js`, `user-info.js`           |
| 文件名（工具） | kebab-case          | `safe-redis.js`, `session-store.js` |
| 函数名         | 小驼峰              | `getUserById`, `createSession`      |
| 常量           | 大蛇形              | `MAX_REFRESH_TOKENS`                |
| 表名           | `{app}_{功能}`      | `myapp_article`, `user_user`        |
| 权限编码       | `{app}:{res}:{act}` | `fw:monitor:read`                   |
| 角色编码       | `{app}_{role}`      | `fw_admin`, `myapp_user`            |

## Review 规范清单

- [ ] 新增模型是否走方案 A（camelCase 属性名 + `field` 显式写列名）
- [ ] 表名是否遵循 `{app}_{功能}` 格式（存量例外：`oauth_clients` / `session_tokens` /
      `audit_logs` / `sys_config` / `iam_user_role`，不要为了对齐去改存量表名）
- [ ] 外部 API 返回的 payload 是否遵循驼峰规范（响应体对外统一 camelCase）
- [ ] `createdAt` / `updatedAt` **不需要**逐模型配置映射：全局 `underscored: true` 已处理
