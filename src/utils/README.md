# src/utils/ —— 零依赖工具层

> **改后端代码前先读这一页。** 这里的函数已经覆盖了颜色 / 集合 / 字符串 / 超时 / CORS /
> 手机号加密 / 载荷守卫 / 代理信任八类常见需求 —— 先看有没有现成的，别在业务文件里再写一遍。
>
> 判据很简单：**任何 `src/**` 与入口 `index.js` 都从 `utils/index.js` 导入**，
> 不允许出现 `utils/colors.js` 这种具体文件路径。理由见下。

## 为什么是"门面 + 零依赖叶子层"

`utils/` 位于依赖图**最底层**：它不 import 任何 `framework/**`、不 import 任何 `app/**`，
只依赖 Node 内置模块。因此它可以被任何层安全引用 —— 包括 `framework/support/log` 自己。

两条硬规则（都有守卫测试）：

| 规则                                                                 | 为什么                                                                                     | 谁在守                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| 外部一律 `from '<相对路径>/utils/index.js'`                          | 单个文件是实现细节，今天 `colors` 独立、明天并进 `terminal`，门面外的代码不该跟着改 import | `src/__tests__/conventions/utils-entry.test.js` |
| 目录内成员**禁止**互相走门面（`cors.js` 不要 `import './index.js'`） | 门面 → 成员 → 门面 是环，拿到的会是未初始化的绑定                                          | 同上                                            |
| 成员**不得** import `framework/**`                                   | 一旦依赖 framework，叶子层就变成中间层，门面不再能被任意层安全引用                         | 同上                                            |

> 真实先例：`ip.js` 曾为了写诊断日志而依赖 `framework/support/log`，2026-11-09 迁到
> `framework/ingress/net/ip.js`。所以 `isIpMatch` **不在** `utils/` 里 —— 它在
> `src/framework/ingress/net/ip.js`。

**单元测试是唯一例外**：测哪个模块就 import 哪个文件（钉住被测代码），不要为了"统一入口"
去测门面 —— 那会让测试与实现的耦合变得不可见。

## API 速查

```js
import {
  C,
  IS_TTY, // colors
  capMapSize, // collections
  parseCsvList, // strings
  MAX_TIMEOUT_MS,
  resolveTimeoutMs, // timeout
  normalizeOrigin,
  parseOriginList,
  isOriginAllowed, // cors
  encryptPhone,
  decryptPhone,
  maskPhone,
  isEncrypted, // crypto
  looksLikeHtml,
  assertNotHtmlPayload, // payload-guard
  DEFAULT_TRUST_PROXY,
  parseTrustProxy,
  describeProxyTrustRisk,
  formatProxyTrustRisks // proxy-trust
} from '../utils/index.js';
```

| 模块               | 导出                                                                                        | 一句话                                     |
| ------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `colors.js`        | `C`、`IS_TTY`                                                                               | 终端颜色（TTY 自适应）+ 唯一的终端能力判断 |
| `collections.js`   | `capMapSize(map, maxEntries)`                                                               | Map 超限时逐条淘汰到上限                   |
| `strings.js`       | `parseCsvList(raw, { separator, fallback })`                                                | 逗号分隔环境变量 → 数组                    |
| `timeout.js`       | `resolveTimeoutMs(raw, fallback)`、`MAX_TIMEOUT_MS`                                         | 超时值解析（支持 `30s` / `5m`）            |
| `cors.js`          | `normalizeOrigin`、`parseOriginList`、`isOriginAllowed`                                     | CORS 白名单的纯判断                        |
| `crypto.js`        | `encryptPhone` / `decryptPhone` / `maskPhone` / `isEncrypted`                               | 手机号可检索加密（确定性 IV + HMAC）       |
| `payload-guard.js` | `looksLikeHtml(payload)`、`assertNotHtmlPayload(payload, label)`                            | 判断一段字节是数据还是网页                 |
| `proxy-trust.js`   | `DEFAULT_TRUST_PROXY`、`parseTrustProxy`、`describeProxyTrustRisk`、`formatProxyTrustRisks` | `trustProxy` 网段解析与过宽告警            |

## 逐个用法

### colors —— 终端颜色与 `IS_TTY`

