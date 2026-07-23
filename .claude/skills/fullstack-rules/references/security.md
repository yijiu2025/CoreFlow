# 安全规范

> 安全红线汇总，所有项目必须遵守。

---

## 一、敏感信息（最高优先级）

| 红线             | 说明                                                     |
| ---------------- | -------------------------------------------------------- |
| 严禁提交明文密钥 | API Key、数据库密码、私钥、JWT Secret 等不得出现在代码中 |
| 环境变量管理     | 敏感配置仅通过 `.env` / 环境变量注入，不硬编码           |
| 模板文件         | `.env.example` 作为模板提交，`.env.*` 写入 `.gitignore`  |
| 密钥文件         | `*.pem`、`*.key`、`id_rsa` 等密钥文件必须排除            |

```gitignore
# 必须添加
.env
.env.*
!.env.example
*.pem
*.key
id_rsa
```

---

## 二、XSS 防护（前端）

| 规则                           | 说明                                               | 违反后果             |
| ------------------------------ | -------------------------------------------------- | -------------------- |
| 禁止 `v-html`                  | 严禁使用 `v-html` 渲染未经净化的用户输入           | 攻击者可注入任意脚本 |
| 禁止 `dangerouslySetInnerHTML` | React 项目同规则                                   | 同上                 |
| iframe sandbox                 | 嵌入 iframe 必须配置 `sandbox` 属性                | 可被用于点击劫持     |
| 用户内容                       | 用户生成内容（评论、简介等）必须在服务端做输出净化 | 存储型 XSS           |

```vue
<!-- ❌ 禁止 -->
<div v-html="userComment"></div>

<!-- ✅ 安全做法：用纯文本插值 -->
<div>{{ userComment }}</div>

<!-- iframe 必须配置 sandbox -->
<iframe src="..." sandbox="allow-scripts allow-same-origin"></iframe>
```

---

## 三、SQL 注入防护（后端）

| 规则           | 说明                                                  |
| -------------- | ----------------------------------------------------- |
| 使用 ORM       | 所有数据库操作通过 Sequelize 参数化查询，禁止拼接 SQL |
| 禁止 raw query | 避免使用 `sequelize.query()` 拼接用户输入             |
| 参数化         | 动态条件通过 `where` 对象传入，不走字符串拼接         |

```js
// ❌ 禁止：字符串拼接 SQL
sequelize.query(`SELECT * FROM users WHERE id = ${userId}`);

// ✅ 安全：参数化查询
User.findOne({ where: { id: userId } });

// ✅ 安全：sequelize.query 也使用参数占位
sequelize.query('SELECT * FROM users WHERE id = ?', { replacements: [userId] });
```

---

## 四、权限校验（后端）

| 规则      | 说明                                      |
| --------- | ----------------------------------------- |
| 接口鉴权  | 涉及用户身份的接口必须校验 `requireLogin` |
| 权限校验  | 敏感操作必须配置 `permission` 参数        |
| 三级守卫  | System → Group → API 每级可独立拦截       |
| deny 优先 | 即使管理员，被明确 deny 的权限也会被拒绝  |

```js
registerSecureRoute(app, {
  name: 'deleteUser',
  method: 'DELETE',
  url: '/:id',
  requireLogin: true,       // 必须登录
  permission: 'user:delete', // 必须有删除权限
  handler: async (request, reply) => { ... }
})
```

---

## 五、输入验证（后端）

| 规则     | 说明                                                     |
| -------- | -------------------------------------------------------- |
| 参数校验 | 使用 Fastify schema 校验请求参数类型和格式               |
| 边界值   | 数值参数设置 `minimum` / `maximum`，字符串设 `maxLength` |
| 类型安全 | 禁止信任用户传入的类型，前端传什么就按什么处理           |

```js
schema: {
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
    }
  },
  params: {
    type: 'object',
    properties: {
      id: { type: 'integer', minimum: 1 }
    },
    required: ['id']
  }
}
```

---

## 六、认证安全（后端）

| 规则           | 说明                                            |
| -------------- | ----------------------------------------------- |
| Session 双令牌 | `sid`（2h）+ 可选 `sid_r`（30d 刷新）           |
| Cookie 安全    | HttpOnly + Secure + SameSite 属性               |
| HMAC 签名      | Cookie 值必须经过 HMAC-SHA256 签名，防止篡改    |
| 踢下线         | Redis 删除 session + DB 标记 revoked → 立即生效 |
| 密码存储       | 用户密码必须使用 bcrypt 哈希，禁止明文存储      |

