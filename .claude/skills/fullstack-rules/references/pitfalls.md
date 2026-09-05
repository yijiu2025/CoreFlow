# 项目事故复盘库（写相关代码前先扫描本文件）

> 每条都是本仓库**真实发生过**的事故，格式：现象 → 根因 → 规则 → 防回归机制。
> AI 在修改相关模块前必须扫描对应条目，**不重蹈覆辙**。

## 1. 设备 ID 算法两端漂移 → 全量校验失败死循环（81350f1）

- **现象**：所有设备 ID 被后端判定无效 → 前端每请求重生新 ID → 服务端也换发 → 指纹每请求变 → 人机验证死循环。
- **根因**：Base62 时间戳编码算法在前后端**各自实现**，长度常量（11 字符）单方面改动无人察觉。
- **规则**：共享算法必须**物理单源**——统一由 `stable-deviceid/base62-timestamp` 提供，任何一端不允许再手写编解码。
- **防回归**：`src/__tests__/framework/auth/device-id-parity.test.js`；改动共享包后必须重新 `npm run build`（后端引用的是 dist）。

## 2. 路由重复注册 → 启动抛 DUPLICATE_ROUTE

- **现象**：启动报 `路由重复注册: GET /xxx`，error code `DUPLICATE_ROUTE`。
- **根因**：`registerGroupMetadata` 组名重复，或 `method+url` 组合已被占用（含别名路径）。
- **规则**：注册新路由前先 grep `_routeRegistry` 已有 name / url；组名全局唯一（如 deviceAccountsAdmin ≠ userSessionsAdmin）；同域多文件可复用组名但路由 name/url 必须唯一。
- **防回归**：guard.js 在 Fastify 注册前主动拦截（实时路由重复检测）。

## 3. 401 无感刷新死锁（前端）

- **现象**：refreshToken 过期时，刷新请求自身 401 → 进入 pendingQueue → 排队等待自己 → 永久 pending。
- **根因**：刷新请求与业务请求共用同一个 axios 实例，刷新的 401 也进了响应拦截器的刷新队列。
- **规则**：**刷新会话必须走独立 axios 实例**（不带响应拦截器的 401 递归处理），见 `posecraft/src/utils/request.ts` 的 refreshToken 专用实例。
- **防回归**：code review 时检查任何新增 axios 实例的 401 处理路径。

## 4. SSO iframe 主题竞态 → 首屏闪白

- **现象**：父窗口在 iframe `@load` 后立即 postMessage 主题色，子应用 Vue 监听器尚未就绪 → 消息丢失 → 首屏白屏闪变。
- **根因**：`@load` 只保证 HTML 到达，不保证 Vue app mounted + 监听器注册完成。
- **规则**：**必须握手**：子应用 mount 后发 `SSO_READY`，父窗口收到才同步主题并关 loading；父窗口设 3s 兜底超时防握手丢失导致永久 loading。
- **防回归**：login/index.vue、Consent.vue 统一在 dispatcher 入口发 SSO_READY（子组件不重复发）。

## 5. session_tokens 表膨胀（客户端可控 deviceId）

- **现象**：同一用户每次传随机 deviceId → `user_id+device_id` upsert 键不同 → 无限新增行。
- **根因**：设备幂等键是客户端可控输入，无总量上限。
- **规则**：`MAX_ACTIVE_DEVICES`（默认 20）+ `pruneActiveDevices` 在新增设备行后裁剪最旧；**边界必须精确**——曾出现 off-by-one（恰好等于上限也多删一台），修复后 `activeCount > MAX` 才裁剪。**边界条件写完必须用边界值测试**（见 prune-active-devices.test.js）。
- **防回归**：prune-active-devices.test.js；scheduler session-cleanup 每日清理 90 天陈旧行。

## 6. 服务端换发 ID 前端不知情 → 指纹漂移死循环

- **现象**：服务端替换了非法客户端 ID，但前端 localStorage 仍是旧值 → 每请求发旧 ID → 每请求都被换发 → 指纹每请求变。
- **根因**：换发只发生在一个方向，前端没有同步通道。
- **规则**：服务端换发时**必须回写** `X-Device-Id`（+ `X-Device-Id-Updated: true`），前端 `handleDeviceSyncInResponse` 同步回 localStorage 并失效内存缓存。
- **防回归**：device-sync.test.js 缓存一致性回归用例。

