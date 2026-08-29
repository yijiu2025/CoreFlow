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

## 十二、密钥管理（Secrets Handling）

> **最高优先级规则**：任何密钥（API Key / Secret / Token / DB 连接串）**绝不能**进 git、对话、文档、截图。

### 反模式（这些操作会立即泄露）

| ❌ 反模式 | 后果 |
|---|---|
| 把 Secret Key 贴到 IM/邮件/对话/issue | 攻击者可绕过所有验证、伪造请求 |
| 把 Secret Key 提交到 git（即使是私有仓） | 历史记录永远存在，**轮换也救不了**（已 fork/clone/镜像） |
| 把 Key 写在 `.env` 文件并提交（即使 `.env.example`） | 复制粘贴易混淆，PR review 也可能误提交 |
| 把 Key 放在前端代码（即使 build 时混淆） | 浏览器端代码 = 公开，任何用户 F12 能看到 |
| 把 Key 截图发到 IM/工单 | 图片 OCR + 截屏历史，难彻底删 |

### 正确流程（人机验证/SaaS Key 标准做法）

1. **前端 Key（site key / public key）**：
   - 可公开（设计如此），但**仍不主动泄露**
   - 放 `.env`，加 `.gitignore` 规则
   - `.env.example` 写**占位符**（`0x4AAAAAAA...`）作为格式示例
   - 部署时用部署平台 secret manager 注入（Vercel/Vercel env / Cloudflare Workers secret / K8s Secret / Vault）

2. **后端 Key（secret key / private key）**：
   - **绝不能**进前端代码、`.env`（前端环境）、git
   - 放后端 `.env`，加 `.gitignore`
   - 部署时用 secret manager 注入
   - 定期（90 天）轮换，CI/CD 自动更新

3. **如果不小心泄露了 Secret Key**：
   - 立即到对应 SaaS Dashboard **轮换**（regenerate）
   - 旧 key 立即失效
   - 检查异常日志（看是否被滥用）
   - 评估影响范围（是否影响鉴权/支付/数据）

### oauth21 的实际配置

```bash
# oauth21/.env（这是前端 .env，**不能放后端 Secret Key**）
# Turnstile Site Key（公开 key，可放前端 .env）
VITE_TURNSTILE_ENABLED=true
VITE_TURNSTILE_SITE_KEY=<从 Cloudflare Dashboard 复制 site key>

# ⚠️ Turnstile Secret Key（**绝不放前端 .env！**）
# 放后端 .env（src/ 同级的 server .env，不在 oauth21/ 目录）：
# TURNSTILE_SECRET_KEY=<从 Cloudflare Dashboard 复制 secret key>
# 后端用 secret key 调 https://challenges.cloudflare.com/turnstile/v0/siteverify 验证
```

### 检测机制（推荐 CI 加）

- **git-secrets**（[git-secret-mirror](https://github.com/awslabs/git-secrets)）：commit hook 自动检测常见 key pattern（AKIA / 0x4AAAA / AIzaSy / sk- 等）
- **TruffleHog / gitleaks**：扫描整个 git 历史，已泄露的 key 即使在历史 commit 也能发现

### 历史教训（本项目）

- 2026-08-29 开发者曾在对话中贴出 Cloudflare Turnstile site key + secret key
- 立即建议轮换（因为 key 一旦公开，**唯一**补救是 Cloudflare Dashboard regenerate）
- 当前 .env 仍是占位符，未把真实 key 写入仓库

## 十三、审计日志

| 日期 | 审计人 | 范围 | 发现 | 修复 |
|---|---|---|---|---|
| 2026-08-29 | AppSec 自动化 + 人工 | 47 文件全量 | 3 Medium（生产 console / 死代码 / 限流） | 全部修复（本次 commit） |
| 2026-08-29 | AppSec 集成 | 人机验证 | hCaptcha 国内加载慢；新需求支持 Turnstile | 加 useTurnstile/useCaptcha（前端）；recaptcha service 加 _verifyTurnstile（后端） |

## 十四、Turnstile 端到端集成清单

### 启用顺序

1. **Cloudflare Dashboard** 创 Invisible widget + 域名白名单
2. **轮换** Secret Key（**必须**先轮换再填新值）
3. **后端 .env**（部署时用 secret manager 注入，**不**提交 git）：
   ```bash
   RECAPTCHA_ENABLED=true
   RECAPTCHA_PROVIDER=turnstile
   TURNSTILE_SECRET_KEY=<新 secret key>     # ⚠️ 仅后端
   TURNSTILE_SITE_KEY=<新 site key>          # 后端记录，前端用
   ```
4. **前端 .env**（**只**填 site key）：
   ```bash
   VITE_TURNSTILE_ENABLED=true
   VITE_TURNSTILE_SITE_KEY=<同后端 SITE_KEY>  # 公开 key
   ```
5. **后端代码已就位**（[src/framework/verify/recaptcha/service.js](../../src/framework/verify/recaptcha/service.js#L133)）：
   - `provider === 'turnstile'` 自动用 `_verifyTurnstile`
   - 调 `https://challenges.cloudflare.com/turnstile/v0/siteverify`
   - 失败返 400 `人机验证失败`
6. **前端代码已就位**（[oauth21/src/composables/useCaptcha.ts](../../oauth21/src/composables/useCaptcha.ts)）：
   - 3 个 register 组件用 `useCaptcha('register')` 自动选 Turnstile
   - `getToken()` 拿 token 随 `authApi.register` 提交
7. **测试端到端**：
   - dev 打开 `/m/register`（移动端）或 `/register`（PC）
   - 填邮箱 → 收图形码 → 发邮箱码 → 收邮箱码 → 提交
   - 后端日志看 `[Turnstile] Cloudflare API 请求失败` 或 `success: true`
   - Network 面板看 `challenges.cloudflare.com/turnstile/v0/siteverify` 200 OK
8. **轮换后清理**：
   - 检查 access log（Cloudflare Dashboard → Turnstile → Analytics）有无异常
   - 旧 secret key 立即失效（轮换后）

### dev 跳过验证的临时方案（仅 dev！）

如果 Cloudflare 端配置未完成，**不**写真实 key 到 dev .env——加：

```bash
# 后端 .env（dev only）
RECAPTCHA_ENABLED=false  # 完全跳过验证（注册流程不受影响）
```

生产前必设 `RECAPTCHA_ENABLED=true` + 真实 key。
