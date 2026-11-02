# @fastify/rate-limit 路由级限频与 `groupId` 计数隔离

> 适用版本：`@fastify/rate-limit` ^11.2.1（源码行为均对照 `node_modules/@fastify/rate-limit/index.js` 核实）
>
> 本文回答一个问题：**为什么公开端点的 `config.rateLimit` 里要写 `groupId`，不写会出什么事。**

---

## 1. 问题背景：默认所有端点共享同一个计数桶

本项目在防火墙第一层（`src/framework/firewall/engine/detectors/first-ratelimit.js`）注册了**全局** `@fastify/rate-limit` 插件，并使用**自定义 keyGenerator**：

```js
keyGenerator: req => {
  if (req.state?.user?.id) {
    return `rate:user:${req.state.user.id}`;
  }
  return `rate:ip:${req.ip}`;
};
```

关键点：**这个 key 里只有「用户/IP」维度，没有「路由」维度**。也就是说：

- 同一个 IP 访问 `/auth/v1/h5-token`、`/user/v1/sessions`、登录接口……全部累加进**同一个** `rate:ip:<ip>` 计数桶；
- 全局阈值（`defense.rateLimitRequests`，出厂默认 600 次/60s）是所有端点**共享**的额度。

后果是双向污染：

| 方向             | 场景                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| 别人吃掉你的额度 | 公司/校园网 NAT 出口下，大量用户刷其它端点，把 `rate:ip:<出口IP>` 的全局桶打满，你的端点跟着 429 |
| 你吃掉别人的额度 | 你的端点被脚本刷，连带同一 IP 上所有其它端点一起被限                                             |

对公开端点（不 requireLogin、可被脚本无成本调用，如 h5-token 预发）这尤其致命——它恰恰是最容易被刷、又最需要「自己的额度自己算」的一类端点。

## 2. `groupId` 的机制（源码级）

插件每次请求时在 `applyRateLimit` 中计算 key（v11 源码，行号 248–256）：

```js
let key =
  params.keyGenerator === defaultKeyGenerator
    ? defaultKeyGenerator(req, params.ipv6Subnet)
    : await params.keyGenerator(req);
const groupId = req.routeOptions.config?.rateLimit?.groupId;

if (groupId) {
  key += groupId;
}
```

三个必须记住的事实：

1. **读取位置固定**：`req.routeOptions.config.rateLimit.groupId`。所以它必须写在路由的 `config.rateLimit` 对象里（本项目 `registerSecureRoute` 的 `config` 参数会原样传给 Fastify 路由配置），写在别处不生效。
2. **追加方式是直接字符串拼接，没有分隔符**：`key += groupId`。本项目自定义 keyGenerator 产出 `rate:ip:1.2.3.4`，加 `groupId: 'h5-token'` 后最终 key 是：
   ```
   rate:ip:1.2.3.4h5-token
   ```
   （已登录用户则是 `rate:user:42h5-token`。）
3. **注册期校验**：`groupId` 若提供则必须是 string，否则插件在启动阶段直接 `throw new Error('groupId must be a string')`——这是好事，写错类型不会静默失效。

### 语义：同组共享，异组隔离

`groupId` 本质是给 key 追加一个**路由维度后缀**，由此产生分组语义：

- **不同 `groupId`** → 不同计数桶，互相独立核算（隔离，最常见用法）；
- **相同 `groupId`** → 多个端点**共享**同一个桶（分组配额，例如「这一组验证码接口合计 10 次/分钟」）。

## 3. 本项目标准用法

`src/api/auth/v1/h5-token.js`：

```js
registerSecureRoute(fastify, {
  name: 'issueH5Token',
  method: 'GET',
  url: '/h5-token',
  requireLogin: false,
  config: {
    rateLimit: {
      max: 30,                    // 路由级阈值，覆盖全局的 600
      timeWindow: '1 minute',
      groupId: 'h5-token'         // 计数隔离：本端点独立核算
    }
  },
  handler: ...
});
```

生效后的完整行为：

