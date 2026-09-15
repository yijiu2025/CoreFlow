# 单次请求的数据库查询清单（实测）

> 结论日期：2026-09-14
> 方法：全仓 `addHook` 静态梳理 + **真实实例动态实测**（`createApp()` + `sequelize.options.logging`
> 采集 SQL + `app.inject()` 发请求，逐请求计数并打印原始 SQL）。探针脚本用完即删，未改任何产品代码。

---

## 一、结论速览

**每一次收到请求，框架层最少查 0 次数据库。**

全局钩子链（监控 / 认证 / 防火墙 / Guard）全部只读 Redis 与内存，MySQL 只在 4 个**条件分支**里才会被碰到。

| 请求形态 | DB 查询次数（实测） |
| --- | --- |
| 无 Cookie（K8s 探针 / 爬虫） | **0** |
| 带无效 sid Cookie | **0** |
| 未登录访问受保护路由（401） | **0** |
| 404 / 403 等错误响应 | **0** |
| 已登录 + 客户端带合法 `x-device-id`（浏览器正常形态） | **0** |
| 已登录 + 不带 device id，但 Redis session 里 deviceId 合法 | **0** |
| 已登录 + 客户端无 device id **且** session.deviceId 非法/缺失 | **1** |
| 已登录但 Redis 会话丢失（降级回源） | **4** |
| 已登录 + 命中业务 handler 自己的查询 | 上表 + handler 自身查询数 |

> 实测样例：`GET /user/v1/profile`（已登录）共 2 次 —— 1 次设备兜底 + 1 次 `UserDao.getProfile`。

---

## 二、每个请求都会经过的钩子链（按执行顺序）

| 阶段 | 位置 | 是否碰 DB |
| --- | --- | --- |
| `onRequest` 计时 | `framework/loader/registry/01-monitor.js:20` | 否 |
| `onRequest` 认证 | `framework/auth/index.js:380` | **条件性**（见第三节） |
| `onRequest` 防火墙 | `app/firewall/index.js:46` | 否（全 Redis） |
| `onRequest` WebSocket 握手防护 | `app/firewall/index.js:87` | 否 |
| `preHandler` 三级守卫 | `api/guard.js:217`（`createGuard`） | 否（纯内存配置） |
| `preHandler` CSRF / 限频 | `app/oauth21/middleware/*` | **未生效，见第五节** |
| `onSend` / `onResponse` | `app/firewall/index.js:80,109`、`01-monitor.js:25` | 否 |

业务 handler 与路由级 `preHandler` 的查询不在本表内，它们因路由而异。

---

## 三、MySQL 的 4 个落点（全在 `framework/auth`）

| # | 触发条件 | 位置 | 查询 |
| --- | --- | --- | --- |
| ① | Bearer JWT 路径 + 用户缓存（Redis 30s）未命中 | `framework/auth/index.js:153` | `findUserById` 查 `users` |
| ② | JWT 无 `roles`/`permissions` claim + 权限缓存（Redis 5min）未命中 | `framework/auth/index.js:191` | `loadUserPermissions` |
| ③ | sid 在 Redis 未命中 → 降级回源 | `framework/auth/session.js:370`、`:424` | `SessionToken.findOne`（JOIN `User`）+ `loadUserPermissions` |
| ④ | 客户端无有效 device id **且** Redis `session.deviceId` 非法/缺失 | `framework/auth/session.js:894`（经 `device.js:186 loadFromDb`） | `session_tokens` 单表查询 |

补充写操作（同属 auth 路径，非每请求）：

- `session.js:399` `token.update({ revoked: true })` —— 会话超长期 TTL 时。
- `createSession`（登录）：`UserSession.upsert` + `SessionToken.findOrCreate` + `pruneActiveDevices` + `SessionLog.create`。
- `refreshSessionCore`（sid_r 续期）：`SessionToken.findOne` + `User.findByPk` + `loadUserPermissions`
  + `record.update` + `SessionLog.create`。

### ③ 的精确代价（组件级实测）

`SessionToken.findOne` 带 `include User` 是 **1 条 JOIN SQL**；`loadUserPermissions(1,'oauth21')` 实测
**3 条**（`UserRole.findAll` + `Role.findOne`(superadmin 分支) + `InlinePolicy.findAll`）。

---

## 四、④ 号落点的触发条件（最容易误判的一处）

`framework/auth/device.js:178` 的判断是：
`if (!clientId || !(await validateDeviceId(clientId)).valid)` —— 只有客户端**完全没给**设备 ID、
或给的 **格式非法**时，才会走到 `loadFromDb()` 回查 `session_tokens`。

- 浏览器正常请求带合法 `x-device-id` → `clientId` 合法 → **不进分支，0 次查询**。
- 前端 localStorage 被清但 httpOnly `device_id` cookie 还在 → cookie 兜底恢复 → 也不查 DB。
- 真正会查库的是：**cookie 与 header 双缺失 + Redis session 里的 deviceId 又是一个非法值**
  （典型为旧版本写入的会话数据）。此时每请求固定 +1。

短前缀已注意：`x-device-id` 无效不等价于"缺失"，两者都会进分支；但 `sessionDeviceId` 有效时
会先被 `validateDeviceId` 命中而**不触发** `loadFromDb`。

---

## 五、顺带发现：oauth21 的三个安全钩子目前不生效

**现象（实测）**

- 对真实登录路由 `POST /oauth2.1/login` 连打 7 次，**没有出现 429**（敏感接口限频器未执行）。
- 带 `_csrf` cookie、不带 `X-CSRF-Token` 访问非排除路径，返回 401 而非 403「CSRF token 无效」（CSRF 未执行）。
- `initOAuthMiddleware`（H5 签名校验 `verifySignature` 的注册入口）**全仓只有定义与导出，从未被任何地方注册**
  → 路由上的 `requireSignature: true` 目前没有实际防护效果。

**根因**

`src/framework/loader/registry/10-apps.js:115` 用 `app.register(appConfig.init)` 调用
`src/app/oauth21/config.js` 的 `init(app)`。`init` 不是 `fastify-plugin` 包装的插件，`register` 会为它
**新开一个封装作用域**；而 `registerSensitiveRateLimits(app)` / `registerCsrfProtection(app, …)` 把钩子
挂在了这个**没有任何路由的子作用域**上 → 钩子永远不会被触发。路由本身是在根作用域（`08-api.js`）注册的。

**可选修法**（未改动，待确认）

1. 把 oauth21 的 `init` 用 `fp()` 包一层（打破封装，钩子上浮到根作用域）；或
2. 在 `10-apps.js` 里改为把这两个注册函数直接作用于根 `app`；或
3. 补注册 `initOAuthMiddleware`，让 `requireSignature` 真正生效。

---

## 六、可复现的验证方式

```js
// 临时探针（勿提交）：node --env-file=.env _probe.mjs
const { createApp } = await import('./src/app.js');
const { sequelize } = await import('./src/framework/db/index.js');
const hits = [];
sequelize.options.logging = sql => hits.push(String(sql).replace(/\s+/g, ' ').trim());

const app = await createApp();
app.log.level = 'fatal';
await new Promise(r => setTimeout(r, 1500));

hits.length = 0;
const res = await app.inject({ method: 'GET', url: '/v1/health' });
console.log(res.statusCode, 'DB 查询次数 =', hits.length, hits);

await app.close();
```

造已登录态不必写业务库：`getStore('session').set(sid, sessionData, ttl)` + `signCookie(sid, 0)` 组 cookie，
用完 `delete(sid)`；设备 ID 用 `generateServerSideDeviceId(UA)` 生成格式合法的值，否则会误触发 ④。
