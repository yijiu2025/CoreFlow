# 系统数据模型 (Models) 领域驱动设计 (DDD) 架构规划

您的直觉非常敏锐！在目前的结构中，将 `Role`（角色）与 `User`（用户本体）混在一起确实违背了**领域驱动设计 (DDD)** 的高内聚低耦合原则。

`Role`（以及对应的 PBAC 策略）决不只属于“用户模块”，它是**统管整个后端的“中枢神经”**。哪怕以后新增了“设备(Device)”、“API 凭证(AK/SK)”等非人实体，它们依然需要被分配 `Role` 来鉴权。

基于大厂级的微服务拆分思想，我们对现有的 `src/models/` 目录给出以下终极架构重组方案：

---

## 1. 身份核心域 (`src/models/identity/` 或保留 `user/`)
**核心指责**：回答“你是谁？”、“你的密码/凭证对不对？”
此目录只应存放**与自然人实体及认证**强相关的数据模型，绝对不涉及权限。

*   `User.js`: 用户主表 (档案、昵称、状态)。
*   `UserIdentity.js`: 多源身份聚合表 (密码 Hash、微信 OpenID、手机号)。

## 2. 访问控制域 (`src/models/iam/` ⭐️ 全新建议)
**核心指责**：回答“你能干什么？”、“你被全系统赋予了哪些特权？”
**这就是您提议剥离出来的全局中枢。** 我们建议将其命名为 `iam` (Identity and Access Management)，这是全球云计算行业（AWS, 阿里云）的标准命名，比 `service` 更专业、更精准。

*   `Role.js`: 全局角色表 (携带 JSON 策略，应用隔离)。
*   `UserRole.js`: 授权记录表 (记录谁、在哪个应用下、获得了哪个角色、谁授予的)。
*   `InlinePolicy.js`: 个人特权/黑名单策略表。
*(注：建议将现有的 `src/models/user/Role.js` 等 3 个模型移动至 `src/models/iam/` 目录)*

## 3. 委派授权域 (`src/models/oauth21/`)
**核心指责**：回答“第三方客户端代替用户能干什么？”
这是目前切分得最好的一个域，保持现状即可。

*   `OauthClient.js`: 接入系统的第三方/内部子系统档案。
*   `OauthApproval.js`: 用户对第三方的授权（Scope）快照。
*   `OauthToken.js`: 颁发的 Access/Refresh Token 凭证实体。
*   `OauthCode.js` & `OauthConsent.js`: 协议流程记录。

## 4. 身份会话域 (`src/models/sso/`)
**核心指责**：跨应用单点登录与全局 Session 追踪。
如果未来会话管理不再局限于单点登录，该文件夹可升级为 `session/`。

*   `SsoUser.js`: 记录各子系统的登录时间与最后活跃 IP。

## 5. 系统底层设施域 (`src/models/system/` 或 `notice/`)
**核心指责**：脱离于人和权限的系统级元数据配置。

*   `NoticeConfig.js`: 全局邮件、短信等通道的配置账本。
*   *未来可能新增的字典表 (Dictionary)、操作日志审计表 (AuditLog) 等均存放在此。*

---

## 🚀 重构执行建议

为了将理论落地，我建议您执行以下简单的文件级重构（系统会自动通过 `06-models.js` 重新加载它们，无需更改加载代码）：

1. **新建文件夹**：`mkdir src/models/iam`
2. **移动文件**：将 `Role.js`, `UserRole.js`, `InlinePolicy.js` 从 `user` 目录剪切到 `iam` 目录。
3. **清理废弃文件**：删除 `src/models/auth/` 目录下的老旧 `Group.js` 和 `Permission.js`（这是以前 RBAC 时代的遗留产物，在 PBAC 下已彻底废弃）。
4. **修改依赖路径**：在 `User.js` 和 `iam` 的几个文件中，检查一下互相引用的 `models.xxx` 字符串，如果有硬编码的文件 `import`，需要调整相对路径。由于 Sequelize 是按 `models.User` 动态引用的，大部分底层逻辑甚至不需要改一行代码！
