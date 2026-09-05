# stable-deviceid

[English](./README.md) | 简体中文

为现代 Web 应用提供**稳定、可自愈**的设备身份标识。

`stable-deviceid` 解决浏览器设备标识在实际生产中的全部痛点：用户或 Safari ITP 清除存储、客户端与服务端时钟偏差、多标签页竞态、iframe SSO 下各 origin 身份分裂。内置隐私友好的设备指纹采集（默认关闭）与 axios 一站式接入，一行代码完成全部配置。

## 特性

- **结构化设备 ID** — `{PLATFORM}-{ENCODED_TS}-{RANDOM}`（如 `WEB-DaBOSbNdSuc-8s4T`）：毫秒时间戳位混淆（64 位魔数 XOR → Base62）+ 6 字符高熵随机后缀（`crypto.getRandomValues` 拒绝采样）
- **自愈能力** — 损坏 / 老格式 / 过期 / 未来时间的存量 ID 本地自动重生；服务端校验失败一轮往返即收敛
- **响应头同步** — 服务端可通过 `X-Device-Id` 下发权威 ID，客户端持久化后下一个请求立即生效
- **SSO 身份归一** — iframe SSO 场景下子应用采纳身份域的权威 ID，同一物理设备全端同一身份
- **安全内建** — 本地校验与后端逐条对齐（平台枚举、长度、Base62 字符集、含 ±5 分钟时钟偏差容差的未来时间拒绝、365 天有效期）、脏值拒绝、超长头过滤、日志截断
- **隐私友好** — canvas + WebGL 指纹**默认关闭**；存储访问静默降级内存层，不抛异常
- **零依赖** — ESM-only、tree-shaking 友好（`sideEffects: false`）、TypeScript 类型完备、93 个单元测试

## 安装

```bash
npm install stable-deviceid
```

要求 Node.js >= 18（仅构建环境；运行时面向现代浏览器）。

## 快速开始

### axios 一站式接入（推荐）

```ts
import axios from 'axios';
import { setupDeviceSync } from 'stable-deviceid';

const http = axios.create({ baseURL: '/api', withCredentials: true });
setupDeviceSync(http);
```

`setupDeviceSync` 自动完成：

