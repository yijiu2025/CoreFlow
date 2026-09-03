# @nodeservers/shared-device

跨前端共享的设备 ID / 设备指纹工具包（npm workspace 包）。

主前端（`oauth21/`、`firewall/`，以及 posecraft）通过 vite alias + tsconfig paths
引用本包源码，保证 device_id 生成、传递、响应头同步逻辑三端一致。

## 模块

| 入口 | 导出 | 职责 |
| --- | --- | --- |
| `device-id` | `getStableDeviceId` / `parseDeviceId` / `decodeTimestamp` / `STORAGE_KEY` | 从 localStorage（key `cf_device_id`）取/生成结构化 ID；存量 ID 自查（无效/过期重生）；隐私模式降级为会话内临时 ID |
| `device-fingerprint` | `getDeviceFingerprint` / `isDeviceFingerprintEnabled` | canvas + WebGL 特征 SHA-256（32 位 hex），`VITE_DEVICE_FINGERPRINT=true` 或 `<meta name="device-fp">` 才启用 |
| `device-sync` | `syncDeviceFromHeaders` / `handleDeviceSyncInResponse` / `initDeviceSync` / `getCurrentDeviceId` / `setDeviceId` / `clearDeviceId` / `getDeviceIdStats` | 从响应头 `X-Device-Id`/`X-Device-Id-Updated` 同步 device_id 到 localStorage；兼容 Headers / AxiosHeaders / 普通对象；`initDeviceSync` 注册跨标签页 storage 监听（防重复注册） |
| `sha256` | `sha256` | 优先 Web Crypto API，非安全上下文（HTTP）自动降级为内置纯 JS 实现 |
| `base62-timestamp` | `encodeTimestamp` / `decodeTimestamp` / `toBase62` / `fromBase62` | 时间戳混淆 + Base62 编解码，**前后端共享算法的唯一事实来源** |

## 设备 ID 格式

```
{PLATFORM}-{ENCODED_TIMESTAMP}-{RANDOM_SUFFIX}
示例：WEB-DaBOSbNdSuc-8s4T
```

- `PLATFORM`：`WEB` / `IOS` / `ANDROID`（UA 检测）
- `ENCODED_TIMESTAMP`：毫秒时间戳减 2024-01-01 偏移 → 64 位魔数 XOR 混淆 → Base62，固定 11 字符
- `RANDOM_SUFFIX`：6 字符 Base62 随机码（拒绝采样，无模偏差）

与后端 `src/framework/auth/device-id-service.js` 的校验规则（长度 / 字符集 /
平台枚举 / 365 天有效期）严格对齐。**两端编码一致性由 jest 测试守护**：
`src/__tests__/framework/auth/device-id-parity.test.js`。修改 `base62-timestamp.js`
或后端算法任意一端时该测试会失败，防止 81350f1 类长度漂移故障复发。

## 接入方式

本包 `exports` 直接指向 `.ts` 源码，**仅限 workspace 内通过 vite alias 消费**，
不发布到 npm。接入步骤（以 oauth21 为例）：

```js
// vite.config.js
alias: { '@nodeservers/shared-device': path.resolve(__dirname, '../packages/shared-device/src/index.ts') }
```

```json
// tsconfig.app.json → paths
"@nodeservers/shared-device": ["../packages/shared-device/src/index.ts"],
"@nodeservers/shared-device/*": ["../packages/shared-device/src/*"]
```

```json
// package.json → dependencies
"@nodeservers/shared-device": "*"
```

应用入口调用一次 `initDeviceSync()`；请求拦截器注入
`config.headers['x-device-id'] = getStableDeviceId()`；响应拦截器调用
`handleDeviceSyncInResponse(res)` 完成服务端下发 ID 的同步。完整链路见
[docs/development/设备ID全链路梳理.md](../../docs/development/设备ID全链路梳理.md)。

## 已知限制

- 隐私模式下 localStorage 不可用时降级为会话内临时 ID，每次刷新变化，会频繁触发
  人机验证（降级时 console.warn 告警）；放宽策略需产品决策。
- `isDeviceFingerprintEnabled` 依赖 `import.meta.env`（Vite）与 DOM，仅浏览器环境可用。