| 项         | 值                                                                       |
| ---------- | ------------------------------------------------------------------------ |
| 计数键     | `rate:ip:<ip>h5-token`（未登录）/ `rate:user:<id>h5-token`（已登录）     |
| 阈值       | 30 次/分钟（路由级 `max` 覆盖全局 600 次/60s）                           |
| 存储       | 全局注册的 resilient store（Redis 优先，故障降级内存）                   |
| 超限响应   | 全局 `errorResponseBuilder` → HTTP 429 + `code: 429`（含防火墙事件记录） |
| 与其它端点 | 完全隔离：该 IP/用户刷别的端点不影响这里，反之亦然                       |

### `timeWindow` 怎么写

解析器是插件依赖的 **`@lukeed/ms` 2.0.2**（`const { parse } = require('@lukeed/ms')`），语法比常见的
`ms` 包**更严格**：只接受「一个数值 + 一个单位」。

| 写法                                                 | 解析结果                                  | 说明                              |
| ---------------------------------------------------- | ----------------------------------------- | --------------------------------- |
| `'1 minute'` / `'1 minutes'`                         | 60000                                     | 全称单/复数都行                   |
| `'1m'` / `'30s'` / `'500ms'` / `'1.5h'` / `'2 days'` | 60000 / 30000 / 500 / 5400000 / 172800000 | 缩写可用，允许小数与空格          |
| `60000`（数字）                                      | 60000                                     | **单位是毫秒**，不会当秒          |
| `'1d 2h'`（复合）                                    | `undefined`                               | ❌ 不支持多单位组合               |
| `'1mon'` / `'0'`                                     | `undefined`                               | ❌ 不支持的词 / 零值              |
| `'60'`（字符串数字）                                 | `60`                                      | ⚠️ 被当成 **60 毫秒**，不是 60 秒 |

写成 `undefined` 时插件**不会回退默认值**（`mergeParams` 的兜底分支只对非字符串生效），
所以复合单位或拼错的写法会静默产生一个非法窗口。**结论：只用「数值 + 单位」的单一写法。**

### 窗口的真实来源（2026-11-02 修）

窗口由 `ResilientStore.incr(key, cb, timeWindow)` 的第三个参数决定（插件把路由的
`timeWindow` 传进来）。此前的实现**完全忽略该参数**、只用 `defense.rateLimitWindow`，
所以路由上改 `timeWindow` 是无效的；同时它在 Redis 侧每个请求都 `PEXPIRE`，
TTL 被不断续期 → 持续重试的客户端永远不会解封。两处都已修好（`framework/redis/resilient-store.js`）。

## 4. 生效前提（重要：2026-11-02 起已修）

`config.rateLimit` 是由 `@fastify/rate-limit` 的 **onRoute 钩子**消费的——**插件不注册，这些声明就全部失效**，而 Fastify 对未知的 route config **不校验、不警告**。

历史缺陷（已修）：插件注册原先完全由 `defense.enableRateLimit` 控制，而它默认 `false`，于是全仓 14 处端点级 `config.rateLimit`（含本节示例的 `h5-token`）**从未生效过**。

现在的语义（`first-ratelimit.js`）：

| `enableRateLimit`（全局桶） | `enableEndpointRateLimit`（端点级） | 插件                  | 实际行为                                          |
| --------------------------- | ----------------------------------- | --------------------- | ------------------------------------------------- |
| `true`                      | `true`                              | 注册，`global: true`  | 全局限流 + 端点声明都生效                         |
| `false`（默认）             | `true`（默认）                      | 注册，`global: false` | **只有端点声明生效**，未声明的路由不限流          |
| `true`                      | `false`                             | 注册，`global: true`  | 注册前摘掉路由上的 `config.rateLimit`，只剩全局桶 |
| `false`                     | `false`                             | **不注册**            | 完全不限流（启动日志有明确 warn）                 |

要点：

- 只要有一个开关打开，插件就注册——因为「插件在不在」决定了端点声明是否被消费，不该被另一个开关顺手带走；
- 端点级开关关闭时，代码会在插件注册**之前**用 `onRoute` 钩子删掉 `config.rateLimit`，所以「关了端点级却还在限」不会发生；
- 端点级限流现在**只有一条实现**：路由上的 `config.rateLimit`。防火墙管道里那套自研路径规则（`defense.endpointRateLimits`）已于 2026-11-02 删除——它的 path 全部对不上现存路由，封禁又写到了非 IP 键，整套空转。

## 5. 决策指南：哪些端点该写 `groupId`

