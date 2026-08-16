# JWT sign 返回密钥对 ID

## Context

用户要求 `sign(payload)` 在返回 JWT 字符串的同时，返回实际使用的密钥对 ID（kid）。当前 JWT 的 `kid` 已写入 header（`keyid: keyName`），但调用方无法得知签名时用的是哪个 key——这使得调用方（如 token-issuer）无法将 kid 存入令牌记录或日志，也无法在返回 JWKS 时告知客户端用哪把公钥验证。

## 方案

### 改动 1：`src/framework/jwt/index.js` — `sign()` 返回 `{ token, kid }`

当前 `sign()` 返回 `Promise<string>`。改为返回 `{ token, kid }`，其中 `kid` 就是 `options.keyName`（或默认值 `DEFAULT_KEY_NAME`）：

```js
// 改动前
return jwt.sign(payload, privateKey, { algorithm, keyid: keyName, ...signOptions });

// 改动后
const token = jwt.sign(payload, privateKey, { algorithm, keyid: keyName, ...signOptions });
return { token, kid: keyName };
```

### 改动 2：`src/app/oauth21/crypto/jwt.js` — 返回解包，保持外部接口不变

`issueToken` 和 `issueIdToken` 当前直接 `return sign(payload)`。改为 `const { token } = await sign(payload); return token;`——解包后只返回 JWT 字符串，**保持对外接口不变**。

### 不改动的文件

- `src/framework/jwt/index.js` 的 `verify()` — 不需要 keyId
- `src/framework/auth/index.js` — 调用 `verify()` 不需要 keyId
- `src/api/auth/v1/session.js` — 同上
- 所有 `token.service.js` / `token-issuer.js` 等调用方 — 它们不直接调 `sign()`，只调 `issueToken()` / `issueAccessToken()` / `issueIdToken()`，这些接口不变

### 影响范围

只影响 `sign()` 的直接调用者。当前 `sign()` 的直接调用者只有 `src/app/oauth21/crypto/jwt.js`（第 56 行和第 94 行），已在改动 2 中处理。**无其他调用方需要修改。**

## 验证

1. 启动服务 `npm run dev`，确认加载无报错
2. 检查 `sign()` 返回结构：`{ token, kid }` — 确保 `token` 是 JWT 字符串，`kid` 是 `'default'`