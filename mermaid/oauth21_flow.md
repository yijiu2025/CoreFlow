# OAuth 2.1 鉴权中心页面流转与交互关系图 (User Flow & Interactions)

本文件使用 Mermaid.js 拓扑连线图定义了 `oauth21` (鉴权中心) 前端的所有页面流转与认证/授权逻辑。

---

## 1. 全景页面连线图 (Flowchart)

```mermaid
flowchart TD
    %% 页面节点声明
    Login[登录入口 StandardLogin.vue/MiniLogin.vue]
    Register[账号注册页 RegisterView.vue]
    ForgotPassword[找回密码页 ForgotPassword.vue]
    Authorize[同意授权页 Authorize.vue]

    %% 交互连线与流转逻辑
    Login -->|没有账号? 点击去注册| Register
    Login -->|忘记密码? 点击去重置| ForgotPassword
    Login -->|输入账号密码/扫码验证成功| AuthSession{已登录?}
    
    AuthSession -->|有第三方客户端 Authorize 请求| Authorize
    
    Authorize -->|点击 '同意授权' -> 携带 Code 重定向| ClientApp[重定向回客户端 Redirect URI]
    Authorize -->|点击 '拒绝授权' -> 携带拒绝参数| CancelApp[重定向回客户端 Cancel URI]
    
    Register -->|注册成功| Login
    ForgotPassword -->|密码修改成功| Login
```

---

## 2. 核心功能及交互提示 (Functional Tooltips)

*   **登录入口 (`StandardLogin.vue`/`MiniLogin.vue`)**：
    *   *功能*：提供标准的用户名密码登录，同时支持基于 H5 签名的防爬虫防刷机制。可由第三方客户端发起授权时唤起。
*   **同意授权页 (`Authorize.vue`)**：
    *   *功能*：这是 OAuth 2.1 中的核心用户交互页面。展示第三方应用所申请的 Scope 范围权限（如 openid, profile, email），并在用户确认后，向后端请求授权码（Authorization Code），最后重定向回客户端的回调地址。
