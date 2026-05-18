# OAuth 2.1 授权登录全流程技术文档

本文档描述了集成 SSO (单点登录) 系统与第三方应用之间的标准授权流、接口规范及数据交互逻辑。

---

## 1. 总体流程概览

用户访问第三方应用 -> 重定向至 SSO 授权中心 -> 登录验证 -> 授权确认 -> 回调 Authorization Code -> 换取令牌。

### 核心时序说明
1. **App -> SSO**: `GET /authorize?client_id=xxx&...`
2. **SSO 判断**:
   - 若无登录 Cookie -> 返回 `action: 'login'`
   - 若已登录未授权 -> 返回 `action: 'consent'`
   - 若已登录已授权 -> 302 重定向 `redirect_uri?code=xxx` (静默登录)
3. **SSO -> App**: 回传 Code
4. **App -> SSO**: `POST /token` 换取 Access Token

---

## 2. 接口定义

### 2.1 授权入口请求 (Authorize)
**接口**: `GET /authorize`

| 参数名 | 说明 |
| :--- | :--- |
| `client_id` | 应用 ID |
| `redirect_uri` | 回调地址 |
| `scope` | 权限范围 (如 `openid profile`) |

### 2.2 授权确认 (Consent)
**接口**: `POST /authorize/consent`
**参数**: `{ sessionId, user_id, action: 'approve' }`

---

## 3. 授权范围 (Scope) 与限制
*   **格式**: JSON 数组存储，空格分隔传输。
*   **封禁**: 将 `oauth_approvals` 表中的 `status` 字段设为 `0` 即可即时阻断该应用访问，强制重新授权或提示错误。

---

## 4. SSO 体验设计
*   **静默登录 (Silent Login)**: 当满足 `(已登录) AND (已授权) AND (状态正常)` 时，系统会自动执行 302 跳转。用户表现为“点击一下应用登录，瞬间完成跳转”，无需任何手动输入。
