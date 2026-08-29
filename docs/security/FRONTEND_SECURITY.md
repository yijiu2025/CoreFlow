# oauth21 前端安全清单

> 适用于 oauth21 及其同技术栈前端项目（Vue 3 + Vite + TypeScript）。
> 参考 OWASP Top 10 + fullstack-rules security.md 沉淀。

## 一、生产构建安全配置（vite.config.js）

```js
build: {
  // 生产构建删除所有 console 调用（防 Error 堆栈泄露到浏览器 DevTools）
  esbuild: { drop: ['console'] },
  // 生产不输出 .map 文件（防源码泄露到 dist）
  sourcemap: false,
}
```

**关键**：
- dev 模式 console 仍可用（仅 build 时 drop）
- sourcemap: false 防生产 dist 暴露源码（需调试时单独开）
- chunkSizeWarningLimit 调高到 1024KB（OAuth 登录页组件较大是合理的）

## 二、错误上报（替代 console.error）

`src/composables/useErrorReporter.ts`：
- dev 模式：`console.warn` 留痕
- 生产模式：fetch 上报到 `/api/v1/client-error`（1.5s 超时，失败静默）
- 字段：`message/errorType/info/url/userAgent/digest/timestamp`
- **不传 stack**（防源码位置泄露）

后端**必须**提供 `/api/v1/client-error` 端点（POST 接收，写日志/告警系统）。
缺失端点时 fetch 静默失败，不阻塞主流程。

## 三、ESLint 安全规则（eslint.config.js）

```js
rules: {
  'vue/no-v-html': 'error',                  // 禁用 v-html（防 XSS）
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',                   // 禁止 javascript: URL
  'no-console': ['error', { allow: ['warn', 'error'] }],  // 禁 log/info/debug
  'no-empty': ['error', { allowEmptyCatch: true }],
}
```

**注意**：`no-console: error` + `build.esbuild.drop: ['console']` 双重保护——dev lint 报错强制规范，build drop 兜底防漏网。

## 四、安全实践（oauth21 现状）

### 4.1 认证与 Token

- **token 不落 localStorage**：Session 模式 cookie + httpOnly（后端负责）；JWT 模式由父应用决定
- **H5 签名双因子**：sessionKey（cookie 下发）+ appKey（前后端共享 env 变量）
- **签名覆盖 query 参数**：path + body + params 全部纳入签名串，防 query 篡改
- **nonce 密码学安全随机**：`crypto.getRandomValues`（防重放）

### 4.2 跨域通信

- **postMessage 100% 走 postToParent**：白名单 origin + ancestorOrigins（不可伪造）双校验
- **禁用 `postMessage(..., '*')`**：绕过了 origin 校验，恶意父窗口能截获

### 4.3 加密

- **RSA-OAEP + SHA-256**（Web Crypto API）：密码传输
- **公钥缓存**：localStorage 存 JWK 格式（非明文），带 kid 标识
- **设备码 + 复合指纹**：device_id（cookie + localStorage）+ device_fingerprint（canvas + WebGL 哈希）

### 4.4 输入防护

- **v-html 零使用**（强制 ESLint 规则）
- **eval / new Function / document.write 零使用**（强制 ESLint 规则）
- **H5 签名绑定 path + body + params**：防 URL/参数注入

### 4.5 死代码零容忍

- **md5.ts 已删除**（2026-08-29）：MD5 弱算法，零引用
- **sign.ts 弱 RNG 函数已删除**：generateDeviceId/generateMid/generateUuid
- **jsencrypt 依赖已删除**：零引用

## 五、依赖管理

```bash
# 定期跑 audit（package.json 已加 scripts）
npm run audit            # moderate 级别失败
npm run audit:fix        # 自动修复
```

**建议接入 Dependabot**（GitHub）：自动检测依赖 CVE，PR 提醒更新。

## 六、按钮防双击

`src/composables/useButtonLock.ts`：
- 提交类按钮在请求未完成时禁用
- 最小锁定 500ms（防接口太快响应看不到禁用态）
- 用法：`<button :disabled="lock.locked.value" @click="onSubmit">`