---

## 七、CSRF 防护

### 原理

CSRF（跨站请求伪造）利用用户已登录的身份，诱骗用户在不知情的情况下发送恶意请求。

### 防护措施

| 措施                | 说明                                                 | 适用场景    |
| ------------------- | ---------------------------------------------------- | ----------- |
| SameSite Cookie     | 设置 `SameSite=Strict` 或 `Lax`，阻止跨站携带 Cookie | 所有 Cookie |
| CSRF Token          | 表单提交时携带随机 Token，服务端校验                 | 表单提交    |
| Origin/Referer 校验 | 检查请求头中的 Origin 或 Referer                     | API 接口    |
| 双重提交 Cookie     | Cookie 和请求体中都携带 Token 并比对                 | 无状态 API  |

### Fastify 配置

```js
// 使用 @fastify/csrf-protection
import csrf from '@fastify/csrf-protection';

await fastify.register(csrf, {
  sessionPlugin: '@fastify/cookie', // 需要 session 支持
  key: 'csrf-secret',
  cookieOpts: { sameSite: 'lax', path: '/' }
});
```

### 前端配合

```vue
<!-- 表单中携带 CSRF Token -->
<form @submit.prevent="submit">
  <input type="hidden" name="_csrf" :value="csrfToken" />
  <!-- 其他表单字段 -->
</form>
```

### 注意事项

- SPA + API 模式下，如果 Cookie 设置了 `SameSite=Strict`，通常不需要 CSRF Token
- 如果使用 JWT Token（放在 Authorization 头），不受 CSRF 攻击影响
- OAuth21 回调接口需要特殊处理，建议验证 state 参数

---

## 八、重型库安全（前端）

| 规则        | 说明                                                          |
| ----------- | ------------------------------------------------------------- |
| 动态导入    | TensorFlow、Fabric.js、ECharts 等重型库必须 `import()` 懒加载 |
| iframe 安全 | 嵌入第三方内容必须配置 `sandbox` 属性                         |
| 依赖审计    | 定期运行 `npm audit` 检查依赖漏洞                             |

---

## 九、环境变量管理

### 文件层级

| 文件              | 是否提交到 Git | 用途                               |
| ----------------- | -------------- | ---------------------------------- |
| `.env.example`    | ✅ 必须提交    | 环境变量模板，列出所有变量和默认值 |
| `.env`            | ❌ 禁止提交    | 本地开发环境配置                   |
| `.env.local`      | ❌ 禁止提交    | 本地覆盖配置（优先级高于 .env）    |
| `.env.production` | ❌ 禁止提交    | 生产环境配置                       |

### 命名规范

- 环境变量使用 `UPPER_SNAKE_CASE`
- 按模块分组，使用前缀：`DB_`（数据库）、`REDIS_`（缓存）、`APP_`（应用）、`OAUTH_`（认证）
- 敏感变量（密码、密钥）不设默认值，启动时校验必须存在

### 维护规则

- 新增环境变量时，必须同步更新 `.env.example`
- 敏感变量（密码、密钥、Token）不得出现在日志输出中
- 生产环境禁止使用 `DB_SYNC=true`

### .gitignore 配置

```gitignore
# 环境变量
.env
.env.*
!.env.example

# 密钥文件
*.pem
*.key
id_rsa
```

---

## 十、安全自查清单

提交代码前逐项检查：

- [ ] 代码中没有硬编码的密钥、密码、token
- [ ] `.env` 文件不在版本控制中
- [ ] 没有使用 `v-html` 渲染用户输入
- [ ] iframe 配置了 `sandbox` 属性
- [ ] 新增 API 接口有权限校验
- [ ] 数据库查询使用参数化，没有拼接 SQL
- [ ] 输入参数有 schema 校验
- [ ] 重型库已懒加载
- [ ] 新增环境变量已同步更新 `.env.example`

---

## 相关规范

| 规范         | 文件                                  | 说明                                   |
| ------------ | ------------------------------------- | -------------------------------------- |
| Git 安全红线 | [git-patterns.md](../git-patterns.md) | 敏感信息提交禁止、.gitignore 配置      |
| Vue 安全规范 | [vue.md](../frontend/web/vue.md)      | XSS 防护、iframe 安全、懒加载          |
| 后端权限校验 | [backend/main.md](../backend/main.md) | 三级守卫、registerSecureRoute 权限配置 |
