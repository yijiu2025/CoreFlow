# stable-deviceid

跨端一致的现代浏览器设备身份库。为 Web 应用提供**稳定、可自愈、隐私友好**的设备标识：
结构化稳定设备 ID（生成 / 校验 / 自愈）、canvas + WebGL 设备指纹（默认关闭）、
HTTP 响应头身份同步、SSO 跨 origin 身份归一、axios 一站式接入。

> 设计目标：设备 ID 一经生成终身复用——用户清除缓存可自动恢复（httpOnly cookie 兜底）、
> 时钟偏差不引起身份漂移（±5 分钟容差）、多标签页实时同步、同设备跨应用（SSO iframe）归一为同一身份。

## 特性

- 🆔 **结构化设备 ID**：`{PLATFORM}-{ENCODED_TS}-{RANDOM}`（如 `WEB-DaBOSbNdSuc-8s4T`），
  时间戳位混淆 + Base62 编码 + 高熵随机后缀（`crypto.getRandomValues` 拒绝采样）
- 🔁 **自愈能力**：损坏 / 老格式 / 过期 / 未来时间的存量 ID 自动重生；服务端校验失败自动收敛（一轮往返）
- 🔄 **响应头同步**：服务端可下发权威 ID（`X-Device-Id`），客户端写回后下一请求立即生效
- 🧩 **SSO 跨 origin 归一**：oauth21 式 iframe 登录场景，子应用采纳权威域 ID，同物理设备全端同身份
- 🛡 **安全内建**：与后端校验规则逐条对齐、脏值拒绝、超长头忽略、日志截断、SSO 消息双重校验
- 🤫 **隐私友好**：设备指纹默认关闭，需显式启用；存储层静默降级，不抛异常
- 📦 **零依赖**：ESM-only、tree-shaking 友好（`sideEffects: false`）、TypeScript 类型完备

## 安装

```bash
npm install stable-deviceid
```

要求 Node.js >= 18（仅构建环境；运行时为现代浏览器）。

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
2. 按需注入设备指纹头 `x-device-fp`（默认按环境判定，见下方指纹开关）
3. 响应拦截器同步服务端下发的设备 ID（写回存储 + 失效内存缓存）
4. 注册跨标签页 storage 监听（幂等）

```ts
// 可选配置
setupDeviceSync(http, {
  fingerprint: true,                    // 强制开启指纹（默认按 meta/env 判定）
  onDeviceIdChange: (oldId, newId) => { /* 设备 ID 变更回调 */ }
});

// dispose：卸载拦截器（HMR / 单测场景）
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
  getDeviceFingerprint,       // 设备指纹（异步，32 位 hex）
  isDeviceFingerprintEnabled, // 指纹开关判定
  handleDeviceSyncInResponse, // 响应头同步（传 axios response）
  initDeviceSync              // 全局初始化（跨标签页监听，幂等）
} from 'stable-deviceid';

http.interceptors.request.use(async config => {
  config.headers['x-device-id'] = getStableDeviceId();
  if (isDeviceFingerprintEnabled()) {
    try {
      config.headers['x-device-fp'] = await getDeviceFingerprint();
    } catch { /* 采集失败不影响主流程 */ }
  }
  return config;
});

http.interceptors.response.use(response => {
  handleDeviceSyncInResponse(response);
  return response;
});
```

## API 一览

| 导出 | 说明 |
| --- | --- |
| `setupDeviceSync(instance, options?)` | 一站式接入（axios），返回 dispose 函数 |
| `getDeviceHeaders()` | 同步返回 `{ 'x-device-id': id }`，供 fetch / 显式带头 |
| `getStableDeviceId()` | 稳定设备 ID（首次生成，之后持久复用） |
| `getCurrentDeviceId()` / `setDeviceId(id)` / `clearDeviceId()` | 读取 / 校验写入 / 清除（均含格式校验） |
| `adoptDeviceId(id)` | 采纳 SSO 权威域下发的 ID（格式 + 平台段双校验，跨 origin 归一） |
| `validateDeviceIdFormat(id)` | 本地格式校验（返回 `{ valid, reason? }`） |
| `parseDeviceId(id)` | 解析 ID 信息（platform / timestamp / age），非法返回 null |
| `syncDeviceFromHeaders(headers, options?)` | 从响应头同步（兼容 Headers / AxiosHeaders / 普通对象） |
| `handleDeviceSyncInResponse(response, options?)` | 响应拦截器集成（axios / fetch Response 均可） |
| `initDeviceSync(options?)` | 全局初始化：跨标签页监听 + 变更回调（幂等） |
| `getDeviceFingerprint()` / `isDeviceFingerprintEnabled()` | 指纹采集（Promise 缓存、并发去重）与开关判定 |
| `sha256(message)` | SHA-256（Web Crypto 优先，非安全上下文自动降级纯 JS） |
| `getDeviceIdStats()` | 调试统计（当前 ID / 解析信息 / 来源） |

