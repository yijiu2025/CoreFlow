# OAuth 2.1 登录与授权流程架构 (Login & Consent Flow Architecture)

本文档阐明了系统中统一身份认证 (SSO) 与子应用 (以 Firewall 防火墙为例) 之间的快捷登录、单点登录以及动态授权流程。

## 1. 整体登录逻辑时序图 (SSO Login Flow)

```mermaid
sequenceDiagram
    autonumber
    participant App as Firewall 子应用的前台 (Iframe/Page)
    participant SSO_FE as SSO 快捷登录前端 (MiniLogin.vue)
    participant SSO_BE as SSO 授权中心后端 (auth.js)
    participant DB as 数据库 (Users / Approvals / Clients)

    Note over App, SSO_FE: 1. 弹出登录窗口并拉取快捷登录
    App->>SSO_FE: 嵌套加载 /mini-login?appName=firewall
    SSO_FE->>SSO_BE: 请求验证码或获取图形验证码

    Note over SSO_FE, DB: 2. 用户身份凭证校验 (邮箱验证码 / 密码)
    SSO_FE->>SSO_BE: 提交登录请求 POST /oauth2.1/login (含加密凭证及 client_id: 'firewall')
    SSO_BE->>DB: 校验账户 & 验证码/密码是否正确
    alt 凭证无效
        SSO_BE-->>SSO_FE: 返回 400 (invalid_grant)
    else 凭证有效
        Note over SSO_BE, DB: 3. 校验应用授权状态 (Consent Check)
        SSO_BE->>DB: 查询是否已有该用户对 firewall 应用的有效授权
        alt 未授权 (No Consent)
            SSO_BE->>SSO_BE: 创建 5分钟临时会话并生成 consentKey
            SSO_BE-->>SSO_FE: 返回 { action: 'consent', consentKey, client_name, scope, user }
            Note over SSO_FE: 展示授权确认面板 (确认申请邮箱/基础资料权限)
            SSO_FE->>App: 用户进行授权确认中 (SSO 界面改变)
            SSO_FE->>SSO_BE: 点击同意，提交 POST /oauth2.1/login/consent/confirm (携带 consentKey)
            SSO_BE->>DB: 写入永久/有效授权记录 (oauth_approvals 表)
        end
        
        Note over SSO_BE, DB: 4. 签发 OAuth2.1 / OIDC 凭证
        SSO_BE->>DB: 签发并在 Redis/Db 中存储 AccessToken / RefreshToken
        SSO_BE-->>SSO_FE: 返回最终 Token 数据 { access_token, id_token, refresh_token, user }
    end

    Note over SSO_FE, App: 5. 跨域传递消息，完成登录状态同步
    SSO_FE->>App: window.parent.postMessage({ type: 'LOGIN_SUCCESS', token, user })
    Note over App: 接收数据，保存登录状态，关闭弹窗，刷新 HUD 界面
```

---

## 2. 详细后端判断逻辑流程 (Backend Guard Flow)

```mermaid
flowchart TD
    Start([收到登录请求 handleDirectLogin]) --> VerifyCred[验证身份凭据: 密码或验证码]
    VerifyCred --> IsValid{凭据是否正确?}
    IsValid -- 否 --> ReturnError[返回 400/401 错误]
    
    IsValid -- 是 --> CheckClient[查询客户端 OauthClient 属性]
    CheckClient --> IsFirstParty{是否为一方应用/Portal?}
    
    IsFirstParty -- 是 (如 first-party-app) --> Issue[直接签发 Token & 用户信息]
    
    IsFirstParty -- 否 (三方或子系统如 firewall) --> CheckConsent[查询 oauth_approvals 是否已授权过该 scope]
    CheckConsent --> IsConsented{已存在授权?}
    
    IsConsented -- 是 --> Issue
    
    IsConsented -- 否 --> GenSession[生成唯一 consentKey & 将未决的 userId, clientId 存入 consent_session]
    GenSession --> ReturnConsent[返回 action: 'consent' 告知前端需要授权]
    
    ReturnConsent --> WaitUser[等待用户点击同意授权]
    WaitUser --> ConfirmConsent[调用 /login/consent/confirm 接口]
    ConfirmConsent --> WriteDb[在 oauth_approvals 插入/更新授权数据]
    WriteDb --> Issue
    
    Issue --> End([返回成功令牌，通过 PostMessage 广播给主页面])
```

---

## 3. 设计亮点与安全防范

1. **授权会话 (Consent Session)**:
   在需要用户点击同意授权时，没有直接让用户重新登录。因为如果是邮箱验证码登录，验证码是**一次性消费**的，第二次提交会直接失效。
   使用 `consentKey` 换取临时身份凭证，避免了让用户重新输入或重新发送验证码的糟糕体验，且 `consentKey` 仅限一次性使用且具有 5 分钟超时限制。

2. **多端平滑兼容**:
   在 `MiniLogin.vue` 中，当登录成功后同时广播：
   - `SSO_SUCCESS`：保证统一认证平台的第三方 OAuth/OIDC 默认客户端正常监听。
   - `LOGIN_SUCCESS`：与 Firewall 等需要快速同步 `user` 对象的精简 HUD 子应用完美对齐。
