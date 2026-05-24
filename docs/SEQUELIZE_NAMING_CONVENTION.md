# Sequelize 命名规范与字段映射标准 (Coding Conventions)

在多语言混合的团队级项目中，由于 JavaScript/TypeScript 的主流规范是 **`camelCase` (驼峰命名)**，而关系型数据库 (MySQL/PostgreSQL) 的主流规范是 **`snake_case` (下划线命名)**，如果两者没有进行清晰的层级隔离，就会导致严重的“心智内耗”和代码混乱（例如，一会儿在 JS 中写 `client.client_id`，一会儿又写 `approval.appId`）。

为了消除团队内耗，规范本项目的 Sequelize 属性命名，现统一制定如下编码铁律。

---

## 1. 核心标准铁律 (The Rule)

> **“JS 内存世界属于驼峰命名 (camelCase)，SQL 物理磁盘世界属于下划线命名 (snake_case)。”**

*   **JavaScript 内存中（Sequelize Model 属性定义、Controller / Service / DAO 层）**：一律使用 **`camelCase`**。例如：`clientId`, `clientName`, `clientSecret`, `lastAuthAt`。
*   **数据库物理列中（MySQL Schema）**：一律使用 **`snake_case`**。例如：`client_id`, `client_name`, `client_secret`, `last_auth_at`。

---

## 2. 映射实现标准

在 Sequelize 模型中，我们通过两种方式进行完美映射：

### 方案 A：显式 `field` 映射 (强推推荐)
最直观且零失误的做法。在属性定义中显式配置 `field` 指向数据库物理列。这使其他开发者能一眼看清映射关系：

```javascript
// ✅ 统一推荐做法
export default (sequelize, DataTypes) => {
  const OauthApproval = sequelize.define('OauthApproval', {
    appId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'app_id', // 显式映射为数据库中的 app_id
      comment: '应用唯一标识'
    },
    lastAuthAt: {
      type: DataTypes.DATE,
      field: 'last_auth_at', // 显式映射为数据库中的 last_auth_at
      comment: '最后授权时间'
    }
  }, {
    tableName: 'user-approval',
    timestamps: true
  });

  return OauthApproval;
};
```

### 方案 B：利用全局 `underscored: true` 配置 (自动映射)
在定义模型时配置 `underscored: true`。Sequelize 会在物理数据库中将 `camelCase` 属性名自动编译为 `snake_case`：

```javascript
const UserRole = sequelize.define('UserRole', {
  userId: {
    type: DataTypes.BIGINT,
    allowNull: false
    // 开启 underscored 之后，底层自动生成名为 user_id 的列
  }
}, {
  tableName: 'user_roles',
  underscored: true // ⚡️ 开启下划线映射
});
```

---

## 3. 遗留/老旧代码 (Legacy) 的渐进式重构路线

在现存代码中，`oauth21` 目录下的老旧模型（如 `OauthClient.js`）曾直接在 JS 层使用了 `client_id`, `client_name` 等下划线命名。

对于这些历史代码，我们采用 **“增量重构，平稳降级”** 的过渡机制：

1. **新写的模型与业务层**：必须强制遵守本文的 **`camelCase`** 规范。
2. **已存在的历史模型**：允许继续维护其下划线属性以保证线上业务不发生突发崩溃，但在遇到对应的核心业务重构或大版本升级时，必须按照下例方式进行 `camelCase` 平滑适配：

```javascript
// 🔄 历史模型平滑改造示范 (如 OauthClient.js 的未来重构版)
export default (sequelize, DataTypes) => {
  const OauthClient = sequelize.define('OauthClient', {
    clientId: {
      type: DataTypes.STRING(128),
      primaryKey: true,
      field: 'client_id', // 💾 物理层依旧保持旧的 client_id 不变，实现无缝兼容
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

  return OauthClient;
};
```
通过配置 `field` 映射，我们能够在**不更改任何物理表列名、不用写任何迁移脚本**的前提下，将 JS 代码层 100% 优雅地统一回驼峰命名法！

---

## 4. 团队 Review 规范清单

在提交 PR 进行 Code Review 时，需严格检查：
- [ ] 属性定义中是否包含 `userId: { type: DataTypes.BIGINT, field: 'user_id' }` 样式的映射。
- [ ] 凡是 Sequelize 自动生成的 `createdAt` 和 `updatedAt`，是否配置了 `createdAt: 'created_at'` 以保证物理列为下划线。
- [ ] 外部 API 接口返回的 payload，是否遵循 JS 格式的驼峰规范。