常量：`STORAGE_KEY`、`MAX_AGE_DAYS`（365）、`CLOCK_SKEW_TOLERANCE_MS`（±5 分钟）、
`DEVICE_PLATFORMS`、`RANDOM_SUFFIX_LENGTH`。

## SSO 跨 origin 身份归一

iframe 嵌入 SSO 登录页（如 oauth21）时，登录成功消息中携带权威域设备 ID，
子应用在 bindSession 之前采纳，同物理设备即归一为同一身份：

```ts
window.addEventListener('message', event => {
  // 务必校验 event.origin 与 event.source（示例省略）
  if (event.data?.type === 'LOGIN_SUCCESS' && event.data.deviceId) {
    adoptDeviceId(event.data.deviceId); // 包内做格式 + 平台段双校验
  }
});
```

## 设备指纹（默认关闭，隐私友好）

```html
<!-- 方式一：后端/模板注入 meta 开关 -->
<meta name="device-fp" content="true" />
```

```bash
# 方式二：Vite 环境变量
VITE_DEVICE_FINGERPRINT=true
```

```ts
// 方式三：代码强制指定（非 Vite 构建器推荐）
setupDeviceSync(http, { fingerprint: true });
```

采集维度：canvas 渲染差异 + WebGL renderer/vendor，SHA-256 取前 32 位 hex，
进程内 Promise 缓存（并发去重、双失败返回空串而非常量哈希，防误匹配）。

## 安全设计

- **前后端校验对齐**：格式校验与后端 `validateDeviceId` 逐条一致（平台枚举 /
  长度 / Base62 字符集 / 拒绝超容差未来时间 / 365 天有效期），存量非法 ID 本地即重生
- **脏输入防御**：响应头超 128 字符忽略、日志截断外部输入、`setDeviceId` 入口校验
- **缓存一致性**：任何来源的 ID 写入后立即失效内存缓存，下一请求即生效
- **隐私模式降级**：存储不可用时静默降级内存层（会话内稳定），不抛异常不中断请求链路

## 在 nodeServers monorepo 内开发

workspace 内前端（oauth21 / firewall / posecraft）通过 vite alias 直连源码消费：

```ts
// vite.config.ts
resolve: { alias: { stable-deviceid: fileURLToPath(new URL('../packages/shared-device/src/index.ts', import.meta.url)) } }
```

```json
// tsconfig.json
"paths": { "stable-deviceid": ["../packages/shared-device/src/index.ts"], "stable-deviceid/*": ["../packages/shared-device/src/*"] },
"include": ["src/**/*.ts", "../packages/shared-device/src/**/*.ts"]
```

`package.json` dependencies 中 `"stable-deviceid": "*"` 供 workspace 链接。

## 构建与发布（维护者）

```bash
cd packages/shared-device
npm run build     # esbuild 逐模块转换 → dist/ + tsc 产出 index.d.ts
npm publish       # prepack 自动构建；ESM-only，access: public
```

## 已知限制

- 隐私模式下存储降级为会话内临时 ID，每次刷新变化（console.warn 告警）
- `isDeviceFingerprintEnabled` 依赖 `import.meta.env`（Vite）与 DOM；非 Vite 消费方请用 meta 标签或 `fingerprint` 选项
- `crypto.getRandomValues` 不可用的极旧浏览器以 `Math.random` 生成随机后缀（告警提示）
- Safari ITP 会清除脚本可写存储，需配合服务端 httpOnly cookie 兜底恢复机制使用

## License

[MIT](./LICENSE) © 2026 qirly