**注意**：`stores/auth.ts:11` 的 `loading` ref 已部分实现此能力，**useButtonLock 适合非 auth 场景**（如图形码弹窗的"确定"按钮）。

## 七、上线前必查清单

### 协议合规
- [ ] `agreementConfig.ts` 占位符全部替换（OPERATOR/地址/信用代码/DPO邮箱/电话）
- [ ] DPO 邮箱是企业域名（非 qq/163/gmail）
- [ ] 隐私政策生效日期正确

### 部署配置
- [ ] 生产环境 `VITE_API_BASE_URL` 是 HTTPS
- [ ] 后端返回 CSP 响应头（`Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'`)
- [ ] 后端启用 SRI（SubResource Integrity）—— PWA 资源完整性校验
- [ ] `build.sourcemap: false` 已配置（防源码泄露）
- [ ] `build.esbuild.drop: ['console']` 已配置（防错误堆栈泄露）

### 后端配合
- [ ] 提供 `/api/v1/client-error` 端点（接收前端错误上报）
- [ ] H5 签名 Redis 存 nonce（防 2min 内重放）
- [ ] 后端 setCookie `Secure` flag（生产必须 HTTPS）

## 八、CSP 建议（后端）

```js
// Fastify helmet 插件或手动 Set-Cookie header
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],                    // 禁 inline script
      styleSrc: ["'self'", "'unsafe-inline'"],   // Vue scoped CSS 需要
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https://api.your-domain.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],               // 防 clickjacking
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  }
}))
```

## 九、限流加固

- **前端**：`useButtonLock` 防止双击；`request.ts` 拦截器无法做限流（拦截器在请求层）
- **后端**：所有写接口（登录/注册/忘记密码/二次验证/授权）需有 IP + 账号维度限流
- **验证码**：图形码 5-10 次/小时，邮箱码 3-5 次/小时

## 十、监控建议

1. **接入 SAST**（Semgrep / SonarQube）：CI 卡门槛
2. **接入前端监控**（Sentry / Fundebug / 自建 `/api/v1/client-error`）
3. **依赖定期 audit**（`npm audit` + Dependabot）
4. **关键事件告警**（登录失败/邮箱码频繁请求/风险拦截触发）
5. **定期代码审计**（每季度一次，重点：认证/输入校验/依赖更新）

## 十一、未来扩展（按优先级）

| 优先级 | 项 | 说明 |
|---|---|---|
| P1 | 接入 Sentry | 替换 useErrorReporter 的自建上报，专业平台自动去重/source map 解析 |
| P1 | 后端 Redis 存 nonce | 防 H5 签名 2min 重放 |
| P2 | 接入 Semgrep | 每次 PR 跑安全规则 |
| P2 | Dependabot | 自动依赖更新 PR |
| P2 | CSP 头 | 后端设 Content-Security-Policy |
| P3 | SubResource Integrity | PWA 资源 SRI |
| P3 | 密钥管理 | appKey 用 HashiCorp Vault/云 KMS 替换 env 直读 |

## 十二、严禁的反模式

| 反模式 | 原因 |
|---|---|
| `postMessage(..., '*')` | 绕过 origin 校验，恶意父窗口能截获 |
| `localStorage.setItem('token', ...)` | XSS 可窃取（应 httpOnly cookie） |
| `v-html="userInput"` | 直接 XSS（用 `{{ }}` 插值自动转义） |
| `eval()` / `new Function()` | 代码注入 |
| `Math.random()` 用于安全场景 | 弱随机数（用 `crypto.getRandomValues`） |
| `console.error(err)` 生产 | 堆栈泄露（用 `useErrorReporter` 上报） |
| `MD5/SHA1/DES/RC4` 加密 | 已被攻破（用 SHA-256+ / bcrypt） |

## 十三、审计日志

| 日期 | 审计人 | 范围 | 发现 | 修复 |
|---|---|---|---|---|
| 2026-08-29 | AppSec 自动化 + 人工 | 47 文件全量 | 3 Medium（生产 console / 死代码 / 限流） | 全部修复（本次 commit） |
