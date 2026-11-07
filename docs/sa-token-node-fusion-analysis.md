# sa-token-node 与本仓 StpUtil 融合性分析

> 分析对象：https://github.com/yijiu2025/sa-token-node（移植 Java Sa-Token 到 Node）
> 对照对象：`src/framework/security/auth/stp-util.js`（本仓权限认证核心工具类）
> 日期：2026-11-01
> **状态更新（2026-11-01 下午）：P1/P2/P3 已实现完毕，见文末「五、实现落地记录」。**

---

## 一、两个实现的基本盘对比

| 维度 | 本仓 StpUtil | sa-token-node |
| --- | --- | --- |
| 定位 | 单文件静态工具类（238 行），会话管理在 `session.js` | 全框架移植：SaManager / StpLogic / SaTokenDao / 事件中心 / 注解 / filter / router |
| 上下文 | AsyncLocalStorage（`request-context.js`） | SaTokenContextForThreadLocal（Node 版 ThreadLocal 模拟） |
| 会话模型 | **双令牌**：sid（HMAC 签名 cookie，2h）+ sid_r（refresh，30 天），记住我可续期 | 单令牌：`satoken` cookie 直接即凭证，30 天 TTL，无 refresh 概念 |
| 多应用隔离 | 有（appId 进 session，PBAC 按 appId 加载） | 无（单 loginType 维度） |
| 权限模型 | **PBAC**：allows/denies + Deny 优先 + 通配符 | 经典 RBAC：getPermissionList + 通配符，**无 deny 概念** |
| 权限数据源 | 登录时快照进 session（`permission-loader.js`） | `StpInterface` 接口，**每次校验实时拉取** |
| 并发登录 | 已有踢下线（destroySession + revoked 标记） | isConcurrent / isShare / kickout / replaced（顶人下线）完整语义 |
| 持久化 | 本仓 Redis v5（有降级） | SaTokenDao 接口，默认**内存实现**，Redis 适配需自写 |
| API 形态 | 全同步（除 login） | 大量 async（getConfig/getSaTokenDao 等均 async） |
| 质量/活跃度 | 有测试、审计记录、类型闸门约束 | 18 commits、3 star、2025-08 停更；node_modules/dist 入库；babel 构建混杂；无 README；无类型 |

## 二、sa-token-node 值得关注的能力清单

本仓 StpUtil **没有**、而它**有**的能力：

1. **账号封禁体系**：`disable/isDisable/checkDisable/untieDisable` + 阶梯封禁（disableLevel，按等级处罚）。本仓 firewall 是 IP/请求层封禁，账号级业务封禁目前只有 user.status 静态位。
2. **二级认证**：`openSafe/checkSafe/closeSafe`——敏感操作前要求"再次确认"，N 分钟内免重复验证。
3. **临时身份切换**：`switchTo(loginId, func)`——lambda 内临时切身份，结束自动恢复（admin 模拟登录场景）。
4. **顶人下线**：`replaced/kickout` 区分场景值（-4 顶人 / -5 踢人），被顶端下次请求能感知"被顶"原因。
5. **Token-Session / 匿名会话**：`getTokenSession / getAnonTokenSession`——未登录也可用的临时会话。
6. **活跃冻结 activeTimeout**：token 超过 N 秒不活跃即冻结（区别于绝对 TTL）。
7. **事件中心 SaTokenEventCenter**：登录/登出/踢人等全生命周期事件广播，可挂审计。
8. **Same-Token 同源认证**：内部服务间调用的短时效票据。
9. **临时令牌 SaTemp**：颁发临时 token 给第三方执行受限操作。
10. **TOTP 模块**：动态一次性密码。

## 三、融合判定

### 3.1 结论：不整库引入，按模块移植思想

**不可行的路——直接替换：**
- 会话模型冲突：本仓双令牌 + 记住我 + appId 隔离 + firewall 联动 + oauth21 iframe 登录，全部挂在现有 session 结构上，替换等于重写认证层。
- 权限模型倒退：RBAC 无 deny，本仓 PBAC（Deny 优先）是安全增强，不能降级。
- 工程质量不达标：停更、无类型、无 README、async 泛滥、DAO 默认内存实现，与本仓 ESM/测试有效性/lint 约定冲突；引入后成为不可维护的黑盒依赖。

