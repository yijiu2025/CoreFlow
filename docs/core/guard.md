# 三级守卫 {#guard}

## 守卫层级

三级守卫系统实现级联访问控制：

| 级别   | 来源                      | 配置项                                                  |
| ------ | ------------------------- | ------------------------------------------------------- |
| System | `system.json`             | enabled, allowIps, requireLogin                         |
| Group  | `registerGroupMetadata()` | enabled, allowIps, allowRoles                           |
| API    | `registerSecureRoute()`   | enabled, allowIps, allowRoles, requireLogin, permission |

每级可独立拦截，任一级拒绝则请求被拦截。

## 校验流程

```
请求到达
  │
  ▼
System 级 (system.json)
  ├─ enabled: true?     → 否 → 返回 403
  ├─ allowIps 匹配?     → 不匹配 → 返回 403
  └─ requireLogin?      → 未登录 → 返回 401
  │
  ▼
Group 级 (registerGroupMetadata)
  ├─ enabled: true?     → 否 → 返回 403
  ├─ allowRoles 匹配?   → 不匹配 → 返回 403
  └─ requireLogin?      → 未登录 → 返回 401
  │
  ▼
API 级 (registerSecureRoute)
  ├─ enabled: true?     → 否 → 返回 403
  ├─ permission 匹配?   → 不匹配 → 返回 403
  └─ requireLogin?      → 未登录 → 返回 401
  │
  ▼
放行到 handler
```

## 配置示例

### System 级（system.json）

```json
{
  "name": "myapp",
  "alias": "我的应用",
  "prefix": "/myapp",
  "enabled": true,
  "requireLogin": false,
  "allowIps": [],
  "allowRoles": []
}
```

### Group 级（路由文件中）

```js
registerGroupMetadata({
  name: 'article',
  description: '文章管理',
  prefix: '/v1',
  requireLogin: true,
  allowRoles: ['myapp_user', 'myapp_admin']
});
```

### API 级（路由文件中）

```js
registerSecureRoute(fastify, {
  name: 'deleteArticle',
  method: 'DELETE',
  url: '/articles/:id',
  requireLogin: true,
  allowRoles: ['myapp_admin'],
  permission: 'myapp:article:delete',
  handler: async (request, reply) => { ... }
});
```

## `registerSecureRoute()` 完整字段参考

定义在 `src/api/guard.js`。除三级守卫外，它还编排了签名验证、二级认证、敏感操作回源、风险豁免等一系列安全设施。字段分四类：**路由基本项 / 守卫项 / 增强安全项 / Fastify 透传项**。

### 字段总表

| 字段 | 类型 / 默认值 | 分类 | 说明 |
| --- | --- | --- | --- |
| `name` | string，默认 url 中 `/` 换 `_` | 基本 | API key，用于守卫配置持久化与运行时动态修改；同一 System+Group 内命名需可辨识 |
| `alias` | string | 基本 | 中文别名，仅用于管理面板/文档展示 |
| `method` | string，**必填** | 基本 | HTTP 方法，内部转大写 |
| `url` | string，**必填** | 基本 | 相对路径，与 system prefix、组前缀拼接成最终 URL（见下文 URL 拼接规则） |
| `handler` | function，**必填** | 基本 | 业务处理函数 |
| `group` | string，默认 currentGroup | 基本 | 覆盖文件级组归属（一般不用，Loader 自动维护上下文） |
| `requireLogin` | boolean，默认 `false` | 守卫 | 未登录返回 401。**置 true 会自动开启 H5 签名验证**（见 `requireSignature`） |
| `allowRoles` | string[]，默认 `[]` | 守卫 | 角色白名单；**非空时隐含必须登录**（未登录连角色都没有） |
| `allowIps` | string[]，默认 `[]` | 守卫 | IP 白名单，支持精确/通配符/CIDR；非空时白名单外的 IP 一律 403 |
| `enabled` | 经持久化配置控制 | 守卫 | 代码里不直接声明；在管理面板/`guard_configs` 表中动态开关 |
| `permission` / `requirePermission` | string \| `{any:[]}` \| `{all:[]}`，默认 `null` | 守卫 | 权限校验，`permission` 是 `requirePermission` 的短别名，两者等价；Deny 优先（见下方权限配置） |
| `requireSignature` | boolean，默认 `false` | 增强 | H5 签名验证（`_m_h5_tk` + timestamp + nonce SHA-256）；`requireLogin: true` 时自动开启，公开端点也可单独开启防爬 |
| `freshPermission` | boolean，默认 `false` | 增强 | 敏感操作回源校验：绕过会话内的权限副本，**实时查库**取最新角色/权限再决策。每开一个多 3 表查询，只给改权限、注销账号、导出全量数据这类不可逆/高影响操作开。回源失败 fail-closed（403） |
| `safe` | string（service 维度），默认 `null` | 增强 | 二级认证：守卫通过后追加 `createSafePreHandler(service)`，要求当前用户处于 `openSafe(service)` 时间窗内，否则 403 `SECOND_AUTH_REQUIRED`（前端引导二次验证后再发起请求） |
| `riskExempt` | boolean，默认 `false` | 增强 | 风险豁免：设备指纹变更（warn 级）会拦截高风险写操作；退出登录/切换账号/人机验证等端点若不豁免会**死锁**（退不出、验不了）。标志写入路由 config，由防火墙 anomaly-detector 的 onRequest 读取消费 |
| `schema` | object，默认 `{}` | 透传 | Fastify 原生 schema（body/querystring/response 校验） |
| `config` | object，默认 `{}` | 透传 | 原样并入路由 config。**`@fastify/rate-limit` 的路由级配置就写在这里**（`max`/`timeWindow`/`groupId`，见 [rate-limit-group-id.md](./rate-limit-group-id.md)） |