```js
import { C, IS_TTY } from '../utils/index.js';

log.info(`✅ [Redis] ${C.green}连接成功${C.reset}`);
log.warn(`⚠️ [Redis] ${C.yellow}连接失败，降级到内存模式${C.reset}`);
```

- 可用颜色：`reset` / `green` / `yellow` / `red` / `cyan` / `dim`（只有这 6 个，别自己写转义序列）
- **不需要判断 `process.stdout.isTTY`**：非 TTY（docker / pm2 / 重定向 / CI）下所有颜色码自动变空串，
  避免把 `\x1b[31m` 泄漏进日志采集端
- 用户偏好优先：`NO_COLOR=1` 一律关色，`FORCE_COLOR=1` 在管道里也强制上色
- `IS_TTY` 用于**非颜色**的终端能力判断（如 Windows 的 `chcp`）。**全仓的 isTTY 判断只此一处**，
  不要在别处再写一遍 `process.stdout.isTTY`

### collections —— `capMapSize(map, maxEntries)`

内存降级场景的兜底：Map 超过上限时从**最旧**（插入顺序最前）逐条淘汰，直到 `size <= maxEntries`。

```js
capMapSize(this.cache, 1000);
```

- 语义是**封顶**不是"砍一半"：一次性灌 1000 条、上限 10 条时，旧实现会留下 500 条
- ⚠️ **不要用在限流降级表上**（`framework/persistence/redis/resilient-store.js` 的
  `memoryFallback`）：那里的条目是"某个 IP/用户的窗口计数"，淘汰一条 = 该客户端额度被清零。
  容量上限要用"满了拒绝新键"而不是"淘汰旧键"
- 淘汰按**插入顺序**；需要按访问顺序淘汰请用 LRU，别拿它凑

### strings —— `parseCsvList(raw, { separator, fallback })`

```js
const origins = parseCsvList(process.env.CORS_ORIGINS, { fallback: [] });
const trusted = parseCsvList(process.env.PROXY_TRUST_CIDR, { fallback: DEFAULT_TRUST_PROXY });
```

- `fallback` **必须显式写**：不写就是 `[]`。这是刻意的 —— 全仓曾有 6 处各写一遍
  `.split(',').map(trim).filter(Boolean)`，但默认值策略不同（CORS 空白名单 = 拒绝全部跨域；
  trustProxy 空 = 回退回环地址），复制粘贴最容易丢掉的就是这层语义
- 返回的是浅拷贝，改它不会污染调用方传进来的常量

### timeout —— `resolveTimeoutMs(raw, fallback)`

```js
const keepAlive = resolveTimeoutMs(APP_CONFIG.http?.keepAliveTimeoutMs, 72_000);
const upstream = resolveTimeoutMs(process.env.UPSTREAM_TIMEOUT, 30_000); // 支持 '30s' / '5m'
```

- 支持单位后缀 `ms|s|m|h`（环境变量里写 `30s` 比 `30000` 可读）
- **非法值回退 `fallback`，绝不退化成 0**：`0` 在 Fastify 里意味着"用内置默认"，
  而某些场景写 0 等于把保护关掉。三个"假 0"已被拦掉：`Number(null)` / `Number('   ')` / `Number(true)`
- 合法的 `0` **原样保留**（那是调用方显式表达"交给 Fastify 默认值"）
- 超过 `MAX_TIMEOUT_MS`（2^31-1）会钳到上限 —— 否则 Node 把超时压成 1ms，
  "几乎不过期"瞬间变"立刻超时"

### cors —— 三个纯判断

```js
const allowed = parseOriginList(process.env.CORS_ORIGINS);
if (!isOriginAllowed(req.headers.origin, allowed, isProd)) {
  /* 拒绝 */
}
```

`isOriginAllowed(origin, allowedOrigins, isProduction)` 的规则：

| 情形                                   | 结果                       |
| -------------------------------------- | -------------------------- |
| `origin` 为空（同源 / 非浏览器客户端） | 放行                       |
| 非生产环境                             | 放行（本地任意端口直连）   |
| 生产 + 白名单为空                      | **全部拒绝**（宁可不跨域） |
| 生产 + 命中白名单                      | 放行                       |
| 无法归一化的 origin                    | 拒绝（fail-closed）        |