**可行的路——吸收设计，自己实现（或小片段移植）：**

| 优先级 | 能力 | 落点建议 | 理由 |
| --- | --- | --- | --- |
| P1 | 事件中心（登录/登出/踢人广播） | `session.js` 内加轻量 EventEmitter 或注册表，`04-auth.js` 挂监听 | 成本极低，直接补审计/告警能力 |
| P1 | 账号封禁 + 阶梯等级 | 新增 `src/framework/security/auth/ban.js`，Redis key `ban:<uid>:<service>` + TTL；`StpUtil.check()` 前置校验 | 本仓 Redis 陷阱经验已齐（v5 scan 等），实现成本低；补齐账号级处罚闭环 |
| P2 | 二级认证 openSafe/checkSafe | 新增 `safe.js`，Redis 存 `safe:<uid>:<service>` + 时间窗 | 敏感操作（改密/解绑/支付）通用需求 |
| P2 | 权限实时化（StpInterface 思想） | 可选：`hasPermission` 支持注入"实时 loader"，默认仍走 session 快照 | 解决"改权限需重新登录"痛点，但要权衡每次校验的 Redis 查询开销，建议做成可配置 |
| P3 | 顶人下线（replaced 语义） | `createSession` 加 isConcurrent 选项，被顶 session 打 kicked-out 场景标记 | 前端可据此提示"您已在别处登录" |
| P3 | switchTo 临时身份切换 | ALS 里加 switch 标记位即可，lambda 结束还原 | 本仓有模拟登录类需求；注意 retroweb 经验：免登录档不走身份切换 |
| 不建议 | Token-Session / SaTemp / TOTP / Same-Token | — | 与 oauth21 的 JWT/H5 签名体系职责重叠，已有更完善的实现 |

### 3.2 关键技术差异备注（实现时注意）

1. **同步 vs 异步**：sa-token-node 的 API 因 async 工厂泛滥而整体 async 化。本仓 StpUtil 全同步是基于"权限快照在 session 里"的前提；若做权限实时化，只有 loader 一层需要 async，对外 API 应保持同步 facade + 内部可选异步。
2. **数据源接口化**：sa-token 的 `StpInterface`（getPermissionList/getRoleList 由外部实现注入）+ `SaManager` 组件注册是它的核心架构优点。本仓可在 `ThemeStateOptions` 式"策略收口"的思路上做同类事：把 permission-loader 定义为可替换接口，而非硬编码。
3. **封禁 key 设计**：借鉴其 `loginId + service + level` 三元组；service 维度允许"封登录不封浏览"这类细分。TTL 用 Redis 原生过期，勿自算时间戳。
4. **License**：sa-token-node 源头是 Apache-2.0（sa-token.cc），按片段借鉴思想无风险；若逐字拷代码需保留其版权头。

## 四、建议的实施顺序

1. 事件中心（半天级）：登录成功/失败、登出、踢下线三类事件先落地，接审计日志。
2. 账号封禁（1 天级）：`ban.js` + `StpUtil.check()` 前置钩子 + 管理端 API。
3. 二级认证（1 天级）：仅在敏感路由的 `registerSecureRoute` 加 `safe: 'xxx'` 声明字段。
4. 其余（顶人下线 / switchTo / 权限实时化）按业务需求触发，不预做。

---

*本文档只做分析，未改动任何代码。*

---

## 五、实现落地记录（2026-11-01）

动手前重新盘点发现本仓能力**比上文分析时更强**，实际缺口与落地如下：

### 已存在（无需实现，修正上文判断）