### 校验顺序（单次请求内）

```
onRequest 阶段（守卫之前）
  ├─ @fastify/rate-limit 全局限频（config.rateLimit 消费点）
  ├─ 防火墙五层管道（anomaly-detector 读 config.riskExempt 判定豁免）
  └─ H5 签名验证（config.requireSignature 消费点）
preHandler 阶段
  ├─ 1. 三级级联守卫 createGuard（System → Group → API）
  └─ 2. 二级认证 createSafePreHandler（仅 safe 声明时，数组按序执行）
handler
```

### 运行时行为细节

- **重复注册检测**：`method + 最终 URL` 在注册表里查重，重复直接 `throw`（`DUPLICATE_ROUTE`），启动即失败而非延后暴露到无关模块。
- **参数防御性校验**：`method`/`url`/`handler` 缺失或类型错误启动期抛 `INVALID_PARAM`。
- **返回值**：`{ name, fullUrl, method }` —— `fullUrl` 是解析后的真实完整路径，调用方可直接用它做客户端配置或跳转，避免手拼 `system.json.prefix + 组前缀 + url`。
- **守卫结果元数据注入**：`request.state.systemKey/groupKey/apiKey` 会注入请求上下文，供日志审计链路使用。
- **路由 config 注入**：`requireSignature`、`requireLogin`、`riskExempt` 满足条件时会写入 `request.routeOptions.config`，供下游 onRequest 钩子（防火墙等）在不依赖 guard 配置表的前提下读取——只读元数据，鉴权决策仍完全由 preHandler 守卫负责。

### 组合示例

```js
// 敏感写操作全家桶：权限 + 实时回源 + 二级认证 + 显式签名
registerSecureRoute(fastify, {
  name: 'resetPermissions',
  method: 'POST',
  url: '/permissions/reset',
  requireLogin: true,              // 隐含开启 H5 签名验证
  permission: 'admin:perm:write',
  freshPermission: true,           // 改权限前实时查库，防陈旧权限蒙混
  safe: 'perm_reset',              // 需在二级认证时间窗内
  config: {
    rateLimit: { max: 5, timeWindow: '1 minute', groupId: 'perm-reset' }
  },
  handler: async (request, reply) => { ... }
});

// 公开免登录端点：独立限频桶 + 显式签名防爬（无登录则不会自动开签名）
registerSecureRoute(fastify, {
  name: 'issueH5Token',
  method: 'GET',
  url: '/h5-token',
  requireLogin: false,
  requireSignature: false,         // 本端点本身就是发签名 cookie 的，不能要求签名
  config: {
    rateLimit: { max: 30, timeWindow: '1 minute', groupId: 'h5-token' }
  },
  handler: async (request, reply) => { ... }
});
```

## 权限配置

`permission` 支持三种格式：

```js
// 单个权限
permission: 'fw:config:read';

// 任一满足（OR）
permission: {
  any: ['fw:block:write', 'fw:admin:*'];
}

// 全部满足（AND）
permission: {
  all: ['fw:admin:reset', 'fw:admin:*'];
}
```

## IP 匹配

支持通配符和 CIDR：

```js
allowIps: [
  '192.168.1.100', // 精确匹配
  '192.168.1.*', // 通配符
  '10.0.0.0/8', // CIDR
  '*' // 全部允许
];
```

