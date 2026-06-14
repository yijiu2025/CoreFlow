# 多服务器架构 {#multi-server}

## 架构概览

```
┌──────────────┐          ┌──────────────┐
│  主服务器     │          │  子服务器 A   │
│  (Auth)      │          │  (业务A)      │
│              │          │              │
│  OAuth2.1    │◄────────►│  业务 API    │
│  User/IAM    │  验证Token│  应用数据    │
│  Session     │          │  本地权限     │
└──────┬───────┘          └──────────────┘
       │
       ▼
┌──────────────┐
│  共享数据库    │
│  MySQL/Redis │
└──────────────┘
```

## 配置开关

通过 `.env` 控制模块加载：

**主服务器：**

```ini
SERVER_ROLE=auth
MODULE_OAUTH21=true
MODULE_USER=true
MODULE_IAM=true
MODULE_NOTICE=true
MODULE_SESSION=true
```

**子服务器：**

```ini
SERVER_ROLE=app
MODULE_OAUTH21=false
MODULE_USER=false
MODULE_IAM=false
MODULE_SESSION=true

AUTH_SERVER_URL=https://auth.example.com
AUTH_SERVER_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
```

## Token 验证

主服务器签发 JWT（RS256），子服务器用公钥验证：

```
主服务器:  私钥签名 → Access Token (JWT)
子服务器:  公钥验证 → 解析出 sub, role, scope 等 claims
```

优势：
- 子服务器验证 Token 是本地操作，零网络开销
- 公钥可以安全分发
- 即使主服务器临时不可用，已签发的 Token 仍可被验证

## 子服务器分类

| 类型 | 用户授权 | 用户数据 | 状态同步 | 典型场景 |
|------|----------|----------|----------|----------|
| 用户型 | 需要 | 有 | 需要 | 用户后台、SaaS |
| 服务型 | 不需要 | 无 | 不需要 | 定时任务、数据同步 |
| 混合型 | 部分需要 | 部分 | 部分需要 | 电商 |

## 用户状态同步

**核心原则：只通知该用户授权过的应用。**

```
Auth 服务:
  用户被封禁
    → 查询 oauth_user_approval: 该用户授权了 App A、App B
    → POST https://app-a.example.com/internal/webhook/user-state
    → POST https://app-b.example.com/internal/webhook/user-state
    → App C 不通知
```

| 变更类型 | 紧急程度 | 同步方案 |
|----------|----------|----------|
| 用户封禁/注销 | 立即 | Token 黑名单 + Webhook |
| 角色/权限变更 | 尽快 | Webhook 通知 |
| 资料更新 | 最终一致 | 短 Token 自动刷新 |

## 方案对比

| 维度 | 方案 A：配置开关 | 方案 B：独立数据库 | 方案 C：微服务 |
|------|------------------|-------------------|----------------|
| 改动量 | 小 | 中 | 大 |
| 部署复杂度 | 低 | 中 | 高 |
| 数据隔离 | 无 | 有 | 有 |
| 独立扩缩容 | 不支持 | 不支持 | 支持 |
| 适用阶段 | 初期/中期 | 中期 | 大规模 |