- 比对前两边都走 `normalizeOrigin`（去空白 / 去尾斜杠 / 小写）。
  历史 bug：`origin-guard` 归一化而这里 `includes` 原样比对，配置写 `https://A.com/` 时
  跨域被 cors 拒、敏感端点却被 origin-guard 放行 —— 两边判据各说一套
- 为什么抽成纯函数：这是 CSRF / 信息泄露边界，写进 `@fastify/cors` 的 `origin` 回调就只能
  靠整机启动来验证；纯函数可以被 `utils/cors.test.js` 逐条钉住

### crypto —— 手机号可检索加密

```js
const stored = encryptPhone('13800138000'); // 同一明文恒产生同一密文（唯一索引可用）
const phone = decryptPhone(stored); // 先验 HMAC 再解密，篡改直接抛错
const shown = maskPhone(phone); // 138****8000
if (isEncrypted(value)) {
  /* 已是密文，别二次加密 */
}
```

- AES-256-CBC + **确定性 IV**（HMAC-SHA256 派生），因此同明文 → 同密文，唯一索引与等值查询仍可用
- 密文附带 HMAC 标签，解密先验签：防 CBC bit-flipping 产生可控明文
- 密钥来自环境变量；**换密钥 = 存量数据全部解不开**，轮换要配迁移

### payload-guard —— 判断下载物是数据还是网页

```js
const buf = Buffer.from(await res.arrayBuffer());
assertNotHtmlPayload(buf, `模型文件 ${url}`); // 是 HTML 就抛错，附带 label
await fs.writeFile(dest, buf);
```

- 只看**前 256 字节**，不看 `content-type`（那是服务端声明的，可能是错的）
- 为什么需要：2026-06 一批 TensorFlow.js `.bin` 权重实际是保存下来的 Kaggle 页面
  （带公开前端 key），根因是下载时只检查 HTTP 状态码 —— 登录页 / 换页 HTML 也返回 200
- 下载外部资源后**必须**过这一关，尤其是会落盘成二进制扩展名的

### proxy-trust —— `trustProxy` 网段

```js
const trustProxy = parseTrustProxy(process.env.PROXY_TRUST_CIDR);
const risks = describeProxyTrustRisk(trustProxy);
if (risks.length) log.warn(`⚠️ [Server] ${formatProxyTrustRisks(risks)}`);
```

- 默认值 `DEFAULT_TRUST_PROXY = ['127.0.0.1', '::1']`（只信本机反代）
- 这组判据守的是一条**看不见的边界**：`trustProxy` 里的每条网段，其来源都可以自定义
  `X-Forwarded-For`，于是 `request.ip` 变成攻击者可填的字符串 —— 而它是
  `allowIps` 白名单、限流 `keyGenerator`、防火墙按 IP 封禁**三者共同的唯一判据**
- 所以网段写得越宽，等于越多来源能自证"我是任意 IP"，三层同时失效且**没有任何报错**。
  生产只填代理的**确切地址**（如 `172.18.0.2/32`），不要填整个网段
- `describeProxyTrustRisk` 负责识别过宽网段并给出人类可读的风险说明

## 新增一个工具模块

1. 判断它是否真的"零依赖"：需要 import `framework/**` 或 `app/**` ⇒ **不属于这里**
   （放 `framework/` 对应分组，例如 IP 判据在 `framework/ingress/net/`）
2. 新建 `src/utils/<name>.js`，文件头写清：**为什么需要它**、判据取舍、什么时候别用
3. 在 `src/utils/index.js` 里 import 并在末尾 `export { ... }` 汇总（定义处不写 `export`）
4. 补 `src/__tests__/utils/<name>.test.js`，**直接 import 该文件**（不走门面）
5. 跑 `npm test` —— `conventions/utils-entry.test.js` 会拦"绕过门面导入"和"成员反向依赖 framework"

## 相关文件

- 门面与设计说明：`src/utils/index.js` 文件头
- 入口约定守卫：`src/__tests__/conventions/utils-entry.test.js`
- 测试有效性守卫：`src/__tests__/conventions/test-effectiveness.test.js`
- 超时在 HTTP 层的消费点：`src/framework/ingress/http/server-options.js`
- 代理信任在启动期的消费点：`src/framework/lifecycle/startup/`（`proxy-trust` 判据 + 告警）
