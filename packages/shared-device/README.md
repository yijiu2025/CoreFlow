# @nodeservers/shared-device

跨前端共享的设备 ID / 设备指纹工具包（npm workspace 包）。

主前端（`oauth21/`、`firewall/`，以及 posecraft）通过 vite alias + tsconfig paths
引用本包源码，保证 device_id 生成、传递、响应头同步逻辑三端一致。

## 目录结构

```
packages/shared-device/
├── package.json          # workspace 包定义（exports 直指源码，不发布 npm）
├── tsconfig.json         # 包级类型检查配置（IDE 直接打开包内文件用）
└── src/
    ├── index.ts          # TS 桶文件出口（vite alias 唯一入口）
    ├── device-id.js/.d.ts        # 稳定设备 ID：生成 / 严格校验 / 存量自查
    ├── device-sync.js/.d.ts      # 响应头同步：X-Device-Id 写回 / 缓存一致性
    ├── device-fingerprint.js/.d.ts # canvas + WebGL 指纹（默认关闭）
    ├── sha256.js/.d.ts           # SHA-256：Web Crypto 优先，纯 JS 降级
    ├── base62-timestamp.js/.d.ts # 时间戳混淆 + Base62（前后端共享算法唯一事实来源）
    ├── storage.js/.d.ts          # localStorage 安全封装（隐私模式内存降级）
    ├── env.d.ts          # vite/client 类型引用
    └── __tests__/        # 单元测试（根 Jest 直接运行，76 用例）
```

## 实现形态约定（.js + 手写 .d.ts）

实现模块全部为**纯 JS + 手写 .d.ts**，仅 `index.ts` 桶文件为 TS。
原因：根 Jest 配置 `transform: {}`（纯 ESM，不编译 TS），浏览器逻辑的
单元测试需要直接 import 实现文件（node 环境下 mock 全局对象运行）。
修改实现时**必须同步更新对应 .d.ts**，类型检查（`tsc -p packages/shared-device`）
会校验 .d.ts 与桶文件导出的一致性。

## 模块职责

| 模块 | 导出 | 职责 |
| --- | --- | --- |
| `device-id` | `getStableDeviceId` / `validateDeviceIdFormat` / `invalidateCachedDeviceId` / `parseDeviceId` / `getPlatform` / `STORAGE_KEY` 等 | 从存储（key `cf_device_id`）取/生成结构化 ID；存量 ID 严格自查（格式/过期/未来时间，规则与后端 `validateDeviceId` 逐条对齐）；隐私模式降级为会话内临时 ID |
| `device-sync` | `syncDeviceFromHeaders` / `handleDeviceSyncInResponse` / `initDeviceSync` / `getCurrentDeviceId` / `setDeviceId` / `clearDeviceId` / `getDeviceIdStats` | 从响应头 `X-Device-Id`/`X-Device-Id-Updated` 同步 device_id；兼容 Headers / AxiosHeaders / 普通对象；写后失效 device-id 内存缓存（服务端下发新 ID 下一请求即生效）；`setDeviceId` 入口校验拒绝脏值；跨标签页 storage 监听 |
| `device-fingerprint` | `getDeviceFingerprint` / `isDeviceFingerprintEnabled` | canvas + WebGL 特征 SHA-256（前 32 位 hex）；Promise 缓存（并发去重、空结果也缓存）；meta 标签或 `VITE_DEVICE_FINGERPRINT=true` 才启用，默认关闭（隐私友好） |
| `sha256` | `sha256` / `sha256Pure` | 优先 Web Crypto API，非安全上下文（HTTP）自动降级为内置纯 JS 实现（与 Node crypto 全量对拍测试守护） |
| `base62-timestamp` | `encodeTimestamp` / `decodeTimestamp` / `toBase62` / `fromBase62` 等 | 时间戳混淆 + Base62 编解码，**前后端共享算法的唯一事实来源** |
| `storage` | `safeGetItem` / `safeSetItem` / `safeRemoveItem` | 包内唯一存储访问出口；隐私模式 / 配额异常静默降级内存 Map，不向调用方抛异常 |

## 设备 ID 格式

```
{PLATFORM}-{ENCODED_TIMESTAMP}-{RANDOM_SUFFIX}
示例：WEB-DaBOSbNdSuc-8s4T
```

- `PLATFORM`：`WEB` / `IOS` / `ANDROID`（UA 检测，与后端 `detectPlatform` 同规则；
  刻意不做 iPadOS 13+（UA 报 Macintosh）识别，避免两端平台判定不一致触发后端告警）
- `ENCODED_TIMESTAMP`：毫秒时间戳减 2024-01-01 偏移 → 64 位魔数 XOR 混淆 → Base62，固定 11 字符
- `RANDOM_SUFFIX`：6 字符 Base62 随机码（`crypto.getRandomValues` + 拒绝采样，无模偏差；
  crypto 不可用的极端环境降级 `Math.random` 并告警——设备 ID 非加密材料，仅求唯一性）

与后端 `src/framework/auth/device-id-service.js` 的校验规则（长度 / 字符集 /
平台枚举 / 拒绝未来时间 / 365 天有效期）严格对齐。**两端编码一致性由 jest 测试守护**：
`src/__tests__/framework/auth/device-id-parity.test.js`。修改 `base62-timestamp.js`
或后端算法任意一端时该测试会失败，防止 81350f1 类长度漂移故障复发。

## 安全设计

- **脏输入防御**：响应头值超过 128 字符直接忽略（合法 ID 最长 22 字符）；日志中的
  外部输入截断到 48 字符，防刷屏与日志注入；`setDeviceId` 入口校验拒绝非法格式。
- **前后端校验对齐**：本地校验规则与后端 `validateDeviceId` 逐条一致（含未来时间
  拒绝、365 天有效期），存量非法 ID 本地即重生，避免"本地可用、后端全拒"的
  每请求重生循环。
- **隐私友好**：设备指纹默认关闭，需显式 meta 标签或环境变量启用；存储层
  静默降级不抛异常；指纹双失败（headless/反指纹浏览器）返回空串而非常量哈希，
  防止此类浏览器被误匹配。

## 接入方式

本包 `exports` 直接指向源码，**仅限 workspace 内通过 vite alias 消费**，
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

## 测试

```bash
node --experimental-vm-modules npx jest --testPathPatterns "packages/shared-device"
```

覆盖 76 个用例：SHA-256 纯 JS 实现与 Node crypto 全量对拍、Base62 编解码边界、
设备 ID 生成/自查/校验规则、同步流与**缓存一致性回归**（服务端下发新 ID 后
`getStableDeviceId` 立即生效）、指纹开关与双失败缓存。浏览器全局（window /
localStorage / navigator / document）在 node 测试环境用桩对象模拟。

## 已知限制

- 隐私模式下存储降级为会话内临时 ID，每次刷新变化，会频繁触发
  人机验证（降级时 console.warn 告警）；放宽策略需产品决策。
- `isDeviceFingerprintEnabled` 依赖 `import.meta.env`（Vite）与 DOM，仅浏览器环境可用。
- `crypto.getRandomValues` 不可用的极旧浏览器会以 `Math.random` 生成随机后缀
  （熵降低，仅影响唯一性不影响安全性），并 console.warn 告警。
