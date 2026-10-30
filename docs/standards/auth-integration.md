# 认证集成 {#frontend-auth}

> ⚠️ **安全基线（必须遵守）**：默认使用 **HttpOnly Session Cookie**（`withCredentials: true`，由后端下发/续期）。
> **不要把高权限长期 Token 存进 `localStorage`/`sessionStorage`** —— XSS 可被直接读取并持久化窃取。
> Bearer Token 仅用于**独立的 API 客户端**（服务端集成 / 移动端），此时才需要显式管理
> Token 生命周期、吊销与轮换，并说明与 Cookie 会话不同的 CSRF/XSS 防护边界。

## auth Store 标准实现

**推荐形态：store 不持有凭证**。会话由后端 `sid` HttpOnly Cookie 承载，前端只维护
「请求进行中」这类 UI 态；登录态靠 `/user/v1/userinfo` 探活得出，而不是靠本地有没有 token。
参考实现 `oauth21/src/stores/auth.ts`（只有 `loading` + `login()`）。

```typescript
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { loginApi } from '@/api';

export const useAuthStore = defineStore('auth', () => {
  const loading = ref(false);

  async function login(payload: Record<string, unknown>): Promise<unknown> {
    loading.value = true;
    try {
      return await loginApi.login(payload);
    } finally {
      loading.value = false;
    }
  }

  return { loading, login };
});
```

登录态与用户信息的判定走独立 API，不落盘：

```typescript
// 路由守卫里调用；401 即未登录，直接跳登录页
const user = await getUserInfo(); // GET /user/v1/userinfo
const permissions = await getPermissions(); // GET /user/v1/permissions
```

> ⚠️ 历史版本曾把 `token` / `user` / `roles` / `permissions` 序列化进 `localStorage`。
> 这套写法已在 `oauth21` 删除：`localStorage` 里的权限快照**会过期而不自知**
> （后端改权限后前端仍按旧快照放行 UI），且任何 XSS 都能读走。**不要把它抄回来。**

### 独立 API 客户端（无 Cookie 场景）

服务端集成、移动端、CLI 这类拿不到 Cookie 的场景才用 Bearer：

- access_token 只放**进程内存**（变量 / 内存缓存），**不落 `localStorage`**；
- refresh_token 交给操作系统钥匙串或安全存储；
- 每次请求注入 `Authorization: Bearer <token>`，401 时按 refresh_token 续期。

## 权限指令

```vue
<!-- 权限控制：无权限元素从 DOM 移除 -->
<button v-auth="'config:write'">保存</button>
<button v-auth="['config:write', 'config:delete']">操作</button>

<!-- 角色控制 -->
<button v-role="'admin'">管理</button>
<button v-role="['admin', 'operator']">操作</button>
```

> 前端权限指令只负责**别把按钮画出来**，不是安全边界 —— 真正的拦截在后端守卫，
> 且判据是 **deny 优先 + 通配**（`denies` 命中即拒绝，与 `allows` 是否命中无关）。

## HTTP 请求封装

```typescript
import axios from 'axios';

const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 10000,
  withCredentials: true // 跨域也要带 Cookie（后端需 CORS 白名单 + credentials）
});

// 请求拦截：Cookie 会话由浏览器自动携带，前端不注入任何 token。
service.interceptors.request.use(config => {
  // 若该路由声明了 requireSignature（如 /oauth2.1 下的 H5 接口），
  // 这里补 x-device-id / 时间戳 / 签名，见「请求签名」一节。
  return config;
});

// 响应拦截：统一解包 + 401 单点处理
service.interceptors.response.use(
  response => {
    const res = response.data;
    if (res.code === 200) return res.data;
    return Promise.reject(new Error(res.message));
  },
  error => {
    if (error.response?.status === 401) {
      // 统一走 intercept401：清本地状态 → 跳登录，且同一请求只重试一次，防无界重放
    }
    return Promise.reject(error);
  }
);

export default service;
```

## 请求签名（`/oauth2.1` 作用域）

后端中间件 `initOAuthMiddleware` 只对 **`/oauth2.1` 前缀**生效（`/oauth2.10` 不误命中），
且仅在路由声明 `config.requireSignature` 为真时校验。判据：

| 情况 | 结果 |
| --- | --- |
| 路由未声明 `requireSignature` | 放行（公开路由不受影响） |
| 缺签名 / 缺时间戳 / 签名不匹配 | **403** |
| 时间戳超出允许窗口 | **403** |
| 首次访问（无 `_m_h5_tk`） | 下发 `_m_h5_tk`，本次不判失败 |

前端要做的就是：从 `_m_h5_tk` cookie 取 token，按后端约定的串拼接后放进请求头，
并带上 `x-device-id`。签名算法见 `src/framework/auth/signature.js`。

## CSRF（当前未启用，接入前先读）

后端 oauth21 的 CSRF 钩子**目前没有生效**（钩子注册在封装作用域内，覆盖不到根作用域路由，
详见修复状态文档的 U21）。启用前必须同时满足：

1. 前端所有非 GET 请求带上 `x-csrf-token`，值与 `_csrf` cookie 一致；
2. 登录 / 注册 / 改密等公开 POST 也要带（否则一刀切 403）；
3. 先灰度到 `/oauth2.1` 前缀，再评估其他前端。

**在此之前不要在前端硬编码"已开启 CSRF"的假设**，也不要新增依赖它的逻辑。

## 后端接口清单

### 认证相关

前缀来自 `src/api/<域>/<域>.json` 的 `prefix`（oauth21 是 `/oauth2.1`，**没有** `v1` 段；
用户域是 `/user` + 路由内的 `/v1`）。以实际前端调用为准：

| 接口                             | 方法 | 说明                       |
| -------------------------------- | ---- | -------------------------- |
| `/oauth2.1/login`                | POST | 标准登录（RSA 加密密码）   |
| `/oauth2.1/mini-login`           | POST | 快捷登录（允许 iframe）    |
| `/oauth2.1/login/consent/confirm`| POST | 快捷登录确认授权           |
| `/oauth2.1/login/verify-email`   | POST | 环境异常后的邮箱二次验证   |
| `/oauth2.1/logout`               | POST | 登出                       |
| `/user/v1/register`              | POST | 注册                       |
| `/user/v1/userinfo`              | GET  | 获取当前用户信息           |
| `/user/v1/permissions`           | GET  | 获取当前用户权限           |
| `/auth/v1/verify-challenge`      | POST | 校验图形验证码             |
| `/verify/v1/send-login-verify-code` | POST | 发送登录验证码          |