1. 请求拦截器注入 `x-device-id` 头（内存缓存直读，近乎零开销）
2. 按需注入设备指纹头 `x-device-fp`（见[设备指纹](#设备指纹默认关闭隐私友好)）
3. 响应拦截器同步响应头下发的设备 ID
4. 跨标签页 storage 监听（幂等）

```ts
// 可选配置
setupDeviceSync(http, {
  fingerprint: true,                    // 强制开启指纹（默认按环境判定）
  onDeviceIdChange: (oldId, newId) => { /* 设备身份变更回调 */ }
});

// 卸载拦截器（HMR / 单测场景）
const dispose = setupDeviceSync(http);
dispose();
```

### 原生 fetch / 显式带头

```ts
import { getDeviceHeaders } from 'stable-deviceid';

fetch('/api/profile', { headers: { ...getDeviceHeaders() } });
```

### 手动拦截器（细粒度控制）

```ts
import {
  getStableDeviceId,          // 稳定设备 ID（持久化 + 内存缓存）
  getDeviceFingerprint,       // 指纹（异步，32 位 hex）
  isDeviceFingerprintEnabled, // 指纹开关判定
  handleDeviceSyncInResponse, // 响应头同步（传 axios response）
  initDeviceSync              // 全局初始化（跨标签页监听，幂等）
} from 'stable-deviceid';

http.interceptors.request.use(async config => {
  config.headers['x-device-id'] = getStableDeviceId();
  if (isDeviceFingerprintEnabled()) {
    try {
      config.headers['x-device-fp'] = await getDeviceFingerprint();
    } catch { /* 指纹采集绝不阻断请求 */ }
  }
  return config;
});

http.interceptors.response.use(response => {
  handleDeviceSyncInResponse(response);
  return response;
});
```

## API 参考

| 导出 | 说明 |
| --- | --- |
| `setupDeviceSync(instance, options?)` | axios 一站式接入，返回 dispose 函数 |
| `getDeviceHeaders()` | 同步返回 `{ 'x-device-id': id }`，供 fetch / 显式带头 |
| `getStableDeviceId()` | 稳定设备 ID（首次生成，终身复用） |
| `getCurrentDeviceId()` / `setDeviceId(id)` / `clearDeviceId()` | 读取 / 校验写入 / 清除 |
| `adoptDeviceId(id)` | 采纳 SSO 权威域 ID（格式 + 平台段双校验，跨 origin 归一） |
| `validateDeviceIdFormat(id)` | 本地格式校验 → `{ valid, reason? }` |
| `parseDeviceId(id)` | 解析 ID 元信息（platform / timestamp / age），非法返回 null |
| `syncDeviceFromHeaders(headers, options?)` | 响应头同步（兼容 Headers / AxiosHeaders / 普通对象） |
| `handleDeviceSyncInResponse(response, options?)` | 响应拦截器集成（axios / fetch Response 均可） |
| `initDeviceSync(options?)` | 全局初始化：跨标签页监听 + 变更回调（幂等） |
| `getDeviceFingerprint()` / `isDeviceFingerprintEnabled()` | 指纹采集（Promise 缓存、并发去重）与开关判定 |
| `sha256(message)` | SHA-256（Web Crypto 优先，非安全上下文自动降级纯 JS） |
| `getDeviceIdStats()` | 调试统计（当前 ID / 解析信息 / 来源） |

常量：`STORAGE_KEY`、`MAX_AGE_DAYS`（365）、`CLOCK_SKEW_TOLERANCE_MS`（±5 分钟）、`DEVICE_PLATFORMS`、`RANDOM_SUFFIX_LENGTH`。

## SSO 跨 origin 身份归一

当应用以 iframe 嵌入不同 origin 的 SSO 登录页（如 OAuth 授权页）时，各 origin 本会各持一份设备 ID。在登录成功消息中由身份域下发权威 ID，子应用在 **bindSession 之前**采纳，绑定请求即携带统一身份：

```ts
window.addEventListener('message', event => {
  // 生产环境务必校验 event.origin 与 event.source（此处省略）
  if (event.data?.type === 'LOGIN_SUCCESS' && event.data.deviceId) {
    adoptDeviceId(event.data.deviceId); // 包内做格式 + 平台段双校验
  }
});
```

## 设备指纹（默认关闭，隐私友好）

```html
<!-- 方式一：服务端/模板注入 meta 开关 -->
<meta name="device-fp" content="true" />
```

```bash
# 方式二：Vite 环境变量
VITE_DEVICE_FINGERPRINT=true
```

```ts
// 方式三：显式配置（非 Vite 构建器推荐）
setupDeviceSync(http, { fingerprint: true });
```

采集维度：canvas 渲染差异 + WebGL renderer/vendor，SHA-256 取前 32 位 hex。结果以 Promise 缓存：并发调用去重，采集失败（headless / 反指纹浏览器）返回空串而非常量哈希，防止误匹配。

## 安全设计

- **前后端校验对齐** — 本地规则与后端 `validateDeviceId` 逐条一致，非法存量 ID 本地即重生，避免每请求重生循环
- **脏输入防御** — 响应头超 128 字符忽略、日志截断外部输入、`setDeviceId` 拒绝非法写入
- **缓存一致性** — 任何身份写入立即失效内存缓存，下一请求即生效
- **优雅降级** — 隐私模式 / 存储故障静默降级内存层，不抛异常、不中断请求链路

## 设备 ID 格式

```
{PLATFORM}-{ENCODED_TIMESTAMP}-{RANDOM_SUFFIX}
示例：WEB-DaBOSbNdSuc-8s4T
```

- `PLATFORM` — `WEB` / `IOS` / `ANDROID`（UA 检测）
- `ENCODED_TIMESTAMP` —（毫秒时间戳 − 2024-01-01 偏移）XOR 64 位黄金比例魔数 → Base62，固定 11 字符
- `RANDOM_SUFFIX` — 6 字符 Base62（约 35.7 bit 熵），拒绝采样无模偏差

## 在 nodeServers monorepo 内开发

workspace 内前端通过 Vite alias 直连源码消费（开发体验保持 bundler 原生）：

```ts
// vite.config.ts
resolve: { alias: { 'stable-deviceid': fileURLToPath(new URL('../packages/shared-device/src/index.ts', import.meta.url)) } }
```

```json
// tsconfig.json
"paths": { "stable-deviceid": ["../packages/shared-device/src/index.ts"], "stable-deviceid/*": ["../packages/shared-device/src/*"] },
"include": ["src/**/*.ts", "../packages/shared-device/src/**/*.ts"]
```

各应用 `package.json` 中 `"stable-deviceid": "*"` 供 workspace 链接。

## 构建与发布（维护者）

```bash
cd packages/shared-device
npm run build     # esbuild 逐模块转换 → dist/ + tsc 产出 dist/index.d.ts
npm publish       # prepack 自动构建；ESM-only，access: public
```

## 前后端分离部署

包本身只依赖 `x-device-id` / `X-Device-Fp` 请求头与响应头（CORS 需放行 `x-device-id`、
`X-Device-Fp`、`credentials: true`），无 cookie 读写，天然支持前后端分离部署。
但后端的 **session cookie 与 device_id 兜底 cookie 默认 `SameSite=Lax`**，跨站直连时浏览器不会携带。两种部署形态：

| 形态 | 配置 | 说明 |
| --- | --- | --- |
| ① 同域反代（**推荐**） | 前端静态资源与 `/api` 同域（nginx 转发），无需任何额外配置 | `SameSite=Lax` 正常工作，CSRF 防御最佳 |
| ② 跨子域（app.example.com ↔ api.example.com） | 后端设 `COOKIE_DOMAIN=.example.com` | 主域 cookie 全子域共享，`Lax` 对同站子域请求仍会携带 |
| ③ 真跨站（完全不同域名） | 后端设 `COOKIE_SAMESITE=none` + `COOKIE_SECURE=true`（HTTPS 必需）+ CORS 放行 | 会扩大 CSRF 暴露面，务必配合 CSRF 防御措施 |

后端环境变量（服务端 cookie 策略，与本包无关但影响设备身份兜底恢复）：
`COOKIE_SAMESITE`（lax/none/strict，默认 lax）、`COOKIE_SECURE`（默认生产 true）、
`COOKIE_DOMAIN`（默认不设）。

## 已知限制

- 隐私模式下存储降级为会话内内存 ID，刷新即变（有 `console.warn` 告警）
- `isDeviceFingerprintEnabled` 依赖 `import.meta.env`（Vite）与 DOM；非 Vite 消费方请用 meta 标签或 `fingerprint` 选项
- 极旧浏览器无 `crypto.getRandomValues` 时随机后缀降级 `Math.random`（有告警；仅影响唯一性不影响安全性）
- Safari ITP 会清除脚本可写存储，需配合服务端 httpOnly cookie 兜底恢复机制实现完全连续性

## 许可证

[MIT](./LICENSE) © 2026 qirly
