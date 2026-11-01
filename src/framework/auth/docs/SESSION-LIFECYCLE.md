# Session 生命周期（session/ 子模块）架构与审计记录

> 代码：`src/framework/auth/session/`（8 文件）；本文是该子模块的机制地图 + 深度检查记录。
> 关联：封禁分工见 [H5-SIGNATURE.md](H5-SIGNATURE.md) 同级的 security/ 模块；踢出/封禁语义对比见 README security/ 表。

## 一、文件职责与依赖方向

```
session-store.js    ← 底座（零兄弟依赖，谁都可用它）
  ↑
session-saga.js     ← 补偿事务原语（零兄弟依赖）
  ↑
session-governance.js（治理/统计，不碰 kick）   session-perm.js（权限指纹解析）
  ↑                                              ↑
session-kick.js（踢出/墓碑）                session-refresh.js（sid_r 轮转核心）
  ↑                                              ↑
  └──────────── session.js（生命周期聚合门面）──┘
                     ↑
          session-api.service.js（Cookie 绑定/多账号免切，供路由层调用）
```

- **依赖方向单向**：生命周期模块反向依赖 kick（createSession → kickByDeviceType），无环。
- `session.js` 尾部 re-export 保持拆分前 24 项导出契约（auth-contract.test.js 守护）。

## 二、登录链路（createSession 七步）

```
0   checkDisable('login')      login 维度封禁拦新登录（既有会话不动，见 ban.js）
0.5 kickSessionsByIds          前端勾选"下线哪些设备"重试登录（归属校验内建）
1   checkMaxSessions           并发配额（顺带回收超 30 天 DB 行 + 清索引僵尸条目）
2   kickByDeviceType           单设备单登录互顶（SESSION_SINGLE_DEVICE_TYPES 白名单，
                               multiDevice=true 显式豁免）
3   getPermissions + 指纹      权限随会话落 Redis/DB，恢复时增量回源判断
4   Redis Saga + DB 事务       session/索引/refresh 链/family 逐步写入，任一步失败
                               逆序补偿；DB 事务永远最后一步
5   下发 sid (+ sid_r)         HMAC 签名 cookie
6   广播 SESSION_LOGIN 事件
```

## 三、双 Cookie 模型与恢复路径

| Cookie | 内容 | 作用 |
|--------|------|------|
| `sid` | HMAC 签名的 sessionId + accessCount | 请求认证；每次访问续期重签 |
| `sid_r` | HMAC 签名的 refreshToken（仅记住我） | sid 过期后免密恢复；**一次性轮转** |

**getSession 三条恢复路径**（顺序）：
1. Redis 命中 → 状态校验（共享 30s 用户缓存）→ access 封禁检查 → 权限指纹校验 → 续期；
2. Redis 未命中 → 踢出墓碑（24h 内可区分"被顶/被踢"→ `X-Session-Kick` 响应头）；
3. DB 重建（容灾）→ 同样过状态 + **access 封禁**检查 → TTL 锚点判定（超长期 revoke、
   记住我超短期交 sid_r、非记住我拒绝）→ 指纹校验后重建 Redis。

**refreshSessionCore（sid_r 轮转）资格检查顺序**：rotated 复用检测（盗用 → 吊销 family）→
DB 定位链路 → **status 硬禁用（吊销 family）→ login/access 封禁（拒刷不清 family）** →
权限指纹 → GETDEL 原子领取 + Saga 轮转。刷新产生的是**新会话**，封禁必须在此拦
（否则 login 封禁被记住我自动续期架空，2026-11-01 修复）。

## 四、Redis 命名空间全景

**session-store.js 单一出处**（9 个）：`session` / `refresh` / `user_refresh` /
`refresh_rotated` / `session_family` / `user_sessions` / `session_kick_tomb` /
`auth:perm`（与 perm-cache 契约测试钉死逐字一致）/ `user`（用户状态 30s 短缓存，
与 JWT 认证共用）。
另有 `session_token`（bind-session 一次性凭证，getStore 于 session-api.service.js 调用点）。

## 五、kick 与 ban 的分工（速查）

- **kick**（session-kick.js）：对**现存会话**的一次性吊销，不阻止再登录。入口六种粒度
  （单会话/ID 列表/按设备/按设备类型/全端/按用户），墓碑 24h 供前端区分被顶/被踢。
- **ban**（security/ban.js）：对**用户**的限期处罚。`login` 拦新登录不动既有会话；
  `access` 请求级拦截且命中即吊销会话（30s 负缓存）。
- **User.status=0**：全局永久硬禁用（DB 权威，登录/会话/刷新全拦）。
- 组合：马上下去 → kick；不许再来 → ban；两者都要 → `disable('access')` 一件事全包，
  或 `ban('login') + kick`（适合保留在线观察）。

## 六、2026-11-01 深度检查修复记录

| 级别 | 修复 | 文件 |
|------|------|------|
| P2 | **refreshSessionCore 缺封禁检查**：login 封禁用户凭记住我 sid_r 无限自动续期，登录封禁被架空；access 封禁也提前拦截。命中拒刷但**不吊销 family**（login 封禁不动既有会话的语义） | session-refresh.js |
| P2 | **status===0 严格相等漏拦**：DB 驱动返回字符串 `'0'` 时刷新放行；改用 `isSessionUserActive`（Number 归一，与 getSession 同源） | session-refresh.js |
| P2 | **createSession 配额清理不吊销 DB token**：超 MAX_REFRESH_TOKENS 清旧 refresh 链只删 Redis，旧设备凭 sid cookie 走 DB 恢复路径复活会话；补 DB revoke + 清会话索引 | session.js |
| P3 | **getSession DB 恢复路径缺 access 封禁检查**：Redis 被驱逐瞬间被封禁用户可过一次；与 Redis 命中路径对齐 | session.js |
| P4 | DB 路径内联 sha256 改统一原语 `sidHash` | session.js |

### 遗留观察项（有意保留，未修）

- `kickByDeviceType` 在 DB 事务之前执行且**不可补偿**：createSession 后续失败时旧设备已被
  踢下线（用户重登即可，Saga 补偿恢复会话的复杂度不值得）；
- `removeSavedAccount` 的服务端索引兜底会撤销该用户**所有设备**的免切凭证（rt 与设备
  无服务端绑定，无法只撤单设备；前端"忘掉账号"语义可接受）；
- `updateRememberMe` 反复开关会累积指向同一 session 的 rt（受 MAX_REFRESH_TOKENS 配额
  清理兜底）；`destroySession` 的 reply 参数未判空（所有调用方均传 reply）。

## 七、测试

- `session-kick.test.js` / `session-saga.test.js` / `session-security.test.js` /
  `session-token-atomic.test.js` / `ban.test.js`（框架级）
- `auth-contract.test.js`（session.js 24 项导出契约）+ `integration/app.test.js`