## WebSocket 守卫

WebSocket 路由同样支持三级守卫：

```js
registerSecureWebSocket(fastify, {
  url: '/ws/monitor',
  requireLogin: true,
  allowRoles: ['fw_viewer'],
  handler: (connection, req, client) => { ... }
});
```

## URL 拼接规则

```
最终 URL = system.json.prefix + registerGroupMetadata.prefix + registerSecureRoute.url
```

示例：

```json
// system.json
{ "prefix": "/blog" }
```

```js
registerGroupMetadata({ prefix: '/v1' });
registerSecureRoute(fastify, { url: '/posts', ... });
// 最终：GET /blog/v1/posts
```

## 配置持久化

Guard 配置持久化到**数据库** `guard_configs` 表（`src/app/guard/dao/guard-config.dao.js` 的
`loadFromDB()` / `saveToDB()`，由 `src/api/guard-config.js` 在启动后调度），支持运行时动态修改。

> ⚠️ `data/guard_config.json` 是迁移到数据库**之前**的本地文件方案，**已废弃** ——
> 直接编辑它不会生效，服务也不会再读写该文件。

### 运行时字段的变更方向（2026-11-07 起）

可被运维调整的字段只有四个（`app/guard/services/direction.js` 的 `RUNTIME_FIELDS`）：
`enabled`、`requireLogin`、`allowIps`、`allowRoles`。
`requirePermission` / `freshPermission` 是**代码级授权声明**，面板与数据库都改不动 ——
它们是 PBAC 的判据本身，一旦可写，权限模型就退化成表单。

变更按方向区别对待：

| 方向 | 例子 | 二次认证 | 签名信封 |
|---|---|---|---|
| 收紧 | 关模块、加角色、加 IP、`requireLogin: false → true` | 需要 | 不需要 |
| 放宽 | 开模块、删角色、清空名单、`requireLogin: true → false` | 需要 | 需要 |
| 无鉴权语义 | 只改 `description` | 不需要 | 不需要 |

> 收紧同样要认证：把模块关掉、把角色踢出去，和越权放宽在结果上没有区别。
> 签名信封只用于放宽 —— DB 里收紧越多只会越严，不需要额外授权。

判定语义上有两个易错点：

- `allowRoles: []` / `allowIps: []` 表示**不限制**，所以"清空"是放宽、"从空到有"是收紧；
- 一次 patch 同时增删时按**放宽**处理，避免"夹带一个删除"绕过认证。

### 二次认证与签名信封

任何运行时字段变更都要先换一张 step-up 票据（`description` 除外）：

```
POST /api/firewall/v1/apiconfigs/stepup/challenge   { system, group, apiKey, patch, reason, method }
POST /api/firewall/v1/apiconfigs/stepup/verify      { challengeId, code | password }
PATCH /api/firewall/v1/apiconfigs/:system/:group    Header: X-Stepup-Token: <ticket>
```

**谁能改**：只有超级管理员（角色含 `superadmin`，或权限集含通配 `*`）能发起变更。
`fw:config:write` 不够 —— 那个权限可以授给运维，而安全配置的变更权不该随运维角色扩散。
若配置了 `GUARD_SUPERADMIN_EMAILS`（逗号分隔、大小写不敏感），账号在**库中绑定的邮箱**
必须命中列表；未配置时退化为"超管账号自己的邮箱"。白名单比对用库里的值而不是会话快照，
否则"换绑邮箱后旧会话仍通过"就能绕开。


- `method` 支持 `email`（6 位验证码）与 `password`；**短信通道尚未接入**，传 `sms` 会被明确拒绝；
- 票据 5 分钟有效、一次性、且绑定 `sha256(目标路径 + patch 运行时字段)` ——
  换目标或换内容都会失效，一次授权只能用于它被批准的那次变更；
- 放宽落地时节点会带上 `_relaxation`（含 `at/by/reason/sig`），签名覆盖该节点的全部运行时字段值。

启动与跨实例同步合并 DB 时会验签：**签名不符或缺失的放宽整节点跳过并告警**。
因此直接 `UPDATE guard_configs SET config = ...` 放宽权限**不会生效** ——
这是刻意的：数据库不该成为绕过二次认证的旁路。
确需应急时，用面板重新提交（走认证），签名会由服务端签发。

> 签名密钥由 `APP_SECRET` 派生。轮换 `APP_SECRET` 会让存量放宽项验签失败、
> 回落到代码基线（方向更严），启动日志会逐条列出被忽略的节点，重新授权即可。

