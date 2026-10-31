# 安全 {#security}

## 密码安全

- **新写入一律用 `crypto.scrypt`**（`src/framework/auth/password-hash.js`，走 libuv 线程池，
  带并发背压 `SCRYPT_MAX_CONCURRENCY`）
- 历史 `bcrypt` 哈希**只做校验兼容**：校验失败/成功都不得再写入 bcrypt，登录成功后由
  `isLegacyHash()` 判定并就地升级为 scrypt
- ⚠️ **禁止把 `bcryptjs` 用回密码哈希路径**：它是纯 JS 实现，`hashSync`/`compareSync` 会整体
  占住主线程（实测 10 次并发冻结事件循环 649–774ms）；异步版也一样，因为它只是分段让出调度权。
  这条曾经写反过（文档写"使用 bcryptjs 做密码哈希"），`bcrypt` 校验路径的并发上限
  （`BCRYPT_MAX_CONCURRENCY`）就是为了兜住存量哈希的突发。
- 生产环境校验密钥安全性，拒绝默认密钥与过短密钥

## 防重放攻击

- 时间戳校验：**±2 分钟**（`src/framework/auth/signature.js`，`Math.abs(now - ts) > 120_000` 即拒）
- Nonce 去重（Redis 原子 check-and-mark）：H5 请求签名（`_m_h5_tk`）与 RSA 登录请求都走这一套

## CSRF 保护

- Double Submit Cookie 模式，**只作用于 `/oauth2.1` 作用域**
- 排除清单只允许「不依赖浏览器 cookie」的端点（token / revoke / crypto / device 流）；
  登录、授权确认、扫码确认、登出**必须在保护范围内**（登录 CSRF = 登录劫持）

## 登录限频

| 接口           | 限制                | 实现位置 |
| -------------- | ------------------- | -------- |
| 登录 / 快捷登录 | 每 IP 每分钟 5 次   | `app/oauth21/middleware/rate-limiter.js` |
| 邮箱二次验证    | 每 IP 每分钟 5 次   | 同上 |
| 扫码确认        | 每 IP 每分钟 10 次  | 同上 |
| 注册            | 每 IP 每分钟 5 次（端点级 `config.rateLimit`）+ 邮箱验证码 + 图形验证 |
| 全站            | 每键（用户 / IP）600 次/60 秒 | `@fastify/rate-limit`，阈值取 `defense.rateLimitRequests` |

> ⚠️ 全局限流的阈值在 `src/data/firewall_config.json` 的 `defense.rateLimitRequests`，
> 历史上配成过 10000/60 秒（≈167 rps/键，等于没有这一层）。启动日志会打印生效值，
> 超过 1000 会打印告警。

## 登录失败锁定

- 同一账号 15 分钟内 5 次失败 → 锁定 30 分钟
- 同一 IP 15 分钟内 10 次失败 → 临时封禁并告警

## Cookie 安全

```
sid cookie: HttpOnly / Secure / SameSite=Lax
  - HMAC-SHA256 签名
  - 每次请求递增 accessCount（防重放）
  - timingSafeEqual 比较签名（防时序攻击），比较前先比字节长度
sid_r cookie: HttpOnly / SameSite=Strict / path 收窄到刷新端点
```

## CORS 配置

生产环境只放行 `CORS_ORIGINS` 白名单；**白名单为空时对敏感端点是 fail-closed**
（`src/framework/auth/origin-guard.js`：Origin → Referer → 非浏览器请求 三级判定，判不出来就拒绝）。
不要在示例代码里直接 `process.env.CORS_ORIGINS.split(',')` —— 未配置时会抛 `TypeError`。

## 安全响应头

```js
reply.header('X-Content-Type-Options', 'nosniff');
reply.header('X-Frame-Options', 'SAMEORIGIN');          // 需要 iframe 的页面按白名单下发 CSP frame-ancestors
reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
```

> `X-XSS-Protection` **不要下发**：该头已被现代浏览器废弃，且在旧版 IE 上会把合法内容当反射型
> XSS 处理，反而可被利用。

## 反向代理信任

`PROXY_TRUST_CIDR` 只能填**反向代理的确切地址**（如 `172.18.0.2/32`）。
被信任网段里的任何来源都能自定义 `X-Forwarded-For`，而 `request.ip` 是 IP 白名单、限流键、
封禁记录的唯一判据 —— 填 `172.16.0.0/12` 这种大网段等于把 IP 维度整体让给攻击者。
`src/app.js` 会在启动时检测过宽网段并打 warn。

## 环境变量安全

生产环境必须修改所有默认密钥：

```ini
APP_SECRET=强随机值（至少32字符）
SESSION_SECRET=强随机值
FIREWALL_SECRET=强随机值
```

框架会在启动时检测不安全的默认值并拒绝启动。
