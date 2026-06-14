# 安全 {#security}

## 密码安全

- 使用 `bcryptjs` 做密码哈希
- 生产环境校验密钥安全性，拒绝默认密钥

## 防重放攻击

- 时间戳校验（5分钟窗口）
- Nonce 去重（Redis 存储）

## CSRF 保护

- Double Submit Cookie 模式
- 公开接口排除

## 登录限频

| 接口 | 限制 |
|------|------|
| 登录接口 | 每 IP 每分钟 5 次 |
| 验证码接口 | 每 IP 每分钟 10 次 |
| 注册接口 | 每 IP 每小时 3 次 |

## 登录失败锁定

- 同一账号 5 次失败 → 锁定 30 分钟
- 同一 IP 10 次失败 → 告警

## Cookie 安全

```
sid cookie: HttpOnly / Secure / SameSite=Lax
  - HMAC-SHA256 签名
  - 每次请求递增 accessCount（防重放）
  - timingSafeEqual 比较签名（防时序攻击）
```

## CORS 配置

```js
// 生产环境：仅允许 CORS_ORIGINS 中配置的来源
if (!isDev && origin) {
  const allowed = process.env.CORS_ORIGINS.split(',').map(s => s.trim());
  if (!allowed.includes(origin)) {
    return cb(new Error('CORS origin not allowed'), false);
  }
}
```

## 安全响应头

```js
reply.header('X-Content-Type-Options', 'nosniff');
reply.header('X-Frame-Options', 'SAMEORIGIN');
reply.header('X-XSS-Protection', '1; mode=block');
reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
```

## 环境变量安全

生产环境必须修改所有默认密钥：

```ini
APP_SECRET=强随机值（至少32字符）
SESSION_SECRET=强随机值
FIREWALL_SECRET=强随机值
```

框架会在启动时检测不安全的默认值并拒绝启动。