| 能力 | 现状 |
| --- | --- |
| 权限实时化（P2b） | **已由 perm-cache.js 指纹机制覆盖**：会话恢复时增量回源 + getSession 就地刷新，改权限无需重新登录 |
| 踢人/顶人基础件 | session-kick.js 已有 kickByDeviceType（默认单设备互顶）/kickByDeviceId/kickUser/kickAllSessions；checkMaxSessions 超限错误自带 sessions 列表 |
| 账号级硬禁用 | User.status=0（全局永久，请求级校验 + 30s 缓存，命中即吊销会话） |
| 审计消费者 | audit-logger.js（DB+Redis ring）+ SessionLog 表（LOGIN/LOGOUT/KICK/LOGIN_FAILED） |

### 本次新增

| 优先级 | 内容 | 落点 |
| --- | --- | --- |
| P1a | 认证事件总线（session:login/logout/kick + ban/safe 事件，零依赖，监听者抛错不阻断主流程） | `framework/security/auth/events.js` |
| P1b | 账号封禁：service 维度 + 时限/永久 + 阶梯等级；封 'login' 拦新登录、封 'access' 请求级拦截（30s 负缓存）；Redis TTL 到期自动解封 | `framework/security/auth/ban.js` + StpUtil.disable/disableLevel/untieDisable/checkDisable 系列 |
| P2a | 二级认证：openSafe/isSafe/checkSafe/closeSafe；`registerSecureRoute` 新增 `safe: 'service'` 声明字段（守卫后追加 checkSafe preHandler） | `framework/security/auth/safe.js` + guard.js |
| P3 | 顶人下线增强：①踢出墓碑（被顶 SESSION_REPLACED / 被踢 SESSION_KICKED，X-Session-Kick 响应头，24h TTL）②`SESSION_SINGLE_DEVICE_TYPES` env 按设备类型配互顶策略（默认全部类型=历史行为）③`offlineSessionIds` 登录参数（MAX_SESSIONS_EXCEEDED 前端勾选后重试，归属校验防越权踢人） | session-kick.js + session.js + session-store.js |
| 管理端 API | POST /admin/user/v1/bans/disable · /bans/untie · GET /bans/status | `api/admin/user/v1/bans.js` |

### 设计要点（后续维护必读）

- **契约不破坏**：session.js 公开面保持恰好 24 项导出（auth-contract.test.js 钉死）；session-kick.js 的 `_revokeOneSession` 4 处调用/1 处定义、`sessionStore.delete` 1 处契约不变。
- **错误形状**：封禁 code=`ACCOUNT_BANNED`/`ACCOUNT_BAN_LEVEL`，二级认证 code=`SECOND_AUTH_REQUIRED`，均 statusCode=403；调用方按 `err.code` 分支。
- **fail 语义**：封禁检查 fail-open（Redis 挂时放行，此时会话系统本身已不可用）；二级认证 fail-closed（读失败视为未开启，宁可让用户重新确认）。
- **墓碑原因映射**：`single_device_login`/`offline_by_login`/`replaced` → SESSION_REPLACED（提示"您已在别处登录"），其余 → SESSION_KICKED。
- **多进程缓存延迟**：封禁负缓存/用户状态缓存均为 30s 量级，跨进程解封最迟 ~30s 生效（与现状一致）。
- **测试**：16 套件 201 用例全绿（新增 ban/safe/events + session-kick 墓碑与越权防护）；session-saga.test.js 的 session-kick mock 已同步补齐新导出。

### 业务侧使用示例

```js
// 封禁（管理端已提供 API；框架层亦可直调）
await StpUtil.disable(42, 'login', 7 * 86400, { reason: '违规', operator: 'admin' });
await StpUtil.disableLevel(42, 'comment', 3, -1);   // 3 级永久封禁
await StpUtil.untieDisable(42, 'login');

// 敏感路由声明二级认证（确认窗内放行，否则 403 SECOND_AUTH_REQUIRED）
registerSecureRoute(app, {
  name: 'changePassword', method: 'POST', url: '/password',
  requireLogin: true, safe: 'change-password',
  handler: async req => { /* ... */ }
});
// 用户完成密码重输后：await StpUtil.openSafe('change-password', 600);
```