## 7. npm 包名防抢注拦截

- **现象**：发布 `deviceid` 被 403 "Package name too similar to existing package device-id"。
- **根因**：npm typosquat 保护拦截与已有包过于相似的名字，且发布强制 2FA（需 bypass token 或 OTP）。
- **规则**：发布新包前先 `npm view <name>` / 查 registry 确认可用且不与现有包相似；发布用临时 granular token（勾选 Bypass 2FA）→ 发布 → 立即撤销。
- **防回归**：发布流程写入 README"构建与发布"章节。

## 8. Safari ITP / 隐私模式存储丢失 → 设备身份漂移

- **现象**：iOS 用户每 7 天设备 ID 变一次；隐私模式每次刷新都变 → 频繁触发人机验证。
- **根因**：ITP 清除脚本可写存储（localStorage + JS cookie），但**不清服务端写的 httpOnly cookie**。
- **规则**：httpOnly cookie 兜底恢复——header ID 是"刚出生"（<10s）或不可解析、且 cookie 有合法不同 ID 时，优先恢复 cookie 身份并回写；隐私模式降级内存 ID 必须告警。
- **防回归**：device.test.js（8 用例含 ITP 场景）；后端 recovery 逻辑在 device.js getDeviceId。

## 9. 跨站分离部署 cookie 全失效

- **现象**：前端与后端不同域名部署时，登录态与设备身份全部丢失。
- **根因**：cookie 硬编码 `SameSite=Lax`，浏览器不随跨站请求携带。
- **规则**：cookie 策略环境变量化（`COOKIE_SAMESITE`/`COOKIE_SECURE`/`COOKIE_DOMAIN`），跨站时 None+Secure（HTTPS 必需）；**新 cookie 选项一律引用 `COOKIE_POLICY`，禁止再硬编码 sameSite/secure 字面量**。
- **防回归**：grep 检查 setCookie 调用无字面量 sameSite；分离部署矩阵见 stable-deviceid README。

## 10. getModel 是 throw 语义，不是返回 null

- **现象**：模型未注册时 `getModel('Xxx')` 抛 TypeError，而不是返回 null——靠 `if (!model)` 守卫的代码**永远走不到守卫**，异常被外层 try/catch 静默吞掉。
- **根因**：`src/framework/db/index.js` 的 getModel 对缺失模型直接 `throw TypeError`。
- **规则**：调用 getModel 处要么确保模型已注册（06-models loader 自动加载 src/models），要么用 try/catch 明确处理；**不要写 `if (!getModel('Xxx'))` 这种永远不生效的守卫**。
- **防回归**：code review 扫描 getModel 调用点的错误处理方式。

## 11. 嵌套 .git 目录污染主仓库

- **现象**：把外部仓库整目录拷进 assets/ 后，主仓库出现 gitlink（mode 160000），内部 100+ object 文件不可控，git status 持续脏。
- **根因**：拷贝时未剔除嵌套 `.git/`。
- **规则**：向 skill/assets 拷贝外部内容时**必须先删除嵌套 .git**，只保留需要的文件；作为 gitlink 还是普通文件要有意识决策。
- **防回归**：`git ls-files -s | grep 160000` 应为空。

## 12. 文档与代码库路径漂移

- **现象**：目录从 `src/db|redis|auth` 迁到 `src/framework/*` 后，AGENTS.md / skill 模板仍写旧路径——AI 照模板写 import 直接失败。
- **根因**：目录迁移时只改了代码，没改文档；三份指引（AGENTS/CLAUDE/skill）各自维护同一事实。
- **规则**：**目录/包名变更必须同步所有指引文件**（AGENTS.md、CLAUDE.md、.claude/skills/fullstack-rules/references/**）；改完跑 `node .claude/skills/fullstack-rules/scripts/doctor.mjs` 自检。
- **防回归**：doctor.mjs 脚本检测旧路径残留与断链。
