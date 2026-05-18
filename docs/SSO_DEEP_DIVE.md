# SSO 授权登录深度技术解析

本手册旨在通过图解方式，深入剖析 SSO 认证中心与第三方应用（Client）之间的数据交互链路。

---

## 1. 核心业务流程图 (Detailed Sequence)

```mermaid
sequenceDiagram
    participant App as 第三方应用 (Client)
    participant Browser as 浏览器 (Cookie)
    participant SSO as SSO 认证中心
    participant UI as 登录/授权页 (Vue)

    App->>Browser: 引导登录
    Browser->>SSO: GET /authorize (携带 Cookie)
    
    alt A: 未登录
        SSO-->>Browser: { action: 'login' }
        Browser->>UI: 展示登录组件
        UI->>SSO: POST /authorize/login
        SSO-->>UI: { action: 'consent' }
    else B: 已登录未授权
        SSO-->>Browser: { action: 'consent' }
    end

    UI->>Browser: 展示 Authorize.vue
    UI->>SSO: POST /authorize/consent (批准)
    SSO-->>Browser: 302 重定向 ?code=xxx
    Browser->>App: 提交 Code
    App->>SSO: POST /token
    SSO-->>App: 返回 Access Token
```

---

## 2. 状态逻辑判定

1. **CheckCookie**: 检查浏览器是否有 SSO 会话。
2. **CheckApproval**: 检查数据库 `oauth_approvals` 中 `status=1` 的记录。
3. **SilentFlow**: 若以上皆满足，直接重定向回应用。

---

## 3. 封禁逻辑
通过设置 `oauth_approvals.status = 0`，管理员可以立即终止特定用户对特定 App 的访问权。
