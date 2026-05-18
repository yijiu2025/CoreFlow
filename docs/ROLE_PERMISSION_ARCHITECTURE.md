# 企业级双驱权限架构 (PBAC + OAuth2) 核心解析

随着我们抛弃了传统的 RBAC 表结构，拥抱了 **“PBAC (内部提权)” + “OAuth2 (外部授权)”** 的双引擎架构。这份文档详细解答了整个系统中**角色、策略、凭证**的存储位置及协作原理。

## 1. 09-pbac.js 里的 `Role` 到底是什么？

在 `loader/registry/09-pbac.js` 的这段代码中：
```javascript
const { Role } = sequelize.models;
```
此处的 `Role` 对应的是 `src/models/user/Role.js` 模型，映射的物理表为 `user_role`。
它是我们内部 IAM (Identity and Access Management) 系统的基石。区别于传统角色表，这个表中没有零碎的权限外键关联，而是包含了一个重磅字段：`policy` (JSON 类型)。

`09-pbac.js` 的作用就是：在 Node.js 服务冷启动时，读取内存里收集到的所有“初始状态数据”，并将其 **Upsert（如果不存在则插入，如果已存在则按需更新）** 到 `user_role` 这张表里。它是“上帝之手”，帮你把写在代码里的权限持久化给数据库。

---

## 2. “内网”与“外网”：双维权限生态全景图

在您的系统目录下，清晰地划分为两大核心防线，它们各自解决不同的权限存储与核验问题：

### 防线 A：内部权限域 (src/models/user/*)
**解决的问题**：“用户张三，在我们的后台管理系统里，是个什么级别的干部？”

*   **1. 角色载体表 (`Role.js` -> `user_role`)**
    *   **存储位置**：MySQL 数据库。
    *   **保存方法**：通过代码中的 `defineRoles()` 注册到内存，再由 `09-pbac.js` 统一存入数据库。
    *   **作用**：携带标准的 JSON PBAC 文档。比如“代发专员”角色的 Policy 允许 `xianyu:order:*`。
*   **2. 派发记录表 (`UserRole.js` -> `user_app_user_role`)**
    *   **存储位置**：MySQL 数据库。
    *   **作用**：心脏授权表。记录 `user_id` 在特定的 `app_id` (应用维度隔离) 下被赋予了哪个 `role_id`。包含 `expire_at` (限时提权机制)。
*   **3. 个人特权表 (`InlinePolicy.js` -> `user_inline_policy`)**
    *   **存储位置**：MySQL 数据库。
    *   **作用**：极度灵活的脱轨机制。针对某个用户特殊加权（或使用 Deny 封号），直接将 JSON 策略绑定到人，绕过角色体系。

### 防线 B：开放平台授权域 (src/models/oauth21/*)
**解决的问题**：“外部三方应用客户端，代替用户张三能干哪些事？”

*   **1. 应用审批录 (`OauthApproval.js` -> `user_approval`)**
    *   **存储位置**：MySQL 数据库。
    *   **保存方法**：在用户登录三方页面点击“同意授权”时，由 OAuth Controller 存入。
    *   **作用**：记录某用户同意了某三方 App（OauthClient）可以执行的 **Scope（权限范围，本质就是 PBAC 的 Action 列表）**。
*   **2. 颁发凭证 (`OauthToken.js` -> `oauth_tokens`)**
    *   **存储位置**：数据库 / Redis 缓存集群。
    *   **作用**：AccessToken 的实体。携带了具体的 Scope 数组。

---

## 3. 合理的设置方法与最佳实践

这套系统设计极其巧妙，我们要在代码层面制定以下存储和加载的标准：

### 3.1 权限字典 (Action) 写死在代码中
所有的权限标识（如 `user:profile:read`，在 OAuth 领域叫 `scope`），必须定义在 `src/user/permission/index.js` 等模块的字典中。
**坚决反对在数据库建一张 Permission 表！**因为权限标识是跟随着 API 接口（ Controller ）同生共死的。

### 3.2 角色定义 (Role) 交给 Registry 自动注入
使用您刚刚实现的 `defineRoles` 魔法：
1. 模块开发者在自己的 `roles.js` 组合 JSON 权限。
2. 模块启动时自动进入内存。
3. `09-pbac.js` 执行最后入库。这保证了任何新部署的环境，只要一开机，所有基础角色瞬间就位。

### 3.3 木桶原理：内网 PBAC 与 OAuth Scope 的双重压制
如果在未来您开发了供第三方接入的 Open API，当请求到来时，验证顺序应为：
1. **解析 OAuth Token**：解析出的 `scope` 表明这个 Token **申请了** `xianyu:delete` 权限。
2. **校验 PBAC 引擎**：去 `user_role` 算出这个用户本人到底有没有 `xianyu:delete` 的权限。
3. **安全结论**：哪怕第三方拿到了拥有最高 Scope 的 Token，只要后台管理员给这个用户下发了一个 `InlinePolicy: Deny(xianyu:delete)`，本次请求依然**熔断拦截**。这就是企业级安全网。