| 场景                              | 建议                                                     |
| --------------------------------- | -------------------------------------------------------- |
| 公开端点（无登录）且有独立阈值    | **必写**。这是最容易被 NAT 连带误伤、也最容易被刷的组合  |
| 阈值与全局不同（更严或更松）      | **必写**。否则改的只是自己的 max，计数仍和全局桶混在一起 |
| 一组端点想共享一个配额            | 写**同一个** `groupId`（分组语义）                       |
| 普通登录态业务端点，阈值 = 全局值 | 可不写，跟随全局桶即可                                   |
| 写了 `groupId` 但没写路由级 `max` | 合法，key 隔离但阈值沿用全局——通常不是你想要的，检查一下 |

### `groupId` 命名约定

- 用**稳定的语义短横线小写串**：`h5-token`、`sms-send`、`qr-login`；
- 因为拼接无分隔符，避免一个 groupId 是另一个的**前缀**（如 `h5` 与 `h5-token`——理论上 `...ip` + `h5` 与另一 IP 拼接可碰撞；实践中 IP 字符边界使风险极低，但遵守约定零成本）；
- 改名 = 换桶（旧计数自然过期），无迁移负担。

## 6. 排障速查

| 症状                 | 排查点                                                                                                                                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 429 来得太早/太频繁  | ① 确认 `defense.enableRateLimit=true`（看启动日志）；② 确认 `groupId` 真的写在了 `config.rateLimit` 下（写在外层不生效且无警告）；③ 是否多个端点误用了同一个 `groupId`（共享桶）                                                                                 |
| 配了限频但完全不生效 | ① 看启动日志：只有 `enableRateLimit` 与 `enableEndpointRateLimit` **都**为 false 插件才不注册；② 确认 `groupId`/声明写在路由的 `config.rateLimit` 下（写外层不生效且无警告）；③ 是否被 `FW_RATE_LIMIT_OVERRIDE` 放宽（只取 `max(base, override)`，仅放宽不收紧） |
| 想看当前计数         | Redis 中按最终 key 查：`rate:ip:<ip><groupId>`（无分隔符直接拼接）                                                                                                                                                                                               |
| 429 返回 500         | 全局 `errorResponseBuilder` 必须带 `statusCode`（历史坑，`first-ratelimit.js` 已修，勿动）                                                                                                                                                                       |

## 7. 相关文件

| 文件                                                         | 职责                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| `src/framework/firewall/engine/detectors/first-ratelimit.js` | 插件注册、全局 keyGenerator、阈值解析与旁路、429 响应 |
| `src/framework/redis/resilient-store.js`                     | 计数存储（Redis 优先 / 内存降级）                     |
| `src/api/guard.js` → `registerSecureRoute`                   | 路由注册，透传 `config.rateLimit`                     |
| `src/api/auth/v1/h5-token.js`                                | `groupId` 标准用例                                    |
| `node_modules/@fastify/rate-limit/index.js`                  | `applyRateLimit` 中 key 拼接逻辑（行 248–256）        |

### 当前声明清单（2026-11-02）

公开端点（`requireLogin: false`）默认最容易被刷，全部已带独立 `groupId`：

| 端点 | 阈值 | groupId | 说明 |
| --- | --- | --- | --- |
| `GET /auth/v1/h5-token` | 30/min | `h5-token` | 预发 H5 签名 cookie |
| `POST /auth/v1/verify-challenge` | 10/min | — | 人机验证回执 |
| `POST /auth/v1/bind-token` | 30/min | `bind-token` | Bearer → Cookie |
| `POST /auth/v1/bind-session` | 30/min | `bind-session` | 一次性 session_token → Cookie |
| `POST /oauth2.1/token`、`/revoke` | 60/min | `oauth-token` | 同一令牌流程共用桶 |
| `POST /oauth2.1/device_authorization`、`/device/token`、`GET /device`、`POST /device/authorize` | 20/min | `oauth-device` | 设备码流程四个端点共用一个桶 |
| `POST /api/firewall/v1/challenge/verify` | 20/min | `challenge-verify` | 挑战回执（CPU + 被刷） |

> 登录本身**不靠这一层**：由防火墙的 `checkLoginBruteForce`（账号锁定 + IP 挑战）负责。
> 新增公开端点时，先问自己「它会不会被脚本无限调用」——会，就必须带 `groupId`。
